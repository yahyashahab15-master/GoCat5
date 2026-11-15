/* GoCat Creator Launchpad
   Lightweight add-on: creator discovery, share links, weekly missions and earned milestones.
   No new database tables or changes to authentication/feed rendering are required. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function mountHomePageSections() {
    const home = $("page-home");
    const hero = home?.querySelector(".home-welcome");
    if (!home || !hero || $("gocatHomePages")) return;

    const section = document.createElement("section");
    section.id = "gocatHomePages";
    section.className = "gocat-home-pages";
    section.setAttribute("aria-label", "GoCat sections");
    section.innerHTML = `
      <div class="gocat-home-pages-heading">
        <div><span>EXPLORE GOCAT</span><strong>Jump to a section</strong></div>
        <small>Everything in one place</small>
      </div>
      <nav class="gocat-home-page-links" aria-label="GoCat pages">
        <button type="button" class="gocat-home-page-link" data-page="reels"><span aria-hidden="true">▶</span><strong>Reels</strong></button>
        <button type="button" class="gocat-home-page-link" data-page="explore"><span aria-hidden="true">⌕</span><strong>Explore</strong></button>
        <button type="button" class="gocat-home-page-link" data-page="following"><span aria-hidden="true">♡</span><strong>Following</strong></button>
        <button type="button" class="gocat-home-page-link" data-page="posts"><span aria-hidden="true">▤</span><strong>Posts</strong></button>
        <button type="button" class="gocat-home-page-link" data-page="chats"><span aria-hidden="true">✉</span><strong>Messages</strong></button>
        <button type="button" class="gocat-home-page-link" data-page="studio"><span aria-hidden="true">▥</span><strong>Studio</strong></button>
      </nav>`;
    hero.insertAdjacentElement("afterend", section);
  }

  function moveHomeExtrasBelowFeed() {
    const home = $("page-home");
    if (!home) return;
    const creators = home.querySelector(".home-creators-section");
    const launchpad = $("gocatCreatorLaunchpad");
    if (creators && creators.nextElementSibling !== launchpad) {
      home.appendChild(creators);
    }
    if (launchpad && home.lastElementChild !== launchpad) {
      home.appendChild(launchpad);
    }
  }

  const missions = [
    "Teach one useful trick in 30 seconds.",
    "Show the before-and-after of something you made.",
    "Share one beginner tip that would have helped you.",
    "Tell the story behind your latest project.",
    "Make a quick top-three list about something you love.",
    "Show a behind-the-scenes moment from your day."
  ];
  const starterIdeas = [["Gaming","3 beginner tips for a game you enjoy","Show three simple things you wish you knew when you started."],["Gaming","A favorite moment from your latest game","Tell viewers what made the moment fun, using your own commentary."],["Gaming","One setting that improved your experience","Show a harmless in-game or accessibility setting and explain it."],["Gaming","A game you would recommend to a friend","Explain who might enjoy it and why."],["Technology","A website you made from scratch","Show the idea, one part you built, and what you learned."],["Technology","One browser shortcut worth remembering","Demonstrate a useful shortcut and when it saves time."],["Technology","How you fixed a small coding bug","Explain the problem, the clue you noticed, and the fix."],["Technology","A tool that helps you stay organized","Show how you use it for a project or files."],["Learning","Explain one tricky idea in 30 seconds","Choose a topic you understand and explain it in plain words."],["Learning","Three surprising facts about a topic you like","Share three original facts and explain one of them."],["Learning","A simple way to remember a new word","Give the meaning, an example, and a memory clue."],["Learning","What you learned from a recent project","Show one thing that worked and one thing you would improve."],["Art","Sketch to finished artwork","Record a short process clip and explain one creative choice."],["Art","How you choose a color palette","Show a few colors and describe the mood you wanted."],["Art","Turn three simple shapes into a character","Show the steps and reveal your original design."],["Art","A small detail that changed your artwork","Zoom in on a detail and explain why you added it."],["Music","Create an original 10-second sound","Make a short original melody or rhythm and explain your idea."],["Music","Show how a beat or rhythm is built","Layer a few original sounds one by one."],["Community","Ask your community one interesting question","Invite members to share opinions about your topic."],["Community","Introduce the topic of your new community","Explain what people can share and what you hope to learn together."]];

  function renderStarterIdeas() {
    const root = $("gocatStarterIdeas");
    if (!root) return;
    root.innerHTML = starterIdeas.map((idea, index) => `
      <article class="gocat-starter-idea">
        <div class="gocat-starter-idea-top">
          <span>${idea[0]}</span>
          <small>${String(index + 1).padStart(2, "0")}</small>
        </div>
        <h4>${idea[1]}</h4>
        <p>${idea[2]}</p>
        <div class="gocat-starter-idea-actions">
          <button type="button" data-gocat-copy-starter-idea="${index}">Copy idea</button>
          <button type="button" data-gocat-use-starter-idea="${index}">Use idea</button>
        </div>
      </article>`).join("");
  }


  function toast(message) {
    if (typeof showToast === "function") showToast(message);
  }

  function currentCreatorId() {
    return (typeof currentProfileUserId !== "undefined" && currentProfileUserId)
      || (typeof currentUser !== "undefined" && currentUser?.id)
      || null;
  }

  function creatorName(id) {
    if (typeof getUser === "function") {
      const profile = getUser(id);
      if (profile?.username) return profile.username;
    }
    return "this GoCat creator";
  }

  function creatorUrl(id) {
    const url = new URL(location.pathname, location.origin);
    if (id) url.searchParams.set("creator", String(id));
    return url.toString();
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (_) {}
    field.remove();
    if (!copied) throw new Error("Copy is not available in this browser.");
    return true;
  }

  async function copyCreatorChannel(id) {
    if (!id) {
      if (typeof openLoginScreen === "function") openLoginScreen("Sign in to copy your creator link.");
      return;
    }
    try {
      await copyText(creatorUrl(id));
      toast("Channel link copied. Add it to your social bio or share it in a chat.");
    } catch (_) {
      toast("Could not copy the channel link in this browser.");
    }
  }

  async function shareCreator(id, preferNative = true) {
    if (!id) {
      if (typeof openLoginScreen === "function") openLoginScreen("Sign in to share your creator page.");
      return;
    }
    const name = creatorName(id);
    const url = creatorUrl(id);
    const shareData = {
      title: name + " on GoCat",
      text: "Discover " + name + " on GoCat. Share this channel with someone who might enjoy it.",
      url
    };
    try {
      if (preferNative && navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await copyText(url);
      toast("Creator link copied. Share it anywhere.");
    } catch (error) {
      if (error?.name === "AbortError") return;
      try {
        await copyText(url);
        toast("Creator link copied. Share it anywhere.");
      } catch (_) {
        toast("Could not share the link in this browser.");
      }
    }
  }

  function inviteOnWhatsApp() {
    const id = (typeof currentUser !== "undefined" && currentUser?.id) || null;
    const url = creatorUrl(id);
    const message = id
      ? "Join me on GoCat and check out my creator page: " + url
      : "Join me on GoCat to discover videos, Reels and new creators: " + location.origin;
    window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  }

  function getWeeklyMission() {
    const week = Math.floor(Date.now() / 604800000);
    return missions[((week % missions.length) + missions.length) % missions.length];
  }

  function mountHomeLaunchpad() {
    const home = $("page-home");
    const hero = home?.querySelector(".home-welcome");
    if (!home || !hero || $("gocatCreatorLaunchpad")) return;

    const section = document.createElement("section");
    section.id = "gocatCreatorLaunchpad";
    section.className = "gocat-launchpad";
    section.innerHTML = `
      <div class="gocat-launchpad-heading">
        <div>
          <span class="gocat-launchpad-kicker">GOCAT RISING</span>
          <h2>A launchpad for creators on the way up.</h2>
          <p>GoCat gives emerging channels a discovery boost. Make something, share your page, and build an audience one viewer at a time.</p>
        </div>
        <span class="gocat-launchpad-mark" aria-hidden="true">↗</span>
      </div>
      <div class="gocat-launchpad-grid">
        <article class="gocat-mission-card">
          <span class="gocat-mini-label">THIS WEEK'S CREATOR MISSION</span>
          <h3 id="gocatWeeklyMission"></h3>
          <p>Keep it simple, make it yours, and publish it as a Reel.</p>
          <div class="gocat-launchpad-actions">
            <button class="gocat-launch-primary" type="button" data-open-upload="short">Create a Reel</button>
            <button class="gocat-launch-secondary" type="button" data-gocat-copy-mission>Copy idea</button>
          </div>
        </article>
        <article class="gocat-share-card">
          <span class="gocat-mini-label">GROW YOUR COMMUNITY</span>
          <h3>Bring your first viewers with you.</h3>
          <p>Share your channel link in WhatsApp, your social bio, or a group where people already know you.</p>
          <div class="gocat-launchpad-actions">
            <button class="gocat-launch-primary" type="button" data-gocat-share-channel>Share my channel</button>
            <button class="gocat-launch-secondary" type="button" data-gocat-copy-channel>Copy channel link</button>
            <button class="gocat-launch-secondary" type="button" data-gocat-invite-whatsapp>Invite on WhatsApp</button>
          </div>
        </article>
      </div>
      <details class="gocat-starter-library">
        <summary>
          <span><strong>20 original Reel ideas</strong><small>Pick a niche-friendly prompt, copy it, or open the Reel uploader with it.</small></span>
          <span class="gocat-starter-library-toggle">Browse ideas <b aria-hidden="true">⌄</b></span>
        </summary>
        <div id="gocatStarterIdeas" class="gocat-starter-idea-grid"></div>
      </details>
      <div class="gocat-launchpad-foot">
        <span><i aria-hidden="true">✦</i> Discovery is designed to give smaller channels a fairer starting chance.</span>
        <button type="button" data-page="studio">Open Creator Studio <span aria-hidden="true">→</span></button>
      </div>`;
    home.appendChild(section);
    $("gocatWeeklyMission").textContent = getWeeklyMission();
    renderStarterIdeas();
  }

  function mountProfileShare() {
    const action = $("profileActionBtn");
    if (!action || $("gocatProfileShareBtn")) return;
    const button = document.createElement("button");
    button.id = "gocatProfileShareBtn";
    button.type = "button";
    button.className = "soft-btn gocat-profile-share";
    button.textContent = "Share channel";
    button.setAttribute("data-gocat-share-profile", "");
    action.insertAdjacentElement("afterend", button);
    const copyButton = document.createElement("button");
    copyButton.id = "gocatProfileCopyBtn";
    copyButton.type = "button";
    copyButton.className = "soft-btn gocat-profile-share";
    copyButton.textContent = "Copy link";
    copyButton.setAttribute("data-gocat-copy-profile", "");
    button.insertAdjacentElement("afterend", copyButton);
  }

  function milestoneMarkup(title, detail, current, target) {
    const safeCurrent = Math.max(0, Number(current) || 0);
    const safeTarget = Math.max(1, Number(target) || 1);
    const progress = Math.min(100, Math.round((safeCurrent / safeTarget) * 100));
    const complete = safeCurrent >= safeTarget;
    return `
      <article class="gocat-milestone ${complete ? "is-earned" : ""}">
        <div class="gocat-milestone-top">
          <strong>${title}</strong>
          <span>${complete ? "Unlocked" : progress + "%"}</span>
        </div>
        <p>${detail}</p>
        <div class="gocat-milestone-track"><span style="width:${progress}%"></span></div>
        <small>${Math.min(safeCurrent, safeTarget).toLocaleString()} / ${safeTarget.toLocaleString()}</small>
      </article>`;
  }

  function updateMilestones() {
    const panel = $("gocatMilestones");
    if (!panel) return;
    const uploads = Number(($("studioVideos")?.textContent || "0").replace(/,/g, "")) || 0;
    const views = Number(($("studioViews")?.textContent || "0").replace(/,/g, "")) || 0;
    const followers = Number(($("studioFollowers")?.textContent || "0").replace(/,/g, "")) || 0;

    panel.innerHTML = `
      <div class="gocat-milestone-grid">
        ${milestoneMarkup("First upload", "Publish your first video or Reel.", uploads, 1)}
        ${milestoneMarkup("5 uploads", "Build a small library for new viewers.", uploads, 5)}
        ${milestoneMarkup("100 views", "Reach your first 100 tracked views.", views, 100)}
        ${milestoneMarkup("10 followers", "Bring your first ten people into your community.", followers, 10)}
      </div>`;
  }

  function mountStudioMilestones() {
    const stats = document.querySelector("#page-studio .studio-stats");
    if (!stats || $("gocatMilestonePanel")) return;
    const panel = document.createElement("section");
    panel.id = "gocatMilestonePanel";
    panel.className = "gocat-milestone-panel";
    panel.innerHTML = `
      <div class="gocat-milestone-heading">
        <div><span class="gocat-launchpad-kicker">CREATOR PROGRESS</span><h2>Your milestones</h2>
        <p>Earn profile achievements as your real uploads, views and followers grow. These are platform badges, not cash payouts.</p></div>
        <div class="gocat-launchpad-actions">
          <button type="button" class="gocat-launch-primary" data-gocat-share-channel>Share channel</button>
          <button type="button" class="gocat-launch-secondary" data-gocat-copy-channel>Copy channel link</button>
        </div>
      </div>
      <div id="gocatMilestones"></div>`;
    stats.insertAdjacentElement("afterend", panel);
    updateMilestones();

    const values = ["studioVideos", "studioViews", "studioFollowers"]
      .map(id => $(id)).filter(Boolean);
    if (values.length && "MutationObserver" in window) {
      const observer = new MutationObserver(updateMilestones);
      values.forEach(node => observer.observe(node, { childList: true, characterData: true, subtree: true }));
    }
  }

  function openSharedCreator() {
    const id = new URLSearchParams(location.search).get("creator");
    if (!id || window.__gocatSharedCreatorOpened) return;
    const list = (typeof users !== "undefined" && Array.isArray(users)) ? users : [];
    const profile = list.find(user => String(user.id) === String(id));
    if (profile && typeof openPage === "function") {
      window.__gocatSharedCreatorOpened = true;
      currentProfileUserId = profile.id;
      openPage("profile");
    }
  }

  document.addEventListener("click", async function (event) {
    const copy = event.target.closest("[data-gocat-copy-channel], [data-gocat-copy-profile]");
    if (copy) {
      event.preventDefault();
      const id = copy.hasAttribute("data-gocat-copy-profile") ? currentCreatorId()
        : (typeof currentUser !== "undefined" ? currentUser?.id : null);
      await copyCreatorChannel(id);
      return;
    }

    const share = event.target.closest("[data-gocat-share-channel], [data-gocat-share-profile]");
    if (share) {
      event.preventDefault();
      const id = share.hasAttribute("data-gocat-share-profile") ? currentCreatorId()
        : (typeof currentUser !== "undefined" ? currentUser?.id : null);
      await shareCreator(id, true);
      return;
    }

    if (event.target.closest("[data-gocat-invite-whatsapp]")) {
      event.preventDefault();
      inviteOnWhatsApp();
      return;
    }

    if (event.target.closest("[data-gocat-copy-mission]")) {
      event.preventDefault();
      try {
        await copyText("GoCat creator mission: " + getWeeklyMission());
        toast("Creator idea copied.");
      } catch (_) {
        toast("Could not copy the idea in this browser.");
      }
      return;
    }

    const copyIdea = event.target.closest("[data-gocat-copy-starter-idea]");
    if (copyIdea) {
      event.preventDefault();
      const idea = starterIdeas[Number(copyIdea.dataset.gocatCopyStarterIdea)];
      if (!idea) return;
      try {
        await copyText(idea[1] + "\\n" + idea[2]);
        toast("Reel idea copied.");
      } catch (_) {
        toast("Could not copy the idea in this browser.");
      }
      return;
    }

    const useIdea = event.target.closest("[data-gocat-use-starter-idea]");
    if (useIdea) {
      event.preventDefault();
      const idea = starterIdeas[Number(useIdea.dataset.gocatUseStarterIdea)];
      if (!idea) return;
      if (!currentCreatorId()) {
        if (typeof openLoginScreen === "function") openLoginScreen("Sign in to create a Reel from this idea.");
        return;
      }
      if (typeof openUpload === "function") openUpload("short");
      window.setTimeout(() => {
        if ($("videoTitle")) $("videoTitle").value = idea[1];
        if ($("videoDescription")) $("videoDescription").value = idea[2];
      }, 80);
      return;
    }
  });

  function boot() {
    mountHomePageSections();
    mountHomeLaunchpad();
    moveHomeExtrasBelowFeed();
    mountProfileShare();
    mountStudioMilestones();
    openSharedCreator();
  }

  boot();
  // Main startup loads Supabase data asynchronously. Retry the shared-channel
  // route while that public profile list is being populated.
  if (new URLSearchParams(location.search).has("creator")) {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      mountProfileShare();
      openSharedCreator();
      if (window.__gocatSharedCreatorOpened || tries >= 36) window.clearInterval(timer);
    }, 350);
  }

  const profileAction = $("profileActionBtn");
  if (profileAction && "MutationObserver" in window) {
    new MutationObserver(mountProfileShare).observe(profileAction, { attributes: true, attributeFilter: ["class", "style"] });
  }

  // The app can render its profile and studio after the initial script execution.
  const appObserver = new MutationObserver(() => {
    mountProfileShare();
    mountStudioMilestones();
  });
  const app = $("app");
  if (app) appObserver.observe(app, { childList: true, subtree: true });
})();
