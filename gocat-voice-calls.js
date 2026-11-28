/* GoCat one-to-one WebRTC voice calls.
   Call invitations and SDP/ICE signaling use RLS-protected Postgres rows.
   Audio travels peer-to-peer where network conditions allow. This free STUN-only
   build has no TURN relay, so some restrictive networks may not connect. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const INVITE_TTL_MS = 35000;
  const CONNECT_TIMEOUT_MS = 25000;
  const INBOX_POLL_MS = 2500;
  const CALL_POLL_MS = 1600;
  // Multiple STUN endpoints improve address discovery. A TURN relay is still
  // needed for some restrictive carrier and corporate networks.
  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:global.stun.twilio.com:3478"
    }
  ];

  let inboxChannel = null;
  let inboxUserId = "";
  let inboxPromise = null;
  let inboxPollTimer = null;
  let inboxPollInFlight = false;
  let activeCall = null;
  let incomingInvite = null;
  let overlay = null;
  let durationTimer = null;
  let incomingExpiryTimer = null;
  let ringtoneTimer = null;
  let ringtoneContext = null;

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return hex.slice(0,8) + "-" + hex.slice(8,12) + "-" + hex.slice(12,16) + "-" +
      hex.slice(16,20) + "-" + hex.slice(20);
  }

  function validUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function directPeerId() {
    if (typeof currentChatConversationId !== "undefined" && currentChatConversationId) return "";
    return typeof currentChatUserId === "undefined" ? "" : String(currentChatUserId || "");
  }

  function existingDirectThread(peerId) {
    if (!currentUser || !peerId || typeof currentChatMessages === "undefined") return false;
    return currentChatMessages.some(function (message) {
      return message.conversation_id == null && (
        (String(message.sender_id) === String(currentUser.id) && String(message.recipient_id) === String(peerId)) ||
        (String(message.sender_id) === String(peerId) && String(message.recipient_id) === String(currentUser.id))
      );
    });
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
        '<div class="gocat-call-network-note">GoCat connects browsers directly when possible. This free version has no TURN relay, so some networks may not connect.</div>' +
        '<audio id="gocatCallRemoteAudio" autoplay playsinline controls></audio>' +
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
    $("gocatCallMuteBtn").hidden = mode !== "active";
    $("gocatCallSpeakerBtn").hidden = mode !== "active";
    root.dataset.mode = mode;
  }

  function setCallStatus(message) {
    if ($("gocatCallStatus")) $("gocatCallStatus").textContent = message;
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

  function updateCallButton() {
    const button = $("chatVoiceCallBtn");
    if (!button) return;
    const peerId = directPeerId();
    const enabled = !!currentUser && !!peerId && peerId !== String(currentUser.id) &&
      !activeCall && !incomingInvite;
    button.disabled = !enabled;
    button.title = !peerId
      ? "Open a one-to-one conversation to call"
      : activeCall || incomingInvite
        ? "A voice call is already active"
        : "Start a private one-to-one voice call";
  }

  function subscribeChannel(channel, label) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timeout = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(label + " timed out. Check your connection and try again."));
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
          reject(error || new Error("Could not connect to " + label + "."));
        }
      });
    });
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
      const channel = db.channel("gocat-call-inbox-" + userId + "-" + uuid());
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "gocat_voice_call_invites",
        filter: "callee_id=eq." + userId
      }, function (change) {
        handleInboxInviteChange(change && change.new ? change.new : {}, change && change.old ? change.old : {});
      });
      await subscribeChannel(channel, "incoming call inbox");
      if (!currentUser || String(currentUser.id) !== userId) {
        await db.removeChannel(channel);
        return;
      }
      inboxChannel = channel;
      inboxUserId = userId;
      if (inboxPollTimer) clearInterval(inboxPollTimer);
      inboxPollTimer = setInterval(pollIncomingInvites, INBOX_POLL_MS);

      const pending = await db.from("gocat_voice_call_invites")
        .select("id,caller_id,callee_id,status,expires_at")
        .eq("callee_id", userId)
        .eq("status", "ringing")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (pending.error) console.warn("GoCat pending calls:", pending.error.message);
      else if (pending.data && pending.data[0]) receiveIncomingInvite(pending.data[0]);
    })();

    try { await inboxPromise; }
    catch (error) {
      console.warn("GoCat call inbox:", error);
      showToast("Incoming calls could not connect. Refresh GoCat to retry.");
    } finally {
      inboxPromise = null;
    }
  }

  async function disconnectVoiceInbox() {
    const channel = inboxChannel;
    inboxChannel = null;
    inboxUserId = "";
    if (inboxPollTimer) clearInterval(inboxPollTimer);
    inboxPollTimer = null;
    if (channel && db) {
      try { await db.removeChannel(channel); } catch {}
    }
  }

  function handleInboxInviteChange(row) {
    if (!row || !row.id) return;
    if (row.status === "ringing") {
      receiveIncomingInvite(row);
      return;
    }
    if (incomingInvite && String(incomingInvite.id) === String(row.id) &&
        ["cancelled", "declined", "ended"].includes(row.status)) {
      dismissIncomingCall();
      showToast(row.status === "cancelled" ? "The caller cancelled the invitation." : "The call invitation ended.");
    }
    if (activeCall && String(activeCall.id) === String(row.id)) {
      if (row.status === "declined") {
        endActiveCall("The call was declined.", false, true);
      } else if (row.status === "cancelled" || row.status === "ended") {
        endActiveCall(row.status === "cancelled" ? "The caller cancelled the invitation." : "The call ended.", false, false);
      } else if (row.status === "accepted" && activeCall.role === "caller") {
        activeCall.inviteStatus = "accepted";
        setCallStatus("Call accepted · connecting audio…");
        if (activeCall.connectTimer) clearTimeout(activeCall.connectTimer);
        activeCall.connectTimer = setTimeout(function () {
          if (activeCall && activeCall.id === row.id && !activeCall.connectedAt) {
            endActiveCall("The audio connection timed out. Try again.", true, true);
          }
        }, CONNECT_TIMEOUT_MS);
      }
    }
  }

  function playIncomingTone() {
    if (settings && settings.voiceCallSound === false) return;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      if (!ringtoneContext || ringtoneContext.state === "closed") ringtoneContext = new AudioContextConstructor();
      if (ringtoneContext.state === "suspended") ringtoneContext.resume().catch(function () {});
      const oscillator = ringtoneContext.createOscillator();
      const gain = ringtoneContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0.0001, ringtoneContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, ringtoneContext.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ringtoneContext.currentTime + 0.32);
      oscillator.connect(gain);
      gain.connect(ringtoneContext.destination);
      oscillator.start();
      oscillator.stop(ringtoneContext.currentTime + 0.34);
    } catch (error) {
      console.warn("GoCat incoming call sound:", error);
    }
  }

  function stopRingtone() {
    if (ringtoneTimer) clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }

  function clearIncomingExpiryTimer() {
    if (incomingExpiryTimer) clearTimeout(incomingExpiryTimer);
    incomingExpiryTimer = null;
  }

  function startRingtone() {
    stopRingtone();
    if (settings && settings.voiceCallSound === false) return;
    playIncomingTone();
    ringtoneTimer = setInterval(playIncomingTone, 1700);
  }

  function receiveIncomingInvite(row) {
    if (!currentUser || !validUuid(row.id) || !validUuid(row.caller_id) ||
        !validUuid(row.callee_id) || String(row.callee_id) !== String(currentUser.id) ||
        row.status !== "ringing" || activeCall || incomingInvite) return;
    const expiresAt = new Date(row.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;

    incomingInvite = {
      id: String(row.id),
      callerId: String(row.caller_id),
      calleeId: String(row.callee_id),
      expiresAt
    };
    setCallOverlay("incoming", "Incoming voice call", getUsername(incomingInvite.callerId),
      "Accept to connect your microphone.");
    startRingtone();
    incomingExpiryTimer = setTimeout(function () {
      if (incomingInvite && incomingInvite.id === String(row.id)) {
        incomingInvite = null;
        stopRingtone();
        clearIncomingExpiryTimer();
        hideCallOverlay();
        updateCallButton();
        showToast("The call invitation expired.");
      }
    }, Math.max(0, expiresAt - Date.now()));
    updateCallButton();
  }

  function dismissIncomingCall() {
    incomingInvite = null;
    stopRingtone();
    clearIncomingExpiryTimer();
    hideCallOverlay();
    updateCallButton();
  }

  function makeCallRecord(role, inviteRow, remoteUserId) {
    return {
      id: String(inviteRow.id),
      role: role,
      remoteUserId: String(remoteUserId),
      inviteStatus: inviteRow.status || "preparing",
      localStream: null,
      peer: null,
      signalChannel: null,
      inviteChannel: null,
      pendingIce: [],
      offerStarted: false,
      connectedAt: 0,
      ringTimer: null,
      connectTimer: null,
      disconnectTimer: null,
      signalPollTimer: null,
      invitePollTimer: null,
      signalPollInFlight: false,
      invitePollInFlight: false,
      processedSignalIds: new Set()
    };
  }

  function callRowChannel(call) {
    return db.channel("gocat-call-row-" + call.id + "-" + uuid())
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "gocat_voice_call_invites",
        filter: "id=eq." + call.id
      }, function (change) {
        handleInboxInviteChange(change && change.new ? change.new : {}, change && change.old ? change.old : {});
      });
  }

  async function subscribeCallRow(call) {
    const channel = callRowChannel(call);
    await subscribeChannel(channel, "call status");
    call.inviteChannel = channel;
    return channel;
  }

  async function subscribeCallSignals(call) {
    const channel = db.channel("gocat-call-signals-" + call.id + "-" + uuid());
    channel.on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "gocat_voice_call_signals",
      filter: "call_id=eq." + call.id
    }, function (change) {
      dispatchCallSignal(call, change && change.new ? change.new : {});
    });
    await subscribeChannel(channel, "voice connection");
    if (activeCall !== call) {
      await db.removeChannel(channel);
      throw new Error("The call was cancelled.");
    }
    call.signalChannel = channel;
    return channel;
  }

  function dispatchCallSignal(call, row) {
    if (activeCall !== call || !row || String(row.call_id) !== call.id ||
        String(row.sender_id) !== call.remoteUserId) return;
    const signalId = String(row.id || "");
    if (signalId && call.processedSignalIds.has(signalId)) return;
    if (signalId) {
      call.processedSignalIds.add(signalId);
      // Bound memory even if a peer emits an unusually large ICE set.
      if (call.processedSignalIds.size > 300) {
        const oldest = call.processedSignalIds.values().next().value;
        call.processedSignalIds.delete(oldest);
      }
    }
    handleCallSignal(call, row);
  }

  async function pollIncomingInvites() {
    if (!currentUser || !db || inboxPollInFlight || incomingInvite || activeCall ||
        inboxUserId !== String(currentUser.id)) return;
    inboxPollInFlight = true;
    try {
      const pending = await db.from("gocat_voice_call_invites")
        .select("id,caller_id,callee_id,status,expires_at")
        .eq("callee_id", String(currentUser.id))
        .eq("status", "ringing")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (pending.error) throw pending.error;
      if (pending.data && pending.data[0]) receiveIncomingInvite(pending.data[0]);
    } catch (error) {
      console.warn("GoCat incoming-call backup check:", error.message || error);
    } finally {
      inboxPollInFlight = false;
    }
  }

  async function pollCallInvite(call) {
    if (activeCall !== call || !currentUser || call.invitePollInFlight) return;
    call.invitePollInFlight = true;
    try {
      const result = await db.from("gocat_voice_call_invites")
        .select("id,caller_id,callee_id,status,expires_at")
        .eq("id", call.id)
        .maybeSingle();
      if (result.error) throw result.error;
      if (activeCall === call && result.data && result.data.status !== call.inviteStatus) {
        handleInboxInviteChange(result.data);
        if (activeCall === call && result.data.status === "ringing") {
          call.inviteStatus = "ringing";
        }
      }
    } catch (error) {
      console.warn("GoCat call-status backup check:", error.message || error);
    } finally {
      call.invitePollInFlight = false;
    }
  }

  async function pollCallSignals(call) {
    if (activeCall !== call || !currentUser || call.signalPollInFlight) return;
    call.signalPollInFlight = true;
    try {
      const result = await db.from("gocat_voice_call_signals")
        .select("id,call_id,sender_id,signal_type,payload,created_at")
        .eq("call_id", call.id)
        .order("created_at", { ascending: true })
        .limit(100);
      if (result.error) throw result.error;
      (result.data || []).forEach(row => dispatchCallSignal(call, row));
    } catch (error) {
      // Realtime remains the primary path; this is only a delivery fallback.
      console.warn("GoCat call-signal backup check:", error.message || error);
    } finally {
      call.signalPollInFlight = false;
    }
  }

  function startCallPolling(call) {
    if (!call || activeCall !== call) return;
    if (call.invitePollTimer) clearInterval(call.invitePollTimer);
    if (call.signalPollTimer) clearInterval(call.signalPollTimer);
    call.invitePollTimer = setInterval(() => pollCallInvite(call), CALL_POLL_MS);
    call.signalPollTimer = setInterval(() => pollCallSignals(call), CALL_POLL_MS);
    pollCallInvite(call);
    pollCallSignals(call);
  }

  async function insertSignal(call, signalType, data) {
    if (!call || !currentUser) throw new Error("The voice call has closed.");
    const result = await db.from("gocat_voice_call_signals").insert({
      call_id: call.id,
      sender_id: String(currentUser.id),
      signal_type: signalType,
      payload: data || {}
    });
    if (result.error) throw result.error;
  }

  async function getMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone recording is not supported in this browser.");
    }
    if (!window.isSecureContext) throw new Error("Voice calls need a secure HTTPS connection.");
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  }

  function applyInitialMute(call) {
    if (settings && settings.voiceCallMuteMicByDefault === true && call.localStream) {
      call.localStream.getAudioTracks().forEach(function (track) { track.enabled = false; });
    }
  }

  function syncMuteButton(call) {
    const button = $("gocatCallMuteBtn");
    if (!button || activeCall !== call) return;
    const isEnabled = !!call.localStream && call.localStream.getAudioTracks().some(function (track) {
      return track.enabled;
    });
    button.textContent = isEnabled ? "Mute mic" : "Unmute mic";
    button.setAttribute("aria-pressed", String(!isEnabled));
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

  function setCallTimer(call) {
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = setInterval(function () {
      if (activeCall !== call || !call.connectedAt) return;
      const elapsed = Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000));
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      setCallStatus("Connected · " + mins + ":" + secs);
    }, 1000);
  }

  function setConnected(call) {
    if (activeCall !== call || call.connectedAt) return;
    call.connectedAt = Date.now();
    if (call.connectTimer) clearTimeout(call.connectTimer);
    if (call.ringTimer) clearTimeout(call.ringTimer);
    setCallOverlay("active", getUsername(call.remoteUserId), "One-to-one voice call", "Connected · 00:00");
    syncMuteButton(call);
    setCallTimer(call);
  }

  function createPeer(call) {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    call.peer = peer;

    (call.localStream ? call.localStream.getTracks() : []).forEach(function (track) {
      peer.addTrack(track, call.localStream);
    });

    peer.onicecandidate = function (event) {
      if (!event.candidate || activeCall !== call) return;
      insertSignal(call, "ice", event.candidate.toJSON ? event.candidate.toJSON() : event.candidate)
        .catch(function (error) { console.warn("GoCat ICE candidate:", error); });
    };

    peer.ontrack = function (event) {
      if (activeCall !== call) return;
      const audio = $("gocatCallRemoteAudio");
      if (!audio) return;
      audio.srcObject = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      audio.play().catch(function () {
        setCallStatus("Connected. Press Play in the audio control to hear the other person.");
      });
    };

    peer.onconnectionstatechange = function () {
      if (activeCall !== call) return;
      if (peer.connectionState === "connected") {
        setConnected(call);
      } else if (peer.connectionState === "connecting") {
        setCallStatus("Connecting audio…");
      } else if (peer.connectionState === "disconnected") {
        setCallStatus("Connection interrupted · trying to reconnect…");
        if (call.disconnectTimer) clearTimeout(call.disconnectTimer);
        call.disconnectTimer = setTimeout(function () {
          if (activeCall === call && peer.connectionState === "disconnected") {
            endActiveCall("The connection was lost.", true, true);
          }
        }, 10000);
      } else if (peer.connectionState === "failed") {
        endActiveCall("A direct connection failed. Some networks require a TURN relay, which GoCat does not have yet.", true, true);
      }
    };
    return peer;
  }

  async function drainIceQueue(call) {
    if (!call.peer || !call.peer.remoteDescription) return;
    const queued = call.pendingIce.splice(0);
    for (const candidate of queued) {
      try { await call.peer.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn("GoCat queued ICE:", error); }
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

  async function handleCallSignal(call, row) {
    if (activeCall !== call || String(row.call_id) !== call.id ||
        String(row.sender_id) !== call.remoteUserId) return;
    const data = row.payload || {};
    try {
      if (row.signal_type === "ready" && call.role === "caller" && !call.offerStarted) {
        call.offerStarted = true;
        call.inviteStatus = "accepted";
        const offer = await call.peer.createOffer();
        await call.peer.setLocalDescription(offer);
        const local = call.peer.localDescription;
        await insertSignal(call, "offer", local.toJSON ? local.toJSON() : local);
        setCallStatus("Calling " + getUsername(call.remoteUserId) + "…");
        return;
      }
      if (row.signal_type === "offer" && call.role === "callee") {
        await call.peer.setRemoteDescription(data);
        await drainIceQueue(call);
        const answer = await call.peer.createAnswer();
        await call.peer.setLocalDescription(answer);
        const local = call.peer.localDescription;
        await insertSignal(call, "answer", local.toJSON ? local.toJSON() : local);
        setCallStatus("Connecting audio…");
        return;
      }
      if (row.signal_type === "answer" && call.role === "caller") {
        await call.peer.setRemoteDescription(data);
        await drainIceQueue(call);
        setCallStatus("Connecting audio…");
        return;
      }
      if (row.signal_type === "ice") {
        await receiveIce(call, data);
      }
    } catch (error) {
      console.error("GoCat WebRTC negotiation:", error);
      await endActiveCall("Voice connection failed: " + (error.message || error), true, true);
    }
  }

  async function startOutgoingCall() {
    if (!currentUser || !requireAuth("start voice calls")) return;
    const remoteId = directPeerId();
    if (!remoteId) return showToast("Open a one-to-one conversation first. Group voice calls are not enabled yet.");
    if (String(remoteId) === String(currentUser.id)) return;
    if (activeCall || incomingInvite) return showToast("Finish the current call before starting another.");

    const callId = uuid();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const call = {
      id: callId,
      role: "caller",
      remoteUserId: String(remoteId),
      inviteStatus: "preparing",
      localStream: null,
      peer: null,
      signalChannel: null,
      inviteChannel: null,
      pendingIce: [],
      offerStarted: false,
      connectedAt: 0,
      connectTimer: null,
      disconnectTimer: null,
      signalPollTimer: null,
      invitePollTimer: null,
      signalPollInFlight: false,
      invitePollInFlight: false,
      processedSignalIds: new Set()
    };
    activeCall = call;
    updateCallButton();
    setCallOverlay("outgoing", "Calling " + getUsername(remoteId), "Private one-to-one voice call", "Requesting microphone permission…");

    try {
      call.localStream = await getMicrophone();
      if (activeCall !== call) {
        call.localStream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      applyInitialMute(call);
      const inserted = await db.from("gocat_voice_call_invites").insert({
        id: callId,
        caller_id: String(currentUser.id),
        callee_id: String(remoteId),
        status: "preparing",
        expires_at: expiresAt
      }).select("id,caller_id,callee_id,status,expires_at").single();
      if (inserted.error) throw inserted.error;

      await subscribeCallRow(call);
      await subscribeCallSignals(call);
      createPeer(call);
      startCallPolling(call);

      const ring = await db.from("gocat_voice_call_invites")
        .update({ status: "ringing" })
        .eq("id", callId)
        .eq("caller_id", String(currentUser.id))
        .eq("status", "preparing");
      if (ring.error) throw ring.error;
      call.inviteStatus = "ringing";
      call.ringTimer = setTimeout(function () {
        if (activeCall === call && call.inviteStatus === "ringing") {
          endActiveCall("No answer. The invitation expired.", true, true);
        }
      }, INVITE_TTL_MS);
      setCallStatus("Ringing " + getUsername(remoteId) + "…");
    } catch (error) {
      console.warn("GoCat outgoing voice call:", error);
      await endActiveCall("", true, false);
      showToast(callErrorMessage(error));
    }
  }

  async function acceptIncomingCall() {
    const invite = incomingInvite;
    if (!invite || !currentUser) return;
    if (invite.expiresAt <= Date.now()) {
      dismissIncomingCall();
      return showToast("That call invitation has expired.");
    }
    if (activeCall) return showToast("Finish your current call first.");

    const call = {
      id: invite.id,
      role: "callee",
      remoteUserId: invite.callerId,
      inviteStatus: "ringing",
      localStream: null,
      peer: null,
      signalChannel: null,
      inviteChannel: null,
      pendingIce: [],
      offerStarted: false,
      connectedAt: 0,
      connectTimer: null,
      disconnectTimer: null,
      signalPollTimer: null,
      invitePollTimer: null,
      signalPollInFlight: false,
      invitePollInFlight: false,
      processedSignalIds: new Set()
    };
    incomingInvite = null;
    stopRingtone();
    clearIncomingExpiryTimer();
    activeCall = call;
    updateCallButton();
    setCallOverlay("connecting", "Connecting to " + getUsername(call.remoteUserId), "Private one-to-one voice call", "Requesting microphone permission…");

    try {
      call.localStream = await getMicrophone();
      if (activeCall !== call) {
        call.localStream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      applyInitialMute(call);
      await subscribeCallRow(call);
      await subscribeCallSignals(call);
      createPeer(call);
      startCallPolling(call);

      const accepted = await db.from("gocat_voice_call_invites")
        .update({ status: "accepted" })
        .eq("id", call.id)
        .eq("callee_id", String(currentUser.id))
        .eq("status", "ringing");
      if (accepted.error) throw accepted.error;
      call.inviteStatus = "accepted";
      await insertSignal(call, "ready", {});
      call.connectTimer = setTimeout(function () {
        if (activeCall === call && !call.connectedAt) {
          endActiveCall("The audio connection timed out. Try again.", true, true);
        }
      }, CONNECT_TIMEOUT_MS);
      setCallStatus("Waiting for the other person…");
    } catch (error) {
      console.warn("GoCat accepting voice call:", error);
      await endActiveCall("", false, false);
      await db.from("gocat_voice_call_invites")
        .update({ status: "declined" })
        .eq("id", call.id)
        .eq("callee_id", String(currentUser.id))
        .eq("status", "ringing");
      showToast(callErrorMessage(error));
    }
  }

  async function declineIncomingCall() {
    const invite = incomingInvite;
    if (!invite || !currentUser) return;
    incomingInvite = null;
    stopRingtone();
    clearIncomingExpiryTimer();
    hideCallOverlay();
    updateCallButton();
    const result = await db.from("gocat_voice_call_invites")
      .update({ status: "declined" })
      .eq("id", invite.id)
      .eq("callee_id", String(currentUser.id))
      .eq("status", "ringing");
    if (result.error) showToast("Could not decline the call: " + result.error.message);
  }

  async function endActiveCall(message, notifyPeer, showNotice) {
    const call = activeCall;
    activeCall = null;
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = null;
    stopRingtone();

    if (call) {
      if (call.ringTimer) clearTimeout(call.ringTimer);
      if (call.connectTimer) clearTimeout(call.connectTimer);
      if (call.disconnectTimer) clearTimeout(call.disconnectTimer);
      if (call.signalPollTimer) clearInterval(call.signalPollTimer);
      if (call.invitePollTimer) clearInterval(call.invitePollTimer);

      if (notifyPeer && call.inviteStatus) {
        const endStatus = call.inviteStatus === "accepted" ? "ended" :
          call.role === "caller" ? "cancelled" : null;
        if (endStatus) {
          const result = await db.from("gocat_voice_call_invites")
            .update({ status: endStatus })
            .eq("id", call.id)
            .eq("status", call.inviteStatus);
          if (result.error) console.warn("GoCat update call status:", result.error.message);
        }
      }
      if (call.peer) {
        try { call.peer.ontrack = null; call.peer.onicecandidate = null; call.peer.close(); } catch {}
      }
      if (call.localStream) call.localStream.getTracks().forEach(function (track) {
        try { track.stop(); } catch {}
      });
      if (call.signalChannel && db) {
        try { await db.removeChannel(call.signalChannel); } catch {}
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

  function dismissRemoteEndedCall(row) {
    if (!activeCall || String(activeCall.id) !== String(row.id)) return;
    const message = row.status === "declined" ? "The call was declined." :
      row.status === "cancelled" ? "The caller cancelled the invitation." : "The call ended.";
    endActiveCall(message, false, row.status !== "cancelled");
  }

  function updateSettings() {
    if (settings && settings.voiceCallSound === false) {
      if (ringtoneTimer) clearInterval(ringtoneTimer);
      ringtoneTimer = null;
    } else if (incomingInvite && !ringtoneTimer) {
      startRingtone();
    }
  }

  async function cleanupAppSession() {
    if (activeCall) await endActiveCall("", true, false);
    else dismissIncomingCall();
    await disconnectVoiceInbox();
  }

  function bindUI() {
    ensureOverlay();
    $("chatVoiceCallBtn").addEventListener("click", startOutgoingCall);

    const title = $("chatTitle");
    if (title && "MutationObserver" in window) {
      new MutationObserver(updateCallButton).observe(title, {
        childList: true, subtree: true, characterData: true
      });
    }
    const messages = $("chatMessages");
    if (messages && "MutationObserver" in window) {
      new MutationObserver(updateCallButton).observe(messages, { childList: true, subtree: true });
    }

    document.addEventListener("click", function (event) {
      if (event.target.closest("#logoutBtn,#settingsLogout")) cleanupAppSession();
    }, true);

    window.addEventListener("pagehide", function () {
      if (activeCall && activeCall.localStream) {
        activeCall.localStream.getTracks().forEach(function (track) {
          try { track.stop(); } catch {}
        });
      }
    });

    if (db && db.auth && typeof db.auth.onAuthStateChange === "function") {
      db.auth.onAuthStateChange(function (event) {
        if (event === "SIGNED_IN") connectVoiceInbox();
        if (event === "SIGNED_OUT") cleanupAppSession();
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
        await cleanupAppSession();
        const result = await originalGuest.apply(this, arguments);
        updateCallButton();
        return result;
      };
    }

    if (currentUser) connectVoiceInbox();
    updateCallButton();
  }

  window.GoCatVoiceCalls = {
    start: startOutgoingCall,
    refreshButton: updateCallButton,
    end: function () { endActiveCall("Call ended.", true, true); },
    updateSettings: updateSettings
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindUI, { once: true });
  else bindUI();
})();