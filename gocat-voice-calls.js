/* GoCat one-to-one WebRTC voice calls.
   Supabase Realtime carries private call signaling; audio is peer-to-peer where
   network conditions allow. This free STUN-only build has no TURN relay. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const RING_TIMEOUT_MS = 35000;
  const CONNECT_TIMEOUT_MS = 25000;
  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  let inboxChannel = null;
  let inboxUserId = "";
  let inboxPromise = null;
  let activeCall = null;
  let incomingInvite = null;
  let overlay = null;
  let durationTimer = null;
  let incomingExpireTimer = null;
  let incomingSoundTimer = null;
  let ringtoneContext = null;

  function directPeerId() {
    if (typeof currentChatConversationId !== "undefined" && currentChatConversationId) return "";
    return typeof currentChatUserId === "undefined" ? "" : String(currentChatUserId || "");
  }

  function hasExistingDirectThread(peerId) {
    if (!currentUser || !peerId || typeof currentChatMessages === "undefined") return false;
    return currentChatMessages.some(function (message) {
      return message.conversation_id == null && (
        (String(message.sender_id) === String(currentUser.id) && String(message.recipient_id) === String(peerId)) ||
        (String(message.sender_id) === String(peerId) && String(message.recipient_id) === String(currentUser.id))
      );
    });
  }

  function canonicalPair(userA, userB) {
    const a = String(userA || "");
    const b = String(userB || "");
    return a < b ? [a, b] : [b, a];
  }

  function pairTopic(userA, userB) {
    const pair = canonicalPair(userA, userB);
    return "gocat-voice-pair:" + pair[0] + ":" + pair[1];
  }

  function uuid() {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
      hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function validUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function callErrorMessage(error) {
    if (error && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
      return "Microphone permission was denied. Allow microphone access for GoCat and try again.";
    }
    if (error && (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")) {
      return "No microphone was found on this device.";
    }
    if (error && error.name === "NotReadableError") {
      return "Your microphone is being used by another app. Close that app and try again.";
    }
    return error && error.message ? error.message : "The voice call could not be started.";
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "gocatVoiceCallOverlay";
    overlay.className = "gocat-call-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<button class="gocat-call-backdrop" type="button" data-call-dismiss aria-label="Close call window"></button>' +
      '<section class="gocat-call-dialog" role="dialog" aria-modal="true" aria-labelledby="gocatCallTitle">' +
        '<button id="gocatCallCloseBtn" class="gocat-call-close" type="button" aria-label="Close voice call window">×</button>' +
        '<div class="gocat-call-avatar" aria-hidden="true">☎</div>' +
        '<span class="gocat-call-eyebrow">GOCAT PRIVATE VOICE</span>' +
        '<h2 id="gocatCallTitle">Voice call</h2>' +
        '<p id="gocatCallSubtitle">One-to-one voice connection</p>' +
        '<div id="gocatCallStatus" class="gocat-call-status" aria-live="polite">Ready</div>' +
        '<div class="gocat-call-network-note">Audio connects directly between browsers when possible. This free version has no TURN relay, so some networks may block calls.</div>' +
        '<audio id="gocatCallRemoteAudio" autoplay playsinline></audio>' +
        '<div class="gocat-call-actions">' +
          '<button id="gocatCallAcceptBtn" type="button" class="gocat-call-accept" hidden>Accept</button>' +
          '<button id="gocatCallDeclineBtn" type="button" class="gocat-call-decline" hidden>Decline</button>' +
          '<button id="gocatCallMuteBtn" type="button" class="gocat-call-mute" hidden>Mute mic</button>' +
          '<button id="gocatCallSpeakerBtn" type="button" class="gocat-call-speaker" hidden>Mute speaker</button>' +
          '<button id="gocatCallHangupBtn" type="button" class="gocat-call-hangup" hidden>End call</button>' +
        '</div>' +
      '</section>';
    document.body.appendChild(overlay);

    $("gocatCallAcceptBtn").addEventListener("click", acceptIncomingCall);
    $("gocatCallDeclineBtn").addEventListener("click", declineIncomingCall);
    $("gocatCallMuteBtn").addEventListener("click", toggleMicrophone);
    $("gocatCallSpeakerBtn").addEventListener("click", toggleSpeaker);
    $("gocatCallHangupBtn").addEventListener("click", function () {
      endActiveCall("Call ended.", true, true);
    });
    $("gocatCallCloseBtn").addEventListener("click", function () {
      if (activeCall) endActiveCall("Call ended.", true, true);
      else dismissIncomingCall();
    });
    overlay.querySelector("[data-call-dismiss]").addEventListener("click", function () {
      if (activeCall) endActiveCall("Call ended.", true, true);
      else dismissIncomingCall();
    });
    return overlay;
  }

  function setCallOverlay(mode, title, subtitle, status) {
    const root = ensureOverlay();
    root.hidden = false;
    $("gocatCallTitle").textContent = title || "Voice call";
    $("gocatCallSubtitle").textContent = subtitle || "";
    $("gocatCallStatus").textContent = status || "";
    $("gocatCallAcceptBtn").hidden = mode !== "incoming";
    $("gocatCallDeclineBtn").hidden = mode !== "incoming";
    $("gocatCallHangupBtn").hidden = mode === "incoming";
    $("gocatCallMuteBtn").hidden = mode === "incoming" || mode === "outgoing";
    $("gocatCallSpeakerBtn").hidden = mode === "incoming" || mode === "outgoing";
    root.dataset.mode = mode;
  }

  function hideCallOverlay() {
    if (overlay) overlay.hidden = true;
    const audio = $("gocatCallRemoteAudio");
    if (audio) {
      try { audio.pause(); } catch {}
      audio.srcObject = null;
      audio.muted = false;
    }
  }

  function setCallStatus(message) {
    if ($("gocatCallStatus")) $("gocatCallStatus").textContent = message;
  }

  function updateCallButton() {
    const button = $("chatVoiceCallBtn");
    if (!button) return;
    const peerId = directPeerId();
    const enabled = !!currentUser && !!peerId && peerId !== String(currentUser.id) &&
      hasExistingDirectThread(peerId) && !activeCall && !incomingInvite;
    button.disabled = !enabled;
    button.title = !peerId
      ? "Open a one-to-one conversation to call"
      : !hasExistingDirectThread(peerId)
        ? "Send a direct message first, then you can call"
        : activeCall || incomingInvite
          ? "A voice call is already active"
          : "Start a private one-to-one voice call";
  }

  function subscribePrivateChannel(channel) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timeout = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error("Private voice channel timed out. Check your connection and try again."));
      }, 12000);
      channel.subscribe(function (status, error) {
        if (settled) return;
        if (status === "SUBSCRIBED") {
          settled = true;
          clearTimeout(timeout);
          resolve(channel);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          settled = true;
          clearTimeout(timeout);
          reject(error || new Error("GoCat could not authorize the private voice channel."));
        }
      });
    });
  }

  async function joinPairChannel(call) {
    if (!db || !currentUser) throw new Error("Sign in before starting a voice call.");
    await db.realtime.setAuth();
    const channel = db.channel(pairTopic(currentUser.id, call.remoteUserId), { config: { private: true } });
    channel.on("broadcast", { event: "voice-signal" }, function (event) {
      handleVoiceSignal(call, event && event.payload ? event.payload : {});
    });
    try {
      await subscribePrivateChannel(channel);
      if (activeCall !== call) {
        await db.removeChannel(channel);
        throw new Error("The call was cancelled.");
      }
      call.pairChannel = channel;
      return channel;
    } catch (error) {
      try { await db.removeChannel(channel); } catch {}
      throw error;
    }
  }

  async function sendInboxEvent(targetUserId, eventName, payload) {
    if (!db || !currentUser) throw new Error("Sign in before sending a call invitation.");
    await db.realtime.setAuth();
    const channel = db.channel("gocat-voice-inbox:" + String(targetUserId), { config: { private: true } });
    try {
      await subscribePrivateChannel(channel);
      const result = await channel.send({ type: "broadcast", event: eventName, payload: payload });
      if (result !== "ok") throw new Error("GoCat could not deliver the call invitation.");
    } finally {
      try { await db.removeChannel(channel); } catch {}
    }
  }

  async function connectVoiceInbox() {
    if (!currentUser || !db) return;
    const userId = String(currentUser.id);
    if (inboxChannel && inboxUserId === userId) return;
    if (inboxPromise) return inboxPromise;
    inboxPromise = (async function () {
      if (inboxChannel) {
        try { await db.removeChannel(inboxChannel); } catch {}
        inboxChannel = null;
        inboxUserId = "";
      }
      await db.realtime.setAuth();
      const channel = db.channel("gocat-voice-inbox:" + userId, { config: { private: true } });
      channel
        .on("broadcast", { event: "voice-call-invite" }, function (event) {
          receiveIncomingInvite(event && event.payload ? event.payload : {});
        })
        .on("broadcast", { event: "voice-call-cancelled" }, function (event) {
          receiveCallCancellation(event && event.payload ? event.payload : {});
        });
      await subscribePrivateChannel(channel);
      if (!currentUser || String(currentUser.id) !== userId) {
        await db.removeChannel(channel);
        return;
      }
      inboxChannel = channel;
      inboxUserId = userId;
    })();
    try { await inboxPromise; }
    catch (error) {
      console.warn("GoCat voice inbox:", error);
      showToast("Incoming voice calls are not available right now. Refresh GoCat to reconnect.");
    } finally {
      inboxPromise = null;
    }
  }

  async function disconnectVoiceInbox() {
    const channel = inboxChannel;
    inboxChannel = null;
    inboxUserId = "";
    if (channel && db) {
      try { await db.removeChannel(channel); } catch {}
    }
  }

  function playIncomingTone() {
    if (settings && settings.voiceCallSound === false) return;
    const AudioConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioConstructor) return;
    try {
      if (!ringtoneContext || ringtoneContext.state === "closed") ringtoneContext = new AudioConstructor();
      if (ringtoneContext.state === "suspended") ringtoneContext.resume().catch(function () {});
      const oscillator = ringtoneContext.createOscillator();
      const gain = ringtoneContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 720;
      gain.gain.setValueAtTime(0.0001, ringtoneContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.055, ringtoneContext.currentTime + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, ringtoneContext.currentTime + 0.36);
      oscillator.connect(gain);
      gain.connect(ringtoneContext.destination);
      oscillator.start();
      oscillator.stop(ringtoneContext.currentTime + 0.38);
    } catch (error) {
      console.warn("GoCat incoming call sound:", error);
    }
  }

  function stopIncomingAlert() {
    if (incomingSoundTimer) clearInterval(incomingSoundTimer);
    if (incomingExpireTimer) clearTimeout(incomingExpireTimer);
    incomingSoundTimer = null;
    incomingExpireTimer = null;
  }

  function startIncomingAlert() {
    stopIncomingAlert();
    playIncomingTone();
    if (settings && settings.voiceCallSound !== false) {
      incomingSoundTimer = setInterval(playIncomingTone, 1800);
    }
  }

  function receiveIncomingInvite(payload) {
    if (!currentUser || !validUuid(payload.callId) || !validUuid(payload.fromId) ||
        !validUuid(payload.toId) || String(payload.toId) !== String(currentUser.id) ||
        String(payload.fromId) === String(currentUser.id)) return;
    const expiresAt = Number(payload.expiresAt || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    if (activeCall || incomingInvite) return;

    incomingInvite = {
      callId: String(payload.callId),
      fromId: String(payload.fromId),
      toId: String(payload.toId),
      expiresAt: expiresAt
    };
    setCallOverlay("incoming", "Incoming voice call", getUsername(incomingInvite.fromId),
      "Accept the call to connect your microphone.");
    startIncomingAlert();
    incomingExpireTimer = setTimeout(function () {
      if (incomingInvite && incomingInvite.callId === payload.callId) {
        incomingInvite = null;
        stopIncomingAlert();
        hideCallOverlay();
        updateCallButton();
        showToast("The call invitation expired.");
      }
    }, Math.max(0, expiresAt - Date.now()));
    updateCallButton();
  }

  function receiveCallCancellation(payload) {
    if (!incomingInvite || String(payload.callId) !== String(incomingInvite.callId)) return;
    incomingInvite = null;
    stopIncomingAlert();
    hideCallOverlay();
    updateCallButton();
    showToast("The caller cancelled the invitation.");
  }

  function dismissIncomingCall() {
    incomingInvite = null;
    stopIncomingAlert();
    hideCallOverlay();
    updateCallButton();
  }

  function setCallTimer(call) {
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = setInterval(function () {
      if (activeCall !== call || !call.connectedAt) return;
      const elapsed = Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000));
      const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const seconds = String(elapsed % 60).padStart(2, "0");
      setCallStatus("Connected · " + minutes + ":" + seconds);
    }, 1000);
  }

  function syncMuteButton(call) {
    const button = $("gocatCallMuteBtn");
    if (!button || activeCall !== call) return;
    const enabled = call.localStream && call.localStream.getAudioTracks().some(function (track) {
      return track.enabled;
    });
    button.textContent = enabled ? "Mute mic" : "Unmute mic";
    button.setAttribute("aria-pressed", String(!enabled));
  }

  function toggleMicrophone() {
    if (!activeCall || !activeCall.localStream) return;
    const tracks = activeCall.localStream.getAudioTracks();
    if (!tracks.length) return;
    const shouldEnable = tracks.some(function (track) { return !track.enabled; });
    tracks.forEach(function (track) { track.enabled = shouldEnable; });
    syncMuteButton(activeCall);
    setCallStatus(shouldEnable ? "Microphone on" : "Microphone muted");
  }

  function toggleSpeaker() {
    const audio = $("gocatCallRemoteAudio");
    const button = $("gocatCallSpeakerBtn");
    if (!audio || !button) return;
    audio.muted = !audio.muted;
    button.textContent = audio.muted ? "Unmute speaker" : "Mute speaker";
  }

  function setConnected(call) {
    if (activeCall !== call || call.connectedAt) return;
    call.connectedAt = Date.now();
    if (call.ringTimer) clearTimeout(call.ringTimer);
    if (call.connectTimer) clearTimeout(call.connectTimer);
    setCallOverlay("active", getUsername(call.remoteUserId), "One-to-one voice call", "Connected · 00:00");
    syncMuteButton(call);
    setCallTimer(call);
  }

  function createPeerConnection(call) {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    call.peer = peer;
    (call.localStream ? call.localStream.getTracks() : []).forEach(function (track) {
      peer.addTrack(track, call.localStream);
    });
    peer.onicecandidate = function (event) {
      if (!event.candidate || activeCall !== call) return;
      sendSignal(call, "ice", event.candidate.toJSON ? event.candidate.toJSON() : event.candidate)
        .catch(function (error) { console.warn("GoCat ICE signal:", error); });
    };
    peer.ontrack = function (event) {
      if (activeCall !== call) return;
      const audio = $("gocatCallRemoteAudio");
      if (!audio) return;
      if (event.streams && event.streams[0]) audio.srcObject = event.streams[0];
      else audio.srcObject = new MediaStream([event.track]);
      audio.play().catch(function () {
        setCallStatus("Connected. Press Play on the audio control to hear the other person.");
      });
    };
    peer.onconnectionstatechange = function () {
      if (activeCall !== call) return;
      if (peer.connectionState === "connected") setConnected(call);
      else if (peer.connectionState === "connecting") setCallStatus("Connecting audio…");
      else if (peer.connectionState === "disconnected") {
        setCallStatus("Connection interrupted · trying to reconnect…");
        if (call.disconnectTimer) clearTimeout(call.disconnectTimer);
        call.disconnectTimer = setTimeout(function () {
          if (activeCall === call && peer.connectionState === "disconnected") {
            endActiveCall("The connection was lost.", false, true);
          }
        }, 10000);
      } else if (peer.connectionState === "failed") {
        endActiveCall("A direct connection could not be made. Some networks need a TURN relay, which GoCat does not have yet.", false, true);
      }
    };
    return peer;
  }

  async function sendSignal(call, kind, data) {
    if (!call || !call.pairChannel) throw new Error("The private call channel is not connected.");
    const result = await call.pairChannel.send({
      type: "broadcast",
      event: "voice-signal",
      payload: {
        callId: call.callId,
        fromId: String(currentUser ? currentUser.id : ""),
        kind: kind,
        data: data || {}
      }
    });
    if (result !== "ok") throw new Error("The voice signal could not be delivered.");
  }

  async function drainIceQueue(call) {
    if (!call.peer || !call.peer.remoteDescription) return;
    const pending = call.pendingIce.splice(0);
    for (const candidate of pending) {
      try { await call.peer.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn("GoCat queued ICE candidate:", error); }
    }
  }

  async function receiveIce(call, candidate) {
    if (!candidate || !call.peer) return;
    if (!call.peer.remoteDescription) {
      call.pendingIce.push(candidate);
      return;
    }
    try { await call.peer.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (error) { console.warn("GoCat ICE candidate:", error); }
  }

  async function handleVoiceSignal(call, payload) {
    if (activeCall !== call || String(payload.callId) !== String(call.callId) ||
        String(payload.fromId) !== String(call.remoteUserId)) return;
    try {
      if (payload.kind === "ready" && call.role === "caller") {
        call.readyReceived = true;
        if (call.ringTimer) clearTimeout(call.ringTimer);
        if (call.inviteChannel) {
          try { await db.removeChannel(call.inviteChannel); } catch {}
          call.inviteChannel = null;
        }
        if (call.offerStarted) return;
        call.offerStarted = true;
        call.connectTimer = setTimeout(function () {
          if (activeCall === call && !call.connectedAt) endActiveCall("The audio connection timed out. Try again.", true, true);
        }, CONNECT_TIMEOUT_MS);
        const offer = await call.peer.createOffer();
        await call.peer.setLocalDescription(offer);
        const local = call.peer.localDescription;
        await sendSignal(call, "offer", local.toJSON ? local.toJSON() : local);
        setCallStatus("Calling " + getUsername(call.remoteUserId) + "…");
        return;
      }
      if (payload.kind === "offer" && call.role === "callee") {
        await call.peer.setRemoteDescription(payload.data);
        await drainIceQueue(call);
        const answer = await call.peer.createAnswer();
        await call.peer.setLocalDescription(answer);
        const local = call.peer.localDescription;
        await sendSignal(call, "answer", local.toJSON ? local.toJSON() : local);
        setCallStatus("Connecting audio…");
        return;
      }
      if (payload.kind === "answer" && call.role === "caller") {
        await call.peer.setRemoteDescription(payload.data);
        await drainIceQueue(call);
        setCallStatus("Connecting audio…");
        return;
      }
      if (payload.kind === "ice") {
        await receiveIce(call, payload.data);
        return;
      }
      if (payload.kind === "decline") {
        await endActiveCall("The call was declined.", false, true);
        return;
      }
      if (payload.kind === "cancel" || payload.kind === "hangup") {
        await endActiveCall("The call ended.", false, false);
      }
    } catch (error) {
      console.error("GoCat WebRTC negotiation:", error);
      await endActiveCall("The voice connection failed: " + (error.message || error), true, true);
    }
  }

  async function acquireMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone access is not supported in this browser.");
    }
    if (!window.isSecureContext) throw new Error("Voice calls need a secure HTTPS connection.");
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  }

  function makeCallRecord(role, callId, remoteUserId) {
    return {
      callId: callId,
      role: role,
      remoteUserId: String(remoteUserId),
      pairChannel: null,
      inviteChannel: null,
      localStream: null,
      peer: null,
      pendingIce: [],
      offerStarted: false,
      readyReceived: false,
      connectedAt: 0,
      ringTimer: null,
      connectTimer: null,
      disconnectTimer: null
    };
  }

  function applyInitialMute(call) {
    if (settings && settings.voiceCallMuteMicByDefault === true && call.localStream) {
      call.localStream.getAudioTracks().forEach(function (track) { track.enabled = false; });
    }
  }

  async function startOutgoingCall() {
    if (!currentUser || !requireAuth("start voice calls")) return;
    const remoteUserId = directPeerId();
    if (!remoteUserId) return showToast("Open a one-to-one conversation first. Group voice calls are not available yet.");
    if (!hasExistingDirectThread(remoteUserId)) return showToast("Send a direct message first, then you can call.");
    if (activeCall || incomingInvite) return showToast("Finish the current call before starting another.");
    if (String(remoteUserId) === String(currentUser.id)) return;

    const call = makeCallRecord("caller", uuid(), remoteUserId);
    activeCall = call;
    updateCallButton();
    setCallOverlay("outgoing", "Calling " + getUsername(call.remoteUserId), "Private one-to-one voice call", "Requesting microphone permission…");

    try {
      call.localStream = await acquireMicrophone();
      if (activeCall !== call) {
        call.localStream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      applyInitialMute(call);
      await joinPairChannel(call);
      call.peer = createPeerConnection(call);
      await db.realtime.setAuth();
      const inviteChannel = db.channel("gocat-voice-inbox:" + call.remoteUserId, { config: { private: true } });
      call.inviteChannel = inviteChannel;
      await subscribePrivateChannel(inviteChannel);
      const inviteResult = await inviteChannel.send({
        type: "broadcast",
        event: "voice-call-invite",
        payload: {
          callId: call.callId,
          fromId: String(currentUser.id),
          toId: call.remoteUserId,
          expiresAt: Date.now() + RING_TIMEOUT_MS
        }
      });
      if (inviteResult !== "ok") throw new Error("The other person could not be reached for a voice call.");
      call.ringTimer = setTimeout(function () {
        if (activeCall === call && !call.readyReceived) endActiveCall("No answer. The call invitation expired.", true, true);
      }, RING_TIMEOUT_MS);
      setCallStatus("Ringing " + getUsername(call.remoteUserId) + "…");
    } catch (error) {
      console.warn("GoCat outgoing call:", error);
      await endActiveCall("", false, false);
      showToast(callErrorMessage(error));
    }
  }

  async function acceptIncomingCall() {
    const invite = incomingInvite;
    if (!invite || !currentUser) return;
    if (invite.expiresAt <= Date.now()) {
      incomingInvite = null;
      stopIncomingAlert();
      hideCallOverlay();
      updateCallButton();
      return showToast("That call invitation has expired.");
    }
    if (activeCall) return showToast("Finish your current call first.");
    incomingInvite = null;
    stopIncomingAlert();
    const call = makeCallRecord("callee", invite.callId, invite.fromId);
    call.readyReceived = true;
    activeCall = call;
    updateCallButton();
    setCallOverlay("connecting", "Connecting to " + getUsername(call.remoteUserId), "Private one-to-one voice call", "Joining the private call channel…");
    try {
      await joinPairChannel(call);
      call.localStream = await acquireMicrophone();
      if (activeCall !== call) {
        call.localStream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      applyInitialMute(call);
      call.peer = createPeerConnection(call);
      await sendSignal(call, "ready", {});
      call.connectTimer = setTimeout(function () {
        if (activeCall === call && !call.connectedAt) endActiveCall("The audio connection timed out. Try again.", true, true);
      }, CONNECT_TIMEOUT_MS);
      setCallStatus("Connecting audio…");
    } catch (error) {
      console.warn("GoCat accept call:", error);
      try { await sendSignal(call, "decline", {}); } catch {}
      await endActiveCall("", false, false);
      showToast(callErrorMessage(error));
    }
  }

  async function declineIncomingCall() {
    const invite = incomingInvite;
    if (!invite || !currentUser) return;
    incomingInvite = null;
    stopIncomingAlert();
    const call = makeCallRecord("callee", invite.callId, invite.fromId);
    activeCall = call;
    setCallOverlay("connecting", "Declining call", getUsername(call.remoteUserId), "Sending response…");
    try {
      await joinPairChannel(call);
      await sendSignal(call, "decline", {});
    } catch (error) {
      console.warn("GoCat decline call:", error);
    }
    await endActiveCall("", false, false);
  }

  async function endActiveCall(message, notifyPeer, showNotice) {
    const call = activeCall;
    activeCall = null;
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = null;
    stopIncomingAlert();
    if (call) {
      if (notifyPeer) {
        try { await sendSignal(call, call.readyReceived ? "hangup" : "cancel", {}); } catch {}
        if (call.role === "caller" && !call.readyReceived) {
          try {
            await sendInboxEvent(call.remoteUserId, "voice-call-cancelled", { callId: call.callId });
          } catch (error) { console.warn("GoCat call cancellation notice:", error); }
        }
      }
      if (call.ringTimer) clearTimeout(call.ringTimer);
      if (call.connectTimer) clearTimeout(call.connectTimer);
      if (call.disconnectTimer) clearTimeout(call.disconnectTimer);
      if (call.peer) {
        try {
          call.peer.ontrack = null;
          call.peer.onicecandidate = null;
          call.peer.close();
        } catch {}
      }
      if (call.localStream) call.localStream.getTracks().forEach(function (track) {
        try { track.stop(); } catch {}
      });
      if (call.pairChannel && db) {
        try { await db.removeChannel(call.pairChannel); } catch {}
      }
      if (call.inviteChannel && db) {
        try { await db.removeChannel(call.inviteChannel); } catch {}
      }
    }
    incomingInvite = null;
    hideCallOverlay();
    updateCallButton();
    if (showNotice && message) showToast(message);
  }

  async function dismissCallOnNavigation() {
    if (activeCall) await endActiveCall("Call ended because you left GoCat chats.", true, false);
    else dismissIncomingCall();
  }

  function bindUI() {
    ensureOverlay();
    $("chatVoiceCallBtn").addEventListener("click", startOutgoingCall);

    const title = $("chatTitle");
    if (title && "MutationObserver" in window) {
      new MutationObserver(updateCallButton).observe(title, { childList: true, subtree: true, characterData: true });
    }
    const messageList = $("chatMessages");
    if (messageList && "MutationObserver" in window) {
      new MutationObserver(updateCallButton).observe(messageList, { childList: true, subtree: true });
    }
    const presence = $("chatPresence");
    if (presence && "MutationObserver" in window) {
      new MutationObserver(updateCallButton).observe(presence, { childList: true, subtree: true, characterData: true });
    }

    document.addEventListener("click", function (event) {
      const signOut = event.target.closest("#logoutBtn,#settingsLogout");
      if (signOut) {
        if (activeCall) endActiveCall("", true, false);
        disconnectVoiceInbox();
      }
    }, true);

    window.addEventListener("pagehide", function () {
      if (activeCall) endActiveCall("", true, false);
    });

    if (db && db.auth && typeof db.auth.onAuthStateChange === "function") {
      db.auth.onAuthStateChange(function (event) {
        if (event === "SIGNED_IN") connectVoiceInbox();
        if (event === "SIGNED_OUT") {
          endActiveCall("", true, false);
          disconnectVoiceInbox();
          incomingInvite = null;
        }
      });
    }

    if (typeof window.startGoCat === "function") {
      const originalStart = window.startGoCat;
      window.startGoCat = async function () {
        const result = await originalStart.apply(this, arguments);
        if (currentUser) await connectVoiceInbox();
        updateCallButton();
        return result;
      };
    }
    if (typeof window.startGuestGoCat === "function") {
      const originalGuest = window.startGuestGoCat;
      window.startGuestGoCat = async function () {
        await dismissCallOnNavigation();
        await disconnectVoiceInbox();
        const result = await originalGuest.apply(this, arguments);
        updateCallButton();
        return result;
      };
    }
    if (typeof window.openChat === "function") {
      const originalOpen = window.openChat;
      window.openChat = async function () {
        const result = await originalOpen.apply(this, arguments);
        updateCallButton();
        return result;
      };
    }

    if (currentUser) connectVoiceInbox();
    updateCallButton();
  }

  function updateSettings() {
    if (settings && settings.voiceCallSound === false) {
      if (incomingSoundTimer) clearInterval(incomingSoundTimer);
      incomingSoundTimer = null;
    } else if (incomingInvite && !incomingSoundTimer) {
      startIncomingAlert();
    }
  }

  window.GoCatVoiceCalls = {
    start: startOutgoingCall,
    end: function () { endActiveCall("Call ended.", true, true); },
    updateSettings: updateSettings
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindUI, { once: true });
  else bindUI();
})();