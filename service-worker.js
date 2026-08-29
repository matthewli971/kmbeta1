const CACHE_NAME = 'kmbeta1-shell-v7';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './bootstrap.js',
    './settings.js',
    './data.js',
    './stop-eta.js',
    './eta.js',
    './stop-modify.js',
    './script.js',
    './route-win.js',
    './stop-win.js',
    './stp.html',
    './mjh.html',
    './manifest.json',
    './manifest-stp.json',
    './manifest-mjh.json',
    './config/index.js',
    './logo_v2.svg',
    './font/arial.ttf',
    './font/arialbd.ttf',
    './font/arialbi.ttf',
    './font/ariali.ttf',
    './font/ARIALN.TTF',
    './font/ARIALNB.TTF',
    './font/ARIALNBI.TTF',
    './font/ARIALNI.TTF',
    './font/ariblk.ttf'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
