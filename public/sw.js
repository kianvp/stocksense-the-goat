// StockSense service worker — network-first with cache fallback so the app
// shell keeps working offline. Live-data endpoints are never intercepted.
// Derives the base path from its own location, so it works both at the domain
// root (Cloudflare, local dev) and under /stocksense-the-goat on GitHub Pages.

const CACHE = "stocksense-shell-v1";
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Leave cross-origin requests (Yahoo proxies, Google scripts, fonts) alone.
  if (url.origin !== self.location.origin) return;
  // Never cache the Worker's live-quote proxy or auth endpoints.
  if (url.pathname.includes("/__proxy") || url.pathname.includes("/__logout")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (res.type === "basic" || res.type === "default")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        // Offline navigation with no cached page: fall back to the app shell.
        if (req.mode === "navigate") {
          const shell = await caches.match(`${BASE}/`);
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
