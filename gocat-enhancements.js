/* GoCat discovery + Reels + chat sharing + loader polish.
   Additive layer: keeps the existing Supabase schema and core app intact. */
(function () {
  "use strict";

  var RECO_KEY = "gocat_recommendations_v1";
  var reco = readReco();
  function readReco() {
    try {
      var saved = JSON.parse(localStorage.getItem(RECO_KEY) || "{}");
      return {
        viewed: Array.isArray(saved.viewed) ? saved.viewed : [],
        topics: saved.topics && typeof saved.topics === "object" ? saved.topics : {},
        sessionSeed: saved.sessionSeed || Math.random()
      };
    } catch (e) {
      return { viewed: [], topics: {}, sessionSeed: Math.random() };
    }
  }
  function saveReco() {
    try { localStorage.setItem(RECO_KEY, JSON.stringify(reco)); } catch (e) {}
  }
  function rememberVideo(video) {
    if (!video) return;
    var id = String(video.id);
    reco.viewed = [id].concat(reco.viewed.filter(function (x) { return x !== id; })).slice(0, 300);
    if (video.topic) reco.topics[video.topic] = (reco.topics[video.topic] || 0) + 1;
    saveReco();
  }
  function engagement(item) {
    var likes = Array.isArray(item.likes) ? item.likes.length : 0;
    var comments = Array.isArray(item.comments) ? item.comments.length : 0;
    var views = Number(item.views || 0);
    return Math.log1p(likes) * 2.2 + Math.log1p(comments) * 1.7 + Math.log1p(views) * 0.7;
  }
  function ageBoost(item) {
    var date = new Date(item.created_at || 0).getTime();
    if (!date || !isFinite(date)) return 0;
    var hours = Math.max(0, (Date.now() - date) / 3600000);
    return 5 * Math.exp(-hours / 120);
  }
  function recommendationScore(item, kind) {
    var owner = kind === "post" ? item.user_id : item.owner_id;
    var score = engagement(item) + ageBoost(item);
    if (typeof isFollowing === "function" && isFollowing(owner)) score += 5.5;
    if (kind !== "post" && typeof hasLiked === "function" && hasLiked(item)) score += 2.4;
    if (item.topic && reco.topics[item.topic]) score += Math.min(4, reco.topics[item.topic] * 0.7);
    if (kind !== "post" && reco.viewed.indexOf(String(item.id)) >= 0) score -= 5;
    // A small deterministic variation avoids every visitor seeing the same strict order.
    var seed = String(item.id || "") + "|" + String(reco.sessionSeed);
    var hash = 0;
    for (var i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    score += (Math.abs(hash % 1000) / 1000) * 0.35;
    return score;
  }
  function textMatches(item, kind, query) {
    if (!query) return true;
    var owner = kind === "post" ? item.user_id : item.owner_id;
    var words = [item.title, item.description, item.content, typeof getUsername === "function" ? getUsername(owner) : ""];
    return words.join(" ").toLowerCase().indexOf(query) >= 0;
  }
  function rank(list, kind) {
    return list.slice().sort(function (a, b) {
      return recommendationScore(b, kind) - recommendationScore(a, kind);
    });
  }

  // Mix long videos, Reels and posts into one varied recommendation stream.
  window.getHomeFeedData = function () {
    var query = document.getElementById("searchInput") ? document.getElementById("searchInput").value.trim().toLowerCase() : "";
    var topicOK = function (v) { return !window.activeHomeTopic || activeHomeTopic === "All" || v.topic === activeHomeTopic; };
    var regular = rank(videos.filter(function (v) { return !isShort(v) && topicOK(v) && textMatches(v, "video", query); }), "video");
    var reels = rank(videos.filter(function (v) { return isShort(v) && topicOK(v) && textMatches(v, "video", query); }), "video");
    var community = rank(posts.filter(function (p) { return textMatches(p, "post", query); }), "post");
    return { regularVideos: regular, shorts: reels, communityPosts: community };
  };

  window.buildHomeFeedCycles = function () {
    var data = window.getHomeFeedData();
    var queues = [
      { kind: "video", list: data.regularVideos, index: 0 },
      { kind: "reel", list: data.shorts, index: 0 },
      { kind: "post", list: data.communityPosts, index: 0 }
    ];
    var all = [];
    while (queues.some(function (q) { return q.index < q.list.length; })) {
      var available = queues.filter(function (q) { return q.index < q.list.length; });
      available.sort(function (a, b) {
        var sa = recommendationScore(a.list[a.index], a.kind === "post" ? "post" : "video");
        var sb = recommendationScore(b.list[b.index], b.kind === "post" ? "post" : "video");
        if (all.length && all[all.length - 1].kind === a.kind) sa -= 3.5;
        if (all.length && all[all.length - 1].kind === b.kind) sb -= 3.5;
        return sb - sa;
      });
      var chosen = available[0];
      all.push({ kind: chosen.kind, item: chosen.list[chosen.index++] });
    }
    var cycles = [];
    for (var start = 0; start < all.length; start += 9) {
      var chunk = all.slice(start, start + 9);
      var cards = chunk.map(function (entry) {
        if (entry.kind === "post") return '<div class="mix-feed-item mix-post">' + postCard(entry.item) + '</div>';
        if (entry.kind === "reel") return '<div class="mix-feed-item mix-reel">' + homeShortCard(entry.item) + '</div>';
        return '<div class="mix-feed-item mix-video">' + videoCard(entry.item) + '</div>';
      }).join("");
      cycles.push('<section class="home-feed-section mix-recommendation-section"><div class="home-feed-heading"><div><h2>Picked for you</h2><p>Videos, Reels and posts from across GoCat</p></div></div><div class="mix-feed-grid">' + cards + '</div></section>');
    }
    return cycles;
  };

  // Reels use the same recommendation signals and automatically reveal the next batch.
  window.renderReels = function () {
    var container = document.getElementById("reelsFeed");
    if (!container) return;
    var allReels = rank(videos.filter(function (v) { return isShort(v); }), "video");
    var page = allReels.slice(0, reelsVisible);
    if (!allReels.length) {
      container.innerHTML = '<div class="reel-empty"><div><h2>No Reels yet</h2><p>Be the first to publish one.</p><button class="primary-btn" data-create-short>Create Reel</button></div></div>';
      document.getElementById("reelsLoadMoreWrap") && document.getElementById("reelsLoadMoreWrap").classList.add("hidden");
      return;
    }
    container.innerHTML = page.map(function (video) {
      var username = getUsername(video.owner_id);
      var liked = hasLiked(video);
      var owner = getUser(video.owner_id);
      var avatarHTML = owner && owner.avatar_path
        ? '<img src="' + esc(storageURL("profile-avatars", owner.avatar_path)) + '" alt="" loading="lazy">'
        : esc(initial(username));
      return '<article class="reel-item" data-reel-item="' + esc(video.id) + '">' +
        '<video class="reel-video" src="' + esc(getVideoURL(video.storage_path)) + '" playsinline loop ' +
        (settings.muted ? 'muted ' : '') + 'preload="metadata" data-play-video="' + esc(video.id) + '"></video>' +
        '<button class="reel-sound-btn" data-reel-sound aria-label="Toggle sound">' + icon(settings.muted ? "mute" : "volume") + '</button>' +
        '<div class="reel-shade"></div><div class="reel-info"><div class="reel-user-row">' +
        '<span class="reel-user-avatar" style="' + avatarBg(username) + '">' + avatarHTML + '</span>' +
        '<button class="reel-username" data-profile-user="' + esc(video.owner_id) + '">@' + esc(username) + '</button>' +
        (!isOwnContent(video.owner_id) ? '<button class="reel-follow" data-follow-user="' + esc(video.owner_id) + '">' + (isFollowing(video.owner_id) ? "Following" : "Follow") + '</button>' : '') +
        '</div><p class="reel-caption"><strong>' + esc(video.title) + '</strong></p>' +
        (video.description ? '<p class="reel-caption">' + esc(video.description) + '</p>' : '') +
        '</div><div class="reel-actions">' +
        '<button class="reel-action ' + (liked ? "liked" : "") + '" data-like-video="' + esc(video.id) + '" aria-label="Like">' + icon("heart") + '</button>' +
        '<span class="reel-count">' + (video.likes ? video.likes.length : 0) + '</span>' +
        '<button class="reel-action" data-comments-video="' + esc(video.id) + '" aria-label="Comments">' + icon("message") + '</button>' +
        '<span class="reel-count">' + (video.comments ? video.comments.length : 0) + '</span>' +
        '<button class="reel-action" data-share-video="' + esc(video.id) + '" aria-label="Share">' + icon("share") + '</button>' +
        '<button class="reel-action reel-share-chat" data-share-chat-video="' + esc(video.id) + '" aria-label="Send to a mutual">↗</button>' +
        (canManageContent(video.owner_id) ? '<button class="reel-action" data-delete-video="' + esc(video.id) + '" aria-label="Delete">' + icon("trash") + '</button>' : '') +
        '</div></article>';
    }).join("");
    if (reelsVisible >= allReels.length) {
      container.insertAdjacentHTML("beforeend", '<div class="reels-end-card"><span>✦</span><strong>You are all caught up</strong><p>New Reels from GoCat creators will appear here.</p></div>');
    }
    document.getElementById("reelsLoadMoreWrap") && document.getElementById("reelsLoadMoreWrap").classList.add("hidden");
    observeReels();
  };

  var reelsFeed = document.getElementById("reelsFeed");
  if (reelsFeed) {
    reelsFeed.addEventListener("scroll", function () {
      var remaining = reelsFeed.scrollHeight - reelsFeed.scrollTop - reelsFeed.clientHeight;
      if (remaining < 700 && reelsVisible < videos.filter(function (v) { return isShort(v); }).length) {
        var oldTop = reelsFeed.scrollTop;
        reelsVisible = Math.min(reelsVisible + PAGE_SIZE, videos.filter(function (v) { return isShort(v); }).length);
        window.renderReels();
        reelsFeed.scrollTop = oldTop;
      }
    }, { passive: true });
  }

  // Remember watch signals after playback starts; these help shape later recommendations.
  document.addEventListener("play", function (event) {
    var el = event.target;
    if (!el || el.tagName !== "VIDEO") return;
    var id = el.getAttribute("data-play-video");
    if (id) rememberVideo(videos.find(function (v) { return String(v.id) === String(id); }));
  }, true);

  // A shared GoCat video can be sent to any mutual connection without changing the DB schema.
  function shareIntoChat(videoId) {
    if (!currentUser) { if (typeof requireAuth === "function") requireAuth("share videos in messages"); return; }
    var mutuals = getMutualFriends();
    if (!mutuals.length) { showToast("You need a mutual connection before sending a video."); return; }
    var video = videos.find(function (v) { return String(v.id) === String(videoId); });
    if (!video) return;
    var choices = mutuals.map(function (u, i) { return (i + 1) + ". " + u.username; }).join("\n");
    var picked = window.prompt("Send this video to which mutual?\n" + choices + "\n\nEnter a number:");
    if (picked === null) return;
    var index = Number(picked) - 1;
    if (!Number.isInteger(index) || !mutuals[index]) { showToast("Choose a valid mutual number."); return; }
    var url = location.origin + location.pathname + "?video=" + encodeURIComponent(video.id);
    var message = "🎬 " + video.title + "\n" + url;
    insertWithTextFallback("messages", { sender_id: currentUser.id, recipient_id: mutuals[index].id }, message, "text", "content")
      .then(function (result) {
        if (result.error) throw result.error;
        showToast("Video sent to " + mutuals[index].username);
        if (String(currentChatUserId) === String(mutuals[index].id)) loadMessages();
      })
      .catch(function (error) { showToast("Could not send video: " + error.message); });
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-share-chat-video]");
    if (button) { event.preventDefault(); event.stopPropagation(); shareIntoChat(button.getAttribute("data-share-chat-video")); }
  });

  // Add a Share to chat control to regular video cards and Shorts shelves.
  var cardObserver = new MutationObserver(function () {
    document.querySelectorAll(".video-card, .home-short-card").forEach(function (card) {
      if (card.querySelector("[data-share-chat-video]")) return;
      var id = card.querySelector("[data-play-video]")?.getAttribute("data-play-video") ||
        card.querySelector("[data-open-reel]")?.getAttribute("data-open-reel") ||
        card.querySelector("[data-open-reel-id]")?.getAttribute("data-open-reel-id");
      if (!id) {
        var link = card.querySelector("[data-open-reel-id], [data-open-reel]");
        id = link && (link.dataset.openReelId || link.dataset.openReel);
      }
      if (!id) return;
      var row = card.querySelector(".video-actions, .home-short-actions");
      if (!row) return;
      var send = document.createElement("button");
      send.type = "button";
      send.className = "pill mix-share-chat";
      send.setAttribute("data-share-chat-video", id);
      send.textContent = "Send to mutual";
      row.appendChild(send);
    });
  });
  ["homeFeed", "reelsFeed", "exploreVideos", "followingFeed"].forEach(function (id) {
    var target = document.getElementById(id);
    if (target) cardObserver.observe(target, { childList: true, subtree: true });
  });

  // Linkify URLs in chat bubbles so shared videos and ordinary links are tappable.
  function linkifyChat() {
    var root = document.getElementById("chatMessages");
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) {
      if (/https?:\/\//i.test(walker.currentNode.nodeValue) && !walker.currentNode.parentElement.closest("a,button,script,style")) nodes.push(walker.currentNode);
    }
    nodes.forEach(function (node) {
      var textValue = node.nodeValue;
      var pattern = /(https?:\/\/[^\s<]+)/gi;
      var fragment = document.createDocumentFragment();
      var last = 0, match;
      while ((match = pattern.exec(textValue))) {
        fragment.appendChild(document.createTextNode(textValue.slice(last, match.index)));
        var url = match[0].replace(/[),.!?]+$/, "");
        var anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.className = "chat-shared-link";
        anchor.textContent = url;
        fragment.appendChild(anchor);
        last = match.index + match[0].length;
      }
      fragment.appendChild(document.createTextNode(textValue.slice(last)));
      node.parentNode.replaceChild(fragment, node);
    });
  }
  var messageRoot = document.getElementById("chatMessages");
  if (messageRoot) new MutationObserver(linkifyChat).observe(messageRoot, { childList: true, subtree: true });
  document.addEventListener("click", function (event) {
    var anchor = event.target.closest(".chat-shared-link");
    if (!anchor) return;
    try {
      var url = new URL(anchor.href);
      var videoId = url.searchParams.get("video");
      if (!videoId || url.origin !== location.origin) return;
      event.preventDefault();
      var video = videos.find(function (v) { return String(v.id) === String(videoId); });
      if (!video) { showToast("That shared video is unavailable."); return; }
      if (isShort(video)) openSpecificReel(video.id);
      else { openPage("home"); scrollToVideo(video.id); }
    } catch (e) {}
  });

  // Make the existing composer explain that GoCat video links can be shared here.
  var compose = document.querySelector(".chat-compose");
  if (compose && !document.getElementById("chatShareVideoBtn")) {
    var shareButton = document.createElement("button");
    shareButton.type = "button";
    shareButton.id = "chatShareVideoBtn";
    shareButton.className = "soft-btn chat-share-video-btn";
    shareButton.textContent = "Share a GoCat video";
    shareButton.addEventListener("click", function () {
      if (!currentUser) { requireAuth("share videos in messages"); return; }
      var available = videos.slice().sort(function (a, b) { return recommendationScore(b, "video") - recommendationScore(a, "video"); });
      if (!available.length) { showToast("There are no videos to share yet."); return; }
      var choices = available.slice(0, 30).map(function (v, i) { return (i + 1) + ". " + v.title; }).join("\n");
      var chosen = window.prompt("Choose a GoCat video to share:\n" + choices + "\n\nEnter a number:");
      if (chosen === null) return;
      var item = available[Number(chosen) - 1];
      if (!item || Number(chosen) < 1 || Number(chosen) > 30) { showToast("Choose a valid video number."); return; }
      shareIntoChat(item.id);
    });
    compose.parentNode.insertBefore(shareButton, compose);
  }

  // Upgrade the first-load experience without delaying the real app.
  var loader = document.getElementById("loader");
  if (loader) {
    loader.classList.add("gocat-loader-active");
    window.addEventListener("load", function () {
      window.setTimeout(function () { loader.classList.add("hide"); }, 120);
    }, { once: true });
  }

  // Keep the visual language motion-rich but respect reduced-motion preferences.
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced && loader) loader.classList.add("reduced-motion");
})();
