/* GoCat media uploads through the connected Vercel Blob store.
 * Upload tokens are issued by /api/blob-upload only after the GoCat session
 * has been verified server-side. The Blob write token never reaches the browser.
 */
(function () {
  "use strict";

  const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
  const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
  let blobClientPromise = null;

  function mediaError(message, code, status) {
    const error = new Error(message);
    error.code = code || "BLOB_UPLOAD_ERROR";
    error.status = status || 0;
    return error;
  }

  function safeFilename(file) {
    return String(file.name || "gocat-media")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "")
      .slice(-140) || "gocat-media";
  }

  function makeId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "");
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  async function loadBlobClient() {
    if (!blobClientPromise) {
      blobClientPromise = import("https://esm.sh/@vercel/blob@2.9.0/client?bundle")
        .then(module => {
          if (typeof module.upload !== "function") {
            throw new Error("The Vercel Blob browser uploader could not be loaded.");
          }
          return module;
        })
        .catch(error => {
          blobClientPromise = null;
          throw mediaError(
            "The Vercel Blob uploader could not load. Check your internet connection and try again.",
            "BLOB_CLIENT_LOAD_ERROR"
          );
        });
    }
    return blobClientPromise;
  }

  async function upload(file, options = {}) {
    if (!(file instanceof Blob) || !file.size) {
      throw mediaError("Choose a valid file before uploading.", "INVALID_FILE");
    }

    const isVideo = String(file.type || "").startsWith("video/");
    const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size > maxBytes) {
      throw mediaError(
        isVideo ? "Videos must be 500 MB or smaller." : "Images must be 25 MB or smaller.",
        "BLOB_FILE_TOO_LARGE"
      );
    }

    if (typeof db === "undefined" || !db) {
      throw mediaError("GoCat sign-in is unavailable.", "AUTH_REQUIRED");
    }

    const sessionResult = await db.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    const session = sessionResult.data.session;
    if (!session?.access_token || !session.user?.id) {
      throw mediaError("Sign in again before uploading.", "AUTH_REQUIRED");
    }

    const allowedPurposes = ["video", "reel", "post", "story", "community"];
    const purpose = allowedPurposes.includes(options.purpose) ? options.purpose : "post";
    const name = safeFilename(file);
    const pathname = "gocat/" + session.user.id + "/" + purpose + "/" +
      Date.now() + "-" + makeId().slice(0, 12) + "-" + name;

    const client = await loadBlobClient();
    try {
      const result = await client.upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        headers: { Authorization: "Bearer " + session.access_token },
        clientPayload: JSON.stringify({ purpose }),
        contentType: file.type || "application/octet-stream",
        multipart: file.size > 100 * 1024 * 1024,
        onUploadProgress: progress => {
          if (typeof options.onProgress === "function") {
            const percentage = Number(progress?.percentage || 0);
            options.onProgress(Math.max(0, Math.min(100, Math.round(percentage))));
          }
        }
      });

      if (typeof options.onProgress === "function") options.onProgress(100);
      return {
        provider: "vercel-blob",
        url: result.url,
        path: result.url,
        pathname: result.pathname,
        name,
        size: file.size,
        fileType: file.type
      };
    } catch (error) {
      if (error?.code) throw error;
      throw mediaError(error?.message || "Vercel Blob could not save this file.", "BLOB_UPLOAD_ERROR");
    }
  }

  async function uploadOrFallback(file, options = {}, fallback) {
    try {
      return await upload(file, options);
    } catch (error) {
      if (error.code !== "BLOB_NOT_CONFIGURED" && error.code !== "BLOB_CLIENT_LOAD_ERROR") {
        throw error;
      }
      if (typeof fallback !== "function") throw error;
      return await fallback(error);
    }
  }

  async function checkStatus() {
    try {
      const response = await fetch("/api/blob-upload", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Storage status unavailable.");
      return {
        provider: payload.provider || "Vercel Blob",
        configured: payload.configured === true,
        store: payload.store || "gocat-media",
        region: payload.region || "dxb1"
      };
    } catch (error) {
      console.warn("GoCat Blob storage status:", error.message);
      return { provider: "Vercel Blob", configured: false, unavailable: true };
    }
  }

  function isRemoteUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  async function renderStorageStatus() {
    const label = document.getElementById("gocatStorageStatusLabel");
    const detail = document.getElementById("gocatStorageStatusText");
    const note = document.getElementById("gocatStorageStatusDetails");
    if (!label || !detail || !note) return;

    label.textContent = "Checking…";
    const status = await checkStatus();

    if (status.configured) {
      label.textContent = "Vercel Blob connected";
      label.dataset.state = "connected";
      detail.textContent = "New videos, Reels, post images, Stories and community media can use your separate Vercel Blob store.";
      note.textContent = "Free Hobby allowance: 1 GB average storage and 10 GB monthly Blob data transfer. Check Vercel Usage for the current totals.";
    } else {
      label.textContent = status.unavailable ? "Status unavailable" : "Not connected";
      label.dataset.state = "inactive";
      detail.textContent = "New uploads are using GoCat’s existing Supabase storage until Vercel Blob is available.";
      note.textContent = "The Blob store is connected in Vercel. Refresh after the latest deployment finishes.";
    }
  }

  window.GoCatMedia = { upload, uploadOrFallback, isRemoteUrl, checkStatus, renderStorageStatus };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderStorageStatus, { once: true });
  } else {
    renderStorageStatus();
  }
})();
