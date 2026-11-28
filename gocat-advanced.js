/* GoCat advanced creator + messaging utilities.
   Uses the existing GoCat upload, chat, auth and storage paths. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  let activeCoverFile = null;
  let activeCoverDuration = 0;
  let coverPreviewUrl = "";
  let coverWorkId = 0;
  let coverDebounce = null;

  function setCoverStatus(message) {
    const status = $("gocatThumbnailPickerStatus");
    if (status) status.textContent = message;
  }

  function readVideoDuration(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      let finished = false;
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onMetadata);
        video.removeEventListener("error", onError);
        clearTimeout(timer);
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
      };
      const done = (callback, value) => {
        if (finished) return;
        finished = true;
        cleanup();
        callback(value);
      };
      const onMetadata = () => done(resolve, Number.isFinite(video.duration) ? video.duration : 0);
      const onError = () => done(reject, new Error("The browser could not read this video."));
      const timer = setTimeout(() => done(reject, new Error("Reading video duration timed out.")), 15000);
      video.preload = "metadata";
      video.addEventListener("loadedmetadata", onMetadata, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.src = url;
      video.load();
      if (video.readyState >= 1) onMetadata();
    });
  }

  function selectedCoverTime() {
    const range = $("gocatThumbnailPickerRange");
    const percent = Number(range?.value || 15) / 100;
    const time = Math.max(0, activeCoverDuration * percent);
    window.GoCatThumbnailTime = time;
    return time;
  }

  async function renderCoverPreview() {
    if (!activeCoverFile || typeof generateVideoThumbnail !== "function") return;
    const workId = ++coverWorkId;
    const time = selectedCoverTime();
    setCoverStatus("Generating preview…");
    const timeLabel = $("gocatThumbnailPickerTime");
    if (timeLabel) timeLabel.textContent = "Frame at " + time.toFixed(1) + "s";
    try {
      const imageFile = await generateVideoThumbnail(activeCoverFile, time);
      if (workId !== coverWorkId || !imageFile) return;
      const url = URL.createObjectURL(imageFile);
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      coverPreviewUrl = url;
      const image = $("gocatThumbnailPickerImage");
      const placeholder = $("gocatThumbnailPickerPlaceholder");
      if (image) {
        image.src = url;
        image.hidden = false;
      }
      if (placeholder) placeholder.hidden = true;
      setCoverStatus("Cover preview ready");
    } catch (error) {
      if (workId !== coverWorkId) return;
      setCoverStatus("Preview unavailable: " + (error?.message || "Could not read this frame."));
    }
  }

  async function setCoverFile(file) {
    activeCoverFile = file || null;
    activeCoverDuration = 0;
    coverWorkId++;
    const panel = $("gocatThumbnailPicker");
    const range = $("gocatThumbnailPickerRange");
    const image = $("gocatThumbnailPickerImage");
    const placeholder = $("gocatThumbnailPickerPlaceholder");
    if (!file) {
      if (panel) panel.hidden = true;
      if (range) range.disabled = true;
      if (image) {
        image.hidden = true;
        image.removeAttribute("src");
      }
      if (placeholder) placeholder.hidden = false;
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      coverPreviewUrl = "";
      window.GoCatThumbnailTime = null;
      if ($("gocatThumbnailPickerTime")) $("gocatThumbnailPickerTime").textContent = "Choose a video to select a frame.";
      setCoverStatus("Waiting for a video");
      return;
    }
    if (panel) panel.hidden = false;
    if (range) range.disabled = true;
    if (image) image.hidden = true;
    if (placeholder) placeholder.hidden = false;
    setCoverStatus("Reading video…");
    try {
      activeCoverDuration = await readVideoDuration(file);
      if (!activeCoverFile || activeCoverFile !== file) return;
      if (!Number.isFinite(activeCoverDuration) || activeCoverDuration <= 0) {
        setCoverStatus("Could not determine video duration.");
        return;
      }
      if (range) {
        range.value = "15";
        range.disabled = false;
      }
      await renderCoverPreview();
    } catch (error) {
      setCoverStatus(error?.message || "Video preview unavailable.");
    }
  }

  function mountCoverPicker() {
    const form = $("uploadForm");
    const fields = form?.querySelector(".upload-main-fields");
    const panel = $("gocatThumbnailPicker");
    if (panel && fields && panel.previousElementSibling !== fields) fields.insertAdjacentElement("afterend", panel);
    const input = $("videoFile");
    if (input && !input.dataset.gocatCoverBound) {
      input.dataset.gocatCoverBound = "true";
      input.addEventListener("change", () => setCoverFile(input.files?.[0] || null));
    }
    const range = $("gocatThumbnailPickerRange");
    if (range && !range.dataset.gocatCoverBound) {
      range.dataset.gocatCoverBound = "true";
      range.addEventListener("input", () => {
        clearTimeout(coverDebounce);
        coverDebounce = setTimeout(renderCoverPreview, 180);
      });
    }
    window.addEventListener("gocat:reel-export-ready", event => {
      if (event.detail?.file) setCoverFile(event.detail.file);
    });
  }

  function copyText(value) {
    const text = String(value || "");
    if (!text) return Promise.reject(new Error("There is no message text to copy."));
    if (navigator.clipboard?.writeText && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.cssText = "position:fixed;opacity:0;left:-9999px;top:0";
      document.body.appendChild(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch {}
      field.remove();
      copied ? resolve() : reject(new Error("Copy is not available in this browser."));
    });
  }

  function mountChatSearch() {
    const title = document.querySelector("#page-chats .chat-title");
    if (!title || $("gocatChatSearchBar")) return;
    const bar = document.createElement("div");
    bar.id = "gocatChatSearchBar";
    bar.className = "gocat-chat-search-bar";
    bar.innerHTML = '<label><span aria-hidden="true">⌕</span><input id="gocatChatSearchInput" type="search" maxlength="100" placeholder="Search this conversation…" aria-label="Search this conversation"></label><small id="gocatChatSearchStatus" aria-live="polite">Search loaded messages</small>';
    title.insertAdjacentElement("afterend", bar);

    const input = $("gocatChatSearchInput");
    const applyFilter = () => {
      const query = String(input?.value || "").trim().toLowerCase();
      const messages = Array.from($("chatMessages")?.querySelectorAll("[data-chat-message-search]") || []);
      let shown = 0;
      messages.forEach(message => {
        const match = !query || String(message.dataset.chatMessageSearch || "").toLowerCase().includes(query);
        message.hidden = !match;
        if (match) shown++;
      });
      const status = $("gocatChatSearchStatus");
      if (status) status.textContent = query ? (shown + " matching message(s) in loaded history") : "Search loaded messages";
    };
    input?.addEventListener("input", applyFilter);
    const container = $("chatMessages");
    if (container && "MutationObserver" in window) {
      new MutationObserver(applyFilter).observe(container, { childList: true, subtree: true });
    }
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-chat-copy-message]");
      if (!button) return;
      const message = (typeof currentChatMessages !== "undefined" ? currentChatMessages : [])
        .find(item => String(item.id) === String(button.dataset.chatCopyMessage));
      if (!message) return;
      copyText(message.content ?? message.text ?? "")
        .then(() => { if (typeof showToast === "function") showToast("Message copied."); })
        .catch(error => { if (typeof showToast === "function") showToast(error.message); });
    });
  }

  function mountImagePaste() {
    const input = $("messageInput");
    if (!input || input.dataset.gocatPasteBound) return;
    input.dataset.gocatPasteBound = "true";
    input.addEventListener("paste", event => {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find(item => item.kind === "file" && String(item.type || "").startsWith("image/"));
      if (!imageItem) return;
      const source = imageItem.getAsFile();
      if (!source) return;
      event.preventDefault();
      if (!currentUser || (!currentChatUserId && !currentChatConversationId)) {
        if (typeof showToast === "function") showToast("Open a conversation before pasting an image.");
        return;
      }
      if (source.size > MAX_CHAT_ATTACHMENT_BYTES) {
        if (typeof showToast === "function") showToast("Pasted images must be 50 MB or smaller.");
        return;
      }
      const extension = (source.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
      const file = new File([source], "pasted-image-" + Date.now() + "." + extension, {
        type: source.type || "image/png",
        lastModified: Date.now()
      });
      if (typeof chatFileTypeAllowed === "function" && !chatFileTypeAllowed(file)) {
        if (typeof showToast === "function") showToast("This image type is not supported in chat.");
        return;
      }
      selectedChatAttachment = file;
      $("chatAttachmentPreview")?.classList.remove("hidden");
      if ($("chatAttachmentName")) $("chatAttachmentName").textContent = file.name + " · " + (file.size / 1048576).toFixed(2) + " MB";
      if ($("chatUploadStatus")) $("chatUploadStatus").textContent = "Image pasted and ready to send.";
      if (typeof showToast === "function") showToast("Image attached. Press Send to share it.");
    });
  }

  function boot() {
    mountCoverPicker();
    mountChatSearch();
    mountImagePaste();
    window.GoCatStudioTools = {
      reset: () => setCoverFile(null)
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();