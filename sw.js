// Service worker: เล่นได้แม้ไม่มีเน็ต (เกมกับบอท)
//   หน้าเกม/สคริปต์ = ลองเน็ตก่อน (ได้เวอร์ชันใหม่เสมอ) ไม่มีเน็ตค่อยใช้ของที่เก็บไว้
//   รูป / ฟอนต์ / ไลบรารี = ใช้ของที่เก็บไว้ก่อน (เร็ว) แล้วเก็บเพิ่มตอนโหลดครั้งแรก
const CACHE = "banmo-1794922985";
const SHELL = ["play.html", "engine.js", "session.js", "manifest.webmanifest", "icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url), same = url.origin === location.origin;
  const isShell = same && (req.mode === "navigate" || /\.(html|js|webmanifest)$/.test(url.pathname));
  if (isShell) {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("play.html"))));
    return;
  }
  if (same || /fonts\.(googleapis|gstatic)\.com|unpkg\.com|cdnjs\.cloudflare\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return r; })));
  }
});
