// Card-free auth gate. This Worker runs in front of the static export and
// refuses to serve any file without a valid signed session cookie. Sign-in is
// Google Identity Services; the returned ID token is verified server-side
// against Google, then a short HMAC-signed session cookie is issued. Real
// enforcement — the app's HTML/JS is never sent to an unauthenticated visitor.

import { BUILD_SECRET } from "./secret.generated";

/* Minimal structural types for the D1 binding — the project doesn't depend on
   @cloudflare/workers-types, and ASSETS is declared the same way. */
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GOOGLE_CLIENT_ID: string;
  /** Optional stable secret. If unset, the build-baked BUILD_SECRET is used. */
  SESSION_SECRET?: string;
  /** Optional comma-separated allowlist. Empty = any Google account. */
  ALLOWED_EMAILS?: string;
  /**
   * D1 user store. OPTIONAL on purpose: if the binding isn't configured the
   * Worker still authenticates normally and simply skips persistence, so
   * sign-in can never break because of the database.
   */
  DB?: D1Database;
  /** Comma-separated emails allowed to read /__admin/users. Unset = nobody. */
  ADMIN_EMAILS?: string;
}

const SESSION_COOKIE = "ss_session"; // HttpOnly, signed — the actual gate
const IDENTITY_COOKIE = "ss_id"; // readable by the app so it knows who's in
const TTL = 60 * 60 * 24 * 7; // 7 days

// Prefer a stable operator-provided secret; otherwise fall back to the secret
// baked into this build (server-side only, rotates each deploy).
function sessionSecret(env: Env): string {
  return env.SESSION_SECRET || BUILD_SECRET;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__auth" && request.method === "POST") {
      return handleAuth(request, env);
    }
    if (url.pathname === "/__logout") {
      return logout(url);
    }
    // Same-origin market-data proxy (public): fetch Yahoo/Finnhub server-side so
    // the browser isn't blocked by CORS or flaky third-party proxies.
    if (url.pathname === "/__proxy") {
      return handleProxy(url);
    }

    // Admin API — signed-in AND on the ADMIN_EMAILS allowlist.
    if (url.pathname === "/__admin/users") {
      return handleAdminUsers(request, env);
    }

    // The admin page itself is admin-only too (defence in depth: the endpoint
    // is the real boundary, but there's no reason to serve the shell either).
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      const session = await getValidSession(request, env);
      if (!session) return loginPage(env, url);
      if (!isAdmin(env, session.email)) return forbiddenPage();
    }

    // Next emits the generated OG image as an extensionless file, so the asset
    // server can't infer a type and sends it with none — which social crawlers
    // reject, leaving shared links with no preview image. Stamp the type Next
    // declared for it.
    if (url.pathname === "/opengraph-image") {
      const res = await env.ASSETS.fetch(request);
      const headers = new Headers(res.headers);
      headers.set("content-type", "image/png");
      return new Response(res.body, { status: res.status, headers });
    }

    // Only the app is members-only. The marketing homepage and shared static
    // assets stay public so visitors can see the site before signing in.
    if (isGated(url.pathname)) {
      const session = await getValidSession(request, env);
      if (!session) return loginPage(env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

// App routes that require a signed-in session. Everything else (the landing
// page "/", favicon, /_next assets, etc.) is served without auth.
const GATED_PREFIXES = [
  "/dashboard",
  "/market",
  "/stocks",
  "/etfs",
  "/compare", // was missing — /compare/ was being served to anonymous visitors
  "/portfolio",
  "/watchlist",
  "/ask-ai",
  "/news",
  "/glossary",
  "/buy-stocks",
  "/recently-viewed",
  "/quote",
  "/quant",
  "/research",
  "/admin",
];

function isGated(pathname: string): boolean {
  return GATED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "."),
  );
}

/* ---------------------------------------------------------------- auth flow */

