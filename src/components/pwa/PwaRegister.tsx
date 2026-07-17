"use client";

import { useEffect } from "react";

// Registers the service worker that makes InvestSense installable and keeps the
// shell available offline. Production only — a SW caching dev assets makes
// local hot-reload behave unpredictably.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {
      /* offline support is progressive enhancement — never break the app */
    });
  }, []);
  return null;
}
