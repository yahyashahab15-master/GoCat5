/* GoCat chat refresh: mobile conversation navigation and gentle missed-message recovery. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let refreshRunning = false;
  let inboxPreviewRunning = false;

  function leaveMobileConversation() {
    document.body.classList.remove("gocat-chat-open");
  }

  document.addEventListener("click", function (event) {
    const back = event.target.closest("#chatBackBtn");
    if (back) {
      event.preventDefault();
      leaveMobileConversation();
      return;
    }
    const selectedConversation = event.target.closest("[data-chat-user],[data-chat-group]");
    if (selectedConversation && window.matchMedia("(max-width: 640px)").matches) {
      document.body.classList.add("gocat-chat-open");
    }
    const navigation = event.target.closest("[data-page]");
    if (navigation && navigation.dataset.page !== "chats") leaveMobileConversation();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && document.body.classList.contains("gocat-chat-open")) {
      leaveMobileConversation();
    }
  });

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", function (event) {
      if (event.data && event.data.type === "GOCAT_OPEN_INCOMING_CALL") {
        window.GoCatVoiceCalls?.checkIncoming?.();
      }
    });
  }


  function inboxMessagePreview(row) {
    let preview = String(row.content || "").trim();
    if (!preview && row.attachment_mime) {
      const mime = String(row.attachment_mime).toLowerCase();
      if (mime.startsWith("audio/")) preview = "🎙 Voice message";
      else if (mime.startsWith("image/")) preview = "📷 Photo";
      else if (mime.startsWith("video/")) preview = "🎬 Video";
      else preview = "📎 " + String(row.attachment_name || "Attachment");
    }
    if (!preview) preview = "New message";
    if (String(row.sender_id) === String(currentUser.id)) preview = "You: " + preview;
    return preview.replace(/\s+/g, " ").slice(0, 88);
  }

  function inboxTimeLabel(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "›";
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  async function refreshInboxPreviews() {
    const page = $("page-chats");
    const list = $("chatFriends");
    if (inboxPreviewRunning || document.hidden || !page || page.classList.contains("hidden") ||
        !list || typeof currentUser === "undefined" || !currentUser ||
        typeof db === "undefined" || !db) return;

    inboxPreviewRunning = true;
    try {
      const userId = String(currentUser.id);
      const result = await db.from("messages")
        .select("sender_id,recipient_id,content,attachment_name,attachment_mime,created_at")
        .or("sender_id.eq." + userId + ",recipient_id.eq." + userId)
        .is("conversation_id", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (result.error) throw result.error;

      const latestByPeer = new Map();
      (result.data || []).forEach(row => {
        const peerId = String(row.sender_id) === userId ? String(row.recipient_id || "") : String(row.sender_id || "");
        if (peerId && !latestByPeer.has(peerId)) latestByPeer.set(peerId, row);
      });

      const buttons = Array.from(list.querySelectorAll(".chat-friend"));
      buttons.forEach((button, index) => {
        const row = latestByPeer.get(String(button.dataset.chatUser || ""));
        const preview = button.querySelector(".chat-friend-copy small");
        const time = button.querySelector(".chat-friend-arrow");
        button.dataset.inboxOrder = String(index);
        button.dataset.lastMessageAt = row && row.created_at
          ? String(new Date(row.created_at).getTime() || 0) : "0";
        if (preview) preview.textContent = row ? inboxMessagePreview(row) : "Start a conversation";
        if (time) time.textContent = row ? inboxTimeLabel(row.created_at) : "›";
      });

      buttons.sort((a, b) => {
        const timeDifference = Number(b.dataset.lastMessageAt || 0) - Number(a.dataset.lastMessageAt || 0);
        return timeDifference || Number(a.dataset.inboxOrder || 0) - Number(b.dataset.inboxOrder || 0);
      }).forEach(button => list.appendChild(button));
    } catch (error) {
      console.warn("GoCat inbox previews:", error && error.message || error);
    } finally {
      inboxPreviewRunning = false;
    }
  }

  async function refreshIfNewMessageExists() {
    const page = $("page-chats");
    if (refreshRunning || document.hidden || !page || page.classList.contains("hidden")) return;
    if (typeof currentUser === "undefined" || !currentUser ||
        typeof db === "undefined" || !db) return;

    const groupId = typeof currentChatConversationId === "undefined"
      ? "" : String(currentChatConversationId || "");
    const peerId = typeof currentChatUserId === "undefined"
      ? "" : String(currentChatUserId || "");
    if (!groupId && !peerId) return;

    const messages = typeof currentChatMessages !== "undefined" && Array.isArray(currentChatMessages)
      ? currentChatMessages : [];
    const latest = messages.length ? messages[messages.length - 1] : null;
    const lastCreatedAt = latest && latest.created_at ? String(latest.created_at) : "";

    let query = db.from("messages")
      .select("id,created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (groupId) {
      query = query.eq("conversation_id", groupId);
    } else {
      const userId = String(currentUser.id);
      const filter = "and(sender_id.eq." + userId + ",recipient_id.eq." + peerId + ")," +
        "and(sender_id.eq." + peerId + ",recipient_id.eq." + userId + ")";
      query = query.or(filter).is("conversation_id", null);
    }
    if (lastCreatedAt) query = query.gt("created_at", lastCreatedAt);

    refreshRunning = true;
    try {
      const result = await query;
      if (result.error) throw result.error;
      if (result.data && result.data.length && typeof window.loadMessages === "function") {
        await window.loadMessages();
      }
    } catch (error) {
      console.warn("GoCat chat refresh:", error && error.message || error);
    } finally {
      refreshRunning = false;
    }
  }

  // Realtime is the fast path. This ID-only check recovers missed events
  // without repeatedly downloading full conversations and their attachments.
  window.setInterval(refreshIfNewMessageExists, 11000);
  window.setInterval(refreshInboxPreviews, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      refreshIfNewMessageExists();
      refreshInboxPreviews();
    }
  });
  document.addEventListener("click", function (event) {
    const chatsNavigation = event.target.closest('[data-page="chats"]');
    if (chatsNavigation) window.setTimeout(refreshInboxPreviews, 650);
  }, true);
  window.setTimeout(refreshInboxPreviews, 700);
})();