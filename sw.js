"use strict";
const CACHE_NAME = "gocat-shell-v27";
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
  "/gocat-batch-upload.css",
  "/gocat-thumbnail-repair.css",
  "/gocat-communities.css",
  "/gocat-stories.css",
  "/gocat-media.js",
  "/randomgo.js",
  "/gocat-communities.js",
  "/gocat-stories.js",
  "/gocat-enhancements.js",
  "/gocat-commercial-polish.js",
  "/gocat-creator-launchpad.js",
  "/gocat-batch-upload.js",
  "/gocat-thumbnail-repair.js",
  "/gocat-advanced.css",
  "/gocat-advanced.js",
  "/gocat-pwa.js",
  "/gocat-growth.css",
  "/gocat-chat-admin.css",
  "/gocat-group-chat.css",
  "/gocat-group-chat.js",
  "/gocat-voice-notes.css",
  "/gocat-voice-notes.js",
  "/gocat-voice-calls.css",
  "/gocat-voice-calls.js",
  "/gocat-chat-refresh.css",
  "/gocat-chat-refresh.js"
];

const SHARE_INBOX_DB = "gocat-share-inbox";
const SHARE_FILE_LIMIT = 50 * 1024 * 1024;

function saveIncomingShare(record) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_INBOX_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("incoming")) {
        request.result.createObjectStore("incoming", { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error || new Error("Could not open share inbox."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("incoming", "readwrite");
      transaction.objectStore("incoming").put(record);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not save shared content.")); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Share inbox save was cancelled.")); };
    };
  });
}

async function receiveSharedContent(request) {
  try {
    const form = await request.formData();
    const incomingFiles = form.getAll("files").filter(item =>
      item && typeof item.name === "string" && item.name && typeof item.size === "number" && item.size > 0
    );
    let file = incomingFiles[0] || null;
    let error = "";
    let notice = "";

    if (incomingFiles.length > 1) {
      notice = "GoCat chat attaches one file per message. The first shared file was added; share other files separately.";
    }
    if (file && file.size > SHARE_FILE_LIMIT) {
      error = "This shared file is larger than GoCat's current 50 MB per-file limit.";
      file = null;
    }

    const record = {
      id: "latest",
      receivedAt: Date.now(),
      title: String(form.get("title") || "").slice(0, 240),
      text: String(form.get("text") || "").slice(0, 10000),
      url: String(form.get("url") || "").slice(0, 4000),
      file,
      fileName: file ? String(file.name || "shared-file").slice(0, 180) : "",
      fileType: file ? String(file.type || "").slice(0, 160) : "",
      fileLastModified: file && Number(file.lastModified || 0),
      notice,
      error
    };

    await saveIncomingShare(record);
    return Response.redirect(new URL("/?gocatShareInbox=1", self.location.origin), 303);
  } catch (error) {
    console.error("GoCat share target could not save incoming content:", error);
    return Response.redirect(new URL("/?gocatShareInboxError=1", self.location.origin), 303);
  }
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("notificationclick", event => {
  const data = event.notification && event.notification.data || {};
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => {
      try { return new URL(client.url).origin === self.location.origin; }
      catch { return false; }
    });
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: "GOCAT_OPEN_INCOMING_CALL", callId: data.callId || "" });
      return;
    }
    await self.clients.openWindow("/");
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && request.method === "POST" && url.pathname === "/share-target/") {
    event.respondWith(receiveSharedContent(request));
    return;
  }
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