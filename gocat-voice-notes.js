/* GoCat compressed voice notes. Recorded locally, then sent through the
   existing private chat-media attachment flow for both DMs and group chats. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const MAX_DURATION_MS = 2 * 60 * 1000;
  const VOICE_BITRATE = 24000;
  const allowedTypes = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);
  let recorder = null;
  let mediaStream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = null;
  let maxDurationId = null;
  let voicePreviewUrl = "";
  let recordingTarget = "";
  let discardOnStop = false;
  let starting = false;
  let isRecording = false;

  function currentTarget() {
    const groupId = typeof currentChatConversationId === "undefined"
      ? "" : String(currentChatConversationId || "");
    const directId = typeof currentChatUserId === "undefined"
      ? "" : String(currentChatUserId || "");
    if (groupId) return "group:" + groupId;
    if (directId) return "dm:" + directId;
    return "";
  }

  function formatDuration(milliseconds) {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = String(Math.floor(total / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return minutes + ":" + seconds;
  }

  function setRecorderUI(recording) {
    const panel = $("gocatVoiceRecordingPanel");
    const button = $("chatVoiceNoteBtn");
    if (panel) panel.hidden = !recording;
    if (button) {
      button.classList.toggle("is-recording", !!recording);
      button.textContent = recording ? "●" : "🎙";
      button.setAttribute("aria-label", recording ? "Recording voice note" : "Record a voice note");
      button.title = recording ? "Recording in progress" : "Record a compressed voice note";
      button.disabled = !!recording || !currentTarget() || !currentUser;
    }
    if ($("gocatVoiceFinishBtn")) $("gocatVoiceFinishBtn").disabled = !recording;
    if ($("gocatVoiceCancelBtn")) $("gocatVoiceCancelBtn").disabled = !recording && !starting;
  }

  function syncButtonState() {
    const button = $("chatVoiceNoteBtn");
    if (!button || isRecording || starting) return;
    const attachButton = $("chatAttachBtn");
    button.disabled = !currentUser || !currentTarget() || !!attachButton?.disabled;
  }

  function stopTracks() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
    }
    mediaStream = null;
  }

  function clearTimers() {
    if (timerId) clearInterval(timerId);
    if (maxDurationId) clearTimeout(maxDurationId);
    timerId = null;
    maxDurationId = null;
  }

  function clearPreview() {
    const review = $("gocatVoiceNoteReview");
    const audio = $("gocatVoiceNoteAudio");
    if (audio) {
      try { audio.pause(); } catch {}
      audio.removeAttribute("src");
      audio.load();
    }
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    voicePreviewUrl = "";
    if (review) review.classList.add("hidden");
    if ($("gocatVoiceSendBtn")) $("gocatVoiceSendBtn").disabled = true;
  }

  function cleanupRecordingUI() {
    clearTimers();
    stopTracks();
    recorder = null;
    chunks = [];
    startedAt = 0;
    recordingTarget = "";
    starting = false;
    isRecording = false;
    discardOnStop = false;
    setRecorderUI(false);
    syncButtonState();
  }

  function showStatus(message) {
    const status = $("chatUploadStatus");
    if (status) status.textContent = message;
  }

  function updatePlaybackRate() {
    const requested = Number(settings && settings.voiceMessagePlaybackRate);
    const rate = [1, 1.25, 1.5, 2].includes(requested) ? requested : 1;
    document.querySelectorAll("#chatMessages audio, #gocatVoiceNoteAudio").forEach(audio => {
      try {
        audio.playbackRate = rate;
        audio.defaultPlaybackRate = rate;
      } catch (error) {
        console.warn("GoCat voice playback speed:", error);
      }
    });
  }

  function cancelRecording(silent) {
    if (!recorder && !starting) return;
    discardOnStop = true;
    clearTimers();
    const activeRecorder = recorder;
    starting = false;
    isRecording = false;
    setRecorderUI(false);
    if (activeRecorder && activeRecorder.state !== "inactive") {
      try { activeRecorder.stop(); } catch { cleanupRecordingUI(); }
    } else {
      cleanupRecordingUI();
    }
    if (!silent) showToast("Voice recording cancelled.");
  }

  function bestMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    const choices = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/webm",
      "audio/ogg"
    ];
    return choices.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  function baseMimeType(value) {
    const base = String(value || "").split(";")[0].trim().toLowerCase();
    return allowedTypes.has(base) ? base : "";
  }

  function attachVoiceFile(blob, mimeType, target) {
    if (target !== currentTarget()) {
      showToast("Voice note discarded because the conversation changed.");
      return;
    }
    if (!blob || !blob.size) {
      showToast("The recording was empty. Please try again.");
      return;
    }
    const safeType = baseMimeType(mimeType || blob.type);
    if (!safeType) {
      showToast("This browser created an unsupported audio format. Try recording in Chrome or Edge.");
      return;
    }
    if (blob.size > MAX_CHAT_ATTACHMENT_BYTES) {
      showToast("Voice note is larger than GoCat's 50 MB attachment limit.");
      return;
    }

    clearPreview();
    const extension = safeType === "audio/ogg" ? "ogg" : safeType === "audio/mp4" ? "m4a" :
      safeType === "audio/mpeg" ? "mp3" : safeType === "audio/wav" ? "wav" : "webm";
    const file = new File([blob], "gocat-voice-note-" + Date.now() + "." + extension, {
      type: safeType,
      lastModified: Date.now()
    });

    selectedChatAttachment = file;
    if ($("chatAttachmentFile")) $("chatAttachmentFile").value = "";
    if ($("chatAttachmentPreview")) $("chatAttachmentPreview").classList.remove("hidden");
    if ($("chatAttachmentName")) {
      $("chatAttachmentName").textContent = "Voice note · " +
        formatDuration(file.size / VOICE_BITRATE * 8 * 1000) + " · " +
        (file.size < 1024 * 1024
          ? Math.max(1, Math.round(file.size / 1024)) + " KB"
          : (file.size / 1048576).toFixed(2) + " MB");
    }
    voicePreviewUrl = URL.createObjectURL(file);
    if ($("gocatVoiceNoteAudio")) $("gocatVoiceNoteAudio").src = voicePreviewUrl;
    updatePlaybackRate();
    if ($("gocatVoiceNoteReview")) $("gocatVoiceNoteReview").classList.remove("hidden");
    if ($("gocatVoiceSendBtn")) $("gocatVoiceSendBtn").disabled = false;
    showStatus("Voice note ready · Review it, then send your voice message.");
    showToast("Voice note attached. Review it and tap Send.");
  }

  function finishRecording(autoStop) {
    if (!recorder || recorder.state === "inactive") return;
    if (autoStop) showToast("Two-minute limit reached. Your voice note is ready to review.");
    discardOnStop = false;
    const activeRecorder = recorder;
    try { activeRecorder.stop(); }
    catch (error) {
      console.warn("GoCat voice note stop:", error);
      cleanupRecordingUI();
      showToast("Could not finish the recording. Try again.");
    }
  }

  async function startRecording() {
    if (starting || isRecording) return;
    if (!currentUser || !requireAuth("record voice notes")) return;
    const target = currentTarget();
    if (!target) return showToast("Open a direct or group conversation first.");
    if (selectedChatAttachment) return showToast("Send or remove the current attachment before recording a voice note.");

    try {
      const groupId = typeof currentChatConversationId === "undefined"
        ? "" : String(currentChatConversationId || "");
      const directId = typeof currentChatUserId === "undefined"
        ? "" : String(currentChatUserId || "");
      const permission = await db.rpc("gocat_can_send_voice_message", {
        p_recipient_id: directId || null,
        p_conversation_id: groupId || null
      });
      if (permission.error) {
        console.warn("GoCat voice-message pre-check failed; the final message RLS policy will decide:", permission.error.message);
      } else if (permission.data !== true) {
        // The pre-check may read stale chat/profile state. Recording is allowed
        // to proceed; the actual audio-message INSERT is still protected by
        // private.gocat_voice_message_pair_allowed / group privacy RLS.
        console.warn("GoCat voice-message pre-check returned false; relying on the authoritative message INSERT policy.");
      }
    } catch (error) {
      console.warn("GoCat voice-message privacy pre-check:", error.message || error);
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return showToast("Voice recording is not supported in this browser. Try a recent version of Chrome or Edge.");
    }
    if (!window.isSecureContext) return showToast("Microphone recording needs a secure HTTPS connection.");

    starting = true;
    recordingTarget = target;
    setRecorderUI(false);
    if ($("chatVoiceNoteBtn")) $("chatVoiceNoteBtn").disabled = true;
    showStatus("Waiting for microphone permission…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      if (recordingTarget !== currentTarget() || !currentUser) {
        stream.getTracks().forEach(track => track.stop());
        starting = false;
        recordingTarget = "";
        syncButtonState();
        showStatus("Microphone permission was granted after the conversation changed. Try again.");
        return;
      }
      mediaStream = stream;
      const requestedMime = bestMimeType();
      let activeRecorder;
      try {
        activeRecorder = new MediaRecorder(stream, {
          ...(requestedMime ? { mimeType: requestedMime } : {}),
          audioBitsPerSecond: VOICE_BITRATE
        });
      } catch (firstError) {
        console.warn("GoCat preferred voice codec unavailable:", firstError);
        activeRecorder = new MediaRecorder(stream);
      }
      recorder = activeRecorder;
      chunks = [];
      discardOnStop = false;

      activeRecorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      activeRecorder.addEventListener("error", event => {
        console.warn("GoCat voice recording error:", event.error || event);
        discardOnStop = true;
        cleanupRecordingUI();
        showToast("Voice recording stopped unexpectedly. Please try again.");
      });
      activeRecorder.addEventListener("stop", () => {
        const shouldDiscard = discardOnStop || recordingTarget !== currentTarget();
        const parts = chunks.slice();
        const actualMime = activeRecorder.mimeType || requestedMime || parts[0]?.type || "";
        const blob = new Blob(parts, { type: actualMime });
        cleanupRecordingUI();
        if (!shouldDiscard) attachVoiceFile(blob, actualMime, target);
      });

      activeRecorder.start(1000);
      starting = false;
      isRecording = true;
      startedAt = Date.now();
      setRecorderUI(true);
      showStatus("Recording privately on this device · 24 kbps target · Max 2 minutes.");
      const updateTimer = () => {
        const elapsed = Math.min(MAX_DURATION_MS, Date.now() - startedAt);
        if ($("gocatVoiceRecordingTime")) $("gocatVoiceRecordingTime").textContent = formatDuration(elapsed);
      };
      updateTimer();
      timerId = setInterval(updateTimer, 250);
      maxDurationId = setTimeout(() => finishRecording(true), MAX_DURATION_MS);
    } catch (error) {
      console.warn("GoCat microphone access:", error);
      cleanupRecordingUI();
      let message = "Could not start voice recording. Check your microphone and try again.";
      if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
        message = "Microphone permission was denied. Allow microphone access for GoCat in your browser settings.";
      } else if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
        message = "No microphone was found on this device.";
      } else if (error?.name === "NotReadableError") {
        message = "Your microphone is being used by another app. Close that app and try again.";
      }
      showStatus(message);
      showToast(message);
    }
  }

  function bindUI() {
    $("chatVoiceNoteBtn")?.addEventListener("click", startRecording);
    $("gocatVoiceSendBtn")?.addEventListener("click", () => {
      if (!selectedChatAttachment || !/^gocat-voice-note-/i.test(selectedChatAttachment.name || "")) {
        return showToast("Record a voice note before sending.");
      }
      const form = $("chatForm");
      if (!form) return showToast("The chat composer is unavailable. Refresh GoCat and try again.");
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else $("sendMessageBtn")?.click();
    });
    $("gocatVoiceFinishBtn")?.addEventListener("click", () => finishRecording(false));
    $("gocatVoiceCancelBtn")?.addEventListener("click", () => cancelRecording(false));

    const attachButton = $("chatAttachBtn");
    if (attachButton && "MutationObserver" in window) {
      new MutationObserver(syncButtonState).observe(attachButton, { attributes: true, attributeFilter: ["disabled"] });
    }
    const composer = $("messageInput");
    if (composer && "MutationObserver" in window) {
      new MutationObserver(syncButtonState).observe(composer, { attributes: true, attributeFilter: ["disabled"] });
    }
    const chatMessages = $("chatMessages");
    if (chatMessages && "MutationObserver" in window) {
      new MutationObserver(updatePlaybackRate).observe(chatMessages, { childList: true, subtree: true });
    }
    $("chatClearAttachment")?.addEventListener("click", () => clearPreview());
    $("chatAttachmentFile")?.addEventListener("change", () => clearPreview());

    document.addEventListener("click", event => {
      const chatSwitch = event.target.closest("[data-chat-user],[data-chat-group]");
      const pageLink = event.target.closest("[data-page]");
      const signOut = event.target.closest("#logoutBtn,#settingsLogout");
      if ((chatSwitch || (pageLink && pageLink.dataset.page !== "chats") || signOut) && (starting || isRecording)) {
        cancelRecording(true);
        showToast("Voice recording cancelled because you left the conversation.");
      }
    }, true);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && (starting || isRecording)) {
        cancelRecording(true);
        showToast("Voice recording paused for privacy because GoCat went into the background.");
      }
    });
    window.addEventListener("pagehide", () => cancelRecording(true));

    if (typeof db !== "undefined" && db?.auth?.onAuthStateChange) {
      db.auth.onAuthStateChange(event => {
        if (event === "SIGNED_OUT" && (starting || isRecording)) cancelRecording(true);
      });
    }

    syncButtonState();
    updatePlaybackRate();
  }

  window.GoCatVoiceNotes = { clearPreview, cancelRecording, updatePlaybackRate, syncButtonState };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI, { once: true });
  } else {
    bindUI();
  }
})();