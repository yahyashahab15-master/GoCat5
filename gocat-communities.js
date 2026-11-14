/* GoCat Communities — public discovery and member-only posting. */
(function () {
  "use strict";

  let communities = [];
  let communityMembers = [];
  let communityPosts = [];
  let activeCommunityId = null;
  let communitiesLoaded = false;
  let loadingPromise = null;
  let communityRealtimeChannel = null;

  const byId = id => document.getElementById(id);
  const getCommunity = id => communities.find(item => String(item.id) === String(id));
  const isCommunityMember = id => !!currentUser && communityMembers.some(row =>
    String(row.community_id) === String(id) && String(row.user_id) === String(currentUser.id)
  );
  const communityMemberCount = id => communityMembers.filter(row =>
    String(row.community_id) === String(id)
  ).length;

  function renderCommunityDirectory() {
    const grid = byId("communityGrid");
    if (!grid) return;
    const category = byId("communityCategoryFilter")?.value || "All";
    const visible = communities.filter(item => category === "All" || item.category === category);

    if (!visible.length) {
      grid.innerHTML = '<div class="empty-card community-empty"><h3>No communities yet</h3><p>Be the first to create a place for people who share an interest.</p><button class="primary-btn" type="button" data-open-community-create>Start a community</button></div>';
      return;
    }

    grid.innerHTML = visible.map(item => {
      const member = isCommunityMember(item.id);
      const owner = !!currentUser && String(item.created_by) === String(currentUser.id);
      return `
        <article class="community-card">
          <div class="community-card-top">
            <span class="community-category">${esc(item.category || "Other")}</span>
            <span class="community-member-count">${communityMemberCount(item.id).toLocaleString()} members</span>
          </div>
          <h3>${esc(item.name)}</h3>
          <p>${esc(item.description || "A GoCat community for people who share this interest.")}</p>
          <div class="community-card-bottom">
            <span class="community-created-by">By ${esc(getUsername(item.created_by))}</span>
            <span class="community-state">${owner ? "Owner" : member ? "Joined" : "Public"}</span>
          </div>
          <button class="soft-btn community-open-btn" type="button" data-community-open="${esc(item.id)}">Open community <span aria-hidden="true">→</span></button>
        </article>`;
    }).join("");
  }

  function renderCommunityDetail() {
    const community = getCommunity(activeCommunityId);
    const directory = byId("communityDirectory");
    const detail = byId("communityDetail");
    if (!community || !directory || !detail) {
      activeCommunityId = null;
      directory?.classList.remove("hidden");
      detail?.classList.add("hidden");
      return;
    }

    directory.classList.add("hidden");
    detail.classList.remove("hidden");

    const isOwner = !!currentUser && String(community.created_by) === String(currentUser.id);
    const isMember = isCommunityMember(community.id);
    const header = byId("communityDetailHeader");
    if (header) {
      header.innerHTML = `
        <div class="community-detail-symbol" aria-hidden="true">${esc((community.name || "G").trim().charAt(0).toUpperCase())}</div>
        <div class="community-detail-copy">
          <span class="community-category">${esc(community.category || "Other")}</span>
          <h1>${esc(community.name)}</h1>
          <p>${esc(community.description || "A place for people who share this interest.")}</p>
          <small>${communityMemberCount(community.id).toLocaleString()} members · Created by ${esc(getUsername(community.created_by))}</small>
        </div>`;
    }

    const actions = byId("communityMembershipAction");
    if (actions) {
      if (isOwner) {
        actions.innerHTML = '<span class="community-owner-label">✦ You own this community</span>';
      } else if (isMember) {
        actions.innerHTML = '<button class="soft-btn" type="button" data-community-leave="' + esc(community.id) + '">Leave community</button>';
      } else if (currentUser) {
        actions.innerHTML = '<button class="primary-btn" type="button" data-community-join="' + esc(community.id) + '">Join community</button>';
      } else {
        actions.innerHTML = '<button class="primary-btn" type="button" data-login-trigger>Sign in to join</button>';
      }
    }

    byId("communityPostForm")?.classList.toggle("hidden", !isMember);
    byId("communityGuestPrompt")?.classList.toggle("hidden", !!isMember);
    if (!currentUser) byId("communityGuestPrompt")?.classList.remove("hidden");

    const feed = byId("communityPostsFeed");
    if (!feed) return;
    const posts = communityPosts
      .filter(post => String(post.community_id) === String(community.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (!posts.length) {
      feed.innerHTML = '<div class="empty-card community-post-empty"><h3>No posts here yet</h3><p>Join this community and start the first conversation.</p></div>';
      return;
    }

    feed.innerHTML = posts.map(post => {
      const username = getUsername(post.user_id);
      const canDelete = !!currentUser && (
        String(post.user_id) === String(currentUser.id) || isOwner
      );
      const author = typeof getUser === "function" ? getUser(post.user_id) : null;
      return `
        <article class="community-post-card">
          <div class="community-post-author">
            ${avatar(username, "", author?.avatar_path || "")}
            <div><strong>${esc(username)}</strong><small>${esc(formatDate(post.created_at))}</small></div>
            ${canDelete ? '<button class="community-delete-post" type="button" data-community-delete-post="' + esc(post.id) + '" aria-label="Delete post">Delete</button>' : ''}
          </div>
          <p class="community-post-content">${esc(post.content)}</p>
        </article>`;
    }).join("");
  }

  function renderCommunities() {
    if (!communitiesLoaded) {
      const grid = byId("communityGrid");
      if (grid && !loadingPromise) grid.innerHTML = '<div class="empty-card">Loading communities…</div>';
      loadCommunities().catch(error => {
        console.error("GoCat communities:", error);
        if (grid) grid.innerHTML = '<div class="empty-card"><h3>Communities could not load</h3><p>' + esc(error.message || "Please try again.") + '</p><button class="soft-btn" type="button" data-community-refresh>Try again</button></div>';
      });
      return;
    }
    renderCommunityDirectory();
    if (activeCommunityId) renderCommunityDetail();
  }

  async function loadCommunities() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      if (!db) throw new Error("GoCat database is unavailable.");
      const [communityResult, memberResult, postResult] = await Promise.all([
        db.from("communities").select("id,name,slug,description,category,created_by,created_at").order("created_at", { ascending: false }),
        db.from("community_members").select("community_id,user_id"),
        db.from("community_posts").select("id,community_id,user_id,content,created_at").order("created_at", { ascending: false }).limit(250)
      ]);
      if (communityResult.error) throw communityResult.error;
      if (memberResult.error) throw memberResult.error;
      if (postResult.error) throw postResult.error;

      communities = communityResult.data || [];
      communityMembers = memberResult.data || [];
      communityPosts = postResult.data || [];
      communitiesLoaded = true;
      renderCommunities();
      return communities;
    })();
    try {
      return await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  function toggleCreatePanel(show) {
    const panel = byId("communityCreatePanel");
    if (!panel) return;
    if (show && !requireAuth("create a community")) return;
    panel.classList.toggle("hidden", !show);
    if (show) byId("communityName")?.focus();
  }

  function makeSlug(name) {
    const base = String(name || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 46) || "community";
    return base + "-" + Math.random().toString(36).slice(2, 7);
  }

  async function createCommunity(form) {
    if (!requireAuth("create a community")) return;
    const name = byId("communityName")?.value.trim() || "";
    const description = byId("communityDescription")?.value.trim() || "";
    const category = byId("communityCategory")?.value || "Other";
    if (name.length < 3 || name.length > 50) {
      showToast("Community names must be 3 to 50 characters.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Creating…"; }
    try {
      const { data, error } = await db.rpc("gocat_create_community", {
        p_name: name,
        p_slug: makeSlug(name),
        p_description: description,
        p_category: category
      });
      if (error) throw error;
      communitiesLoaded = false;
      activeCommunityId = data;
      form.reset();
      toggleCreatePanel(false);
      await loadCommunities();
      renderCommunityDetail();
      showToast("Your community is live.");
    } catch (error) {
      console.error("Create community:", error);
      showToast("Could not create community: " + (error.message || "Please try again."));
    } finally {
      if (button) { button.disabled = false; button.textContent = "Create community"; }
    }
  }

  async function joinCommunity(id) {
    if (!requireAuth("join this community")) return;
    if (!id || isCommunityMember(id)) return;
    try {
      const { error } = await db.from("community_members").insert({
        community_id: id,
        user_id: currentUser.id
      });
      if (error) throw error;
      communitiesLoaded = false;
      await loadCommunities();
      activeCommunityId = id;
      renderCommunityDetail();
      showToast("You joined the community.");
    } catch (error) {
      console.error("Join community:", error);
      showToast("Could not join: " + (error.message || "Please try again."));
    }
  }

  async function leaveCommunity(id) {
    if (!requireAuth("leave this community")) return;
    try {
      const { error } = await db.from("community_members")
        .delete().eq("community_id", id).eq("user_id", currentUser.id);
      if (error) throw error;
      communitiesLoaded = false;
      await loadCommunities();
      activeCommunityId = id;
      renderCommunityDetail();
      showToast("You left the community.");
    } catch (error) {
      console.error("Leave community:", error);
      showToast("Could not leave: " + (error.message || "Please try again."));
    }
  }

  async function publishCommunityPost(form) {
    if (!requireAuth("post in this community")) return;
    const content = byId("communityPostContent")?.value.trim() || "";
    if (!content) return;
    if (!activeCommunityId || !isCommunityMember(activeCommunityId)) {
      showToast("Join the community before posting.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Publishing…"; }
    try {
      const { error } = await db.from("community_posts").insert({
        community_id: activeCommunityId,
        user_id: currentUser.id,
        content
      });
      if (error) throw error;
      form.reset();
      communitiesLoaded = false;
      await loadCommunities();
      renderCommunityDetail();
      showToast("Community post published.");
    } catch (error) {
      console.error("Community post:", error);
      showToast("Could not publish: " + (error.message || "Please try again."));
    } finally {
      if (button) { button.disabled = false; button.textContent = "Publish post"; }
    }
  }

  async function deleteCommunityPost(id) {
    if (!requireAuth("manage this post")) return;
    try {
      const { error } = await db.from("community_posts").delete().eq("id", id);
      if (error) throw error;
      communitiesLoaded = false;
      await loadCommunities();
      renderCommunityDetail();
      showToast("Community post deleted.");
    } catch (error) {
      console.error("Delete community post:", error);
      showToast("Could not delete post: " + (error.message || "Please try again."));
    }
  }

  document.addEventListener("click", event => {
    const open = event.target.closest("[data-community-open]");
    const join = event.target.closest("[data-community-join]");
    const leave = event.target.closest("[data-community-leave]");
    const remove = event.target.closest("[data-community-delete-post]");
    if (event.target.closest("#openCommunityCreate, [data-open-community-create]")) {
      event.preventDefault();
      toggleCreatePanel(true);
      return;
    }
    if (event.target.closest("#closeCommunityCreate")) {
      event.preventDefault();
      toggleCreatePanel(false);
      return;
    }
    if (event.target.closest("[data-community-back]")) {
      event.preventDefault();
      activeCommunityId = null;
      renderCommunities();
      return;
    }
    if (event.target.closest("[data-community-refresh]")) {
      event.preventDefault();
      communitiesLoaded = false;
      renderCommunities();
      return;
    }
    if (open) {
      event.preventDefault();
      activeCommunityId = open.dataset.communityOpen;
      renderCommunityDetail();
      return;
    }
    if (join) { event.preventDefault(); joinCommunity(join.dataset.communityJoin); return; }
    if (leave) { event.preventDefault(); leaveCommunity(leave.dataset.communityLeave); return; }
    if (remove) { event.preventDefault(); deleteCommunityPost(remove.dataset.communityDeletePost); }
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "communityCreateForm") {
      event.preventDefault();
      createCommunity(event.target);
    } else if (event.target.id === "communityPostForm") {
      event.preventDefault();
      publishCommunityPost(event.target);
    }
  });

  byId("communityCategoryFilter")?.addEventListener("change", renderCommunityDirectory);

  if (db) {
    communityRealtimeChannel = db.channel("gocat-communities-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "communities" }, () => {
        if (currentPage === "communities") { communitiesLoaded = false; renderCommunities(); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "community_members" }, () => {
        if (currentPage === "communities") { communitiesLoaded = false; renderCommunities(); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => {
        if (currentPage === "communities") { communitiesLoaded = false; renderCommunities(); }
      })
      .subscribe();
  }

  window.renderGoCatCommunities = renderCommunities;
})();
