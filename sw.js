// KILL-SWITCH service worker.
// An earlier service worker cached index.html and kept serving a stale copy to
// devices, so users never received new deployments (including the fix that stops
// the app auto-reloading). This version caches NOTHING, deletes every existing
// cache, unregisters itself, and forces open pages to reload once from the
// network. After this runs, devices always load the live version directly.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var ks = await caches.keys();
      await Promise.all(ks.map(function (k) { return caches.delete(k); }));
    } catch (err) {}
    try { await self.registration.unregister(); } catch (err) {}
    try {
      var cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(function (c) { try { c.navigate(c.url); } catch (err) {} });
    } catch (err) {}
  })());
});
// No 'fetch' handler on purpose: the browser goes straight to the network for
// every request, so no stale cached page can ever be served again.
