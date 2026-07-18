"use client";

// Admin-only view of every registered account. The Worker enforces access twice:
// this page's path is admin-gated, and /__admin/users re-checks the session
// against ADMIN_EMAILS — the endpoint is the real security boundary, so a
// normal user hitting either gets 403 regardless of what the UI does.

import { useEffect, useState } from "react";
import { Users, RefreshCw, ShieldAlert, Database } from "lucide-react";
import { Card } from "@/components/ui/Card";

type StoredUser = {
  google_id: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: string;
  last_login: string;
};

type State =
  | { status: "loading" }
  | { status: "ok"; users: StoredUser[] }
  | { status: "forbidden" }
  | { status: "nodb" }
  | { status: "error"; message: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  async function load() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/__admin/users", { credentials: "include", cache: "no-store" });
      if (res.status === 401 || res.status === 403) return setState({ status: "forbidden" });
      if (res.status === 503) return setState({ status: "nodb" });
      if (!res.ok) return setState({ status: "error", message: `HTTP ${res.status}` });
      const data = (await res.json()) as { users?: StoredUser[] };
      setState({ status: "ok", users: data.users ?? [] });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Request failed" });
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-1 py-2">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">
            <Users className="h-3.5 w-3.5" /> Admin
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-(--color-fg)">
            Registered users
            {state.status === "ok" && (
              <span className="ml-2 text-[15px] font-medium text-(--color-fg-subtle)">
                ({state.users.length})
              </span>
            )}
          </h1>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-(--color-border-strong) px-3.5 text-sm font-medium text-(--color-fg) hover:bg-(--color-surface-2)"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {state.status === "loading" && (
        <Card>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        </Card>
      )}

      {state.status === "forbidden" && (
        <Card>
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-(--color-down)" />
            <div>
              <p className="font-semibold text-(--color-fg)">Not authorised</p>
              <p className="mt-1 text-sm text-(--color-fg-muted)">
                This account isn&apos;t on the admin allowlist. Add your email to the{" "}
                <code className="rounded bg-(--color-surface-2) px-1 py-0.5 text-[12px]">ADMIN_EMAILS</code>{" "}
                Worker secret to grant access.
              </p>
            </div>
          </div>
        </Card>
      )}

      {state.status === "nodb" && (
        <Card>
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 text-(--color-warn)" />
            <div>
              <p className="font-semibold text-(--color-fg)">No database connected yet</p>
              <p className="mt-1 text-sm text-(--color-fg-muted)">
                Sign-in works, but accounts aren&apos;t being recorded. Enable the{" "}
                <code className="rounded bg-(--color-surface-2) px-1 py-0.5 text-[12px]">DB</code> binding
                in <code className="rounded bg-(--color-surface-2) px-1 py-0.5 text-[12px]">wrangler.jsonc</code>{" "}
                — see CLOUDFLARE_SETUP.md.
              </p>
            </div>
          </div>
        </Card>
      )}

      {state.status === "error" && (
        <Card>
          <p className="font-semibold text-(--color-fg)">Couldn&apos;t load users</p>
          <p className="mt-1 text-sm text-(--color-fg-muted)">{state.message}</p>
        </Card>
      )}

      {state.status === "ok" && state.users.length === 0 && (
        <Card>
          <p className="font-semibold text-(--color-fg)">No users yet</p>
          <p className="mt-1 text-sm text-(--color-fg-muted)">
            The table is live — the first Google sign-in will appear here.
          </p>
        </Card>
      )}

      {state.status === "ok" && state.users.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-(--color-border) bg-(--color-surface-2)">
                  {["Name", "Email", "Date joined", "Last login"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] uppercase tracking-[0.12em] font-semibold text-(--color-fg-subtle)"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.users.map((u) => (
                  <tr key={u.google_id} className="border-b border-(--color-border) last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {u.picture ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.picture}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-(--color-brand-100) text-[11px] font-semibold text-(--color-brand-700)">
                            {(u.name || u.email).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="text-[14px] font-medium text-(--color-fg)">
                          {u.name || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[14px] text-(--color-fg-muted)">{u.email}</td>
                    <td className="px-4 py-3 text-[13px] tabular text-(--color-fg-muted)">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-[13px] tabular text-(--color-fg-muted)">
                      {formatDate(u.last_login)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
