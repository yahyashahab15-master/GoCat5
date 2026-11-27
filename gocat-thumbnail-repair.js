/* GoCat legacy thumbnail repair.
   Existing uploads had no thumbnail_path stored. This lets the signed-in
   creator (or GoCat admin) generate small preview images and save the URL. */
(function () {
  "use strict";

  const MAX_THUMB_WIDTH = 640;
  const MAX_THUMB_HEIGHT = 640;
  let running = false;

  const $ = id => document.getElementById(id);

  function allowedVideos() {
    if (typeof videos === "undefined" || !Array.isArray(videos)) return [];
    return videos.filter(video =>
      !video.thumbnail_path &&
      (typeof isGoCatAdmin !== "undefined" && isGoCatAdmin
        ? true
        : typeof isOwnContent === "function" && isOwnContent(video.owner_id))
    );
  }

  function setStatus(message) {
    const status = $("gocatThumbnailRepairStatus");
    if (status) status.textContent = message;
  }

  function refreshButton() {
    const button = $("gocatThumbnailRepairBtn");
    if (!button) return;
    const count = allowedVideos().length;
    button.hidden = count === 0 || running;
    button.textContent = "Generate missing thumbnails (" + count + ")";
  }

  function mount() {
    const heading = document.querySelector("#page-studio .page-title-row");
    if (!heading || $("gocatThumbnailRepairBtn")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "gocatThumbnailRepairBtn";
    button.className = "soft-btn gocat-thumbnail-repair-btn";
    button.textContent = "Generate missing thumbnails";
    const status = document.createElement("p");
    status.id = "gocatThumbnailRepairStatus";
    status.className = "gocat-thumbnail-repair-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const uploadButton = heading.querySelector("button");
    if (uploadButton) uploadButton.insertAdjacentElement("beforebegin", button);
    else heading.appendChild(button);
    heading.insertAdjacentElement("afterend", status);

    button.addEventListener("click", repairMissingThumbnails);
    refreshButton();
  }

  function waitForMedia(video, eventName, timeoutMs) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(eventName, success);
        video.removeEventListener("error", failure);
      };
      const done = callback => {
        if (finished) return;
        finished = true;
        cleanup();
        callback();
      };
      const success = () => done(resolve);
      const failure = () => done(() => reject(new Error("The browser could not read this video.")));
      const timer = setTimeout(() => done(() => reject(new Error("Video preview timed out."))), timeoutMs);
      video.addEventListener(eventName, success, { once: true });
      video.addEventListener("error", failure, { once: true });
    });
  }

  async function captureThumbnail(videoUrl) {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = videoUrl;

    try {
      if (video.readyState < 1) await waitForMedia(video, "loadedmetadata", 15000);
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) throw new Error("Video dimensions are unavailable.");

      const sampleTime = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(1, video.duration * 0.12)
        : 0;
      if (sampleTime > 0.05) {
        const seeked = waitForMedia(video, "seeked", 12000);
        video.currentTime = sampleTime;
        await seeked;
      } else if (video.readyState < 2) {
        await waitForMedia(video, "loadeddata", 12000);
      }

      const scale = Math.min(1, MAX_THUMB_WIDTH / sourceWidth, MAX_THUMB_HEIGHT / sourceHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The browser could not prepare a thumbnail.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.78));
      if (!blob || !blob.size) throw new Error("The thumbnail image was empty.");
      return new File([blob], "gocat-thumbnail.jpg", {
        type: "image/jpeg",
        lastModified: Date.now()
      });
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }

  async function uploadThumbnail(file, video) {
    const safeId = String(video.id).replace(/[^a-zA-Z0-9_-]/g, "");
    const fallbackPath = String(currentUser.id) + "/thumbnails/" + safeId + ".jpg";

    if (!window.GoCatMedia?.uploadOrFallback) {
      const result = await db.storage.from("videos").upload(fallbackPath, file, {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: "31536000"
      });
      if (result.error) throw result.error;
      return { provider: "supabase", path: result.data?.path || fallbackPath };
    }

    return window.GoCatMedia.uploadOrFallback(file, { purpose: "post" }, async () => {
      const result = await db.storage.from("videos").upload(fallbackPath, file, {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: "31536000"
      });
      if (result.error) throw result.error;
      return { provider: "supabase", path: result.data?.path || fallbackPath };
    });
  }

  async function saveThumbnail(video, file) {
    const asset = await uploadThumbnail(file, video);
    const storedPath = asset.provider === "vercel-blob" ? asset.url : asset.path;
    if (!storedPath) throw new Error("The thumbnail uploaded without a saved path.");

    const update = await db.from("videos")
      .update({ thumbnail_path: storedPath })
      .eq("id", video.id)
      .select("id,thumbnail_path")
      .maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) {
      throw new Error("GoCat did not allow this account to update this video's thumbnail.");
    }
    video.thumbnail_path = update.data.thumbnail_path;
  }

  async function repairMissingThumbnails() {
    if (running) return;
    if (typeof currentUser === "undefined" || !currentUser || !db) {
      if (typeof requireAuth === "function") requireAuth("repair video thumbnails");
      return;
    }

    const queue = allowedVideos();
    if (!queue.length) {
      setStatus("All videos you can manage already have thumbnails.");
      refreshButton();
      return;
    }

    running = true;
    const button = $("gocatThumbnailRepairBtn");
    if (button) { button.disabled = true; button.hidden = false; button.textContent = "Generating…"; }
    let success = 0, failed = 0;
    const total = queue.length;

    for (let index = 0; index < total; index++) {
      const video = queue[index];
      setStatus("Creating thumbnail " + (index + 1) + " of " + total + ": " + (video.title || "Untitled video"));
      try {
        const file = await captureThumbnail(getVideoURL(video.storage_path));
        await saveThumbnail(video, file);
        success++;
      } catch (error) {
        failed++;
        console.warn("GoCat thumbnail repair failed for video", video.id, error);
      }
    }

    running = false;
    if (success && typeof renderEverything === "function") renderEverything();
    setStatus(success + " thumbnail(s) created" + (failed ? "; " + failed + " could not be generated. Check their video CORS/format." : "."));
    refreshButton();
  }

  function boot() {
    mount();
    const content = $("studioContent");
    if (content && "MutationObserver" in window) {
      const observer = new MutationObserver(refreshButton);
      observer.observe(content, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.GoCatThumbnailRepair = { repairMissingThumbnails };
})();