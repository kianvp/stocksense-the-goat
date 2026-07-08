"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { decodeGoogleCredential } from "./jwt";
import type { AuthUser } from "./types";
import "./types";

const STORAGE_KEY = "stocksense.user.v1";
const SIGNIN_OPEN_EVENT = "stocksense:open-signin";

export type AuthContextValue = {
  user: AuthUser | null;
  clientId: string | undefined;
  ready: boolean; // GIS script loaded
  hydrated: boolean; // localStorage session check has run
  signOut: () => void;
  openSignIn: () => void;
  /** Internal — called by SignInModal when GIS returns a credential. */
  _setCredential: (credential: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isExpired(u: AuthUser): boolean {
  return typeof u.exp !== "number" || u.exp * 1000 <= Date.now();
}

// The Cloudflare Worker gate sets a base64url `ss_id` cookie with the verified
// identity. Decode it so the app treats a Worker-authenticated visitor as
// signed in without a second in-app prompt.
function readIdentityCookie(): AuthUser | null {
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith("ss_id="));
    if (!match) return null;
    const raw = match.slice("ss_id=".length);
    if (!raw) return null;
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((ch) => "%" + ch.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const parsed = JSON.parse(json) as AuthUser;
    if (!parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Hydrate the session. When the site is served behind the Cloudflare Worker
  // gate, the Worker has already verified the Google login server-side and set
  // a readable `ss_id` identity cookie — trust that first so users aren't asked
  // to sign in twice. Otherwise fall back to a localStorage session.
  useEffect(() => {
    try {
      const fromCookie = readIdentityCookie();
      if (fromCookie && !isExpired(fromCookie)) {
        setUser(fromCookie);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fromCookie));
        return;
      }
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        if (isExpired(parsed)) {
          window.localStorage.removeItem(STORAGE_KEY);
        } else {
          setUser(parsed);
        }
      }
    } catch {
      /* noop */
    } finally {
      setHydrated(true);
    }
  }, []);

  // Periodically re-check expiry so a long-open tab signs itself out.
  useEffect(() => {
    const id = setInterval(() => {
      setUser((u) => {
        if (!u || !isExpired(u)) return u;
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* noop */
        }
        return null;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Wait for the GIS script to load
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.google?.accounts?.id) {
      setReady(true);
      return;
    }
    const id = setInterval(() => {
      if (window.google?.accounts?.id) {
        setReady(true);
        clearInterval(id);
      }
    }, 120);
    return () => clearInterval(id);
  }, []);

  const persist = useCallback((u: AuthUser | null) => {
    setUser(u);
    try {
      if (u) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const signOut = useCallback(() => {
    if (typeof window !== "undefined" && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch {
        /* noop */
      }
    }
    persist(null);
    // Behind the Worker gate, also drop the server session — otherwise a
    // reload just re-reads the identity cookie and signs back in.
    if (typeof document !== "undefined" && document.cookie.includes("ss_id=")) {
      window.location.href = "/__logout";
    }
  }, [persist]);

  const _setCredential = useCallback(
    async (credential: string) => {
      const decoded = await decodeGoogleCredential(credential, clientId);
      if (!decoded) return false;
      persist(decoded);
      return true;
    },
    [persist, clientId],
  );

  const openSignIn = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(SIGNIN_OPEN_EVENT));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, clientId, ready, hydrated, signOut, openSignIn, _setCredential }),
    [user, clientId, ready, hydrated, signOut, openSignIn, _setCredential],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export const SIGNIN_OPEN_EVENT_NAME = SIGNIN_OPEN_EVENT;
