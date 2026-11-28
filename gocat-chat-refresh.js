/* GoCat chat refresh: mobile conversation navigation and gentle missed-message recovery. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let refreshRunning = false;

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
})();