interface TokenInfo {
  aud?: string;
  /** Google's stable account identifier. */
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  given_name?: string;
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
  try {
    return await handleAuthInner(request, env);
  } catch (e) {
    // Never let an exception fall through as a raw 500 (which the login page
    // reports as a useless "network error") — surface the reason as JSON.
    return json({ error: "server error: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
}

async function handleAuthInner(request: Request, env: Env): Promise<Response> {
  let credential: string | undefined;
  try {
    const body = (await request.json()) as { credential?: string };
    credential = body.credential;
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!credential) return json({ error: "missing credential" }, 400);

  const resp = await fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential),
  );
  if (!resp.ok) return json({ error: "invalid token" }, 401);
  const info = (await resp.json()) as TokenInfo;

  if (info.aud !== env.GOOGLE_CLIENT_ID) return json({ error: "wrong audience" }, 401);
  if (info.email_verified !== "true" && info.email_verified !== true) {
    return json({ error: "email not verified" }, 401);
  }
  const email = String(info.email || "").toLowerCase();
  if (!email) return json({ error: "no email" }, 401);

  const allow = (env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length && !allow.includes(email)) {
    return json({ error: "This account isn't on the allowlist." }, 403);
  }

  // Persist the account. Deliberately after every verification step (so only
  // genuine, allowlisted sign-ins are stored) and deliberately non-fatal — a
  // database problem must never stop someone signing in.
  await recordSignIn(env, info, email);

  const exp = Math.floor(Date.now() / 1000) + TTL;
  const payload = `${email}|${exp}`;
  const sig = await hmac(payload, sessionSecret(env));
  const token = `${strToB64url(payload)}.${sig}`;
  const identity = strToB64url(
    JSON.stringify({
      sub: email,
      email,
      name: info.name || email,
      picture: info.picture || "",
      givenName: info.given_name || "",
      exp,
    }),
  );

  const base = `Path=/; Max-Age=${TTL}; SameSite=Lax; Secure`;
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; ${base}`);
  headers.append("Set-Cookie", `${IDENTITY_COOKIE}=${identity}; ${base}`);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function getValidSession(request: Request, env: Env): Promise<{ email: string } | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try {
    payload = b64urlToStr(payloadB64);
  } catch {
    return null;
  }
  const expected = await hmac(payload, sessionSecret(env));
  if (!timingSafeEqual(sig, expected)) return null;
  const [email, expStr] = payload.split("|");
  const exp = parseInt(expStr, 10);
  if (!email || !exp || exp * 1000 < Date.now()) return null;
  return { email };
}

function logout(url: URL): Response {
  const expired = "Path=/; Max-Age=0; SameSite=Lax; Secure";
  const headers = new Headers({ location: new URL("/", url).toString() });
  headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; ${expired}`);
  headers.append("Set-Cookie", `${IDENTITY_COOKIE}=; ${expired}`);
  return new Response(null, { status: 302, headers });
}

/* ------------------------------------------------------------- user store */

export interface StoredUser {
  google_id: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: string;
  last_login: string;
}

// Isolates are reused between requests, so the DDL only needs to run once per
// isolate rather than on every sign-in.
let schemaReady = false;

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS users (google_id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, picture TEXT, created_at TEXT NOT NULL, last_login TEXT NOT NULL)",
  );
  await db.exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
  schemaReady = true;
}

/**
 * Insert the account on first sign-in, otherwise just refresh last_login (and
 * name/picture, which can change on the Google side). Never throws: persistence
 * is best-effort so a database fault can't lock anyone out.
 */
async function recordSignIn(env: Env, info: TokenInfo, email: string): Promise<void> {
  if (!env.DB) return; // binding not configured — skip silently
  try {
    await ensureSchema(env.DB);
    const now = new Date().toISOString();
    // `sub` is Google's stable ID; fall back to email so a row is still written
    // if a token somehow lacks it.
    const googleId = info.sub || email;
    await env.DB.prepare(
      `INSERT INTO users (google_id, email, name, picture, created_at, last_login)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(google_id) DO UPDATE SET
         last_login = excluded.last_login,
         name       = excluded.name,
         picture    = excluded.picture,
         email      = excluded.email`,
    )
      .bind(googleId, email, info.name ?? null, info.picture ?? null, now, now)
      .run();
  } catch (e) {
    console.error("recordSignIn failed:", e instanceof Error ? e.message : String(e));
  }
}

/* ------------------------------------------------------------------ admin */

/** Fails closed: with ADMIN_EMAILS unset, nobody is an admin. */
function isAdmin(env: Env, email: string): boolean {
  const admins = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.length > 0 && admins.includes(email.toLowerCase());
}

