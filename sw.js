const CACHE = "oratoria-diaria-v4";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/estilo.css",
  "./js/app.js",
  "./js/db.js",
  "./js/conteudo.js",
  "./js/conquistas.js",
  "./js/improviso.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
      .catch((err) => console.error("SW install falhou:", err))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const destino = req.destination;

  // 1) Assets estáticos: cache-first (script, style, image, manifest, font)
  if (["script", "style", "image", "manifest", "font"].includes(destino)) {
    e.respondWith(
      caches.match(req)
        .then((cached) => {
          if (cached) return cached;
          return fetch(req)
            .then((r) => {
              if (r.ok) {
                const copia = r.clone();
                caches.open(CACHE).then((c) => c.put(req, copia));
              }
              return r;
            })
            .catch(() => cached); // fallback se já estivesse em cache
        })
    );
    return;
  }

  // 2) Navegação (HTML): rede primeiro com fallback para index.html (SPA offline)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copia));
          return r;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 3) Demais requisições: tenta cache, senão rede
  e.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
