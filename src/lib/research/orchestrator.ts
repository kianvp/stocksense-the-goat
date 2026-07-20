// Research Engine — orchestrator.
//
// A small typed DAG runner. Nodes declare dependencies; the scheduler runs
// every node whose dependencies are settled, in parallel, until the graph is
// exhausted. Design goals, in order:
//
//   1. Honest observability — every state change is emitted as an event with
//      real wall-clock timing, which is what the UI animates. Nothing in the
//      visualization is scripted.
//   2. Failure isolation — a failed node fails its *dependants* (as
//      "skipped", with the cause), never the whole run.
//   3. Reuse — results can be cached by key with a TTL, so a re-run on the
//      same symbol reuses expensive work (network, LLM) and reports it as a
//      cache hit rather than silently pretending to have recomputed.
//   4. Bounded concurrency for rate-limited resources (the LLM) via named
//      semaphore lanes, so eight analysts don't burst a free-tier RPM cap.
//
// The runner is deliberately dependency-free and browser/Node agnostic so the
// verification harness can exercise scheduling, retry and cache behaviour
// outside a browser.

import type { AgentEnvelope, AgentStatus, PipelineEvent } from "./types";

export type NodeDef<T> = {
  id: string;
  deps: string[];
  /**
   * Soft dependencies: the node waits for these to settle but is NOT skipped
   * if they fail. The debate layer uses this — it argues from whichever
   * analysts delivered, rather than collapsing because one specialist failed.
   */
  softDeps?: string[];
  /** Serialisable cache key; omit to disable caching for this node. */
  cacheKey?: string;
  cacheTtlMs?: number;
  /** Named concurrency lane (e.g. "llm"); omit for unbounded. */
  lane?: string;
  timeoutMs?: number;
  /** Retries after the first failure (0 = single attempt). */
  retries?: number;
  /** If it returns a string, the node is skipped with that reason. */
  skipIf?: (results: ResultMap) => string | null;
  run: (results: ResultMap) => Promise<T>;
  /** Post-run inspection: return a reason to mark the result "degraded". */
  degradeIf?: (value: T) => string | null;
};

export type ResultMap = Map<string, AgentEnvelope<unknown>>;

export type CacheAdapter = {
  get(key: string): { at: number; value: unknown } | null;
  set(key: string, value: unknown): void;
};

/** In-memory cache, suitable for tests and as a session-scope default. */
export function memoryCache(): CacheAdapter {
  const store = new Map<string, { at: number; value: unknown }>();
  return {
    get: (k) => store.get(k) ?? null,
    set: (k, v) => store.set(k, { at: Date.now(), value: v }),
  };
}

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly limit: number) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }
  private release() {
    this.active--;
    this.queue.shift()?.();
  }
}

export type RunOptions = {
  cache?: CacheAdapter;
  onEvent?: (e: PipelineEvent) => void;
  /** Concurrency limits per lane name. Default: llm → 3. */
  lanes?: Record<string, number>;
};

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

function withTimeout<T>(p: Promise<T>, ms: number | undefined, id: string): Promise<T> {
  if (!ms) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${id}: timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Execute a graph. Returns the full result map; never throws for node
 * failures (those surface as envelopes), only for malformed graphs.
 */
export async function runPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: NodeDef<any>[],
  opts: RunOptions = {},
): Promise<{ results: ResultMap; totalMs: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (byId.size !== nodes.length) throw new Error("duplicate node ids");
  for (const n of nodes) {
    for (const d of [...n.deps, ...(n.softDeps ?? [])]) {
      if (!byId.has(d)) throw new Error(`${n.id} depends on unknown node ${d}`);
    }
  }

  const results: ResultMap = new Map();
  const emit = (e: PipelineEvent) => opts.onEvent?.(e);
  const lanes = new Map<string, Semaphore>();
  const laneLimits: Record<string, number> = { llm: 3, ...(opts.lanes ?? {}) };
  const laneFor = (name: string) => {
    if (!lanes.has(name)) lanes.set(name, new Semaphore(laneLimits[name] ?? 4));
    return lanes.get(name)!;
  };

  const t0 = now();
  const settled = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();

  const settle = (id: string, env: AgentEnvelope<unknown>) => {
    results.set(id, env);
    settled.add(id);
    emit({ type: "node", id, status: env.status, ms: env.ms, reason: env.reason });
  };

  async function execute(node: NodeDef<unknown>): Promise<void> {
    // Dependency failure propagates as a skip, with the cause named.
    const badDep = node.deps.find((d) => {
      const s = results.get(d)?.status;
      return s === "failed" || s === "skipped";
    });
    if (badDep) {
      settle(node.id, {
        id: node.id, status: "skipped", ms: 0, attempts: 0,
        reason: `dependency ${badDep} did not complete`, payload: null,
      });
      return;
    }

    const skipReason = node.skipIf?.(results);
    if (skipReason) {
      settle(node.id, {
        id: node.id, status: "skipped", ms: 0, attempts: 0,
        reason: skipReason, payload: null,
      });
      return;
    }

    // Cache: a hit settles instantly and is reported as such, not disguised.
    if (node.cacheKey && opts.cache) {
      const hit = opts.cache.get(node.cacheKey);
      if (hit && (!node.cacheTtlMs || Date.now() - hit.at < node.cacheTtlMs)) {
        settle(node.id, {
          id: node.id, status: "cached", ms: 0, attempts: 0, payload: hit.value,
        });
        return;
      }
    }

    emit({ type: "node", id: node.id, status: "running" });
    const release = node.lane ? await laneFor(node.lane).acquire() : null;
    const started = now();
    const maxAttempts = 1 + (node.retries ?? 0);
    let lastError = "";

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const value = await withTimeout(node.run(results), node.timeoutMs, node.id);
          const ms = Math.round(now() - started);
          const degraded = node.degradeIf?.(value) ?? null;
          if (node.cacheKey && opts.cache && !degraded) {
            opts.cache.set(node.cacheKey, value);
          }
          settle(node.id, {
            id: node.id,
            status: degraded ? "degraded" : "done",
            ms, attempts: attempt,
            reason: degraded ?? undefined,
            payload: value,
          });
          return;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }
      settle(node.id, {
        id: node.id, status: "failed", ms: Math.round(now() - started),
        attempts: maxAttempts, reason: lastError, payload: null,
      });
    } finally {
      release?.();
    }
  }

  // Scheduler: launch every node whose deps are settled; loop as nodes finish.
  while (settled.size < nodes.length) {
    const ready = nodes.filter(
      (n) =>
        !settled.has(n.id) &&
        !inFlight.has(n.id) &&
        n.deps.every((d) => settled.has(d)) &&
        (n.softDeps ?? []).every((d) => settled.has(d)),
    );
    if (ready.length === 0 && inFlight.size === 0) {
      throw new Error("pipeline deadlock: circular dependency");
    }
    for (const n of ready) {
      const p = execute(n).finally(() => inFlight.delete(n.id));
      inFlight.set(n.id, p);
    }
    if (inFlight.size > 0) await Promise.race(inFlight.values());
  }

  const totalMs = Math.round(now() - t0);
  emit({ type: "done", totalMs });
  return { results, totalMs };
}

/** Typed accessor for downstream nodes. */
export function payloadOf<T>(results: ResultMap, id: string): T | null {
  const env = results.get(id);
  if (!env || (env.status !== "done" && env.status !== "cached" && env.status !== "degraded")) {
    return null;
  }
  return env.payload as T;
}
