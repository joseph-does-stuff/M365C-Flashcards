/* M365C Study service worker: app files cache-first, question packs network-first. Bump CACHE when app files change. */
var CACHE = 'm365c-study-v1';
var SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'stix-latin-400-normal.woff2', 'stix-latin-400-italic.woff2', 'stix-latin-600-normal.woff2', 'stix-latin-700-normal.woff2',
  'stix-greek-400-normal.woff2', 'stix-greek-400-italic.woff2', 'stix-greek-600-normal.woff2', 'stix-greek-700-normal.woff2',
  'karla-400-normal.woff2', 'karla-400-italic.woff2', 'karla-700-normal.woff2', 'karla-800-normal.woff2'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL).then(function () {
      return fetch('packs.json').then(function (r) { return r.json(); }).then(function (idx) {
        return c.addAll(['packs.json', 'course.json'].concat((idx.packs || []).map(function (p) { return p.file; })));
      }).catch(function () {});
    });
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  var isData = /\.json$/.test(url.pathname);
  if (isData) {
    // network first so new packs show up; fall back to the cached copy offline
    var clean = new Request(url.origin + url.pathname);
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(clean, copy); }); }
      return res;
    }).catch(function () { return caches.match(clean); }));
    return;
  }
  e.respondWith(caches.match(req, {ignoreSearch: true}).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
