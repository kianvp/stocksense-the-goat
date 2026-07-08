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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Hydrate from localStorage — drop the session if the underlying ID token
  // has already expired instead of trusting it indefinitely.
  useEffect(() => {
    try {
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
