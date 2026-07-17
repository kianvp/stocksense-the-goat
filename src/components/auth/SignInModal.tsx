"use client";

import { useEffect, useRef, useState } from "react";
import { X, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";
import { useAuth, SIGNIN_OPEN_EVENT_NAME } from "@/lib/auth/AuthContext";
import { LogoMark } from "@/components/layout/Logo";

export function SignInModal() {
  const { clientId, ready, user, _setCredential } = useAuth();
  const [open, setOpen] = useState(false);
  const buttonHostRef = useRef<HTMLDivElement | null>(null);
  const initialisedRef = useRef(false);

  // Open via global event from useAuth().openSignIn()
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(SIGNIN_OPEN_EVENT_NAME, onOpen);
    return () => window.removeEventListener(SIGNIN_OPEN_EVENT_NAME, onOpen);
  }, []);

  // Close automatically once the user is signed in
  useEffect(() => {
    if (user) setOpen(false);
  }, [user]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Initialise GIS and render the Google button when the modal opens
  useEffect(() => {
    if (!open || !ready || !clientId || !buttonHostRef.current) return;
    if (typeof window === "undefined" || !window.google?.accounts?.id) return;
    if (!initialisedRef.current) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            _setCredential(response.credential);
          }
        },
        cancel_on_tap_outside: false,
      });
      initialisedRef.current = true;
    }
    buttonHostRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(buttonHostRef.current, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
      width: 320,
    });
  }, [open, ready, clientId, _setCredential]);

  if (!open) return null;

  const setupNeeded = !clientId;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-(--color-brand-950)/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-(--color-border) bg-(--color-surface) shadow-[0_40px_80px_-30px_rgba(13,31,23,0.4)] animate-fade-up">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-(--color-fg-subtle) hover:bg-(--color-surface-2)"
          aria-label="Close sign in"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-7 pt-9 pb-7">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <p className="text-[14px] font-semibold tracking-tight text-(--color-fg)">InvestSense</p>
          </div>
          <h2 className="mt-6 text-[26px] font-semibold tracking-[-0.022em] text-(--color-fg)">
            Welcome back.
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-(--color-fg-muted)">
            Sign in with Google to sync your watchlist, portfolio, and AI conversations across devices.
          </p>

          {setupNeeded ? (
            <SetupHelp />
          ) : !ready ? (
            <div className="mt-7 flex items-center justify-center rounded-2xl border border-(--color-border) bg-(--color-surface-2) px-4 py-6">
              <span className="inline-flex h-2 w-2 rounded-full bg-(--color-brand-500) animate-pulse-dot" />
              <p className="ml-3 text-[13.5px] text-(--color-fg-muted)">Loading Google sign-in…</p>
            </div>
          ) : (
            <div className="mt-7 flex justify-center">
              <div ref={buttonHostRef} />
            </div>
          )}

          <div className="mt-7 grid gap-3 border-t border-(--color-border) pt-6 text-[12.5px] text-(--color-fg-muted)">
            <Feature icon={<ShieldCheck className="h-3.5 w-3.5 text-(--color-up)" />} text="We only ever see your name, email and profile picture." />
            <Feature icon={<Sparkles className="h-3.5 w-3.5 text-(--color-brand-700)" />} text="No password to remember. No data sold to anyone." />
          </div>
        </div>

        <div className="border-t border-(--color-border) bg-(--color-surface-2)/60 px-7 py-4 text-[11.5px] text-(--color-fg-subtle)">
          By signing in you agree to our{" "}
          <a href="#" className="font-medium text-(--color-fg-muted) hover:text-(--color-fg)">Terms</a> and{" "}
          <a href="#" className="font-medium text-(--color-fg-muted) hover:text-(--color-fg)">Privacy Policy</a>.
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-start gap-2">
      <span className="mt-0.5">{icon}</span>
      <span>{text}</span>
    </p>
  );
}

function SetupHelp() {
  return (
    <div className="mt-6 rounded-2xl border border-(--color-warn)/30 bg-[color-mix(in_srgb,var(--color-warn)_8%,white)] p-4">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-(--color-warn)" />
        <div>
          <p className="text-[13.5px] font-semibold text-(--color-fg)">
            Google Sign-In needs a Client ID
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-(--color-fg-muted)">
            Create an OAuth 2.0 Client ID in the{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-(--color-fg) underline underline-offset-2"
            >
              Google Cloud Console
            </a>
            , add this site to <em>Authorized JavaScript origins</em>, then set
            {" "}
            <code className="rounded bg-(--color-surface-2) px-1.5 py-0.5 text-[11.5px] font-mono">
              NEXT_PUBLIC_GOOGLE_CLIENT_ID
            </code>{" "}
            in your repo&rsquo;s GitHub Actions secrets and redeploy.
          </p>
        </div>
      </div>
    </div>
  );
}
