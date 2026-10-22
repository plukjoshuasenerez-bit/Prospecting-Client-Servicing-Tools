// KILL-SWITCH service worker.
// An earlier service worker cached the app and kept serving stale code. This
// version caches NOTHING, deletes every existing cache, and unregisters itself.
// It deliberately does NOT force a navigation/reload — forcing one could bounce
// a page that is already mid-refresh. It simply removes itself so the NEXT normal
// load comes straight from the network with the live code.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var ks = await caches.keys();
      await Promise.all(ks.map(function (k) { return caches.delete(k); }));
    } catch (err) {}
    try { await self.registration.unregister(); } catch (err) {}
  })());
});
// No 'fetch' handler: the browser always goes straight to the network, so no
// stale cached page is ever served again.
