"use strict";
const CACHE_NAME = "gocat-shell-v7";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/gocat-logo.svg",
  "/random%20go.css",
  "/gocat-upgrades.css",
  "/gocat-mobile-polish.css",
  "/gocat-commercial-polish.css",
  "/gocat-creator-launchpad.css",
  "/gocat-communities.css",
  "/gocat-stories.css",
  "/gocat-media.js",
  "/randomgo.js",
  "/gocat-communities.js",
  "/gocat-stories.js",
  "/gocat-enhancements.js",
  "/gocat-commercial-polish.js",
  "/gocat-creator-launchpad.js",
  "/gocat-pwa.js"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put("/index.html", response.clone()));
      return response;
    }).catch(() => caches.match("/index.html")));
    return;
  }
  if (APP_SHELL.includes(url.pathname) || url.pathname === "/random%20go.css") {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});