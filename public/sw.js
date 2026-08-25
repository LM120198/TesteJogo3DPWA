/* VETOR-12 — Service Worker
 * Estratégia: precache do shell + cache-first com rede como fallback
 * para assets com hash. Permite partida offline após a primeira visita.
 */
const VERSION = "vetor12-v1.0.0";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Mesmo origem (app + assets com hash): cache-first, hidratação em 2º plano.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (cached) => {
          const network = fetch(req)
            .then((res) => {
              if (res && res.status === 200) {
                const copy = res.clone();
                caches.open(VERSION).then((c) => c.put(req, copy));
              }
              return res;
            })
            .catch(() => cached);
          if (cached) return cached;
          return network;
        }
      )
    );
    return;
  }

  // Fontes/CDN: rede com fallback de cache (resiliência offline).
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
