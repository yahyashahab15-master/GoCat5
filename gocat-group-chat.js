/* GoCat group messaging — additive layer over the existing direct-message system. */
var currentChatConversationId = null;
var currentChatGroup = null;
var chatGroupConversations = [];
var chatGroupMemberships = [];

(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let groupFetchAt = 0;
  let groupFetchPromise = null;
  let selectedGroupMemberIds = new Set();
  let lastGroupCreatorFocus = null;
  const baseRenderChatFriends = window.renderChatFriends;
  const baseOpenChat = window.openChat;
  const baseLoadMessages = window.loadMessages;
  const baseToggleReaction = window.toggleChatMessageReaction;
  const baseShareMessage = window.shareChatMessageOutside;
  const baseStartGuest = window.startGuestGoCat;

  function groupName(id) {
    const group = chatGroupConversations.find(item => String(item.id) === String(id));
    return group?.title || currentChatGroup?.title || "Group chat";
  }

  function groupMemberCount(id) {
    return chatGroupMemberships.filter(row => String(row.conversation_id) === String(id)).length;
  }

  function bumpGroupTimestamp(id, timestamp) {
    const group = chatGroupConversations.find(item => String(item.id) === String(id));
    if (!group) return;
    group.last_message_at = timestamp || new Date().toISOString();
    chatGroupConversations.sort((a, b) =>
      new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0)
    );
    renderGroupList();
  }

  async function loadGroupConversations(force) {
    if (!currentUser || !db) {
      chatGroupConversations = [];
      chatGroupMemberships = [];
      renderGroupList();
      return [];
    }
    if (!force && Date.now() - groupFetchAt < 20000) {
      renderGroupList();
      return chatGroupConversations;
    }
    if (groupFetchPromise) return groupFetchPromise;
    groupFetchPromise = (async () => {
      const ownRows = await db.from("conversation_members")
        .select("conversation_id,role,joined_at")
        .eq("user_id", String(currentUser.id))
        .order("joined_at", { ascending: false })
        .limit(100);
      if (ownRows.error) {
        console.warn("GoCat group inbox:", ownRows.error.message);
        renderGroupList("Group chats could not load. Try refreshing.");
        return chatGroupConversations;
      }
      const ids = (ownRows.data || []).map(row => String(row.conversation_id));
      if (!ids.length) {
        chatGroupConversations = [];
        chatGroupMemberships = [];
        groupFetchAt = Date.now();
        renderGroupList();
        return [];
      }
      const [groupsResult, membersResult] = await Promise.all([
        db.from("conversations")
          .select("id,title,created_by,created_at,last_message_at")
          .in("id", ids)
          .order("last_message_at", { ascending: false }),
        db.from("conversation_members")
          .select("conversation_id,user_id,role,joined_at")
          .in("conversation_id", ids)
      ]);
      if (groupsResult.error || membersResult.error) {
        console.warn("GoCat group inbox details:", groupsResult.error || membersResult.error);
        renderGroupList("Group chats could not load. Try refreshing.");
        return chatGroupConversations;
      }
      const ownById = new Map((ownRows.data || []).map(row => [String(row.conversation_id), row]));
      chatGroupConversations = (groupsResult.data || []).map(group => ({
        ...group,
        my_role: ownById.get(String(group.id))?.role || "member"
      }));
      chatGroupMemberships = membersResult.data || [];
      groupFetchAt = Date.now();
      renderGroupList();
      return chatGroupConversations;
    })();
    try { return await groupFetchPromise; }
    finally { groupFetchPromise = null; }
  }

  function renderGroupList(message) {
    const list = $("chatGroupList");
    if (!list) return;
    if (!currentUser) {
      list.innerHTML = '<div class="gocat-group-empty">Sign in to create and join group chats.</div>';
      return;
    }
    const search = $("chatSearch")?.value.trim().toLowerCase() || "";
    const rows = chatGroupConversations.filter(group => !search || String(group.title || "").toLowerCase().includes(search));
    if (message) {
      list.innerHTML = '<div class="gocat-group-empty">' + esc(message) + '</div>';
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<div class="gocat-group-empty">No group chats yet. Create one with your connections.</div>';
      return;
    }
    list.innerHTML = rows.map(group => {
      const active = String(currentChatConversationId) === String(group.id);
      const count = groupMemberCount(group.id);
      return '<button type="button" class="gocat-group-row ' + (active ? "active" : "") +
        '" data-chat-group="' + esc(group.id) + '" aria-label="Open group ' + esc(group.title) + '">' +
        '<span class="gocat-group-avatar" aria-hidden="true">👥</span>' +
        '<span class="gocat-group-copy"><strong>' + esc(group.title) + '</strong>' +
        '<small>' + count + ' member' + (count === 1 ? "" : "s") + '</small></span>' +
        '<span class="gocat-group-arrow" aria-hidden="true">›</span></button>';
    }).join("");
  }

  function renderGroupMemberPicker() {
    const picker = $("chatGroupMemberPicker");
    if (!picker) return;
    const search = $("chatGroupMemberSearch")?.value.trim().toLowerCase() || "";
    const candidates = typeof getMutualFriends === "function"
      ? getMutualFriends().filter(user => !user.is_banned && String(user.username || "").toLowerCase().includes(search))
      : [];
    if (!candidates.length) {
      picker.innerHTML = '<div class="gocat-group-empty">No connections match that search. Try another name.</div>';
      updateGroupSelectionSummary();
      return;
    }
    picker.innerHTML = candidates.map(user => {
      const id = String(user.id);
      const selected = selectedGroupMemberIds.has(id);
      return '<label class="gocat-group-person' + (selected ? ' is-selected' : '') + '">' +
        '<span class="gocat-group-person-avatar">' +
        (user.avatar_path
          ? '<img src="' + esc(storageURL("profile-avatars", user.avatar_path)) + '" alt="">'
          : esc(initial(user.username))) +
        '</span><span class="gocat-group-person-copy"><strong>' + esc(user.username || "Creator") + '</strong>' +
        '<small>Connection</small></span>' +
        '<input type="checkbox" data-chat-group-member value="' + esc(id) + '"' + (selected ? ' checked' : '') + '>' +
        '</label>';
    }).join("");
    updateGroupSelectionSummary();
  }

  function updateGroupSelectionSummary() {
    const count = selectedGroupMemberIds.size;
    const summary = $("chatGroupSelectedCount");
    const button = $("chatCreateGroupBtn");
    if (summary) summary.textContent = count + (count === 1 ? " person selected" : " people selected");
    if (button) {
      button.disabled = count < 1 || count > 49;
      button.textContent = count ? "Create group · " + count : "Create group";
    }
  }

  function setComposerEnabled(enabled) {
    if ($("messageInput")) $("messageInput").disabled = !enabled;
    if ($("sendMessageBtn")) $("sendMessageBtn").disabled = !enabled;
    if ($("chatAttachBtn")) $("chatAttachBtn").disabled = !enabled;
  }

  async function openGroupChat(groupId) {
    if (!requireAuth("open group chats")) return;
    await loadGroupConversations(false);
    const group = chatGroupConversations.find(item => String(item.id) === String(groupId));
    const members = chatGroupMemberships.filter(row => String(row.conversation_id) === String(groupId));
    if (!group || !members.some(row => String(row.user_id) === String(currentUser.id))) {
      showToast("You are not a member of that group.");
      return;
    }
    currentChatUserId = null;
    currentChatConversationId = String(group.id);
    currentChatGroup = group;
    resetChatAttachmentSelection();
    if (chatRealtimeChannel) db.removeChannel(chatRealtimeChannel);
    chatRealtimeChannel = db.channel("gocat-group-messages-" + String(group.id))
      .on("postgres_changes", {
        event: "*", schema: "public", table: "messages",
        filter: "conversation_id=eq." + String(group.id)
      }, payload => {
        const row = payload.new || payload.old || {};
        if (String(row.conversation_id) === String(currentChatConversationId)) {
          bumpGroupTimestamp(row.conversation_id, row.created_at);
          loadGroupMessages();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, payload => {
        const row = payload.new || payload.old || {};
        if (currentChatMessages.some(message => String(message.id) === String(row.message_id))) loadGroupMessages();
      })
      .subscribe();
    if ($("chatTitle")) $("chatTitle").textContent = group.title;
    if ($("chatHeaderAvatar")) $("chatHeaderAvatar").textContent = "👥";
    if ($("chatPresence")) $("chatPresence").textContent =
      "Group chat · " + members.length + " members · Group typing and presence are not enabled yet";
    if ($("chatTypingStatus")) $("chatTypingStatus").textContent = "";
    setComposerEnabled(true);
    window.GoCatVoiceNotes?.syncButtonState?.();
    window.GoCatVoiceCalls?.refreshButton?.();
    renderGroupList();
    if (typeof baseRenderChatFriends === "function") baseRenderChatFriends();
    await loadGroupMessages();
  }

  async function loadGroupMessages() {
    if (!currentUser || !currentChatConversationId || !db) return;
    const activeId = String(currentChatConversationId);
    const container = $("chatMessages");
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 90;
    const result = await db.from("messages").select("*")
      .eq("conversation_id", activeId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (String(currentChatConversationId) !== activeId) return;
    if (result.error) {
      console.error("GoCat group messages:", result.error);
      container.innerHTML = '<div class="chat-empty-state"><span class="chat-empty-icon">!</span><strong>Group messages could not load</strong><p>Check your connection and try again.</p></div>';
      return;
    }
    const messages = result.data || [];
    currentChatMessages = messages;
    currentChatReactions = [];
    if (messages.length) {
      const reactions = await db.from("message_reactions")
        .select("message_id,user_id,emoji")
        .in("message_id", messages.map(message => message.id));
      if (String(currentChatConversationId) !== activeId) return;
      if (reactions.error) console.warn("GoCat group reactions:", reactions.error.message);
      else currentChatReactions = reactions.data || [];
    }
    chatSignedUrls = new Map();
    const paths = Array.from(new Set(messages.map(message => message.attachment_path)
      .filter(path => typeof path === "string" && path.trim())));
    if (paths.length) {
      const signed = await db.storage.from(CHAT_BUCKET).createSignedUrls(paths, 3600);
      if (String(currentChatConversationId) !== activeId) return;
      if (signed.error) console.warn("GoCat group attachments:", signed.error.message);
      else (signed.data || []).forEach(item => {
        if (item.path && item.signedUrl) chatSignedUrls.set(item.path, item.signedUrl);
      });
    }
    container.innerHTML = messages.length ? messages.map(message => {
      const mine = String(message.sender_id) === String(currentUser.id);
      const bodyText = String(message.content ?? message.text ?? "");
      const body = esc(bodyText).replace(/\n/g, "<br>");
      const file = chatAttachmentMarkup(message, chatSignedUrls.get(message.attachment_path));
      const searchable = esc([bodyText, message.attachment_name || "", getUsername(message.sender_id)].join(" "));
      const author = '<small class="gocat-group-message-author">' +
        esc(mine ? "You" : getUsername(message.sender_id)) + '</small>';
      const shareButton = '<button type="button" class="chat-bubble-share" data-chat-share-message="' +
        esc(message.id) + '" title="Share this message outside GoCat">Share ↗</button>';
      const copyButton = body
        ? '<button type="button" class="chat-bubble-share" data-chat-copy-message="' + esc(message.id) +
          '" title="Copy message text">Copy</button>' : "";
      return '<article class="chat-bubble ' + (mine ? "mine" : "") +
        '" data-chat-message-search="' + searchable + '">' + author +
        (body ? '<div class="chat-message-body">' + body + '</div>' : "") +
        file + chatMessageReactionMarkup(message.id) +
        '<div class="chat-bubble-footer"><time>' + formatDate(message.created_at) +
        (mine ? " · Sent" : "") + '</time>' + copyButton + shareButton + '</div></article>';
    }).join("") : '<div class="chat-empty-state"><span class="chat-empty-icon">👥</span><strong>Start the group conversation</strong><p>Send a message, photo, video, audio clip or document to everyone in this group.</p></div>';
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }

  async function sendGroupMessage() {
    if (!currentUser || !currentChatConversationId) return;
    const text = $("messageInput")?.value.trim() || "";
    const file = selectedChatAttachment || $("chatAttachmentFile")?.files?.[0] || null;
    if (!text && !file) return showToast("Write a message or attach a file.");
    if (file && file.size > MAX_CHAT_ATTACHMENT_BYTES) return showToast("Chat attachments must be 50 MB or smaller.");
    if (file && !chatFileTypeAllowed(file)) return showToast("This file type is not supported in GoCat chat.");
    const targetId = String(currentChatConversationId);
    const button = $("sendMessageBtn");
    if (button) button.disabled = true;
    if ($("chatAttachBtn")) $("chatAttachBtn").disabled = true;
    let uploadedPath = null;
    try {
      const row = {
        sender_id: String(currentUser.id),
        recipient_id: null,
        conversation_id: targetId,
        content: text
      };
      if (file) {
        if ($("chatUploadStatus")) $("chatUploadStatus").textContent = "Uploading attachment…";
        const extension = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || ("attachment." + extension);
        const path = String(currentUser.id) + "/" + Date.now() + "-" +
          Math.random().toString(36).slice(2, 9) + "-" + safeName;
        const upload = await uploadChatAttachment(file, path, percentage => {
          if ($("chatUploadStatus")) $("chatUploadStatus").textContent = "Uploading attachment… " + percentage + "%";
        });
        uploadedPath = upload && upload.path || path;
        row.attachment_path = uploadedPath;
        row.attachment_name = file.name.slice(0, 180);
        row.attachment_mime = file.type || "application/octet-stream";
        row.attachment_size = file.size;
        if ($("chatUploadStatus")) $("chatUploadStatus").textContent = "Sending message…";
      }
      const sent = await db.from("messages").insert(row);
      if (sent.error) throw sent.error;
      bumpGroupTimestamp(targetId, new Date().toISOString());
      $("messageInput").value = "";
      resetChatAttachmentSelection();
      await loadGroupMessages();
    } catch (error) {
      if (uploadedPath) {
        const removed = await db.storage.from(CHAT_BUCKET).remove([uploadedPath]);
        if (removed.error) console.warn("GoCat group attachment cleanup:", removed.error.message);
      }
      showToast("Group message failed: " + (error.message || error));
    } finally {
      if (button) button.disabled = false;
      if ($("chatAttachBtn")) $("chatAttachBtn").disabled = false;
      if ($("chatUploadStatus") && !selectedChatAttachment) {
        $("chatUploadStatus").textContent = "Files from this device or other apps · Max 50 MB";
      }
    }
  }

  async function toggleGroupReaction(messageId, emoji) {
    if (!currentUser || !currentChatConversationId || !CHAT_REACTION_OPTIONS.includes(emoji)) return;
    if (!currentChatMessages.some(message => String(message.id) === String(messageId))) return;
    const existing = currentChatReactions.find(row =>
      String(row.message_id) === String(messageId) &&
      String(row.user_id) === String(currentUser.id) && row.emoji === emoji
    );
    const result = existing
      ? await db.from("message_reactions").delete()
          .eq("message_id", messageId).eq("user_id", currentUser.id).eq("emoji", emoji)
      : await db.from("message_reactions").insert({
          message_id: messageId, user_id: String(currentUser.id), emoji
        });
    if (result.error) showToast("Reaction could not be saved: " + result.error.message);
    else await loadGroupMessages();
  }

  async function shareGroupMessage(messageId) {
    if (!currentUser || !currentChatConversationId) return;
    const message = currentChatMessages.find(row => String(row.id) === String(messageId));
    if (!message) return showToast("That message is no longer loaded.");
    let text = String(message.content || "").trim();
    let attachmentUrl = "";
    if (message.attachment_path) {
      if (!confirm("This creates a temporary link that anyone with the link can open for up to one hour. Continue?")) return;
      const signed = await db.storage.from(CHAT_BUCKET).createSignedUrl(message.attachment_path, 3600);
      if (signed.error) return showToast("Could not create a sharing link: " + signed.error.message);
      attachmentUrl = signed.data?.signedUrl || "";
      if (!attachmentUrl) return showToast("GoCat could not create the sharing link.");
      text = [text, message.attachment_name || "GoCat attachment"].filter(Boolean).join("\n");
    }
    const data = {
      title: "A group message from " + getUsername(message.sender_id) + " on GoCat",
      text: text || "Shared from GoCat",
      ...(attachmentUrl ? { url: attachmentUrl } : {})
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch (error) { if (error?.name === "AbortError") return; }
    try {
      const value = [data.text, data.url].filter(Boolean).join("\n");
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const field = document.createElement("textarea");
        field.value = value; field.setAttribute("readonly", "");
        field.style.cssText = "position:fixed;opacity:0;left:-9999px;top:0";
        document.body.appendChild(field); field.select();
        const copied = document.execCommand("copy"); field.remove();
        if (!copied) throw new Error("Copy is not available in this browser.");
      }
      showToast("Message copied. Paste it into another app.");
    } catch (error) { showToast("Could not share this message: " + error.message); }
  }

  function showGroupCreator(show) {
    const panel = $("chatGroupCreator");
    if (!panel) return;
    if (show) {
      lastGroupCreatorFocus = document.activeElement;
      renderGroupMemberPicker();
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      document.body.classList.add("gocat-group-modal-open");
      window.requestAnimationFrame(() => $("chatGroupName")?.focus());
      return;
    }
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("gocat-group-modal-open");
    if (lastGroupCreatorFocus && typeof lastGroupCreatorFocus.focus === "function") {
      lastGroupCreatorFocus.focus();
    }
    lastGroupCreatorFocus = null;
  }

  async function createGroup() {
    if (!requireAuth("create group chats")) return;
    const title = String($("chatGroupName")?.value || "").trim();
    const members = Array.from(selectedGroupMemberIds);
    if (!title) return showToast("Add a name for your group.");
    if (members.length < 1 || members.length > 49) return showToast("Choose between 1 and 49 people.");
    const button = $("chatCreateGroupBtn");
    if (button) { button.disabled = true; button.textContent = "Creating…"; }
    try {
      const result = await db.rpc("create_gocat_group_conversation", {
        p_title: title,
        p_member_ids: members
      });
      if (result.error) throw result.error;
      const groupId = String(result.data || "");
      if (!groupId) throw new Error("The group was not created. Please try again.");
      if ($("chatGroupName")) $("chatGroupName").value = "";
      if ($("chatGroupMemberSearch")) $("chatGroupMemberSearch").value = "";
      selectedGroupMemberIds.clear();
      renderGroupMemberPicker();
      showGroupCreator(false);
      await loadGroupConversations(true);
      await openGroupChat(groupId);
      showToast("Group created. Your members can now chat here.");
    } catch (error) {
      showToast("Could not create the group: " + (error.message || error));
    } finally {
      if (button) { button.disabled = false; button.textContent = "Create group"; }
    }
  }

  if (typeof baseRenderChatFriends === "function") {
    window.renderChatFriends = function () {
      baseRenderChatFriends();
      loadGroupConversations(false);
      renderGroupList();
    };
  }

  if (typeof baseOpenChat === "function") {
    window.openChat = function () {
      currentChatConversationId = null;
      currentChatGroup = null;
      const args = arguments;
      return baseOpenChat.apply(this, args);
    };
  }

  if (typeof baseLoadMessages === "function") {
    window.loadMessages = function () {
      if (currentChatConversationId) return loadGroupMessages();
      return baseLoadMessages.apply(this, arguments);
    };
  }

  if (typeof baseToggleReaction === "function") {
    window.toggleChatMessageReaction = function (messageId, emoji) {
      if (currentChatConversationId) return toggleGroupReaction(messageId, emoji);
      return baseToggleReaction.apply(this, arguments);
    };
  }

  if (typeof baseShareMessage === "function") {
    window.shareChatMessageOutside = function (messageId) {
      if (currentChatConversationId) return shareGroupMessage(messageId);
      return baseShareMessage.apply(this, arguments);
    };
  }

  if (typeof baseStartGuest === "function") {
    window.startGuestGoCat = async function () {
      currentChatConversationId = null;
      currentChatGroup = null;
      chatGroupConversations = [];
      chatGroupMemberships = [];
      groupFetchAt = 0;
      return baseStartGuest.apply(this, arguments);
    };
  }

  document.addEventListener("click", event => {
    const groupButton = event.target.closest("[data-chat-group]");
    if (groupButton) {
      event.preventDefault();
      openGroupChat(groupButton.dataset.chatGroup);
      return;
    }
    const userButton = event.target.closest("[data-chat-user]");
    if (userButton) {
      event.preventDefault();
      if (typeof window.openChat === "function") window.openChat(userButton.dataset.chatUser);
      return;
    }
    if (event.target.closest("#chatNewGroupBtn")) {
      showGroupCreator(true);
      return;
    }
    if (event.target.closest("#chatCancelGroupBtn") ||
        event.target.closest("#chatCancelGroupBtnFooter") ||
        event.target.closest("#chatGroupModalBackdrop")) {
      showGroupCreator(false);
      return;
    }
    if (event.target.closest("#chatCreateGroupBtn")) {
      createGroup();
      return;
    }
    if (currentChatConversationId && event.target.closest("#chatAttachBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!requireAuth("send an attachment")) return;
      $("chatAttachmentFile")?.click();
    }
  }, true);

  document.addEventListener("submit", event => {
    if (event.target?.id !== "chatForm" || !currentChatConversationId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendGroupMessage();
  }, true);

  document.addEventListener("input", event => {
    if (event.target?.id === "chatGroupMemberSearch") renderGroupMemberPicker();
    if (event.target?.id === "chatSearch") renderGroupList();
  });

  document.addEventListener("change", event => {
    if (event.target?.matches("[data-chat-group-member]")) {
      const id = String(event.target.value || "");
      if (event.target.checked) selectedGroupMemberIds.add(id);
      else selectedGroupMemberIds.delete(id);
      event.target.closest(".gocat-group-person")?.classList.toggle("is-selected", event.target.checked);
      updateGroupSelectionSummary();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("chatGroupCreator")?.hidden) {
      event.preventDefault();
      showGroupCreator(false);
    }
    if (event.key === "Tab" && !$("chatGroupCreator")?.hidden) {
      const dialog = document.querySelector(".gocat-group-dialog");
      const focusable = Array.from(dialog?.querySelectorAll('button:not(:disabled),input:not(:disabled)') || [])
        .filter(item => item.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });

  // When the user shares a GoCat video while a group is open, send it to that group.
  window.GoCatSendVideoToOpenGroup = async function (video) {
    if (!currentUser || !currentChatConversationId || !video) return false;
    const link = new URL(location.pathname, location.origin);
    link.searchParams.set("video", String(video.id));
    const body = "🎬 " + (video.title || "GoCat video") + "\n" + link.toString();
    const result = await db.from("messages").insert({
      sender_id: String(currentUser.id),
      recipient_id: null,
      conversation_id: String(currentChatConversationId),
      content: body
    });
    if (result.error) throw result.error;
    bumpGroupTimestamp(currentChatConversationId, new Date().toISOString());
    await loadGroupMessages();
    showToast("Video shared with " + groupName(currentChatConversationId) + ".");
    return true;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateGroupSelectionSummary();
      renderGroupList();
    }, { once: true });
  } else {
    updateGroupSelectionSummary();
    renderGroupList();
  }
})();