
"use strict";

const CACHE_PREFIX = "cap-savoir-manager-";
const CACHE_NAME = `${CACHE_PREFIX}v7`;

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./favicon.ico",
  "./favicon.svg",
  "./manifest.json",
  "./css/style.css",
  "./js/storage-recovery.js",
  "./js/students.js",
  "./js/attendance.js",
  "./js/operations.js",
  "./js/app.js"
];

// Installation : mise en cache des fichiers essentiels
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    }).catch((error) => {
      console.error("Échec de mise en cache des ressources essentielles :", error);
      throw error;
    })
  );

  self.skipWaiting();
});

// Activation : ne supprimer que les anciennes versions du cache de cette application.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

// Utiliser la version réseau lorsqu'elle est disponible, avec repli hors connexion.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === "navigate";
  const isStaticAsset = /\.(?:html|css|js|json|svg|ico|png|webmanifest)$/i.test(url.pathname);
  if (!isNavigation && !isStaticAsset) return;

  event.respondWith(
    (async () => {
      // L'icône est précachée et stable pour cette version : la servir d'abord
      // évite un échec réseau inutile sur la requête automatique du navigateur.
      if (/\/favicon\.(?:ico|svg)$/i.test(url.pathname)) {
        const cachedIcon = await caches.match(event.request).catch(() => null);
        if (cachedIcon) return cachedIcon;
      }

      let response;
      try {
        response = await fetch(event.request);
      } catch {
        const cached = await caches.match(event.request).catch(() => null);
        if (cached) return cached;

        if (isNavigation) {
          const appShell = await caches.match("./index.html").catch(() => null);
          if (appShell) return appShell;
        }

        return new Response("Ressource statique indisponible hors connexion.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }

      if (!response || !response.ok) return response;
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      } catch (cacheError) {
        console.warn("La ressource a été chargée, mais pas ajoutée au cache hors ligne :", cacheError);
      }
      return response;
    })().catch((error) => {
      console.error("Échec du traitement d'une ressource statique :", error);
      return new Response("La ressource n'a pas pu être traitée par le cache local.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    })
  );
});
