// Offline support: app files and libraries are cached; map tiles you have viewed stay available offline.
const APP = "wa-app-v44", TILES = "wa-tiles", MAX_TILES = 4000;
const SHELL = ["./", "./index.html", "./app.js", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./seed.json", "./surf-seed.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function trimTiles() {
  const c = await caches.open(TILES), keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in") || url.hostname === "router.project-osrm.org" || url.hostname === "valhalla1.openstreetmap.de" || url.hostname === "photon.komoot.io") return;
  if (url.hostname === "tile.openstreetmap.org" || url.hostname === "server.arcgisonline.com") {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) { c.put(req, res.clone()); trimTiles(); } return res;
    }));
    return;
  }
  // Own app files: always try the network first (fresh updates), fall back to the saved copy offline.
  if (url.origin === location.origin) {
    e.respondWith(caches.open(APP).then(async c => {
      try {
        const res = await fetch(new Request(req, { cache: "no-cache" }));
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (_) {
        const hit = await c.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === "navigate") return c.match("./index.html");
        return Response.error();
      }
    }));
    return;
  }
  // CDN libraries (pinned versions, never change): saved copy first.
  e.respondWith(caches.open(APP).then(async c => {
    const hit = await c.match(req); if (hit) return hit;
    try { const res = await fetch(req); if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }
    catch (_) { return Response.error(); }
  }));
});
