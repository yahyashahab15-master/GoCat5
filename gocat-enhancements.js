/* GoCat social discovery enhancements.
   Uses the existing Supabase data, native renderers and mutual-follow chat model. */
(function () {
  "use strict";

  const STORAGE_KEY = "gocat_recommendations_v2";
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (_) {}
  const seen = new Set(Array.isArray(preferences.seen) ? preferences.seen.map(String) : []);
  const topicCounts = preferences.topicCounts && typeof preferences.topicCounts === "object" ? preferences.topicCounts : {};

  // Keep recommendation calculations efficient while giving small channels a fair start.
  let creatorMetricsCache = null;
  function getCreatorMetrics(ownerId) {
    if (!creatorMetricsCache || creatorMetricsCache.videosRef !== videos || creatorMetricsCache.followsRef !== follows) {
      const metrics = new Map();
      (videos || []).forEach(video => {
        const key = String(video.owner_id || "");
        if (!key) return;
        const entry = metrics.get(key) || { uploads: 0, followers: 0 };
        entry.uploads += 1;
        metrics.set(key, entry);
      });
      (follows || []).forEach(follow => {
        const key = String(follow.following_id || "");
        if (!key) return;
        const entry = metrics.get(key) || { uploads: 0, followers: 0 };
        entry.followers += 1;
        metrics.set(key, entry);
      });
      creatorMetricsCache = { videosRef: videos, followsRef: follows, metrics };
    }
    return creatorMetricsCache.metrics.get(String(ownerId || "")) || { uploads: 0, followers: 0 };
  }

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
    if (kind === "video") {
      const creator = getCreatorMetrics(owner);
      // A modest cold-start boost helps new creators surface without overpowering relevance.
      if (creator.followers < 10) value += 2.2;
      else if (creator.followers < 50) value += 1.1;
      if (creator.uploads > 0 && creator.uploads <= 3) value += 0.7;
    }
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

  // Recommendations are ranked independently inside each content type.
  // GoCat always keeps its original order: 4 videos, 4 Reels, then 2 posts.
  window.gocatRecommendationScore = score;

  window.getHomeFeedData = function () {
    const query = $("searchInput")?.value.trim().toLowerCase() || "";
    const topicOK = video => activeHomeTopic === "All" || video.topic === activeHomeTopic;
    return {
      regularVideos: videos
        .filter(v => !isReel(v) && topicOK(v) && matches(v, "video", query))
        .sort((a, b) => score(b, "video") - score(a, "video")),
      shorts: videos
        .filter(v => isReel(v) && topicOK(v) && matches(v, "video", query))
        .sort((a, b) => score(b, "video") - score(a, "video")),
      communityPosts: posts
        .filter(p => matches(p, "post", query))
        .sort((a, b) => score(b, "post") - score(a, "post"))
    };
  };

  window.buildHomeFeedCycles = function () {
    const data = window.getHomeFeedData();
    let videoIndex = 0;
    let reelIndex = 0;
    let postIndex = 0;
    const cycles = [];

    while (
      videoIndex < data.regularVideos.length ||
      reelIndex < data.shorts.length ||
      postIndex < data.communityPosts.length
    ) {
      const sections = [];

      if (videoIndex < data.regularVideos.length) {
        const group = data.regularVideos.slice(videoIndex, videoIndex + 4);
        videoIndex += group.length;
        sections.push(
          '<section class="home-feed-section home-video-section">' +
            '<div class="home-feed-heading"><h2>Videos for you</h2></div>' +
            '<div class="home-feed-video-grid">' + group.map(videoCard).join("") + '</div>' +
          '</section>'
        );
      }

      if (reelIndex < data.shorts.length) {
        const group = data.shorts.slice(reelIndex, reelIndex + 4);
        reelIndex += group.length;
        sections.push(
          '<section class="home-feed-section home-reels-section">' +
            '<div class="home-feed-heading">' +
              '<div class="home-shelf-title"><span class="shorts-logo">' + icon("shorts") + '</span><h2>Reels for you</h2></div>' +
              '<button class="text-btn" data-go-page="reels">See all</button>' +
            '</div>' +
            '<div class="home-shorts-shelf">' + group.map(homeReelCard).join("") + '</div>' +
          '</section>'
        );
      }

      if (postIndex < data.communityPosts.length) {
        const group = data.communityPosts.slice(postIndex, postIndex + 2);
        postIndex += group.length;
        sections.push(
          '<section class="home-feed-section home-posts-section">' +
            '<div class="home-feed-heading"><h2>From the community</h2><button class="text-btn" data-go-page="posts">View posts</button></div>' +
            '<div class="home-feed-post-grid">' + group.map(postCard).join("") + '</div>' +
          '</section>'
        );
      }

      cycles.push(sections.join(""));
    }
    return cycles;
  };

  // Append the next complete group automatically when the reader approaches the bottom.
  let homeFeedObserver = null;
  function renderHomeFeedAutomatically() {
    const container = $("homeFeed");
    if (!container) return;

    if (homeFeedObserver) {
      homeFeedObserver.disconnect();
      homeFeedObserver = null;
    }

    const data = window.getHomeFeedData();
    const cycles = window.buildHomeFeedCycles();
    const hasObserver = "IntersectionObserver" in window;

    if (!hasObserver) {
      homeVisibleCycles = cycles.length;
    } else {
      homeVisibleCycles = Math.min(
        Math.max(1, Number(homeVisibleCycles) || 1),
        Math.max(1, cycles.length)
      );
    }

    const visible = cycles.slice(0, homeVisibleCycles);
    container.innerHTML = visible.join("");

    const total = data.regularVideos.length + data.shorts.length + data.communityPosts.length;
    const shown = visible.reduce((sum, html) => {
      const matches = html.match(/class="video-card"|class="post-card"|class="home-short-card"/g);
      return sum + (matches ? matches.length : 0);
    }, 0);

    $("homeEmpty")?.classList.toggle("hidden", total > 0);
    $("homeLoadMoreWrap")?.classList.add("hidden");
    if ($("homeCount")) $("homeCount").textContent = "Showing " + shown + " of " + total;

    if (hasObserver && visible.length < cycles.length) {
      const sentinel = document.createElement("div");
      sentinel.className = "home-feed-auto-loader";
      sentinel.setAttribute("aria-label", "More GoCat content loads automatically as you scroll");
      sentinel.innerHTML = '<span></span><small>More from GoCat</small>';
      container.appendChild(sentinel);

      homeFeedObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        homeFeedObserver?.disconnect();
        homeFeedObserver = null;
        homeVisibleCycles = Math.min(homeVisibleCycles + 1, cycles.length);
        renderHomeFeedAutomatically();
      }, { rootMargin: "650px 0px" });

      homeFeedObserver.observe(sentinel);
    }
  }
  window.renderHomeFeed = renderHomeFeedAutomatically;

  // The Posts page follows other posts and loads another batch automatically.
  let postsFeedObserver = null;
  window.renderPosts = function () {
    const container = $("postsFeed");
    if (!container) return;

    if (postsFeedObserver) {
      postsFeedObserver.disconnect();
      postsFeedObserver = null;
    }

    $("guestPostPrompt")?.classList.toggle("hidden", !!currentUser);
    $("createPostForm")?.classList.toggle("hidden", !currentUser);

    const rankedPosts = posts.slice().sort((a, b) => score(b, "post") - score(a, "post"));
    const hasObserver = "IntersectionObserver" in window;
    if (!hasObserver) postsVisible = rankedPosts.length;
    const visible = rankedPosts.slice(0, Math.max(5, Number(postsVisible) || 5));

    container.innerHTML = visible.length
      ? visible.map(postCard).join("")
      : "<div class='empty-card'><h3>No posts yet</h3><p>Share the first update.</p></div>";

    $("postsLoadMoreWrap")?.classList.add("hidden");

    if (hasObserver && visible.length < rankedPosts.length) {
      const sentinel = document.createElement("div");
      sentinel.className = "home-feed-auto-loader";
      sentinel.innerHTML = '<span></span><small>Loading more posts</small>';
      container.appendChild(sentinel);

      postsFeedObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        postsFeedObserver?.disconnect();
        postsFeedObserver = null;
        postsVisible += 5;
        window.renderPosts();
      }, { rootMargin: "650px 0px" });
      postsFeedObserver.observe(sentinel);
    }
  };

  // Record genuine playback starts as lightweight local preference signals.
  document.addEventListener("play", event => {
    const videoEl = event.target;
    if (!(videoEl instanceof HTMLVideoElement)) return;
    const id = videoEl.getAttribute("data-play-video");
    if (id) recordView(videos.find(v => String(v.id) === String(id)));
  }, true);

  // Keep Reels ranked among Reels, with automatic loading instead of a manual button.
  const originalRenderReels = window.renderReels;
  if (typeof originalRenderReels === "function") {
    window.renderReels = function () {
      originalRenderReels();
      $("reelsLoadMoreWrap")?.classList.add("hidden");
    };
  }

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