async function handleAdminUsers(request: Request, env: Env): Promise<Response> {
  const session = await getValidSession(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!isAdmin(env, session.email)) return json({ error: "forbidden" }, 403);
  if (!env.DB) {
    return json({ error: "database not configured", users: [], count: 0 }, 503);
  }
  try {
    await ensureSchema(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT google_id, email, name, picture, created_at, last_login FROM users ORDER BY created_at DESC",
    ).all<StoredUser>();
    const users = results ?? [];
    return json({ users, count: users.length });
  } catch (e) {
    return json({ error: "query failed: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
}

function forbiddenPage(): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>403 · InvestSense</title>` +
      `<div style="font-family:system-ui;background:#041a11;color:#fff;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">` +
      `<h1 style="margin:0;font-size:20px">Admins only</h1>` +
      `<p style="margin:0;color:#9ec5b0;font-size:14px">This account doesn't have access to the admin area.</p>` +
      `<a href="/dashboard" style="color:#5eead4;font-size:14px">Back to dashboard</a></div>`,
    { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/* ---------------------------------------------------- market-data proxy */

// Allowlisted upstreams only — this is a scoped proxy, not an open one.
const PROXY_HOSTS = new Set([
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "finnhub.io",
]);

async function handleProxy(url: URL): Promise<Response> {
  const target = url.searchParams.get("u");
  if (!target) return new Response("missing u", { status: 400 });
  let t: URL;
  try {
    t = new URL(target);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (t.protocol !== "https:" || !PROXY_HOSTS.has(t.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }
  try {
    const upstream = await fetch(t.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        accept: "application/json,text/plain,*/*",
      },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=5",
      },
    });
  } catch {
    return new Response("upstream error", { status: 502 });
  }
}

/* ------------------------------------------------------------------- crypto */

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToB64url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------- base64 utils */

function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToB64url(str: string): string {
  return bytesToB64url(new TextEncoder().encode(str));
}
function b64urlToStr(b64: string): string {
  const b = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* -------------------------------------------------------------------- misc */

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function loginPage(env: Env, _url?: URL): Response {
  const html = LOGIN_HTML.replace(/__CLIENT_ID__/g, escapeHtml(env.GOOGLE_CLIENT_ID || ""));
  return new Response(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in · InvestSense</title>
<script src="https://accounts.google.com/gsi/client" async></script>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(120% 80% at 50% 0%, #0c4a30 0%, #041a11 60%, #030f0a 100%);
    color: #fff; padding: 24px;
  }
  .card {
    width: 100%; max-width: 400px; border: 1px solid rgba(255,255,255,.1);
    background: rgba(255,255,255,.04); border-radius: 24px; padding: 36px 32px;
    text-align: center; backdrop-filter: blur(6px);
  }
  .mark { width: 46px; height: 46px; margin: 0 auto 18px; border-radius: 14px;
    display: grid; place-items: center; background: rgba(111,185,142,.15); }
  .mark svg { width: 24px; height: 24px; }
  h1 { font-size: 22px; letter-spacing: -.02em; margin: 0 0 8px; }
  p { font-size: 14px; line-height: 1.55; color: rgba(255,255,255,.62); margin: 0 0 24px; }
  .btnwrap { display: flex; justify-content: center; min-height: 44px; }
  .foot { margin-top: 22px; font-size: 12px; color: rgba(255,255,255,.4); }
  .err { margin-top: 14px; font-size: 13px; color: #f87171; min-height: 18px; }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">
      <svg viewBox="0 0 24 24" fill="none"><path d="M4 16l5-5 3.5 3L20 7" stroke="#a6d4b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="7" r="2" fill="#a6d4b8"/></svg>
    </div>
    <h1>Sign in to InvestSense</h1>
    <p>This workspace is members-only. Sign in with Google to continue — live markets, portfolio simulator, and AI research.</p>
    <div class="btnwrap">
      <div id="g_id_onload" data-client_id="__CLIENT_ID__" data-callback="onCred" data-auto_prompt="false"></div>
      <div class="g_id_signin" data-type="standard" data-theme="filled_black" data-text="continue_with" data-shape="pill" data-size="large"></div>
    </div>
    <div class="err" id="err"></div>
    <div class="foot">We only ever see your name, email and profile picture.</div>
  </div>
  <script>
    function onCred(resp) {
      var err = document.getElementById('err');
      err.textContent = 'Signing you in…';
      fetch('/__auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: resp.credential })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.ok) { location.reload(); }
        else { err.textContent = (d && d.error) || 'Sign-in failed. Try again.'; }
      }).catch(function () { err.textContent = 'Network error. Try again.'; });
    }
  </script>
</body>
</html>`;
