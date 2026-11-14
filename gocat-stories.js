/* GoCat Stories: guest-readable, owner-published 24-hour moments. */
(function () {
  "use strict";
  const BUCKET = "story-media";
  const MAX_BYTES = 25 * 1024 * 1024;
  let stories = [], groups = [], activeUserId = null, activeIndex = 0;
  let busy = false, queued = false, previewUrl = null;
  const $ = id => document.getElementById(id);
  const own = id => !!currentUser && String(currentUser.id) === String(id);
  const toast = message => { if (typeof showToast === "function") showToast(message); };

  function avatarMarkup(userId) {
    const user = typeof getUser === "function" ? getUser(userId) : null;
    const name = typeof getUsername === "function" ? getUsername(userId) : "Creator";
    if (user?.avatar_path && typeof storageURL === "function") {
      return '<img src="' + esc(storageURL("profile-avatars", user.avatar_path)) + '" alt="" loading="lazy">';
    }
    return '<span aria-hidden="true">' + esc(String(name || "?").trim().charAt(0).toUpperCase() || "?") + '</span>';
  }

  function groupRows(rows) {
    const map = new Map();
    rows.forEach(row => {
      const key = String(row.user_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    const result = Array.from(map, ([userId, items]) => ({
      userId,
      items: items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
      newest: Math.max(...items.map(item => new Date(item.created_at).getTime()))
    }));
    result.sort((a, b) => own(a.userId) ? -1 : own(b.userId) ? 1 : b.newest - a.newest);
    return result;
  }

  function renderTray() {
    const tray = $("storiesTray");
    if (!tray) return;
    let html = "";
    if (currentUser) {
      const ownGroup = groups.find(group => own(group.userId));
      html += '<div class="gocat-story-tile gocat-own-story-tile"><button type="button" class="gocat-story-open" data-story-open="' + esc(currentUser.id) + '" aria-label="Open your story">';
      html += '<span class="gocat-story-ring own-ring"><span class="gocat-story-avatar">' + avatarMarkup(currentUser.id) + '</span></span><span class="gocat-story-name">Your story</span></button>';
      html += '<button type="button" class="gocat-story-add" data-story-create aria-label="Add to your story">+</button>';
      if (ownGroup) html += '<span class="gocat-story-count">' + ownGroup.items.length + '</span>';
      html += '</div>';
    } else {
      html += '<div class="gocat-story-tile"><button type="button" class="gocat-story-open" data-login-trigger aria-label="Sign in to add a story">';
      html += '<span class="gocat-story-ring own-ring"><span class="gocat-story-avatar"><span>+</span></span></span><span class="gocat-story-name">Your story</span></button></div>';
    }
    groups.filter(group => !own(group.userId)).forEach(group => {
      const name = typeof getUsername === "function" ? getUsername(group.userId) : "Creator";
      html += '<div class="gocat-story-tile"><button type="button" class="gocat-story-open" data-story-open="' + esc(group.userId) + '" aria-label="View ' + esc(name) + ' story">';
      html += '<span class="gocat-story-ring"><span class="gocat-story-avatar">' + avatarMarkup(group.userId) + '</span></span><span class="gocat-story-name">' + esc(name) + '</span></button></div>';
    });
    if (!groups.length) html += '<div class="gocat-stories-empty">No stories yet. Share a moment that disappears in 24 hours.</div>';
    tray.innerHTML = html;
  }

  async function loadStories() {
    if (!db) return;
    if (busy) { queued = true; return; }
    busy = true; queued = false;
    try {
      const result = await db.from("stories")
        .select("id,user_id,media_path,media_type,caption,created_at,expires_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(80);
      if (result.error) throw result.error;
      const prepared = await Promise.all((result.data || []).map(async row => {
        const remaining = Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000);
        if (remaining <= 0) return null;
        if (window.GoCatMedia?.isRemoteUrl(row.media_path)) {
          return Object.assign({}, row, { media_url: row.media_path });
        }
        const signed = await db.storage.from(BUCKET).createSignedUrl(row.media_path, Math.max(30, Math.min(86400, remaining)));
        if (signed.error || !signed.data?.signedUrl) return null;
        return Object.assign({}, row, { media_url: signed.data.signedUrl });
      }));
      stories = prepared.filter(Boolean);
      groups = groupRows(stories);
      renderTray();
      if (activeUserId && groups.every(group => group.userId !== activeUserId)) closeViewer();
    } catch (error) {
      console.error("GoCat Stories:", error);
      const tray = $("storiesTray");
      if (tray) tray.innerHTML = '<div class="gocat-stories-error">Stories could not load. <button type="button" data-story-refresh>Try again</button></div>';
    } finally {
      busy = false;
      if (queued) { queued = false; loadStories(); }
    }
  }

  function openComposer() {
    if (typeof requireAuth === "function" && !requireAuth("share a story")) return;
    $("storyComposer")?.classList.remove("hidden");
    $("storyComposer")?.setAttribute("aria-hidden", "false");
    $("storyCaption")?.focus();
  }

  function closeComposer() {
    $("storyComposer")?.classList.add("hidden");
    $("storyComposer")?.setAttribute("aria-hidden", "true");
    $("storyUploadForm")?.reset();
    const preview = $("storyUploadPreview");
    if (preview) preview.innerHTML = '<span>Choose an image or short video to preview it here.</span>';
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    const button = $("storyPublishBtn");
    if (button) { button.disabled = false; button.textContent = "Share story"; }
  }

  function closeViewer() {
    const modal = $("storyViewer");
    modal?.querySelector("video")?.pause();
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
    activeUserId = null; activeIndex = 0;
  }

  function storyAge(value) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    return seconds < 60 ? "Just now" : seconds < 3600 ? Math.floor(seconds / 60) + "m ago" : Math.floor(seconds / 3600) + "h ago";
  }

  function renderViewer() {
    const group = groups.find(item => item.userId === activeUserId);
    if (!group?.items?.length) return closeViewer();
    activeIndex = Math.max(0, Math.min(activeIndex, group.items.length - 1));
    const story = group.items[activeIndex];
    const name = typeof getUsername === "function" ? getUsername(group.userId) : "Creator";
    $("storyViewerName").textContent = name;
    $("storyViewerTime").textContent = storyAge(story.created_at);
    $("storyDeleteBtn")?.classList.toggle("hidden", !own(story.user_id));
    const bars = group.items.map((item, i) =>
      '<span class="gocat-story-progress-track"><i class="' + (i < activeIndex ? "complete" : i === activeIndex ? "current" : "") + '"></i></span>'
    ).join("");
    const media = story.media_type === "video"
      ? '<video src="' + esc(story.media_url) + '" controls autoplay muted playsinline preload="metadata"></video>'
      : '<img src="' + esc(story.media_url) + '" alt="Story shared by ' + esc(name) + '">';
    $("storyViewerStage").innerHTML = '<div class="gocat-story-progress">' + bars + '</div><div class="gocat-story-viewer-media">' + media + '</div>' +
      (story.caption ? '<div class="gocat-story-caption">' + esc(story.caption) + '</div>' : "");
    $("storyPreviousBtn").disabled = activeIndex === 0;
    $("storyNextBtn").textContent = activeIndex === group.items.length - 1 ? "Close" : "Next";
    $("storyViewer").classList.remove("hidden");
    $("storyViewer").setAttribute("aria-hidden", "false");
  }

  function openViewer(userId) {
    const group = groups.find(item => item.userId === String(userId));
    if (!group?.items?.length) { if (own(userId)) openComposer(); return; }
    activeUserId = group.userId; activeIndex = 0; renderViewer();
  }

  function moveStory(direction) {
    const group = groups.find(item => item.userId === activeUserId);
    if (!group) return closeViewer();
    const next = activeIndex + direction;
    if (next < 0) return;
    if (next >= group.items.length) return closeViewer();
    activeIndex = next; renderViewer();
  }

  async function publishStory() {
    if (typeof requireAuth === "function" && !requireAuth("share a story")) return;
    const file = $("storyMediaFile")?.files?.[0];
    const caption = $("storyCaption")?.value.trim() || "";
    if (!file) return toast("Choose a photo or video first.");
    if (file.size > MAX_BYTES) return toast("Stories must be 25 MB or smaller.");
    const imageTypes = ["image/jpeg", "image/png", "image/webp"];
    const videoTypes = ["video/mp4", "video/webm"];
    if (![...imageTypes, ...videoTypes].includes(file.type)) return toast("Use JPG, PNG, WebP, MP4 or WebM.");
    const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    if (!["jpg", "jpeg", "png", "webp", "mp4", "webm"].includes(extension)) return toast("That file extension is not supported.");
    const userId = String(currentUser.id);
    const storyId = window.crypto?.randomUUID ? window.crypto.randomUUID() : "story-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    const path = userId + "/stories/" + storyId + "." + extension;
    const button = $("storyPublishBtn");
    if (button) { button.disabled = true; button.textContent = "Uploading…"; }
    let uploaded = false;
    let storyMediaPath = path;
    let storyProvider = "supabase";
    try {
      const asset = await window.GoCatMedia.uploadOrFallback(file, {
        purpose: "story"
      }, async () => {
        const upload = await db.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
        return { provider: "supabase", path };
      });
      uploaded = true;
      storyProvider = asset.provider || "supabase";
      storyMediaPath = storyProvider === "vercel-blob" ? asset.url : asset.path;
      const insert = await db.from("stories").insert({
        user_id: userId, media_path: storyMediaPath,
        media_type: imageTypes.includes(file.type) ? "image" : "video",
        caption
      });
      if (insert.error) throw insert.error;
      closeComposer();
      await loadStories();
      openViewer(userId);
      toast("Your story is live for 24 hours.");
    } catch (error) {
      console.error("GoCat story publish:", error);
      if (uploaded && storyProvider === "supabase") {
        const cleanup = await db.storage.from(BUCKET).remove([storyMediaPath]);
        if (cleanup.error) console.warn("Story media cleanup:", cleanup.error);
      }
      toast("Could not publish story: " + (error.message || "Please try again."));
    } finally {
      if (button) { button.disabled = false; button.textContent = "Share story"; }
    }
  }

  async function deleteCurrentStory() {
    if (!own(activeUserId)) return;
    const group = groups.find(item => item.userId === activeUserId);
    const story = group?.items?.[activeIndex];
    if (!story || !window.confirm("Delete this story?")) return;
    try {
      const removed = await db.from("stories").delete().eq("id", story.id);
      if (removed.error) throw removed.error;
      if (!window.GoCatMedia?.isRemoteUrl(story.media_path)) {
        const mediaRemoved = await db.storage.from(BUCKET).remove([story.media_path]);
        if (mediaRemoved.error) console.warn("GoCat story media removal:", mediaRemoved.error);
      }
      const previousIndex = activeIndex;
      await loadStories();
      const refreshed = groups.find(item => item.userId === activeUserId);
      if (refreshed?.items?.length) { activeIndex = Math.min(previousIndex, refreshed.items.length - 1); renderViewer(); }
      else closeViewer();
      toast("Story deleted.");
    } catch (error) {
      console.error("GoCat story delete:", error);
      toast("Could not delete story: " + (error.message || "Please try again."));
    }
  }

  document.addEventListener("click", event => {
    const open = event.target.closest("[data-story-open]");
    if (event.target.closest("[data-story-create]")) { event.preventDefault(); openComposer(); return; }
    if (event.target.closest("[data-story-close]")) { event.preventDefault(); closeViewer(); return; }
    if (event.target.closest("[data-story-composer-close]")) { event.preventDefault(); closeComposer(); return; }
    if (event.target.closest("#storyPreviousBtn")) { event.preventDefault(); moveStory(-1); return; }
    if (event.target.closest("#storyNextBtn")) { event.preventDefault(); moveStory(1); return; }
    if (event.target.closest("#storyDeleteBtn")) { event.preventDefault(); deleteCurrentStory(); return; }
    if (event.target.closest("[data-story-refresh]")) { event.preventDefault(); loadStories(); return; }
    if (event.target.id === "storyViewer") { closeViewer(); return; }
    if (event.target.id === "storyComposer") { closeComposer(); return; }
    if (open) { event.preventDefault(); openViewer(open.dataset.storyOpen); }
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "storyUploadForm") { event.preventDefault(); publishStory(); }
  });

  $("storyMediaFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0], preview = $("storyUploadPreview");
    if (!preview) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    if (!file) { preview.innerHTML = '<span>Choose an image or short video to preview it here.</span>'; return; }
    if (file.size > MAX_BYTES) { preview.innerHTML = '<span class="story-preview-error">File is larger than 25 MB.</span>'; return; }
    previewUrl = URL.createObjectURL(file);
    preview.innerHTML = file.type.startsWith("video/")
      ? '<video src="' + esc(previewUrl) + '" controls muted playsinline></video>'
      : '<img src="' + esc(previewUrl) + '" alt="Story preview">';
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { closeViewer(); closeComposer(); }
    if ($("storyViewer")?.classList.contains("hidden")) return;
    if (event.key === "ArrowRight") moveStory(1);
    if (event.key === "ArrowLeft") moveStory(-1);
  });

  if (db) {
    db.auth.onAuthStateChange(() => window.setTimeout(loadStories, 0));
    db.channel("gocat-stories-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => window.setTimeout(loadStories, 250))
      .subscribe();
  }
  window.renderGoCatStories = loadStories;
  window.setTimeout(loadStories, 600);
})();
