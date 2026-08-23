/* PlanRepas — service worker
 * Rend l'application utilisable hors ligne une fois la première visite effectuée.
 * Aucune donnée utilisateur ne transite ici : le planning vit dans le localStorage.
 */
'use strict';

const VERSION = 'v0.26';
const SHELL = `planrepas-shell-${VERSION}`;   // fichiers de l'application
const ASSETS = `planrepas-assets-${VERSION}`; // polices distantes

const SHELL_FILES = [
    './',
    './index.html',
    './manifest.json',
    './data/seed.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL)
            .then((cache) => cache.addAll(SHELL_FILES))
            .catch(() => { /* une ressource manquante ne doit pas bloquer l'installation */ })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter((k) => k.startsWith('planrepas-') && k !== SHELL && k !== ASSETS)
                .map((k) => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

// Permet à la page de déclencher la bascule vers une nouvelle version
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;

    // Navigation : réseau d'abord (pour récupérer les mises à jour), cache en secours
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(req);
                const cache = await caches.open(SHELL);
                cache.put('./index.html', fresh.clone());
                return fresh;
            } catch (e) {
                const cached = await caches.match('./index.html', { ignoreSearch: true });
                return cached || Response.error();
            }
        })());
        return;
    }

    // Ressources de l'application : cache d'abord, rafraîchi en arrière-plan
    if (sameOrigin) {
        event.respondWith((async () => {
            const cached = await caches.match(req, { ignoreSearch: true });
            const network = fetch(req).then((res) => {
                if (res && res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
                return res;
            }).catch(() => null);
            return cached || (await network) || Response.error();
        })());
        return;
    }

    // Polices Google et photos de recettes importées : cache d'abord.
    // Sans cela, une recette venue d'un site tiers perdrait son illustration
    // dès qu'on ouvre l'application hors ligne.
    const estImage = req.destination === 'image';
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || estImage) {
        event.respondWith((async () => {
            const cache = await caches.open(ASSETS);
            const cached = await cache.match(req);
            const network = fetch(req).then((res) => {
                if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
                return res;
            }).catch(() => null);
            return cached || (await network) || Response.error();
        })());
    }
});
