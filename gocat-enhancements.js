/* GoCat social discovery enhancements.
   Uses the existing Supabase data, native renderers and mutual-follow chat model. */
(function () {
  "use strict";

  const STORAGE_KEY = "gocat_recommendations_v2";
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (_) {}
  const seen = new Set(Array.isArray(preferences.seen) ? preferences.seen.map(String) : []);
  const topicCounts = preferences.topicCounts && typeof preferences.topicCounts === "object" ? preferences.topicCounts : {};

  function saveSignals() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
      seen: Array.from(seen).slice(-300), topicCounts: topicCounts
    })); } catch (_) {}
  }
  function recordView(video) {
    if (!video) return;
    seen.delete(String(video.id));
    seen.add(String(video.id));
    if (video.topic) topicCounts[video.topic] = (topicCounts[video.topic] || 0) + 1;
    saveSignals();
  }
  function score(item, kind) {
    const owner = kind === "post" ? item.user_id : item.owner_id;
    const likes = Array.isArray(item.likes) ? item.likes.length : 0;
    const comments = Array.isArray(item.comments) ? item.comments.length : 0;
    const views = Number(item.views || 0);
    const created = new Date(item.created_at || 0).getTime();
    const ageHours = created && Number.isFinite(created) ? Math.max(0, (Date.now() - created) / 3600000) : 1000;
    let value = Math.log1p(likes) * 2 + Math.log1p(comments) * 1.6 + Math.log1p(views) * 0.55;
    value += 5 * Math.exp(-ageHours / 120);
    if (typeof isFollowing === "function" && isFollowing(owner)) value += 5;
    if (kind === "video" && seen.has(String(item.id))) value -= 6;
    if (item.topic) value += Math.min(4, (topicCounts[item.topic] || 0) * 0.6);
    // Small stable variation keeps feeds from being identical without hiding relevance.
    let hash = 0;
    const key = String(item.id || "");
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    return value + Math.abs(hash % 97) / 1000;
  }
  function newestFirst(a, b) {
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  }
  function matches(item, kind, query) {
    if (!query) return true;
    const owner = kind === "post" ? item.user_id : item.owner_id;
    return [item.title, item.description, item.content, getUsername(owner)]
      .join(" ").toLowerCase().includes(query);
  }

  // Keep the established data contract expected by GoCat's home renderer.
  window.getHomeFeedData = function () {
    const query = $("searchInput")?.value.trim().toLowerCase() || "";
    const topicOK = video => activeHomeTopic === "All" || video.topic === activeHomeTopic;
    return {
      regularVideos: videos.filter(v => !isReel(v) && topicOK(v) && matches(v, "video", query))
        .sort((a, b) => score(b, "video") - score(a, "video")),
      shorts: videos.filter(v => isReel(v) && topicOK(v) && matches(v, "video", query))
        .sort((a, b) => score(b, "video") - score(a, "video")),
      communityPosts: posts.filter(p => matches(p, "post", query))
        .sort((a, b) => score(b, "post") - score(a, "post"))
    };
  };

  // One combined stream: long videos, Reels and posts are interleaved card-by-card.
  window.buildHomeFeedCycles = function () {
    const data = window.getHomeFeedData();
    const queues = [
      { kind: "video", list: data.regularVideos, index: 0 },
      { kind: "reel", list: data.shorts, index: 0 },
      { kind: "post", list: data.communityPosts, index: 0 }
    ];
    const mixed = [];
    let previousKind = "";
    while (queues.some(q => q.index < q.list.length)) {
      const ready = queues.filter(q => q.index < q.list.length);
      ready.sort((a, b) => {
        const aScore = score(a.list[a.index], a.kind === "post" ? "post" : "video") - (a.kind === previousKind ? 2.5 : 0);
        const bScore = score(b.list[b.index], b.kind === "post" ? "post" : "video") - (b.kind === previousKind ? 2.5 : 0);
        return bScore - aScore;
      });
      const chosen = ready[0];
      mixed.push({ kind: chosen.kind, item: chosen.list[chosen.index++] });
      previousKind = chosen.kind;
    }
    const cycles = [];
    for (let i = 0; i < mixed.length; i += 6) {
      const cards = mixed.slice(i, i + 6).map(entry => {
        let card = "";
        if (entry.kind === "post") card = postCard(entry.item);
        else if (entry.kind === "reel") card = homeReelCard(entry.item);
        else card = videoCard(entry.item);
        return '<div class="mix-feed-item mix-' + entry.kind + '">' + card +
          (entry.kind === "post" ? "" : '<button class="mix-send-video" type="button" data-share-chat-video="' +
          esc(entry.item.id) + '">Send to mutual ↗</button>') + '</div>';
      }).join("");
      cycles.push('<section class="home-feed-section mix-recommendation-section"><div class="mix-feed-grid">' +
        cards + '</div></section>');
    }
    return cycles;
  };

  // Add a real recommendation panel after the viewer reaches the last available Reel.
  // Recommendations use existing public GoCat Reels only; no fake content is generated.
  const originalRenderReels = window.renderReels;
  if (typeof originalRenderReels === "function") {
    window.renderReels = function () {
      originalRenderReels();
      const feed = $("reelsFeed");
      const allReels = videos.filter(isReel);
      if (!feed || !allReels.length || reelsVisible < allReels.length) return;

      const recentIds = new Set(allReels.slice(Math.max(0, allReels.length - 3)).map(v => String(v.id)));
      const pool = allReels.filter(v => !recentIds.has(String(v.id)));
      const source = pool.length ? pool : allReels;
      const recommendations = source.slice().sort(() => Math.random() - 0.5).slice(0, 3);
      const panel = document.createElement("section");
      panel.className = "reels-end-card";
      panel.innerHTML = '<span aria-hidden="true">✦</span><h2>You reached the end</h2><p>Here are a few more Reels to explore.</p>' +
        recommendations.map(video => '<button type="button" class="soft-btn" data-open-reel-id="' + esc(video.id) + '">' +
          esc(video.title || "Watch this Reel") + ' · @' + esc(getUsername(video.owner_id)) + '</button>').join("");
      feed.appendChild(panel);
    };
  }

  // Record genuine playback starts as lightweight local preference signals.
  document.addEventListener("play", event => {
    const videoEl = event.target;
    if (!(videoEl instanceof HTMLVideoElement)) return;
    const id = videoEl.getAttribute("data-play-video");
    if (id) recordView(videos.find(v => String(v.id) === String(id)));
  }, true);

  // Add one-tap loading of the next recommended Reels as the viewer reaches the end.
  let extendingReels = false;
  const reelFeed = $("reelsFeed");
  if (reelFeed) {
    reelFeed.addEventListener("scroll", () => {
      if (extendingReels) return;
      const all = videos.filter(isReel);
      if (reelsVisible >= all.length) return;
      if (reelFeed.scrollHeight - reelFeed.scrollTop - reelFeed.clientHeight > 520) return;
      extendingReels = true;
      const oldTop = reelFeed.scrollTop;
      reelsVisible = Math.min(reelsVisible + PAGE_SIZE, all.length);
      renderReels();
      requestAnimationFrame(() => {
        reelFeed.scrollTop = oldTop;
        extendingReels = false;
      });
    }, { passive: true });
  }

  async function sendVideoTo(user, video) {
    if (!currentUser || !user || !video) return;
    const link = new URL(location.pathname, location.origin);
    link.searchParams.set("video", String(video.id));
    const body = "🎬 " + (video.title || "GoCat video") + "\n" + link.toString();
    const result = await insertWithTextFallback(
      "messages",
      { sender_id: currentUser.id, recipient_id: user.id },
      body, "text", "content"
    );
    if (result.error) throw result.error;
    if (String(currentChatUserId) === String(user.id)) await loadMessages();
    showToast("Video sent to " + (user.username || "your mutual"));
  }
  async function chooseRecipientAndSend(videoId) {
    if (!requireAuth("share videos in chat")) return;
    const video = videos.find(v => String(v.id) === String(videoId));
    if (!video) return showToast("That video is not available.");
    const mutuals = getMutualFriends();
    if (!mutuals.length) return showToast("You need a mutual follow connection before messaging.");
    if (currentChatUserId) {
      const selected = mutuals.find(u => String(u.id) === String(currentChatUserId));
      if (selected) {
        try { await sendVideoTo(selected, video); } catch (error) { showToast("Video could not be sent: " + error.message); }
        return;
      }
    }
    const list = mutuals.map((u, i) => (i + 1) + ". " + u.username).join("\n");
    const answer = window.prompt("Send this video to a mutual connection:\n" + list + "\n\nEnter a number:");
    if (answer === null) return;
    const recipient = mutuals[Number(answer) - 1];
    if (!recipient || !Number.isInteger(Number(answer)) || Number(answer) < 1) return showToast("Choose a valid mutual.");
    try { await sendVideoTo(recipient, video); }
    catch (error) { showToast("Video could not be sent: " + error.message); }
  }
  document.addEventListener("click", event => {
    const share = event.target.closest("[data-share-chat-video]");
    if (!share) return;
    event.preventDefault();
    event.stopPropagation();
    chooseRecipientAndSend(share.getAttribute("data-share-chat-video"));
  });

  // Add a video-share action to the chat composer. It uses the selected mutual chat,
  // or asks which mutual should receive the selected GoCat video.
  const chatForm = $("chatForm");
  if (chatForm && !$("chatShareVideoBtn")) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "chatShareVideoBtn";
    button.className = "mix-chat-share-btn";
    button.textContent = "Share video";
    button.addEventListener("click", () => {
      if (!requireAuth("share videos")) return;
      const available = videos.slice().sort((a, b) => score(b, "video") - score(a, "video"));
      if (!available.length) return showToast("There are no videos to share yet.");
      const options = available.slice(0, 30).map((v, i) => (i + 1) + ". " + v.title).join("\n");
      const answer = window.prompt("Choose a GoCat video:\n" + options + "\n\nEnter a number:");
      if (answer === null) return;
      const video = available[Number(answer) - 1];
      if (!video || !Number.isInteger(Number(answer)) || Number(answer) < 1 || Number(answer) > Math.min(30, available.length)) {
        return showToast("Choose a valid video.");
      }
      chooseRecipientAndSend(video.id);
    });
    chatForm.parentNode.insertBefore(button, chatForm);
  }

  // Render URLs in chat as safe clickable links, preserving ordinary text and line breaks.
  function linkifyMessages() {
    const root = $("chatMessages");
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (/https?:\/\//i.test(node.nodeValue) && !node.parentElement.closest("a,button,script,style")) textNodes.push(node);
    }
    textNodes.forEach(node => {
      const value = node.nodeValue;
      const pattern = /https?:\/\/[^\s<]+/gi;
      const fragment = document.createDocumentFragment();
      let cursor = 0, match;
      while ((match = pattern.exec(value))) {
        fragment.appendChild(document.createTextNode(value.slice(cursor, match.index)));
        const clean = match[0].replace(/[),.!?]+$/, "");
        const anchor = document.createElement("a");
        anchor.href = clean;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.className = "mix-chat-link";
        anchor.textContent = clean;
        fragment.appendChild(anchor);
        cursor = match.index + match[0].length;
      }
      fragment.appendChild(document.createTextNode(value.slice(cursor)));
      node.parentNode.replaceChild(fragment, node);
    });
  }
  const originalLoadMessages = window.loadMessages;
  if (typeof originalLoadMessages === "function") {
    window.loadMessages = async function () {
      await originalLoadMessages();
      linkifyMessages();
    };
  }
  const messageRoot = $("chatMessages");
  if (messageRoot) new MutationObserver(linkifyMessages).observe(messageRoot, { childList: true, subtree: true });

  // Open shared GoCat video links in the relevant in-app viewer.
  document.addEventListener("click", event => {
    const anchor = event.target.closest(".mix-chat-link");
    if (!anchor) return;
    try {
      const url = new URL(anchor.href, location.href);
      const videoId = url.searchParams.get("video");
      if (!videoId || url.origin !== location.origin) return;
      event.preventDefault();
      const item = videos.find(v => String(v.id) === String(videoId));
      if (!item) return showToast("That shared video is no longer available.");
      if (isReel(item)) openSpecificReel(item.id);
      else { openPage("home"); scrollToVideo(item.id); }
    } catch (_) {}
  });

  // The native startup code controls when the overlay disappears; this only styles it.
  const loader = $("loader");
  if (loader) loader.classList.add("gocat-loader-active");
})();
