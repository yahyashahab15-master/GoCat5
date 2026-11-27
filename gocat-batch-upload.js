/* GoCat multi-video uploader.
   Uploads creator-owned local files sequentially through the existing secure
   Vercel Blob/Supabase path. It deliberately avoids third-party link scraping. */
(function () {
  "use strict";

  const MAX_FILES = 5;
  const MAX_FILE_BYTES = 150 * 1024 * 1024;
  const MAX_BATCH_BYTES = 250 * 1024 * 1024;
  let selectedFiles = [];
  let busy = false;

  const $ = id => document.getElementById(id);
  const formatBytes = bytes => {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  };
  const safeTitle = name => String(name || "Untitled video")
    .replace(/\.[^.]+$/, "").replace(/[<>]/g, "").trim().slice(0, 100) || "Untitled video";

  function mount() {
    const studio = $("page-studio");
    if (!studio || $("gocatBatchUploader")) return;
    const section = document.createElement("section");
    section.id = "gocatBatchUploader";
    section.className = "gocat-batch-uploader";
    section.innerHTML = `
      <div class="gocat-batch-heading">
        <div><span class="gocat-batch-kicker">CREATOR WORKFLOW</span>
          <h2>Upload a video collection</h2>
          <p>Add several videos or Reels in one queue. GoCat uploads them one at a time so the browser and your free storage allowance are not overwhelmed.</p>
        </div>
        <span class="gocat-batch-icon" aria-hidden="true">⇧</span>
      </div>
      <label class="gocat-batch-picker" for="gocatBatchFiles">
        <strong>Choose up to ${MAX_FILES} videos</strong>
        <small>MP4, WebM or MOV · max 150 MB per file · max 250 MB per batch</small>
        <input id="gocatBatchFiles" type="file" accept="video/mp4,video/webm,video/quicktime" multiple>
      </label>
      <div id="gocatBatchSelection" class="gocat-batch-selection">No videos selected yet.</div>
      <div class="gocat-batch-options">
        <label>Publish as
          <select id="gocatBatchKind"><option value="video">Videos</option><option value="reel">Reels</option></select>
        </label>
        <label>Topic
          <select id="gocatBatchTopic">
            <option>Gaming</option><option>Technology</option><option>Education</option>
            <option>Sports</option><option>Music</option><option>Art</option>
            <option>Cooking</option><option>School</option><option>Entertainment</option><option>Other</option>
          </select>
        </label>
      </div>
      <label class="gocat-batch-description">Shared description (optional)
        <textarea id="gocatBatchDescription" maxlength="1000" rows="2" placeholder="A short description for every video in this batch"></textarea>
      </label>
      <div class="gocat-batch-footer">
        <span id="gocatBatchSummary">Choose only videos you own or have permission to publish.</span>
        <button id="gocatBatchStart" type="button" class="primary-btn" disabled>Upload collection</button>
      </div>
      <div id="gocatBatchQueue" class="gocat-batch-queue" aria-live="polite"></div>`;
    const storage = studio.querySelector(".gocat-storage-status");
    const stats = studio.querySelector(".studio-stats");
    if (storage) storage.insertAdjacentElement("afterend", section);
    else if (stats) stats.insertAdjacentElement("beforebegin", section);
    else studio.prepend(section);

    $("gocatBatchFiles").addEventListener("change", onFileChange);
    $("gocatBatchStart").addEventListener("click", runBatch);
  }

  function onFileChange() {
    const input = $("gocatBatchFiles");
    const files = Array.from(input.files || []);
    const reason = [];
    if (files.length > MAX_FILES) reason.push("Choose no more than " + MAX_FILES + " files.");
    if (files.some(file => !["video/mp4", "video/webm", "video/quicktime"].includes(file.type))) {
      reason.push("Only MP4, WebM and MOV videos are supported.");
    }
    if (files.some(file => file.size > MAX_FILE_BYTES)) reason.push("Each video must be 150 MB or smaller.");
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_BATCH_BYTES) reason.push("The full batch must be 250 MB or smaller.");

    selectedFiles = reason.length ? [] : files;
    $("gocatBatchSelection").textContent = reason.length
      ? reason.join(" ")
      : selectedFiles.length
        ? selectedFiles.map(file => file.name + " · " + formatBytes(file.size)).join("  |  ")
        : "No videos selected yet.";
    $("gocatBatchSummary").textContent = reason.length
      ? "Please correct the selection."
      : selectedFiles.length
        ? selectedFiles.length + " video(s) · " + formatBytes(total) + " total"
        : "Choose only videos you own or have permission to publish.";
    $("gocatBatchStart").disabled = !selectedFiles.length || busy;
  }

  function addQueueRow(file) {
    const row = document.createElement("article");
    row.className = "gocat-batch-item";
    const info = document.createElement("div");
    info.className = "gocat-batch-item-info";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const status = document.createElement("small");
    status.textContent = "Waiting";
    info.append(name, status);
    const progress = document.createElement("div");
    progress.className = "gocat-batch-progress";
    const bar = document.createElement("span");
    progress.appendChild(bar);
    row.append(info, progress);
    $("gocatBatchQueue").appendChild(row);
    return {
      status: text => { status.textContent = text; },
      progress: value => { bar.style.width = Math.max(0, Math.min(100, Number(value) || 0)) + "%"; },
      done: ok => { row.classList.toggle("is-done", ok); row.classList.toggle("is-failed", !ok); }
    };
  }

  async function uploadOne(file, kind, topic, description, ui) {
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const suffix = window.crypto?.randomUUID ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2));
    const fallbackPath = String(currentUser.id) + "/" + Date.now() + "-" + suffix.slice(0, 12) + "." + ext;
    let uploaded = false;
    let provider = "supabase";
    let videoPath = fallbackPath;
    let thumbnailPath = null;
    let thumbnailProvider = "supabase";

    try {
      ui.status("Uploading video…");
      const upload = await uploadVideoFile(file, fallbackPath, percent => {
        ui.progress(percent);
        ui.status("Uploading video · " + percent + "%");
      });
      uploaded = true;
      provider = upload.provider || "supabase";
      videoPath = upload.path || fallbackPath;

      try {
        const thumbnail = await generateVideoThumbnail(file);
        if (thumbnail) {
          const thumbFallback = String(currentUser.id) + "/thumbnails/" + Date.now() + "-" + suffix.slice(0, 10) + ".jpg";
          const asset = await window.GoCatMedia.uploadOrFallback(thumbnail, { purpose: "post" }, async () => {
            const result = await db.storage.from(VIDEO_BUCKET).upload(thumbFallback, thumbnail, {
              cacheControl: "31536000", contentType: "image/jpeg", upsert: false
            });
            if (result.error) throw result.error;
            return { provider: "supabase", path: result.data?.path || thumbFallback };
          });
          thumbnailProvider = asset.provider || "supabase";
          thumbnailPath = thumbnailProvider === "vercel-blob" ? asset.url : asset.path;
        }
      } catch (error) {
        console.warn("GoCat batch thumbnail skipped:", error);
      }

      ui.status("Saving video details…");
      const saved = await insertVideoRecord({
        owner_id: currentUser.id,
        title: safeTitle(file.name),
        description: description,
        topic: topic,
        storage_path: videoPath,
        thumbnail_path: thumbnailPath,
        views: 0,
        is_short: kind === "reel"
      });
      if (saved.error) throw saved.error;
      ui.progress(100);
      ui.status("Published");
      ui.done(true);
      if (typeof addLocalNotification === "function") {
        addLocalNotification("video", (kind === "reel" ? "Reel" : "Video") + " published: " + safeTitle(file.name));
      }
      return true;
    } catch (error) {
      if (uploaded && provider === "supabase") {
        const cleanup = await db.storage.from(VIDEO_BUCKET).remove([videoPath]);
        if (cleanup.error) console.warn("Batch upload cleanup:", cleanup.error);
      }
      if (thumbnailPath && thumbnailProvider === "supabase") {
        const cleanup = await db.storage.from(VIDEO_BUCKET).remove([thumbnailPath]);
        if (cleanup.error) console.warn("Batch thumbnail cleanup:", cleanup.error);
      }
      ui.status("Failed · " + (error?.message || "Upload failed"));
      ui.done(false);
      return false;
    }
  }

  async function runBatch() {
    if (busy || !selectedFiles.length) return;
    if (typeof currentUser === "undefined" || !currentUser || !db) {
      if (typeof requireAuth === "function") requireAuth("upload videos");
      return;
    }
    if (typeof uploadVideoFile !== "function" || typeof insertVideoRecord !== "function") {
      showToast("The GoCat uploader is not ready. Refresh the page and try again.");
      return;
    }

    const kind = $("gocatBatchKind").value;
    const topic = $("gocatBatchTopic").value;
    const description = $("gocatBatchDescription").value.trim();
    const files = selectedFiles.slice();
    const button = $("gocatBatchStart");
    const input = $("gocatBatchFiles");
    const previousMode = uploadMode;
    busy = true;
    button.disabled = true;
    button.textContent = "Uploading…";
    input.disabled = true;
    $("gocatBatchKind").disabled = true;
    $("gocatBatchTopic").disabled = true;
    uploadMode = kind === "reel" ? "short" : "video";
    $("gocatBatchQueue").replaceChildren();

    let successes = 0;
    try {
      for (const file of files) {
        const ui = addQueueRow(file);
        if (await uploadOne(file, kind, topic, description, ui)) successes += 1;
      }
      if (successes) {
        await loadVideos();
        homeVisibleCycles = 1;
        reelsVisible = Math.max(reelsVisible, PAGE_SIZE);
        renderEverything();
      }
      showToast(successes + " of " + files.length + " videos published.");
      $("gocatBatchSummary").textContent = successes + " of " + files.length + " uploaded successfully.";
      selectedFiles = [];
      input.value = "";
      $("gocatBatchSelection").textContent = "Your upload queue is complete.";
    } catch (error) {
      console.error("GoCat batch upload:", error);
      showToast("Batch upload stopped: " + (error?.message || "Please try again."));
    } finally {
      uploadMode = previousMode;
      busy = false;
      button.disabled = !selectedFiles.length;
      button.textContent = "Upload collection";
      input.disabled = false;
      $("gocatBatchKind").disabled = false;
      $("gocatBatchTopic").disabled = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
  // This script is loaded with defer, so the Studio markup exists when it runs.
  // Keep no permanent observer on the whole app; it would wake on every feed render.
})();