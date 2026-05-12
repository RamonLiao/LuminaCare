// v2: network-first. Old v1 cached HTML which referenced now-404'd /_next/ chunks.
const CACHE = "ph-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept Next.js internals or API routes.
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return;
  // Network-first; fall back to cache only when offline.
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(e.request);
        const cache = await caches.open(CACHE);
        cache.put(e.request, res.clone()).catch(() => {});
        return res;
      } catch {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        throw new Error("offline");
      }
    })(),
  );
});
