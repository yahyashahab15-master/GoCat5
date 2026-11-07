/* ============================================================
   GOCAT — COMPLETE JAVASCRIPT
   Supabase auth, creator feed, videos, Shorts, posts, profiles,
   follows, comments, studio, history, chat, admin tools and uploads.

   IMPORTANT:
   1. Keep your existing HTML IDs/data-* attributes.
   2. Load Supabase JS v2 before this file.
   3. This file uses your existing Supabase tables and bucket names.
   4. Admin buttons are UI only; secure RLS policies are still required.
   ============================================================ */

/* ============================================================
   01 — SUPABASE CONFIGURATION
   ============================================================ */

const SUPABASE_URL = "https://rfwgvsijxweyzwvuqslt.supabase.co";
const SUPABASE_KEY = "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0O";

const VIDEO_BUCKET = "videos";
const POST_BUCKET = "post-media";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_DURATION = 300;
const PAGE_SIZE = 5;

const db = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;


/* ============================================================
   02 — GLOBAL STATE
   ============================================================ */

let currentUser = null;
let currentProfile = null;
let isGoCatAdmin = false;

let currentProfileUserId = null;
let currentCommentVideoId = null;
let currentChatUserId = null;

let users = [];
let videos = [];
let posts = [];
let follows = [];
let notifications = [];

let currentPage = "home";
let activeHomeTopic = "All";
let exploreMode = "videos";
let profileMode = "home";

let homeVisibleCycles = 1;
let exploreVisible = 6;
let postsVisible = 5;
let reelsVisible = 5;

let uploadMode = "video";
let selectedVideoFile = null;
let exportedReelFile = null;

let currentObjectURL = null;
let reelObserver = null;
let currentUploadPath = null;
let tusLibraryPromise = null;

let editorAudioContext = null;
let editorVideoSource = null;
let editorVideoGain = null;
let editorMusicBuffer = null;
let editorMusicObjectURL = null;

let settings = {
    theme: "dark",
    autoplay: true,
    muted: true,
    history: true
};


/* ============================================================
   03 — DOM AND GENERAL HELPERS
   ============================================================ */

function $(id) {
    return document.getElementById(id);
}

function listen(id, event, callback) {
    const element = $(id);

    if (element) {
        element.addEventListener(event, callback);
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getInitial(name) {
    return String(name || "?")
        .trim()
        .charAt(0)
        .toUpperCase();
}

function getUser(userId) {
    return users.find(user =>
        String(user.id) === String(userId)
    );
}

function getUsername(userId) {
    const user = getUser(userId);

    if (user) {
        return user.username || "Creator";
    }

    if (
        currentProfile &&
        String(currentProfile.id) === String(userId)
    ) {
        return currentProfile.username || "Creator";
    }

    return "GoCat creator";
}

function isOwnContent(userId) {
    return !!currentUser &&
        String(userId) === String(currentUser.id);
}

function canManageContent(ownerId) {
    return isOwnContent(ownerId) || isGoCatAdmin;
}

function isFollowing(userId) {
    if (!currentUser) return false;

    return follows.some(item =>
        String(item.follower_id) === String(currentUser.id) &&
        String(item.following_id) === String(userId)
    );
}

function isShort(video) {
    return video?.is_short === true ||
        video?.is_short === "true";
}

function formatDate(value) {
    if (!value) return "Just now";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Just now";
    }

    const seconds = Math.floor(
        (Date.now() - date.getTime()) / 1000
    );

    if (seconds < 60) return "Just now";

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return minutes + "m ago";
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return hours + "h ago";
    }

    const days = Math.floor(hours / 24);

    if (days < 30) {
        return days + "d ago";
    }

    return date.toLocaleDateString();
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return "00:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(remaining).padStart(2, "0")
    );
}

function topicEmoji(topic) {
    const icons = {
        Gaming: "🎮",
        Technology: "💻",
        Education: "📚",
        School: "📚",
        Cooking: "🍳",
        Sports: "⚽",
        Music: "♫",
        Art: "🎨",
        Entertainment: "▣",
        Other: "◈"
    };

    return icons[topic] || "◈";
}

function safeJSON(key, fallback = []) {
    try {
        const saved = localStorage.getItem(key);

        return saved
            ? JSON.parse(saved)
            : fallback;

    } catch {
        return fallback;
    }
}

function showToast(message) {
    const toast = $("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function showAuthMessage(message, success = false) {
    const element = $("authMessage");

    if (!element) return;

    element.textContent = message;

    element.style.color = success
        ? "#20ce8b"
        : "#ef6272";
}

function showModal(id) {
    $(id)?.classList.remove("hidden");
}

function hideModal(id) {
    $(id)?.classList.add("hidden");
}

function getVideoURL(path) {
    if (!path || !db) return "";

    if (/^https?:\/\//i.test(String(path))) {
        return path;
    }

    return db.storage
        .from(VIDEO_BUCKET)
        .getPublicUrl(path)
        .data.publicUrl;
}

function getPostImageURL(path) {
    if (!path || !db) return "";

    if (/^https?:\/\//i.test(String(path))) {
        return path;
    }

    return db.storage
        .from(POST_BUCKET)
        .getPublicUrl(path)
        .data.publicUrl;
}


/* ============================================================
   04 — SETTINGS AND THEME
   ============================================================ */

function loadSettings() {
    const saved = safeJSON(
        "gocat_settings_v2",
        {}
    );

    settings = {
        theme: saved.theme || "dark",
        autoplay: saved.autoplay !== false,
        muted: saved.muted !== false,
        history: saved.history !== false
    };
}

function saveSettings() {
    localStorage.setItem(
        "gocat_settings_v2",
        JSON.stringify(settings)
    );
}

function applyTheme() {
    document.body.classList.toggle(
        "light",
        settings.theme === "light"
    );

    if ($("themeIcon")) {
        $("themeIcon").textContent =
            settings.theme === "dark" ? "☀" : "◐";
    }

    if ($("themeLabel")) {
        $("themeLabel").textContent =
            settings.theme === "dark"
                ? "Light appearance"
                : "Dark appearance";
    }

    if ($("settingTheme")) {
        $("settingTheme").value = settings.theme;
    }
}

function applySettings() {
    loadSettings();
    applyTheme();

    if ($("settingAutoplay")) {
        $("settingAutoplay").checked = settings.autoplay;
    }

    if ($("settingMuted")) {
        $("settingMuted").checked = settings.muted;
    }

    if ($("settingHistory")) {
        $("settingHistory").checked = settings.history;
    }
}

applySettings();
function openLoginScreen() {
    $("authScreen")?.classList.remove("hidden");
    $("app")?.classList.add("hidden");
    $("loginForm")?.classList.remove("hidden");
    $("registerForm")?.classList.add("hidden");

    if ($("authTitle")) $("authTitle").textContent = "Welcome back";
    if ($("authSubtitle")) {
        $("authSubtitle").textContent = "Sign in to continue to your workspace.";
    }

    showAuthMessage("");
}

function openRegisterScreen() {
    $("authScreen")?.classList.remove("hidden");
    $("app")?.classList.add("hidden");
    $("loginForm")?.classList.add("hidden");
    $("registerForm")?.classList.remove("hidden");

    if ($("authTitle")) $("authTitle").textContent = "Create your account";
    if ($("authSubtitle")) {
        $("authSubtitle").textContent = "Join the GoCat creator community.";
    }

    showAuthMessage("");
}

function openApp() {
    $("authScreen")?.classList.add("hidden");
    $("app")?.classList.remove("hidden");
}

listen("showRegister", "click", openRegisterScreen);
listen("showLogin", "click", openLoginScreen);

listen("loginForm", "submit", async function(event) {
    event.preventDefault();

    const email = $("loginEmail")?.value.trim() || "";
    const password = $("loginPassword")?.value || "";

    const button = this.querySelector('button[type="submit"]');

    if (button) {
        button.disabled = true;
        button.textContent = "Signing in...";
    }

    try {
        if (!db) {
            throw new Error("Supabase did not load. Refresh the page.");
        }

        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        currentUser = data.user;

        await startGoCat();

    } catch (error) {
        console.error("Login error:", error);
        showAuthMessage(error.message || "Login failed.");

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Sign in";
        }
    }
});

/* FIXED: no stray else; admin detection runs after login. */

listen("registerForm", "submit", async function(event) {
    event.preventDefault();

    const username = $("registerUsername")?.value.trim() || "";
    const email = $("registerEmail")?.value.trim() || "";
    const password = $("registerPassword")?.value || "";
    const confirmPassword = $("registerConfirm")?.value || "";

    const button = this.querySelector('button[type="submit"]');

    if (!db) {
        showAuthMessage("Supabase is not connected.");
        return;
    }

    if (username.length < 3) {
        showAuthMessage("Username must have at least 3 characters.");
        return;
    }

    if (password !== confirmPassword) {
        showAuthMessage("Passwords do not match.");
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Creating account...";
    }

    try {
        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: { username }
            }
        });

        if (error) throw error;

        if (data.session && data.user) {
            currentUser = data.user;
            await startGoCat();

        } else {
            openLoginScreen();

            showAuthMessage(
                "Account created. Sign in after any required email confirmation.",
                true
            );
        }

    } catch (error) {
        console.error("Registration error:", error);
        showAuthMessage(error.message || "Registration failed.");

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Create account";
        }
    }
});


/* ============================================================
   06 — PROFILE AND ADMIN STATUS
   ============================================================ */

async function ensureProfile() {
    const existing = await db
        .from("users")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (existing.error) throw existing.error;

    if (existing.data) {
        currentProfile = existing.data;
        return;
    }

    let username =
        currentUser.user_metadata?.username || "gocat_user";

    username = username
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 20);

    const insert = await db
    .from("videos")
    .insert({
        id: crypto.randomUUID(),
        owner_id: currentUser.id,
        title,
        description,
        topic,
        storage_path: path,
        views: 0,
        is_short: uploadMode === "short",
        created_at: Date.now()
    });

if (insert.error) {
    throw insert.error;
}


async function loadAdminStatus() {
    isGoCatAdmin = false;

    const result = await db.rpc("is_gocat_admin");

    if (result.error) {
        console.warn(
            "Admin check failed:",
            result.error.message
        );

        return;
    }

    isGoCatAdmin = result.data === true;

    console.log("GoCat admin status:", isGoCatAdmin);
}


async function loadUsers() {
    const result = await db
        .from("users")
        .select("id,username,email,bio,created_at")
        .order("created_at", { ascending: false });

    if (result.error) throw result.error;

    users = result.data || [];

    if (
        !users.some(user =>
            String(user.id) === String(currentUser.id)
        ) &&
        currentProfile
    ) {
        users.unshift(currentProfile);
    }

    currentProfile =
        users.find(user =>
            String(user.id) === String(currentUser.id)
        ) || currentProfile;
}


/* ============================================================
   07 — LOAD DATABASE DATA
   ============================================================ */

async function loadVideos() {
    const [
        videoResult,
        likeResult,
        commentResult
    ] = await Promise.all([

        db.from("videos")
            .select("*")
            .order("created_at", { ascending: false }),

        db.from("likes")
            .select("video_id,user_id"),

        db.from("comments")
            .select("*")
            .order("created_at", { ascending: true })

    ]);

    if (videoResult.error) throw videoResult.error;
    if (likeResult.error) throw likeResult.error;
    if (commentResult.error) throw commentResult.error;

    const allLikes = likeResult.data || [];
    const allComments = commentResult.data || [];

    videos = (videoResult.data || []).map(video => ({
        ...video,

        likes: allLikes
            .filter(item =>
                String(item.video_id) === String(video.id)
            )
            .map(item => String(item.user_id)),

        comments: allComments.filter(item =>
            String(item.video_id) === String(video.id)
        )
    }));
}


async function loadFollows() {
    const result = await db
        .from("follows")
        .select("follower_id,following_id");

    if (result.error) throw result.error;

    follows = result.data || [];
}


async function loadPosts() {
    const result = await db
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });

    if (result.error) {
        console.warn("Posts table:", result.error.message);
        posts = [];
        return;
    }

    const likesResult = await db
        .from("post_likes")
        .select("post_id,user_id");

    if (likesResult.error) {
        console.warn("Post likes:", likesResult.error.message);
    }

    const allLikes = likesResult.data || [];

    posts = (result.data || []).map(post => ({
        ...post,

        likes: allLikes
            .filter(like =>
                String(like.post_id) === String(post.id)
            )
            .map(like => String(like.user_id))
    }));
}


async function loadAllData() {
    await Promise.all([
        loadUsers(),
        loadVideos(),
        loadFollows(),
        loadPosts()
    ]);
}


/* ============================================================
   08 — START APPLICATION
   ============================================================ */

async function startGoCat() {
    try {
        if (!currentUser) {
            throw new Error("No signed-in user was found.");
        }

        await ensureProfile();
        await loadAdminStatus();
        await loadAllData();

        currentProfileUserId = currentUser.id;

        notifications = safeJSON(
            "gocat_notifications_" + currentUser.id,
            []
        );

        updateUserInterface();

        openApp();

        renderEverything();

        openPage("home");

        checkSharedVideoLink();

    } catch (error) {
        console.error("GoCat startup:", error);

        showToast(
            "Could not load GoCat: " + error.message
        );
    }
}


function updateUserInterface() {
    const username = currentProfile?.username || "Creator";

    if ($("welcomeName")) {
        $("welcomeName").textContent = username;
    }

    if ($("topProfileBtn")) {
        $("topProfileBtn").textContent = getInitial(username);
    }

    if ($("sidebarAvatar")) {
        $("sidebarAvatar").textContent = getInitial(username);
    }

    if ($("sidebarUsername")) {
        $("sidebarUsername").textContent = username;
    }

    if ($("settingsAvatar")) {
        $("settingsAvatar").textContent = getInitial(username);
    }

    if ($("settingsUsername")) {
        $("settingsUsername").textContent = username;
    }

    if ($("settingsEmail")) {
        $("settingsEmail").textContent = currentUser?.email || "";
    }
}
/* ============================================================
   09 — VIDEO AND POST CARDS
   ============================================================ */

function videoCard(video) {
    const username = getUsername(video.owner_id);
    const canDelete = canManageContent(video.owner_id);
    const following = isFollowing(video.owner_id);

    const liked = (video.likes || []).includes(
        String(currentUser.id)
    );

    return `
        <article class="video-card">

            <div class="video-player-wrap">
                <video
                    class="video-player"
                    src="${escapeHTML(getVideoURL(video.storage_path))}"
                    controls
                    playsinline
                    preload="metadata"
                    data-play-video="${escapeHTML(video.id)}">
                </video>
            </div>

            <div class="video-owner">
                <div class="owner-avatar">
                    ${escapeHTML(getInitial(username))}
                </div>

                <div class="owner-name">
                    <button
                        class="profile-user-btn"
                        data-profile-user="${escapeHTML(video.owner_id)}">
                        ${escapeHTML(username)}
                    </button>
                </div>

                ${
                    !canDelete
                    ? `
                        <button
                            class="follow-btn"
                            data-follow-user="${escapeHTML(video.owner_id)}">
                            ${following ? "Following" : "+ Follow"}
                        </button>
                    `
                    : ""
                }
            </div>

            <div class="video-info">
                <h3>${escapeHTML(video.title)}</h3>
                <p>${escapeHTML(video.description || "")}</p>

                <span class="video-topic">
                    ${topicEmoji(video.topic)}
                    ${escapeHTML(video.topic || "Other")}
                </span>
            </div>

            <div class="video-meta">
                <span>${Number(video.views || 0)} views</span>
                <span>${formatDate(video.created_at)}</span>
            </div>

            <div class="video-actions">

                <button
                    class="action-btn ${liked ? "liked" : ""}"
                    data-like-video="${escapeHTML(video.id)}">
                    ${liked ? "♥" : "♡"}
                    ${video.likes?.length || 0}
                </button>

                <button
                    class="action-btn"
                    data-comments-video="${escapeHTML(video.id)}">
                    Comments ${video.comments?.length || 0}
                </button>

                <button
                    class="action-btn"
                    data-share-video="${escapeHTML(video.id)}">
                    Share
                </button>

                ${
                    canDelete
                    ? `
                        <button
                            class="action-btn delete-btn"
                            data-delete-video="${escapeHTML(video.id)}">
                            Delete
                        </button>
                    `
                    : ""
                }

            </div>
        </article>
    `;
}


function postCard(post) {
    const username = getUsername(post.user_id);
    const canDelete = canManageContent(post.user_id);

    const liked = (post.likes || []).includes(
        String(currentUser.id)
    );

    const imageURL = getPostImageURL(post.media_path);

    return `
        <article class="post-card">

            <div class="post-author">

                <div class="post-avatar">
                    ${escapeHTML(getInitial(username))}
                </div>

                <div>
                    <strong>${escapeHTML(username)}</strong>
                    <small>${formatDate(post.created_at)}</small>
                </div>

                ${
                    canDelete
                    ? `
                        <button
                            class="action-btn delete-btn"
                            data-delete-post="${escapeHTML(post.id)}">
                            Delete
                        </button>
                    `
                    : ""
                }

            </div>

            <p class="post-content">
                ${escapeHTML(post.content || "")}
            </p>

            ${
                imageURL
                ? `
                    <img
                        class="post-image"
                        src="${escapeHTML(imageURL)}"
                        alt="Post image"
                        loading="lazy">
                `
                : ""
            }

            <div class="post-actions">
                <button
                    class="post-like-btn ${liked ? "liked" : ""}"
                    data-like-post="${escapeHTML(post.id)}">
                    ${liked ? "♥" : "♡"}
                    ${post.likes?.length || 0} Likes
                </button>
            </div>

        </article>
    `;
}


function homeShortCard(video) {
    const username = getUsername(video.owner_id);

    const liked = (video.likes || []).includes(
        String(currentUser.id)
    );

    return `
        <article class="home-short-card">

            <button
                class="home-short-open"
                data-open-reel-id="${escapeHTML(video.id)}">

                <div class="home-short-thumbnail">
                    <video
                        src="${escapeHTML(getVideoURL(video.storage_path))}"
                        muted
                        playsinline
                        preload="metadata">
                    </video>

                    <span class="home-short-play">▶</span>
                </div>

                <div class="home-short-info">
                    <strong>${escapeHTML(video.title)}</strong>
                    <small>@${escapeHTML(username)}</small>
                    <small>${Number(video.views || 0)} views</small>
                </div>

            </button>

            <div class="home-short-actions">

                <button
                    data-like-video="${escapeHTML(video.id)}"
                    class="${liked ? "liked" : ""}">
                    ${liked ? "♥" : "♡"}
                    ${video.likes?.length || 0}
                </button>

                <button
                    data-comments-video="${escapeHTML(video.id)}">
                    Comments
                </button>

            </div>

        </article>
    `;
}


/* ============================================================
   10 — HOME FEED
   ============================================================ */

function getHomeFeedData() {
    const query =
        $("searchInput")?.value.trim().toLowerCase() || "";

    function matches(item, type) {
        if (!query) return true;

        const ownerId = type === "post"
            ? item.user_id
            : item.owner_id;

        const content = [
            item.title,
            item.description,
            item.content,
            getUsername(ownerId)
        ].join(" ").toLowerCase();

        return content.includes(query);
    }

    const regularVideos = videos
        .filter(video => !isShort(video))
        .filter(video =>
            activeHomeTopic === "All" ||
            video.topic === activeHomeTopic
        )
        .filter(video => matches(video, "video"))
        .slice()
        .sort((a, b) => {

            const score = video => {
                let points = isFollowing(video.owner_id) ? 4 : 0;

                const ageHours =
                    (Date.now() -
                        new Date(video.created_at).getTime()) / 3600000;

                points += Math.max(0, 4 - ageHours / 24);

                points += Math.min(
                    Number(video.views || 0) / 100,
                    3
                );

                points += Math.min(
                    (video.likes?.length || 0) / 5,
                    2
                );

                return points;
            };

            return score(b) - score(a);
        });

    const shorts = videos
        .filter(isShort)
        .filter(video =>
            activeHomeTopic === "All" ||
            video.topic === activeHomeTopic
        )
        .filter(video => matches(video, "video"))
        .slice()
        .sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );

    const communityPosts = posts
        .filter(post => matches(post, "post"))
        .slice()
        .sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );

    return {
        regularVideos,
        shorts,
        communityPosts
    };
}


function buildHomeFeedCycles() {
    const data = getHomeFeedData();

    let videoIndex = 0;
    let shortsIndex = 0;
    let postIndex = 0;

    const cycles = [];

    while (
        videoIndex < data.regularVideos.length ||
        shortsIndex < data.shorts.length ||
        postIndex < data.communityPosts.length
    ) {
        const sections = [];

        if (videoIndex < data.regularVideos.length) {
            const group = data.regularVideos.slice(
                videoIndex,
                videoIndex + 4
            );

            videoIndex += group.length;

            sections.push(`
                <section class="home-feed-section">

                    <div class="home-feed-heading">
                        <div>
                            <h2>Videos for you</h2>
                            <p>Recommended videos from GoCat creators.</p>
                        </div>
                    </div>

                    <div class="home-feed-video-grid">
                        ${group.map(videoCard).join("")}
                    </div>

                </section>
            `);
        }

        if (shortsIndex < data.shorts.length) {
            const group = data.shorts.slice(
                shortsIndex,
                shortsIndex + 4
            );

            shortsIndex += group.length;

            sections.push(`
                <section class="home-feed-section">

                    <div class="home-feed-heading">

                        <div class="home-shelf-title">
                            <span class="shorts-logo">▶</span>

                            <div>
                                <h2>Shorts</h2>
                                <p>Quick videos from GoCat.</p>
                            </div>
                        </div>

                        <button
                            class="soft-btn"
                            data-go-page="reels">
                            See all →
                        </button>

                    </div>

                    <div class="home-shorts-shelf">
                        ${group.map(homeShortCard).join("")}
                    </div>

                </section>
            `);
        }

        if (postIndex < data.communityPosts.length) {
            const group = data.communityPosts.slice(
                postIndex,
                postIndex + 2
            );

            postIndex += group.length;

            sections.push(`
                <section class="home-feed-section">

                    <div class="home-feed-heading">
                        <div>
                            <h2>Community posts</h2>
                            <p>Updates from GoCat creators.</p>
                        </div>

                        <button
                            class="soft-btn"
                            data-go-page="posts">
                            View posts →
                        </button>
                    </div>

                    <div class="home-feed-post-grid">
                        ${group.map(postCard).join("")}
                    </div>

                </section>
            `);
        }

        cycles.push(sections.join(""));
    }

    return cycles;
}


function renderHomeFeed() {
    const container = $("homeFeed");

    if (!container) return;

    const cycles = buildHomeFeedCycles();

    const visible = cycles.slice(
        0,
        homeVisibleCycles
    );

    container.innerHTML = visible.join("");

    const data = getHomeFeedData();

    const total =
        data.regularVideos.length +
        data.shorts.length +
        data.communityPosts.length;

    const shown = visible.reduce((sum, html) => {
        const matches = html.match(
            /class="video-card"|class="post-card"|class="home-short-card"/g
        );

        return sum + (matches ? matches.length : 0);
    }, 0);

    $("homeEmpty")?.classList.toggle(
        "hidden",
        total > 0
    );

    $("homeLoadMoreWrap")?.classList.toggle(
        "hidden",
        homeVisibleCycles >= cycles.length
    );

    if ($("homeCount")) {
        $("homeCount").textContent =
            "Showing " + shown + " of " + total;
    }
}


listen("homeLoadMore", "click", () => {
    homeVisibleCycles += 1;
    renderHomeFeed();
});


document.querySelectorAll("[data-topic]").forEach(button => {
    button.addEventListener("click", function() {
        activeHomeTopic = this.dataset.topic;
        homeVisibleCycles = 1;

        document.querySelectorAll("[data-topic]")
            .forEach(item => item.classList.remove("active"));

        this.classList.add("active");

        renderHomeFeed();
    });
});
/* ============================================================
   11 — CREATORS AND FOLLOWS
   ============================================================ */

function renderSuggestedCreators() {
    const container = $("suggestedCreators");

    if (!container) return;

    const suggestions = users
        .filter(user =>
            !isOwnContent(user.id) &&
            !isFollowing(user.id)
        )
        .slice(0, 15);

    container.innerHTML = suggestions.map(user => `
        <div class="creator-card">

            <div class="creator-avatar">
                ${escapeHTML(getInitial(user.username))}
            </div>

            <div class="creator-info">
                <strong>${escapeHTML(user.username)}</strong>
                <small>GoCat creator</small>
            </div>

            <button
                class="mini-follow"
                data-follow-user="${escapeHTML(user.id)}">
                Follow
            </button>

        </div>
    `).join("");
}


async function toggleFollow(userId) {
    if (!currentUser || isOwnContent(userId)) return;

    const existing = follows.find(item =>
        String(item.follower_id) === String(currentUser.id) &&
        String(item.following_id) === String(userId)
    );

    try {
        if (existing) {

            const result = await db
                .from("follows")
                .delete()
                .eq("follower_id", currentUser.id)
                .eq("following_id", userId);

            if (result.error) throw result.error;

            follows = follows.filter(
                item => item !== existing
            );

            showToast("Unfollowed " + getUsername(userId));

        } else {

            const result = await db
                .from("follows")
                .insert({
                    follower_id: currentUser.id,
                    following_id: userId
                });

            if (result.error) throw result.error;

            follows.push({
                follower_id: currentUser.id,
                following_id: userId
            });

            showToast("Following " + getUsername(userId));
        }

        renderEverything();

    } catch (error) {
        console.error(error);
        showToast("Follow error: " + error.message);
    }
}


/* ============================================================
   12 — LIKES AND COMMENTS
   ============================================================ */

async function toggleVideoLike(videoId) {
    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video) return;

    video.likes = video.likes || [];

    const liked = video.likes.includes(
        String(currentUser.id)
    );

    try {
        const result = liked

            ? await db
                .from("likes")
                .delete()
                .eq("video_id", videoId)
                .eq("user_id", currentUser.id)

            : await db
                .from("likes")
                .insert({
                    video_id: videoId,
                    user_id: currentUser.id
                });

        if (result.error) throw result.error;

        video.likes = liked
            ? video.likes.filter(id =>
                id !== String(currentUser.id)
              )
            : [...video.likes, String(currentUser.id)];

        renderEverything();

    } catch (error) {
        console.error(error);
        showToast("Like error: " + error.message);
    }
}


async function openComments(videoId) {
    currentCommentVideoId = videoId;

    if ($("commentsList")) {
        $("commentsList").innerHTML =
            "<p class='muted-text'>Loading comments...</p>";
    }

    showModal("commentsModal");

    await renderComments();
}


async function renderComments() {
    if (!currentCommentVideoId || !$("commentsList")) return;

    const result = await db
        .from("comments")
        .select("*")
        .eq("video_id", currentCommentVideoId)
        .order("created_at", { ascending: true });

    if (result.error) {
        $("commentsList").textContent = result.error.message;
        return;
    }

    const comments = result.data || [];

    $("commentsList").innerHTML = comments.length
        ? comments.map(comment => `
            <div class="comment-item">

                <strong>
                    ${escapeHTML(getUsername(comment.user_id))}
                </strong>

                <p>
                    ${escapeHTML(comment.content ?? comment.text ?? "")}
                </p>

                <small>${formatDate(comment.created_at)}</small>

            </div>
        `).join("")
        : "<p class='muted-text'>No comments yet.</p>";
}


listen("commentForm", "submit", async function(event) {
    event.preventDefault();

    const text = $("commentInput")?.value.trim() || "";

    if (!text || !currentCommentVideoId) return;

    const result = await db
        .from("comments")
        .insert({
            video_id: currentCommentVideoId,
            user_id: currentUser.id,
            content: text
        });

    if (result.error) {
        showToast("Comment error: " + result.error.message);
        return;
    }

    $("commentInput").value = "";

    await loadVideos();
    await renderComments();

    renderEverything();

    showToast("Comment posted!");
});


/* ============================================================
   13 — SHARE AND VIDEO DELETION
   ============================================================ */

async function shareVideo(videoId) {
    const url =
        location.origin +
        location.pathname +
        "?video=" +
        encodeURIComponent(videoId);

    try {
        if (navigator.share) {
            await navigator.share({
                title: "GoCat video",
                text: "Watch this on GoCat.",
                url
            });

        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            showToast("Video link copied!");

        } else {
            showToast("Sharing is not supported here.");
        }

    } catch (error) {
        if (error.name !== "AbortError") {
            showToast("Sharing failed.");
        }
    }
}


function checkSharedVideoLink() {
    const videoId =
        new URLSearchParams(location.search).get("video");

    if (!videoId) return;

    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video) {
        showToast("That video could not be found.");
        return;
    }

    if (isShort(video)) {
        openSpecificReel(video.id);

    } else {
        openPage("home");

        setTimeout(() => {
            document.querySelector(
                `[data-play-video="${CSS.escape(String(video.id))}"]`
            )?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }, 300);
    }
}


async function deleteVideo(videoId) {
    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video || !canManageContent(video.owner_id)) return;

    if (!confirm("Delete this video permanently?")) return;

    const result = await db
        .from("videos")
        .delete()
        .eq("id", videoId);

    if (result.error) {
        showToast("Delete failed: " + result.error.message);
        return;
    }

    if (video.storage_path) {
        const removal = await db.storage
            .from(VIDEO_BUCKET)
            .remove([video.storage_path]);

        if (removal.error) {
            console.warn(
                "Storage cleanup:",
                removal.error.message
            );
        }
    }

    await loadVideos();

    renderEverything();

    showToast("Video deleted.");
}


/* ============================================================
   14 — SHORTS / REELS
   ============================================================ */

function renderReels() {
    const container = $("reelsFeed");

    if (!container) return;

    const allReels = videos.filter(isShort);

    const page = allReels.slice(
        0,
        reelsVisible
    );

    if (!allReels.length) {
        container.innerHTML = `
            <div class="reel-empty">
                <div>
                    <h2>No Shorts yet</h2>
                    <p>Create the first GoCat Short.</p>

                    <button
                        class="primary-btn"
                        data-create-short>
                        Create Short
                    </button>
                </div>
            </div>
        `;

        $("reelsLoadMoreWrap")?.classList.add("hidden");
        return;
    }

    container.innerHTML = page.map(video => {
        const username = getUsername(video.owner_id);

        const liked = (video.likes || []).includes(
            String(currentUser.id)
        );

        const following = isFollowing(video.owner_id);
        const canDelete = canManageContent(video.owner_id);

        return `
            <article
                class="reel-item"
                data-reel-item="${escapeHTML(video.id)}">

                <video
                    class="reel-video"
                    src="${escapeHTML(getVideoURL(video.storage_path))}"
                    playsinline
                    loop
                    ${settings.muted ? "muted" : ""}
                    preload="metadata"
                    data-play-video="${escapeHTML(video.id)}">
                </video>

                <button
                    class="reel-sound-btn"
                    data-reel-sound>
                    ${settings.muted ? "Muted" : "Sound"}
                </button>

                <div class="reel-shade"></div>

                <div class="reel-info">

                    <div class="reel-user-row">

                        <div class="reel-user-avatar">
                            ${escapeHTML(getInitial(username))}
                        </div>

                        <button
                            class="reel-username"
                            data-profile-user="${escapeHTML(video.owner_id)}">
                            @${escapeHTML(username)}
                        </button>

                        ${
                            !isOwnContent(video.owner_id)
                            ? `
                                <button
                                    class="reel-follow"
                                    data-follow-user="${escapeHTML(video.owner_id)}">
                                    ${following ? "Following" : "Follow"}
                                </button>
                            `
                            : ""
                        }

                    </div>

                    <p class="reel-caption">
                        ${escapeHTML(video.title)}
                    </p>

                    <p class="reel-caption">
                        ${escapeHTML(video.description || "")}
                    </p>

                </div>

                <div class="reel-actions">

                    <button
                        class="reel-action ${liked ? "liked" : ""}"
                        data-like-video="${escapeHTML(video.id)}">
                        ${liked ? "♥" : "♡"}
                    </button>

                    <small style="color:white;text-align:center">
                        ${video.likes?.length || 0}
                    </small>

                    <button
                        class="reel-action"
                        data-comments-video="${escapeHTML(video.id)}">
                        Comments
                    </button>

                    <button
                        class="reel-action"
                        data-share-video="${escapeHTML(video.id)}">
                        Share
                    </button>

                    ${
                        canDelete
                        ? `
                            <button
                                class="reel-action delete-btn"
                                data-delete-video="${escapeHTML(video.id)}">
                                Delete
                            </button>
                        `
                        : ""
                    }

                </div>

            </article>
        `;
    }).join("");

    $("reelsLoadMoreWrap")?.classList.toggle(
        "hidden",
        reelsVisible >= allReels.length
    );

    observeReels();
}


function observeReels() {
    if (reelObserver) {
        reelObserver.disconnect();
    }

    const feed = $("reelsFeed");

    if (!feed || !("IntersectionObserver" in window)) {
        return;
    }

    reelObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const video = entry.target;

            if (entry.isIntersecting && settings.autoplay) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });
    }, {
        root: feed,
        threshold: 0.7
    });

    feed.querySelectorAll(".reel-video").forEach(video => {
        reelObserver.observe(video);
    });
}


listen("reelsLoadMore", "click", () => {
    reelsVisible += PAGE_SIZE;
    renderReels();
});


function openSpecificReel(videoId) {
    const allReels = videos.filter(isShort);

    const index = allReels.findIndex(video =>
        String(video.id) === String(videoId)
    );

    if (index >= 0) {
        reelsVisible = Math.max(reelsVisible, index + 1);
    }

    openPage("reels");

    setTimeout(() => {
        document.querySelector(
            `[data-reel-item="${CSS.escape(String(videoId))}"]`
        )?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, 200);
}


listen("reelsFeed", "click", function(event) {
    const soundButton = event.target.closest("[data-reel-sound]");

    if (!soundButton) return;

    const video = soundButton
        .closest(".reel-item")
        ?.querySelector(".reel-video");

    if (!video) return;

    video.muted = !video.muted;

    soundButton.textContent =
        video.muted ? "Muted" : "Sound";
});


/* ============================================================
   15 — EXPLORE
   ============================================================ */

function setExploreTab(mode) {
    exploreMode = mode;
    exploreVisible = 6;

    document.querySelectorAll("[data-explore-tab]")
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.exploreTab === mode
            );
        });

    $("exploreVideos")?.classList.toggle(
        "hidden",
        mode !== "videos" && mode !== "reels"
    );

    $("explorePeople")?.classList.toggle(
        "hidden",
        mode !== "people"
    );

    $("explorePosts")?.classList.toggle(
        "hidden",
        mode !== "posts"
    );

    renderExplore();
}


document.querySelectorAll("[data-explore-tab]").forEach(button => {
    button.addEventListener("click", function() {
        setExploreTab(this.dataset.exploreTab);
    });
});


function exploreReelCard(video) {
    const username = getUsername(video.owner_id);

    return `
        <article class="feed-post-card feed-reel-card">

            <div class="feed-post-top">
                <div class="feed-post-avatar">
                    ${escapeHTML(getInitial(username))}
                </div>

                <div class="feed-post-user">
                    <strong>${escapeHTML(username)}</strong>
                    <small>GoCat Short</small>
                </div>
            </div>

            <div class="reel-thumb">
                <video
                    src="${escapeHTML(getVideoURL(video.storage_path))}"
                    muted
                    playsinline
                    preload="metadata">
                </video>

                <span class="reel-thumb-label">SHORT</span>
            </div>

            <p class="feed-post-content">
                ${escapeHTML(video.title)}
            </p>

            <button
                class="feed-reel-open"
                data-open-reel-id="${escapeHTML(video.id)}">
                Watch Short
            </button>

        </article>
    `;
}


function renderExplore() {
    const query =
        $("searchInput")?.value.trim().toLowerCase() || "";

    if (exploreMode === "videos") {
        const found = videos.filter(video =>
            !isShort(video) && (
                !query ||
                String(video.title || "").toLowerCase().includes(query) ||
                String(video.description || "").toLowerCase().includes(query) ||
                getUsername(video.owner_id).toLowerCase().includes(query)
            )
        );

        $("exploreVideos").innerHTML =
            found.slice(0, exploreVisible)
                .map(videoCard)
                .join("");

        updateExploreMore(found.length);
        return;
    }

    if (exploreMode === "reels") {
        const found = videos.filter(video =>
            isShort(video) && (
                !query ||
                String(video.title || "").toLowerCase().includes(query) ||
                String(video.description || "").toLowerCase().includes(query) ||
                getUsername(video.owner_id).toLowerCase().includes(query)
            )
        );

        $("exploreVideos").innerHTML =
            found.slice(0, exploreVisible)
                .map(exploreReelCard)
                .join("");

        updateExploreMore(found.length);
        return;
    }

    if (exploreMode === "people") {
        const found = users.filter(user =>
            !isOwnContent(user.id) && (
                !query ||
                String(user.username || "").toLowerCase().includes(query) ||
                String(user.bio || "").toLowerCase().includes(query)
            )
        );

        $("explorePeople").innerHTML =
            found.slice(0, exploreVisible).map(user => `
                <div class="person-card">

                    <div class="person-avatar">
                        ${escapeHTML(getInitial(user.username))}
                    </div>

                    <h3>${escapeHTML(user.username)}</h3>

                    <p>${escapeHTML(user.bio || "GoCat creator")}</p>

                    <button
                        class="primary-btn"
                        data-profile-user="${escapeHTML(user.id)}">
                        View channel
                    </button>

                    <button
                        class="soft-btn"
                        data-follow-user="${escapeHTML(user.id)}">
                        ${isFollowing(user.id) ? "Following" : "Follow"}
                    </button>

                </div>
            `).join("");

        updateExploreMore(found.length);
        return;
    }

    if (exploreMode === "posts") {
        const found = posts.filter(post =>
            !query ||
            String(post.content || "").toLowerCase().includes(query) ||
            getUsername(post.user_id).toLowerCase().includes(query)
        );

        $("explorePosts").innerHTML =
            found.slice(0, exploreVisible)
                .map(postCard)
                .join("");

        updateExploreMore(found.length);
    }
}


function updateExploreMore(total) {
    $("exploreLoadMoreWrap")?.classList.toggle(
        "hidden",
        exploreVisible >= total
    );

    if ($("exploreCount")) {
        $("exploreCount").textContent =
            "Showing " +
            Math.min(exploreVisible, total) +
            " of " +
            total;
    }
}


listen("exploreLoadMore", "click", () => {
    exploreVisible += 6;
    renderExplore();
});
/* ============================================================
   16 — FOLLOWING PAGE
   ============================================================ */

function renderFollowing() {
    const followingIds = follows
        .filter(item =>
            String(item.follower_id) === String(currentUser.id)
        )
        .map(item => String(item.following_id));

    const selected = videos.filter(video =>
        followingIds.includes(String(video.owner_id)) &&
        !isShort(video)
    );

    if ($("followingFeed")) {
        $("followingFeed").innerHTML =
            selected.map(videoCard).join("");
    }

    $("followingEmpty")?.classList.toggle(
        "hidden",
        selected.length > 0
    );
}


/* ============================================================
   17 — VIDEO UPLOAD MODAL AND FILE PICKER
   ============================================================ */

function resetUploadForm() {
    $("uploadForm")?.reset();

    if ($("videoFile")) $("videoFile").value = "";

    if ($("selectedVideoName")) {
        $("selectedVideoName").textContent = "";
    }

    $("uploadProgress")?.classList.add("hidden");

    if ($("uploadProgressBar")) {
        $("uploadProgressBar").style.width = "0%";
    }

    if ($("uploadStatus")) {
        $("uploadStatus").textContent = "";
    }

    $("reelEditor")?.classList.add("hidden");

    selectedVideoFile = null;
    exportedReelFile = null;
}


function setUploadMode(mode) {
    uploadMode = mode === "short" ? "short" : "video";

    document.querySelectorAll("[data-upload-mode]")
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.uploadMode === uploadMode
            );
        });

    if ($("uploadTitle")) {
        $("uploadTitle").textContent =
            uploadMode === "short"
                ? "Create a Short"
                : "Upload video";
    }

    if ($("uploadDescription")) {
        $("uploadDescription").textContent =
            uploadMode === "short"
                ? "Prepare and publish a vertical video."
                : "Publish a video to your GoCat channel.";
    }

    if ($("publishVideoBtn")) {
        $("publishVideoBtn").textContent =
            uploadMode === "short"
                ? "Publish Short"
                : "Publish video";
    }
}


function openUpload(mode = "video") {
    resetUploadForm();
    setUploadMode(mode);
    showModal("uploadModal");
}


listen("uploadTopBtn", "click", () => {
    openUpload("video");
});

listen("createReelBtn", "click", () => {
    openUpload("short");
});


document.querySelectorAll("[data-upload-mode]")
    .forEach(button => {
        button.addEventListener("click", function() {
            if (this.dataset.uploadMode !== uploadMode) {
                setUploadMode(this.dataset.uploadMode);
            }
        });
    });


document.addEventListener("click", function(event) {
    const button = event.target.closest("[data-open-upload]");

    if (!button) return;

    openUpload(
        button.dataset.openUpload === "short"
            ? "short"
            : "video"
    );
});


/* ============================================================
   18 — VIDEO FILE SELECTION
   ============================================================ */

listen("videoFile", "change", function() {
    const input = this;
    const file = input.files?.[0];

    selectedVideoFile = null;
    exportedReelFile = null;

    if ($("selectedVideoName")) {
        $("selectedVideoName").textContent = "";
    }

    if (!file) return;

    const allowedExtensions = [
        "mp4",
        "mov",
        "webm",
        "m4v",
        "ogv",
        "ogg",
        "3gp",
        "mkv"
    ];

    const extension = (
        file.name.split(".").pop() || ""
    ).toLowerCase();

    const validType =
        file.type.startsWith("video/") ||
        allowedExtensions.includes(extension);

    if (!validType) {
        showToast("Please select a supported video file.");
        input.value = "";
        return;
    }

    if (file.size > MAX_VIDEO_BYTES) {
        showToast("Maximum video size is 50 MB.");
        input.value = "";
        return;
    }

    const tempURL = URL.createObjectURL(file);
    const testVideo = document.createElement("video");

    testVideo.preload = "metadata";

    testVideo.onloadedmetadata = function() {
        const duration = testVideo.duration;
        const width = testVideo.videoWidth;
        const height = testVideo.videoHeight;

        URL.revokeObjectURL(tempURL);

        if (
            !Number.isFinite(duration) ||
            !width ||
            !height
        ) {
            showToast("Could not read video information.");
            input.value = "";
            return;
        }

        if (duration > MAX_VIDEO_DURATION) {
            showToast("GoCat videos can be up to 5 minutes.");
            input.value = "";
            return;
        }

        if (
            Math.max(width, height) > 3840 ||
            Math.min(width, height) > 2160
        ) {
            showToast("Maximum resolution is 4K UHD.");
            input.value = "";
            return;
        }

        selectedVideoFile = file;

        if ($("selectedVideoName")) {
            $("selectedVideoName").textContent =
                file.name + " • " +
                (file.size / (1024 * 1024)).toFixed(2) +
                " MB • " +
                width + "x" + height;
        }

        if (uploadMode === "short") {
            prepareReelEditor(file);
        }

        showToast("Video ready!");
    };

    testVideo.onerror = function() {
        URL.revokeObjectURL(tempURL);

        showToast(
            "This video format could not be read by your browser."
        );

        input.value = "";
    };

    testVideo.src = tempURL;
});


/* ============================================================
   19 — SHORTS EDITOR PREVIEW
   Keeps original video unless edited export succeeds.
   ============================================================ */

function prepareReelEditor(file) {
    const preview = $("reelPreview");

    if (!preview) return;

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }

    currentObjectURL = URL.createObjectURL(file);

    preview.src = currentObjectURL;
    preview.style.filter = "none";
    preview.style.transform = "none";
    preview.playbackRate = 1;

    if ($("editorProjectStatus")) {
        $("editorProjectStatus").textContent = file.name;
    }

    if ($("editorStatus")) {
        $("editorStatus").textContent =
            "Choose your edits and export your Short.";
    }

    if ($("editorOverlayPreview")) {
        $("editorOverlayPreview").style.justifyContent = "flex-end";
    }

    if ($("previewTextOne")) {
        $("previewTextOne").textContent = "";
    }

    if ($("previewTextTwo")) {
        $("previewTextTwo").textContent = "";
    }

    if ($("previewSticker")) {
        $("previewSticker").textContent = "";
    }

    showModal("editorModal");

    preview.onloadedmetadata = function() {
        const duration = preview.duration;

        ["trimStart", "trimStartRange"].forEach(id => {
            if ($(id)) $(id).value = 0;
        });

        if ($("trimEnd")) {
            $("trimEnd").value = duration.toFixed(1);
            $("trimEnd").max = duration;
        }

        if ($("trimStart")) {
            $("trimStart").max = duration;
        }

        if ($("trimStartRange")) {
            $("trimStartRange").max =
                Math.ceil(duration * 10);
        }

        if ($("trimEndRange")) {
            $("trimEndRange").max =
                Math.ceil(duration * 10);

            $("trimEndRange").value =
                Math.ceil(duration * 10);
        }

        if ($("timelineDuration")) {
            $("timelineDuration").textContent =
                formatTime(duration);
        }

        if ($("editorTimecode")) {
            $("editorTimecode").textContent =
                "00:00 / " + formatTime(duration);
        }

        updateEditorPreview();
    };
}


document.querySelectorAll("[data-editor-tab]")
    .forEach(button => {
        button.addEventListener("click", function() {
            const tab = this.dataset.editorTab;

            document.querySelectorAll("[data-editor-tab]")
                .forEach(item => item.classList.remove("active"));

            this.classList.add("active");

            document.querySelectorAll("[data-editor-panel]")
                .forEach(panel => {
                    panel.classList.toggle(
                        "hidden",
                        panel.dataset.editorPanel !== tab
                    );
                });
        });
    });


function getEditorFilter() {
    const filters = {
        none: "",
        warm: "sepia(.35) saturate(1.25)",
        cool: "hue-rotate(14deg) saturate(.95)",
        mono: "grayscale(1)",
        vivid: "saturate(1.6) contrast(1.08)",
        cinema: "contrast(1.18) saturate(1.12)",
        fade: "brightness(1.08) saturate(.75) contrast(.88)"
    };

    return filters[$("reelFilter")?.value] || "";
}


function updateEditorPreview() {
    const preview = $("reelPreview");

    if (!preview) return;

    const brightness = Number($("reelBrightness")?.value ?? 100);
    const contrast = Number($("reelContrast")?.value ?? 100);
    const saturation = Number($("reelSaturation")?.value ?? 100);
    const blur = Number($("reelBlur")?.value ?? 0);

    preview.style.filter = [
        getEditorFilter(),
        `brightness(${brightness}%)`,
        `contrast(${contrast}%)`,
        `saturate(${saturation}%)`,
        `blur(${blur}px)`
    ].filter(Boolean).join(" ");

    preview.style.transform =
        `rotate(${Number($("reelRotation")?.value || 0)}deg)`;

    preview.playbackRate =
        Number($("reelSpeed")?.value || 1);

    [
        ["brightnessValue", brightness + "%"],
        ["contrastValue", contrast + "%"],
        ["saturationValue", saturation + "%"],
        ["blurValue", blur + "px"]
    ].forEach(([id, value]) => {
        if ($(id)) $(id).textContent = value;
    });

    if ($("previewTextOne")) {
        $("previewTextOne").textContent =
            $("reelOverlayText")?.value || "";
    }

    if ($("previewTextTwo")) {
        $("previewTextTwo").textContent =
            $("reelOverlayTextTwo")?.value || "";
    }

    if ($("previewSticker")) {
        $("previewSticker").textContent =
            $("reelSticker")?.value || "";
    }

    if ($("previewTextOne") && $("reelTextSize")) {
        $("previewTextOne").style.fontSize =
            Number($("reelTextSize").value) + "px";
    }

    if ($("previewTextOne") && $("reelTextColor")) {
        $("previewTextOne").style.color =
            $("reelTextColor").value;
    }

    if ($("editorOverlayPreview")) {
        const position = $("reelTextPosition")?.value;

        $("editorOverlayPreview").style.justifyContent =
            position === "top"
                ? "flex-start"
                : position === "middle"
                    ? "center"
                    : "flex-end";
    }

    if ($("reelFraming")) {
        preview.style.objectFit =
            $("reelFraming").value === "contain"
                ? "contain"
                : "cover";
    }
}


[
    "reelFilter",
    "reelBrightness",
    "reelContrast",
    "reelSaturation",
    "reelBlur",
    "reelSpeed",
    "reelTextPosition",
    "reelTextSize",
    "reelTextColor",
    "reelOverlayText",
    "reelOverlayTextTwo",
    "reelSticker",
    "reelFraming",
    "reelRotation"
].forEach(id => {
    listen(id, "input", updateEditorPreview);
    listen(id, "change", updateEditorPreview);
});


function syncTrimInputs(changed) {
    const preview = $("reelPreview");

    if (!preview?.duration) return;

    let start = Number($("trimStart")?.value || 0);
    let end = Number($("trimEnd")?.value || preview.duration);

    if (changed === "start") {
        start = Math.max(0, Math.min(start, end - 0.1));

        if ($("trimStart")) {
            $("trimStart").value = start.toFixed(1);
        }
    }

    if (changed === "end") {
        end = Math.min(
            preview.duration,
            Math.max(end, start + 0.1)
        );

        if ($("trimEnd")) {
            $("trimEnd").value = end.toFixed(1);
        }
    }

    if ($("trimStartRange")) {
        $("trimStartRange").value = Math.round(start * 10);
    }

    if ($("trimEndRange")) {
        $("trimEndRange").value = Math.round(end * 10);
    }

    if ($("timelineDuration")) {
        $("timelineDuration").textContent =
            formatTime(end - start);
    }
}


listen("trimStart", "input", () => syncTrimInputs("start"));
listen("trimEnd", "input", () => syncTrimInputs("end"));

listen("trimStartRange", "input", function() {
    if ($("trimStart")) {
        $("trimStart").value =
            (Number(this.value) / 10).toFixed(1);
    }

    syncTrimInputs("start");
});


listen("trimEndRange", "input", function() {
    if ($("trimEnd")) {
        $("trimEnd").value =
            (Number(this.value) / 10).toFixed(1);
    }

    syncTrimInputs("end");
});


listen("reelPreview", "timeupdate", function() {
    if (!this.duration) return;

    if ($("editorTimecode")) {
        $("editorTimecode").textContent =
            formatTime(this.currentTime) +
            " / " +
            formatTime(this.duration);
    }

    const start = Number($("trimStart")?.value || 0);
    const end = Number($("trimEnd")?.value || this.duration);

    const position = Math.max(
        0,
        Math.min(
            100,
            ((this.currentTime - start) /
                Math.max(0.1, end - start)) * 100
        )
    );

    if ($("timelinePlayhead")) {
        $("timelinePlayhead").style.left = position + "%";
    }

    if (this.currentTime >= end) {
        this.pause();
    }
});


listen("editorPreviewPlay", "click", async function() {
    const preview = $("reelPreview");

    if (!preview) return;

    const start = Number($("trimStart")?.value || 0);
    const end = Number($("trimEnd")?.value || preview.duration);

    if (preview.paused) {
        if (
            preview.currentTime < start ||
            preview.currentTime >= end
        ) {
            preview.currentTime = start;
        }

        try {
            await preview.play();
        } catch {
            showToast("Preview playback was blocked.");
        }

    } else {
        preview.pause();
    }
});


listen("reelPreview", "play", () => {
    if ($("editorPreviewPlay")) {
        $("editorPreviewPlay").textContent = "Ⅱ";
    }
});

listen("reelPreview", "pause", () => {
    if ($("editorPreviewPlay")) {
        $("editorPreviewPlay").textContent = "▶";
    }
});
/* ============================================================
   PART 6 — VIDEO EDITOR, MUSIC AND UPLOAD SYSTEM
   ============================================================ */


/* ============================================================
   19 — MUSIC FILE SELECTION
   ============================================================ */

listen("musicFile", "change", function() {
    const file = this.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("audio/")) {
        showToast("Choose an audio file.");
        this.value = "";
        return;
    }

    if (editorMusicObjectURL) {
        URL.revokeObjectURL(editorMusicObjectURL);
    }

    editorMusicObjectURL = URL.createObjectURL(file);
    editorMusicBuffer = null;

    if ($("musicFileName")) {
        $("musicFileName").textContent =
            file.name + " • " +
            (file.size / (1024 * 1024)).toFixed(2) +
            " MB";
    }

    showToast("Music selected!");
});


listen("removeMusicBtn", "click", function() {
    editorMusicBuffer = null;

    if (editorMusicObjectURL) {
        URL.revokeObjectURL(editorMusicObjectURL);
    }

    editorMusicObjectURL = null;

    if ($("musicFile")) $("musicFile").value = "";

    if ($("musicFileName")) {
        $("musicFileName").textContent = "";
    }

    showToast("Background music removed.");
});


async function loadEditorMusic() {
    const file = $("musicFile")?.files?.[0];

    if (!file) return null;

    if (!editorAudioContext) {
        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) return null;

        editorAudioContext = new AudioContextClass();
    }

    if (editorAudioContext.state === "suspended") {
        await editorAudioContext.resume();
    }

    const bytes = await file.arrayBuffer();

    editorMusicBuffer =
        await editorAudioContext.decodeAudioData(bytes);

    return editorMusicBuffer;
}


/* ============================================================
   20 — CANVAS TEXT WRAPPING
   ============================================================ */

function drawWrappedText(
    context,
    text,
    x,
    y,
    maxWidth,
    lineHeight
) {
    const words = String(text || "").split(/\s+/);

    let line = "";
    let currentY = y;

    words.forEach(word => {
        const testLine = line
            ? line + " " + word
            : word;

        const textWidth =
            context.measureText(testLine).width;

        if (textWidth > maxWidth && line) {
            context.strokeText(line, x, currentY);
            context.fillText(line, x, currentY);

            line = word;
            currentY += lineHeight;

        } else {
            line = testLine;
        }
    });

    if (line) {
        context.strokeText(line, x, currentY);
        context.fillText(line, x, currentY);
    }
}


/* ============================================================
   21 — DRAW EDITED VIDEO FRAME
   ============================================================ */

function drawEditedFrame(
    context,
    preview,
    width,
    height
) {
    const sourceWidth = preview.videoWidth;
    const sourceHeight = preview.videoHeight;

    if (!sourceWidth || !sourceHeight) return;

    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);

    const framing = $("reelFraming")?.value || "cover";

    const scale = framing === "contain"
        ? Math.min(
            width / sourceWidth,
            height / sourceHeight
        )
        : Math.max(
            width / sourceWidth,
            height / sourceHeight
        );

    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;

    const rotation =
        Number($("reelRotation")?.value || 0) *
        Math.PI / 180;

    const cssFilter = [
        getEditorFilter(),

        `brightness(${Number($("reelBrightness")?.value || 100) / 100})`,

        `contrast(${Number($("reelContrast")?.value || 100) / 100})`,

        `saturate(${Number($("reelSaturation")?.value || 100) / 100})`,

        `blur(${Number($("reelBlur")?.value || 0)}px)`
    ].filter(Boolean).join(" ");

    context.save();

    context.translate(width / 2, height / 2);
    context.rotate(rotation);

    context.filter = cssFilter;

    context.drawImage(
        preview,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
    );

    context.restore();

    context.filter = "none";

    const mainText =
        $("reelOverlayText")?.value.trim() || "";

    const secondText =
        $("reelOverlayTextTwo")?.value.trim() || "";

    const sticker =
        $("reelSticker")?.value || "";

    const textColor =
        $("reelTextColor")?.value || "#ffffff";

    const textSize =
        Number($("reelTextSize")?.value || 32);

    const position =
        $("reelTextPosition")?.value || "bottom";

    let textY = height * 0.82;

    if (position === "top") {
        textY = height * 0.15;
    }

    if (position === "middle") {
        textY = height * 0.5;
    }

    const ratio = width / 720;

    context.save();

    context.textAlign = "center";
    context.textBaseline = "middle";

    if (sticker) {
        context.font = `${64 * ratio}px Arial`;
        context.fillStyle = "#fff";

        context.fillText(
            sticker,
            width / 2,
            textY - 90 * ratio
        );
    }

    if (mainText) {
        context.font =
            `900 ${Math.round(textSize * ratio)}px Arial`;

        context.fillStyle = textColor;
        context.strokeStyle = "rgba(0,0,0,.85)";
        context.lineWidth = Math.max(3, width / 180);

        drawWrappedText(
            context,
            mainText,
            width / 2,
            textY,
            width * 0.82,
            textSize * 1.25 * ratio
        );
    }

    if (secondText) {
        context.font = `600 ${19 * ratio}px Arial`;

        context.fillStyle = "#fff";
        context.strokeStyle = "rgba(0,0,0,.85)";
        context.lineWidth = Math.max(2, width / 260);

        drawWrappedText(
            context,
            secondText,
            width / 2,
            textY + textSize * 1.8 * ratio,
            width * 0.82,
            25 * ratio
        );
    }

    context.restore();
}


/* ============================================================
   22 — BUILD EDITOR AUDIO MIX
   ============================================================ */

async function buildEditorAudioMix(
    preview,
    canvasStream
) {
    const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

    if (!AudioContextClass) {
        const fallback = preview.captureStream();

        fallback.getAudioTracks().forEach(track => {
            canvasStream.addTrack(track);
        });

        return {
            cleanup: () => {
                fallback.getTracks().forEach(track => {
                    track.stop();
                });
            }
        };
    }

    if (!editorAudioContext) {
        editorAudioContext = new AudioContextClass();
    }

    if (editorAudioContext.state === "suspended") {
        await editorAudioContext.resume();
    }

    const destination =
        editorAudioContext.createMediaStreamDestination();

    if (!editorVideoSource) {
        editorVideoSource =
            editorAudioContext.createMediaElementSource(preview);

        editorVideoGain =
            editorAudioContext.createGain();

        editorVideoSource.connect(editorVideoGain);

        editorVideoGain.connect(
            editorAudioContext.destination
        );
    }

    editorVideoGain.gain.value =
        Number($("reelVolume")?.value ?? 100) / 100;

    editorVideoGain.connect(destination);

    let musicSource = null;

    const musicFile = $("musicFile")?.files?.[0];

    if (musicFile) {
        const buffer = await loadEditorMusic();

        if (buffer) {
            const musicGain =
                editorAudioContext.createGain();

            musicSource =
                editorAudioContext.createBufferSource();

            musicSource.buffer = buffer;
            musicSource.loop = true;

            musicGain.gain.value =
                Number($("musicVolume")?.value ?? 30) / 100;

            musicSource.connect(musicGain);
            musicGain.connect(destination);

            const fadeIn =
                Number($("musicFadeIn")?.value || 0);

            if (fadeIn > 0) {
                musicGain.gain.setValueAtTime(
                    0,
                    editorAudioContext.currentTime
                );

                musicGain.gain.linearRampToValueAtTime(
                    Number($("musicVolume")?.value ?? 30) / 100,
                    editorAudioContext.currentTime + fadeIn
                );
            }

            musicSource.start(0);
        }
    }

    destination.stream.getAudioTracks().forEach(track => {
        canvasStream.addTrack(track);
    });

    return {
        cleanup: () => {
            try {
                musicSource?.stop();
            } catch {}

            try {
                editorVideoGain.disconnect(destination);
            } catch {}

            destination.stream.getTracks().forEach(track => {
                track.stop();
            });
        }
    };
}


/* ============================================================
   23 — EXPORT EDITED SHORT
   ============================================================ */

listen("exportReelBtn", "click", async function() {
    const button = this;
    const preview = $("reelPreview");

    if (!selectedVideoFile || !preview) {
        showToast("Choose a video first.");
        return;
    }

    if (
        !window.MediaRecorder ||
        !HTMLCanvasElement.prototype.captureStream
    ) {
        showToast(
            "Your browser does not support video export. You can still upload the original."
        );

        return;
    }

    const start = Math.max(
        0,
        Number($("trimStart")?.value || 0)
    );

    const end = Math.min(
        preview.duration,
        Number($("trimEnd")?.value || preview.duration)
    );

    if (!Number.isFinite(end) || end <= start) {
        showToast("Choose a valid trim range.");
        return;
    }

    const resolution =
        Number($("reelResolution")?.value || 720);

    const square =
        $("reelFraming")?.value === "square";

    const width = resolution;

    const height = square
        ? resolution
        : Math.round(resolution * 16 / 9);

    const fps =
        Number($("reelFrameRate")?.value || 30);

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
        alpha: false
    });

    if (!context) {
        showToast("Could not create video canvas.");
        return;
    }

    const canvasStream = canvas.captureStream(fps);

    const mimeTypes = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
    ];

    const mimeType = mimeTypes.find(type =>
        MediaRecorder.isTypeSupported(type)
    );

    if (!mimeType) {
        showToast("No supported export format found.");

        canvasStream.getTracks().forEach(track => {
            track.stop();
        });

        return;
    }

    button.disabled = true;
    button.textContent = "Exporting...";

    if ($("editorStatus")) {
        $("editorStatus").textContent =
            "Preparing video and audio...";
    }

    let audioMix = null;
    let animationId = null;
    let finished = false;
    let recorder = null;

    const chunks = [];

    try {
        preview.pause();

        await new Promise((resolve, reject) => {
            const onSeeked = () => {
                cleanup();
                resolve();
            };

            const onError = () => {
                cleanup();
                reject(new Error("Could not seek to trim start."));
            };

            const cleanup = () => {
                preview.removeEventListener("seeked", onSeeked);
                preview.removeEventListener("error", onError);
            };

            if (Math.abs(preview.currentTime - start) < 0.05) {
                resolve();
                return;
            }

            preview.addEventListener("seeked", onSeeked, {
                once: true
            });

            preview.addEventListener("error", onError, {
                once: true
            });

            preview.currentTime = start;
        });

        audioMix = await buildEditorAudioMix(
            preview,
            canvasStream
        );

        recorder = new MediaRecorder(canvasStream, {
            mimeType
        });

        recorder.ondataavailable = event => {
            if (event.data?.size) {
                chunks.push(event.data);
            }
        };

        const exportFinished = new Promise((resolve, reject) => {
            recorder.onstop = resolve;

            recorder.onerror = event => {
                reject(event.error || new Error("Export failed."));
            };
        });

        preview.playbackRate =
            Number($("reelSpeed")?.value || 1);

        function stopExport() {
            if (finished) return;

            finished = true;
            preview.pause();

            if (recorder?.state !== "inactive") {
                recorder.stop();
            }
        }

        function drawLoop() {
            if (finished) return;

            drawEditedFrame(
                context,
                preview,
                width,
                height
            );

            if (
                preview.currentTime >= end ||
                preview.ended
            ) {
                stopExport();
                return;
            }

            animationId = requestAnimationFrame(drawLoop);
        }

        recorder.start(1000);

        await preview.play();

        if ($("editorStatus")) {
            $("editorStatus").textContent =
                `Exporting ${resolution}p at ${fps} FPS...`;
        }

        drawLoop();

        await exportFinished;

        if (!chunks.length) {
            throw new Error("The exported video is empty.");
        }

        const blob = new Blob(chunks, {
            type: mimeType
        });

        if (!blob.size) {
            throw new Error("The exported video is empty.");
        }

        exportedReelFile = new File(
            [blob],
            "gocat-short.webm",
            {
                type: mimeType,
                lastModified: Date.now()
            }
        );

        if ($("selectedVideoName")) {
            $("selectedVideoName").textContent =
                exportedReelFile.name + " • " +
                (blob.size / (1024 * 1024)).toFixed(2) +
                " MB";
        }

        if ($("editorStatus")) {
            $("editorStatus").textContent =
                blob.size > MAX_VIDEO_BYTES
                    ? "Export finished, but it exceeds the 50 MB upload limit. Choose a lower resolution or frame rate."
                    : "Your edited Short is ready!";
        }

        hideModal("editorModal");

        if (blob.size > MAX_VIDEO_BYTES) {
            showToast("Export exceeds 50 MB. Reduce export quality.");
        } else {
            showToast("Short exported successfully!");
        }

    } catch (error) {
        console.error("Export error:", error);

        if ($("editorStatus")) {
            $("editorStatus").textContent =
                "Export failed: " + error.message;
        }

        showToast("Export failed: " + error.message);

    } finally {
        finished = true;

        if (animationId) {
            cancelAnimationFrame(animationId);
        }

        preview.pause();

        audioMix?.cleanup();

        canvasStream.getTracks().forEach(track => {
            track.stop();
        });

        button.disabled = false;
        button.textContent = "Export edited Short";
    }
});


/* ============================================================
   24 — CLOSE EDITOR
   ============================================================ */

function closeEditor() {
    $("reelPreview")?.pause();
    hideModal("editorModal");
}

listen("editorCloseBtn", "click", closeEditor);


/* ============================================================
   25 — LOAD TUS RESUMABLE UPLOAD LIBRARY
   ============================================================ */

function loadTusLibrary() {
    if (window.tus?.Upload) {
        return Promise.resolve(true);
    }

    if (!tusLibraryPromise) {
        tusLibraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");

            script.src =
                "https://unpkg.com/tus-js-client@4.3.1/dist/tus.min.js";

            script.onload = () => {
                if (window.tus?.Upload) {
                    resolve(true);
                } else {
                    reject(
                        new Error("TUS library is unavailable.")
                    );
                }
            };

            script.onerror = () => {
                reject(
                    new Error("Could not load upload library. Check internet.")
                );
            };

            document.head.appendChild(script);
        }).catch(error => {
            tusLibraryPromise = null;
            throw error;
        });
    }

    return tusLibraryPromise;
}


/* ============================================================
   26 — ACTUAL SUPABASE VIDEO UPLOAD
   TUS RESUMABLE UPLOAD WITH PROGRESS
   ============================================================ */

async function uploadVideoFile(
    file,
    path,
    progressCallback
) {
    if (!db) {
        throw new Error("Supabase is not connected.");
    }

    if (!file || !file.size) {
        throw new Error("Invalid video file.");
    }

    if (file.size > MAX_VIDEO_BYTES) {
        throw new Error("Maximum video size is 50 MB.");
    }

    const sessionResult = await db.auth.getSession();

    if (sessionResult.error) {
        throw sessionResult.error;
    }

    const session = sessionResult.data.session;

    if (!session?.access_token) {
        throw new Error("Your session expired. Sign in again.");
    }

    progressCallback(0);

    try {
        await loadTusLibrary();
    } catch (error) {
        console.warn(
            "TUS library unavailable; trying normal upload:",
            error.message
        );

        const fallback = await db.storage
            .from(VIDEO_BUCKET)
            .upload(path, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type || "video/mp4"
            });

        if (fallback.error) {
            throw fallback.error;
        }

        progressCallback(100);

        return fallback.data;
    }

    const projectId = new URL(SUPABASE_URL)
        .hostname.split(".")[0];

    const endpoint =
        `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

    return new Promise((resolve, reject) => {
        const upload = new window.tus.Upload(file, {

            endpoint: endpoint,

            retryDelays: [
                0,
                3000,
                5000,
                10000,
                20000
            ],

            headers: {
                authorization: "Bearer " + session.access_token,
                apikey: SUPABASE_KEY
            },

            uploadDataDuringCreation: true,

            removeFingerprintOnSuccess: true,

            chunkSize: 6 * 1024 * 1024,

            metadata: {
                bucketName: VIDEO_BUCKET,
                objectName: path,
                contentType: file.type || "video/mp4",
                cacheControl: "3600"
            },

            onError: function(error) {
                console.error("TUS upload error:", error);
                reject(error);
            },

            onProgress: function(bytesUploaded, bytesTotal) {
                const percent = Math.round(
                    (bytesUploaded / bytesTotal) * 100
                );

                progressCallback(
                    Math.max(0, Math.min(99, percent))
                );
            },

            onSuccess: function() {
                progressCallback(100);

                resolve({
                    path,
                    uploadURL: upload.url
                });
            }
        });

        upload.start();
    });
}


/* ============================================================
   27 — PUBLISH VIDEO OR SHORT
   ============================================================ */

listen("uploadForm", "submit", async function(event) {
    event.preventDefault();

    const file = exportedReelFile || selectedVideoFile;

    if (!file) {
        showToast("Select a video first.");
        return;
    }

    if (file.size > MAX_VIDEO_BYTES) {
        showToast("Your video must be smaller than 50 MB.");
        return;
    }

    if (!currentUser) {
        showToast("Please sign in before uploading.");
        return;
    }

    const title = $("videoTitle")?.value.trim() || "";
    const description =
        $("videoDescription")?.value.trim() || "";

    const topic = $("videoTopic")?.value || "Other";

    if (!title) {
        showToast("Add a video title.");
        return;
    }

    const button = $("publishVideoBtn");

    if (!button) {
        showToast("Publish button was not found.");
        return;
    }

    button.disabled = true;
    button.textContent = "Uploading...";

    $("uploadProgress")?.classList.remove("hidden");

    if ($("uploadProgressBar")) {
        $("uploadProgressBar").style.width = "0%";
    }

    if ($("uploadStatus")) {
        $("uploadStatus").textContent = "Preparing upload...";
    }

    let uploaded = false;

    const extension = (
        file.name.split(".").pop() || "mp4"
    )
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "mp4";

    const path =
        currentUser.id + "/" +
        Date.now() + "-" +
        Math.random().toString(36).slice(2, 10) +
        "." + extension;

    currentUploadPath = path;

    try {
        // STEP 1 — UPLOAD ACTUAL VIDEO

        await uploadVideoFile(
            file,
            path,
            function(percent) {
                if ($("uploadProgressBar")) {
                    $("uploadProgressBar").style.width =
                        percent + "%";
                }

                if ($("uploadStatus")) {
                    $("uploadStatus").textContent =
                        "Uploading video: " + percent + "%";
                }
            }
        );

        uploaded = true;

        // STEP 2 — INSERT VIDEO DATABASE RECORD

        if ($("uploadStatus")) {
            $("uploadStatus").textContent =
                "Saving video information...";
        }

        const insert = await db
            .from("videos")
            .insert({
                id: crypto.randomUUID(),
                owner_id: currentUser.id,
                title,
                description,
                topic,
                storage_path: path,
                views: 0,
                is_short: uploadMode === "short"
            });

        if (insert.error) {
            throw insert.error;
        }

        // STEP 3 — REFRESH GO CAT

        await loadVideos();

        homeVisibleCycles = 1;
        reelsVisible = Math.max(reelsVisible, PAGE_SIZE);

        renderEverything();

        if ($("uploadProgressBar")) {
            $("uploadProgressBar").style.width = "100%";
        }

        if ($("uploadStatus")) {
            $("uploadStatus").textContent =
                "Published successfully!";
        }

        const publishedMode = uploadMode;

        currentUploadPath = null;

        hideModal("uploadModal");

        resetUploadForm();

        showToast(
            publishedMode === "short"
                ? "Your Short has been published!"
                : "Your video has been published!"
        );

    } catch (error) {
        console.error("VIDEO UPLOAD ERROR:", error);

        if (uploaded && currentUploadPath) {
            const removal = await db.storage
                .from(VIDEO_BUCKET)
                .remove([currentUploadPath]);

            if (removal.error) {
                console.error(
                    "Could not remove failed upload:",
                    removal.error
                );
            }
        }

        const message =
            error?.message ||
            error?.error_description ||
            "Unknown upload error.";

        if ($("uploadStatus")) {
            $("uploadStatus").textContent = message;
        }

        showToast("Upload failed: " + message);

    } finally {
        currentUploadPath = null;

        button.disabled = false;

        button.textContent =
            uploadMode === "short"
                ? "Publish Short"
                : "Publish video";
    }
});
/* ============================================================
   PART 7 — POSTS, PROFILES AND CREATOR STUDIO
   ============================================================ */


/* ============================================================
   28 — CREATE COMMUNITY POSTS
   ============================================================ */

listen("postImage", "change", function() {
    if ($("postImageName")) {
        $("postImageName").textContent =
            this.files?.[0]?.name || "";
    }
});


listen("createPostForm", "submit", async function(event) {
    event.preventDefault();

    const content = $("postContent")?.value.trim() || "";
    const imageFile = $("postImage")?.files?.[0];

    if (!content && !imageFile) {
        showToast("Write something or select an image.");
        return;
    }

    if (
        imageFile &&
        !imageFile.type.startsWith("image/")
    ) {
        showToast("Please select an image.");
        return;
    }

    const button = this.querySelector('button[type="submit"]');

    if (button) {
        button.disabled = true;
        button.textContent = "Publishing...";
    }

    let storagePath = null;

    try {
        if (imageFile) {
            const safeName = imageFile.name.replace(
                /[^a-zA-Z0-9._-]/g,
                "_"
            );

            storagePath =
                currentUser.id + "/" +
                Date.now() + "-" + safeName;

            const upload = await db.storage
                .from(POST_BUCKET)
                .upload(storagePath, imageFile, {
                    upsert: false,
                    contentType: imageFile.type
                });

            if (upload.error) {
                throw upload.error;
            }
        }

        const result = await db
            .from("posts")
            .insert({
                user_id: currentUser.id,
                content: content,
                media_path: storagePath
            });

        if (result.error) {
            throw result.error;
        }

        $("postContent").value = "";
        $("postImage").value = "";

        if ($("postImageName")) {
            $("postImageName").textContent = "";
        }

        await loadPosts();

        renderPosts();
        renderHomeFeed();
        renderExplore();
        renderProfile();

        showToast("Post published!");

    } catch (error) {
        console.error("Post error:", error);

        if (storagePath) {
            const removal = await db.storage
                .from(POST_BUCKET)
                .remove([storagePath]);

            if (removal.error) {
                console.warn("Post cleanup:", removal.error);
            }
        }

        showToast("Post failed: " + error.message);

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Publish post";
        }
    }
});


/* ============================================================
   29 — POST LIKES
   ============================================================ */

async function togglePostLike(postId) {
    const post = posts.find(item =>
        String(item.id) === String(postId)
    );

    if (!post) return;

    post.likes = post.likes || [];

    const liked = post.likes.includes(
        String(currentUser.id)
    );

    try {
        const result = liked
            ? await db
                .from("post_likes")
                .delete()
                .eq("post_id", postId)
                .eq("user_id", currentUser.id)

            : await db
                .from("post_likes")
                .insert({
                    post_id: postId,
                    user_id: currentUser.id
                });

        if (result.error) {
            throw result.error;
        }

        post.likes = liked
            ? post.likes.filter(id =>
                id !== String(currentUser.id)
              )
            : [...post.likes, String(currentUser.id)];

        renderPosts();
        renderHomeFeed();
        renderExplore();
        renderProfile();

    } catch (error) {
        showToast("Post like failed: " + error.message);
    }
}


/* ============================================================
   30 — DELETE POSTS
   Owner and admin UI permission.
   ============================================================ */

async function deletePost(postId) {
    const post = posts.find(item =>
        String(item.id) === String(postId)
    );

    if (!post || !canManageContent(post.user_id)) {
        return;
    }

    if (!confirm("Delete this post permanently?")) {
        return;
    }

    try {
        const result = await db
            .from("posts")
            .delete()
            .eq("id", postId);

        if (result.error) {
            throw result.error;
        }

        if (post.media_path) {
            const removal = await db.storage
                .from(POST_BUCKET)
                .remove([post.media_path]);

            if (removal.error) {
                console.warn("Media cleanup:", removal.error);
            }
        }

        await loadPosts();

        renderEverything();

        showToast("Post deleted.");

    } catch (error) {
        showToast("Delete failed: " + error.message);
    }
}


/* ============================================================
   31 — POSTS PAGE
   ============================================================ */

function renderPosts() {
    const container = $("postsFeed");

    if (!container) return;

    const page = posts.slice(0, postsVisible);

    container.innerHTML =
        page.map(postCard).join("");

    $("postsLoadMoreWrap")?.classList.toggle(
        "hidden",
        postsVisible >= posts.length
    );
}


listen("postsLoadMore", "click", function() {
    postsVisible += PAGE_SIZE;
    renderPosts();
});


/* ============================================================
   32 — PROFILE PAGE
   ============================================================ */

function openOtherProfile(userId) {
    currentProfileUserId = userId;
    profileMode = "home";

    openPage("profile");
}


function renderProfile() {
    const profileId =
        currentProfileUserId || currentUser.id;

    const profile =
        getUser(profileId) ||
        (
            String(currentProfile?.id) === String(profileId)
                ? currentProfile
                : null
        );

    if (!profile) return;

    const own = isOwnContent(profileId);

    if ($("profileUsername")) {
        $("profileUsername").textContent =
            profile.username || "Creator";
    }

    if ($("profileEmail")) {
        $("profileEmail").textContent =
            own ? currentUser.email : "";
    }

    if ($("profileBio")) {
        $("profileBio").textContent =
            profile.bio || "Welcome to GoCat.";
    }

    if ($("profileAvatar")) {
        $("profileAvatar").textContent =
            getInitial(profile.username);
    }

    if ($("profileActionBtn")) {
        $("profileActionBtn").textContent =
            own
                ? "Edit channel"
                : isFollowing(profileId)
                    ? "Following"
                    : "+ Follow";

        $("profileActionBtn").onclick = function() {

            if (own) {
                $("editUsername").value =
                    profile.username || "";

                $("editBio").value =
                    profile.bio || "";

                showModal("editProfileModal");

            } else {
                toggleFollow(profileId);
            }
        };
    }

    const myVideos = videos.filter(video =>
        String(video.owner_id) === String(profileId)
    );

    const regularVideos = myVideos.filter(video =>
        !isShort(video)
    );

    const myReels = myVideos.filter(video =>
        isShort(video)
    );

    const myPosts = posts.filter(post =>
        String(post.user_id) === String(profileId)
    );

    const followers = follows.filter(item =>
        String(item.following_id) === String(profileId)
    ).length;

    const following = follows.filter(item =>
        String(item.follower_id) === String(profileId)
    ).length;

    if ($("profileVideoCount")) {
        $("profileVideoCount").textContent =
            regularVideos.length;
    }

    if ($("profileShortCount")) {
        $("profileShortCount").textContent =
            myReels.length;
    }

    if ($("profileFollowerCount")) {
        $("profileFollowerCount").textContent =
            followers;
    }

    if ($("profileFollowingCount")) {
        $("profileFollowingCount").textContent =
            following;
    }

    if ($("profilePostCount")) {
        $("profilePostCount").textContent =
            myPosts.length;
    }

    if ($("profileHome")) {
        $("profileHome").innerHTML = `

            <div class="section-heading">
                <div>
                    <h2>Latest videos</h2>
                </div>
            </div>

            <div class="video-grid">
                ${regularVideos.slice(0, 3).map(videoCard).join("")}
            </div>

            <div class="section-heading">
                <div>
                    <h2>Latest Shorts</h2>
                </div>
            </div>

            <div class="video-grid">
                ${myReels.slice(0, 3).map(videoCard).join("")}
            </div>

            <div class="section-heading">
                <div>
                    <h2>Community posts</h2>
                </div>
            </div>

            <div class="posts-feed">
                ${myPosts.slice(0, 3).map(postCard).join("")}
            </div>
        `;
    }

    if ($("profileReels")) {
        $("profileReels").innerHTML =
            myReels.map(videoCard).join("");
    }

    if ($("profileVideos")) {
        $("profileVideos").innerHTML =
            regularVideos.map(videoCard).join("");
    }

    if ($("profilePosts")) {
        $("profilePosts").innerHTML =
            myPosts.map(postCard).join("");
    }

    renderProfileTab(profileMode);
}


/* ============================================================
   33 — PROFILE TABS
   ============================================================ */

function renderProfileTab(tab) {
    profileMode = tab;

    document.querySelectorAll("[data-profile-tab]")
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.profileTab === tab
            );
        });

    const panels = {
        home: "profileHome",
        reels: "profileReels",
        videos: "profileVideos",
        posts: "profilePosts"
    };

    Object.entries(panels).forEach(([name, id]) => {
        $(id)?.classList.toggle(
            "hidden",
            name !== tab
        );
    });
}


document.querySelectorAll("[data-profile-tab]")
    .forEach(button => {
        button.addEventListener("click", function() {
            renderProfileTab(this.dataset.profileTab);
        });
    });


/* ============================================================
   34 — EDIT PROFILE
   ============================================================ */

listen("editProfileForm", "submit", async function(event) {
    event.preventDefault();

    const username =
        $("editUsername")?.value.trim() || "";

    const bio =
        $("editBio")?.value.trim() || "";

    if (username.length < 3) {
        showToast("Username must have at least 3 characters.");
        return;
    }

    try {
        const result = await db
            .from("users")
            .update({
                username,
                bio
            })
            .eq("id", currentUser.id)
            .select("*")
            .single();

        if (result.error) {
            throw result.error;
        }

        currentProfile = result.data;

        await loadAllData();

        currentProfileUserId = currentUser.id;

        renderEverything();
        updateUserInterface();

        hideModal("editProfileModal");

        showToast("Channel updated!");

    } catch (error) {
        showToast("Profile update failed: " + error.message);
    }
});


/* ============================================================
   35 — CREATOR STUDIO
   ============================================================ */

function renderStudio() {
    const mine = isGoCatAdmin
        ? videos
        : videos.filter(video =>
            isOwnContent(video.owner_id)
        );

    const totalViews = mine.reduce(
        (sum, video) =>
            sum + Number(video.views || 0),
        0
    );

    const totalLikes = mine.reduce(
        (sum, video) =>
            sum + (video.likes?.length || 0),
        0
    );

    const followers = follows.filter(item =>
        String(item.following_id) === String(currentUser.id)
    ).length;

    if ($("studioVideos")) {
        $("studioVideos").textContent = mine.length;
    }

    if ($("studioViews")) {
        $("studioViews").textContent =
            totalViews.toLocaleString();
    }

    if ($("studioLikes")) {
        $("studioLikes").textContent =
            totalLikes.toLocaleString();
    }

    if ($("studioFollowers")) {
        $("studioFollowers").textContent =
            followers.toLocaleString();
    }

    const container = $("studioContent");

    if (!container) return;

    container.innerHTML = mine.length
        ? mine.map(video => `
            <div class="studio-content-item">

                <div class="studio-content-thumb">
                    <video
                        src="${escapeHTML(getVideoURL(video.storage_path))}"
                        muted
                        preload="metadata">
                    </video>
                </div>

                <div class="studio-content-details">

                    <strong>${escapeHTML(video.title)}</strong>

                    <small>
                        ${isShort(video) ? "Short" : "Video"}
                        · ${Number(video.views || 0)} views
                        · ${video.likes?.length || 0} likes
                    </small>

                    <small>
                        Uploaded by ${escapeHTML(getUsername(video.owner_id))}
                    </small>

                    <small>
                        Published ${formatDate(video.created_at)}
                    </small>

                </div>

                <div class="studio-content-actions">

                    <button
                        class="soft-btn"
                        data-studio-watch="${escapeHTML(video.id)}">
                        View
                    </button>

                    <button
                        class="danger-outline-btn"
                        data-delete-video="${escapeHTML(video.id)}">
                        Delete
                    </button>

                </div>

            </div>
        `).join("")
        : `
            <div class="empty-card">
                <h3>No uploads yet</h3>
                <p>Your published videos will appear here.</p>

                <button
                    class="primary-btn"
                    data-open-upload="video">
                    Upload video
                </button>
            </div>
        `;
}
/* ============================================================
   36 — WATCH HISTORY
   ============================================================ */

function getHistoryKey() {
    return "gocat_watch_history_" + currentUser.id;
}


function getWatchHistory() {
    const saved = safeJSON(getHistoryKey(), []);

    return Array.isArray(saved) ? saved : [];
}


function saveWatchHistory(history) {
    localStorage.setItem(
        getHistoryKey(),
        JSON.stringify(history.slice(0, 300))
    );
}


function addToWatchHistory(videoId) {
    if (!settings.history) return;

    let history = getWatchHistory();

    history = history.filter(item =>
        String(item.id) !== String(videoId)
    );

    history.unshift({
        id: String(videoId),
        watched_at: new Date().toISOString()
    });

    saveWatchHistory(history);

    renderHistory();
}


function renderHistory() {
    const history = getWatchHistory();

    const items = history
        .map(entry => {
            const video = videos.find(item =>
                String(item.id) === String(entry.id)
            );

            if (!video) return null;

            return {
                video,
                watched_at: entry.watched_at
            };
        })
        .filter(Boolean);

    $("historyEmpty")?.classList.toggle(
        "hidden",
        items.length > 0
    );

    const container = $("historyFeed");

    if (!container) return;

    container.innerHTML = items.map(item => {
        const video = item.video;

        return `
            <article class="history-item">

                <div class="history-thumb">
                    <video
                        src="${escapeHTML(getVideoURL(video.storage_path))}"
                        muted
                        preload="metadata">
                    </video>
                </div>

                <div class="history-details">
                    <h3>${escapeHTML(video.title)}</h3>

                    <p>
                        ${escapeHTML(getUsername(video.owner_id))}
                    </p>

                    <p>
                        ${formatDate(item.watched_at)}
                        · ${isShort(video) ? "Short" : "Video"}
                    </p>
                </div>

                <button
                    data-remove-history="${escapeHTML(video.id)}">
                    Remove
                </button>

            </article>
        `;
    }).join("");
}


function removeHistoryItem(videoId) {
    const history = getWatchHistory().filter(item =>
        String(item.id) !== String(videoId)
    );

    saveWatchHistory(history);

    renderHistory();
}


function clearHistory() {
    if (!confirm("Clear all watch history on this device?")) {
        return;
    }

    saveWatchHistory([]);

    renderHistory();

    showToast("Watch history cleared.");
}


listen("clearHistoryBtn", "click", clearHistory);
listen("settingsClearHistory", "click", clearHistory);


/* ============================================================
   37 — VIDEO VIEW TRACKING
   ============================================================ */

async function registerVideoView(videoId) {
    if (!currentUser) return;

    const key =
        "gocat_viewed_v2_" + currentUser.id;

    const viewed = safeJSON(key, []);

    if (viewed.includes(String(videoId))) {
        return;
    }

    viewed.push(String(videoId));

    localStorage.setItem(
        key,
        JSON.stringify(viewed.slice(-300))
    );

    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video) return;

    const nextViews =
        Number(video.views || 0) + 1;

    video.views = nextViews;

    const result = await db
        .from("videos")
        .update({
            views: nextViews
        })
        .eq("id", videoId);

    if (result.error) {
        console.warn("View tracking:", result.error);
    }
}


document.addEventListener("play", function(event) {
    const element = event.target;

    if (!(element instanceof HTMLVideoElement)) return;

    const videoId = element.dataset.playVideo;

    if (!videoId || !currentUser) return;

    addToWatchHistory(videoId);

    registerVideoView(videoId);

}, true);


/* ============================================================
   38 — MUTUAL FRIENDS
   ============================================================ */

function getMutualFriends() {
    const followingIds = follows
        .filter(item =>
            String(item.follower_id) === String(currentUser.id)
        )
        .map(item => String(item.following_id));

    const followerIds = follows
        .filter(item =>
            String(item.following_id) === String(currentUser.id)
        )
        .map(item => String(item.follower_id));

    return users.filter(user =>
        !isOwnContent(user.id) &&
        followingIds.includes(String(user.id)) &&
        followerIds.includes(String(user.id))
    );
}


function renderChatFriends() {
    const friends = getMutualFriends();
    const container = $("chatFriends");

    if (!container) return;

    container.innerHTML = friends.length
        ? friends.map(user => `
            <button
                class="chat-friend ${
                    String(currentChatUserId) === String(user.id)
                        ? "active"
                        : ""
                }"
                data-chat-user="${escapeHTML(user.id)}">

                <span class="chat-friend-avatar">
                    ${escapeHTML(getInitial(user.username))}
                </span>

                ${escapeHTML(user.username)}

            </button>
        `).join("")
        : "<p class='muted-text'>No mutual follows yet.</p>";
}


/* ============================================================
   39 — OPEN CHAT
   ============================================================ */

async function openChat(userId) {
    const allowed = getMutualFriends().some(user =>
        String(user.id) === String(userId)
    );

    if (!allowed) {
        showToast("Chat is available to mutual followers.");
        return;
    }

    currentChatUserId = userId;

    if ($("chatTitle")) {
        $("chatTitle").textContent =
            getUsername(userId);
    }

    if ($("messageInput")) {
        $("messageInput").disabled = false;
    }

    if ($("sendMessageBtn")) {
        $("sendMessageBtn").disabled = false;
    }

    renderChatFriends();

    await loadMessages();
}


/* ============================================================
   40 — LOAD MESSAGES
   ============================================================ */

async function loadMessages() {
    if (!currentChatUserId) return;

    const filter =
        "and(sender_id.eq." + currentUser.id +
        ",recipient_id.eq." + currentChatUserId +
        "),and(sender_id.eq." + currentChatUserId +
        ",recipient_id.eq." + currentUser.id + ")";

    const result = await db
        .from("messages")
        .select("*")
        .or(filter)
        .order("created_at", { ascending: true });

    if (result.error) {
        console.error(result.error);

        if ($("chatMessages")) {
            $("chatMessages").innerHTML =
                "<p class='chat-empty'>Could not load messages. Check your Messages table and permissions.</p>";
        }

        return;
    }

    const messages = result.data || [];
    const container = $("chatMessages");

    if (!container) return;

    container.innerHTML = messages.length
        ? messages.map(message => {
            const mine =
                String(message.sender_id) === String(currentUser.id);

            return `
                <div class="chat-bubble ${mine ? "mine" : ""}">

                    ${escapeHTML(message.content ?? message.text ?? "")}

                    <time>
                        ${formatDate(message.created_at)}
                    </time>

                </div>
            `;
        }).join("")
        : "<p class='chat-empty'>No messages yet. Say hello!</p>";

    container.scrollTop = container.scrollHeight;
}


/* ============================================================
   41 — SEND MESSAGE
   ============================================================ */

listen("chatForm", "submit", async function(event) {
    event.preventDefault();

    const text = $("messageInput")?.value.trim() || "";

    if (!text || !currentChatUserId) return;

    const button = $("sendMessageBtn");

    if (button) button.disabled = true;

    try {
        const result = await db
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                recipient_id: currentChatUserId,
                text
            });

        if (result.error) {
            throw result.error;
        }

        $("messageInput").value = "";

        await loadMessages();

    } catch (error) {
        showToast("Message failed: " + error.message);

    } finally {
        if (button) button.disabled = false;
    }
});


/* ============================================================
   42 — NOTIFICATIONS
   ============================================================ */

function addLocalNotification(icon, text) {
    notifications.unshift({
        id: crypto.randomUUID(),
        icon,
        text,
        created_at: new Date().toISOString()
    });

    notifications = notifications.slice(0, 100);

    localStorage.setItem(
        "gocat_notifications_" + currentUser.id,
        JSON.stringify(notifications)
    );

    renderNotifications();
}


function renderNotifications() {
    const container = $("notificationList");

    if (!container) return;

    if (!notifications.length) {
        container.innerHTML = `
            <div class="empty-card">
                <h3>No notifications yet</h3>
                <p>Your GoCat activity will appear here.</p>
            </div>
        `;

        return;
    }

    container.innerHTML = notifications.map(item => `
        <div class="notification-item">

            <div class="notification-icon">
                ${escapeHTML(item.icon)}
            </div>

            <div>
                <p>${escapeHTML(item.text)}</p>

                <small>
                    ${formatDate(item.created_at)}
                </small>
            </div>

        </div>
    `).join("");
}


listen("clearNotificationsBtn", "click", function() {
    notifications = [];

    localStorage.setItem(
        "gocat_notifications_" + currentUser.id,
        "[]"
    );

    renderNotifications();
});
/* ============================================================
   43 — RENDER EVERYTHING
   ============================================================ */

function renderEverything() {
    renderHomeFeed();
    renderReels();
    renderExplore();
    renderFollowing();
    renderSuggestedCreators();
    renderPosts();
    renderProfile();
    renderNotifications();
    renderChatFriends();
    renderStudio();
    renderHistory();
}


/* ============================================================
   44 — NAVIGATION
   ============================================================ */

const allowedPages = [
    "home",
    "reels",
    "explore",
    "following",
    "history",
    "posts",
    "chats",
    "notifications",
    "studio",
    "profile",
    "settings"
];


function openPage(page) {
    if (!allowedPages.includes(page)) return;
    if (!currentUser) return;

    currentPage = page;

    if (page === "profile" && !currentProfileUserId) {
        currentProfileUserId = currentUser.id;
    }

    document.querySelectorAll(".page-section")
        .forEach(section => {
            section.classList.toggle(
                "hidden",
                section.id !== "page-" + page
            );
        });

    document.querySelectorAll("[data-page]")
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.page === page
            );
        });

    $("sidebar")?.classList.remove("open");

    renderCurrentPage();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function renderCurrentPage() {
    if (currentPage === "home") renderHomeFeed();
    if (currentPage === "reels") renderReels();
    if (currentPage === "explore") renderExplore();
    if (currentPage === "following") renderFollowing();
    if (currentPage === "history") renderHistory();
    if (currentPage === "posts") renderPosts();
    if (currentPage === "chats") renderChatFriends();
    if (currentPage === "notifications") renderNotifications();
    if (currentPage === "studio") renderStudio();
    if (currentPage === "profile") renderProfile();
    if (currentPage === "settings") renderSettings();
}


document.addEventListener("click", function(event) {
    const navigation = event.target.closest("[data-page]");

    if (!navigation || !currentUser) return;

    event.preventDefault();

    const page = navigation.dataset.page;

    if (page === "profile") {
        currentProfileUserId = currentUser.id;
        profileMode = "home";
    }

    openPage(page);
});


/* ============================================================
   45 — PROFILE BUTTON
   ============================================================ */

listen("topProfileBtn", "click", function() {
    if (!currentUser) return;

    currentProfileUserId = currentUser.id;
    profileMode = "home";

    openPage("profile");
});


/* ============================================================
   46 — MOBILE MENU
   ============================================================ */

listen("mobileMenuBtn", "click", function() {
    $("sidebar")?.classList.toggle("open");
});


/* ============================================================
   47 — SEARCH
   ============================================================ */

listen("searchInput", "input", function() {
    const query = this.value.trim();

    $("clearSearch")?.classList.toggle(
        "hidden",
        !query
    );

    homeVisibleCycles = 1;
    exploreVisible = 6;

    if (currentPage === "home") {
        renderHomeFeed();
    }

    if (currentPage === "explore") {
        renderExplore();
    }
});


listen("clearSearch", "click", function() {
    if ($("searchInput")) {
        $("searchInput").value = "";
    }

    this.classList.add("hidden");

    homeVisibleCycles = 1;
    exploreVisible = 6;

    renderHomeFeed();
    renderExplore();
});


/* ============================================================
   48 — THEME
   ============================================================ */

listen("themeBtn", "click", function() {
    settings.theme =
        settings.theme === "dark"
            ? "light"
            : "dark";

    saveSettings();
    applyTheme();
});


/* ============================================================
   49 — SETTINGS
   ============================================================ */

function renderSettings() {
    if ($("settingTheme")) {
        $("settingTheme").value = settings.theme;
    }

    if ($("settingAutoplay")) {
        $("settingAutoplay").checked = settings.autoplay;
    }

    if ($("settingMuted")) {
        $("settingMuted").checked = settings.muted;
    }

    if ($("settingHistory")) {
        $("settingHistory").checked = settings.history;
    }

    if ($("settingsUsername")) {
        $("settingsUsername").textContent =
            currentProfile?.username || "Creator";
    }

    if ($("settingsEmail")) {
        $("settingsEmail").textContent =
            currentUser?.email || "";
    }

    if ($("settingsAvatar")) {
        $("settingsAvatar").textContent =
            getInitial(currentProfile?.username);
    }
}


listen("settingTheme", "change", function() {
    settings.theme = this.value;

    saveSettings();
    applyTheme();
});


listen("settingAutoplay", "change", function() {
    settings.autoplay = this.checked;

    saveSettings();
    renderReels();
});


listen("settingMuted", "change", function() {
    settings.muted = this.checked;

    saveSettings();
    renderReels();
});


listen("settingHistory", "change", function() {
    settings.history = this.checked;

    saveSettings();

    showToast(
        settings.history
            ? "Watch history enabled."
            : "Watch history paused."
    );
});


listen("resetSettingsBtn", "click", function() {
    settings = {
        theme: "dark",
        autoplay: true,
        muted: true,
        history: true
    };

    saveSettings();
    applySettings();
    renderSettings();
    renderReels();

    showToast("Settings restored.");
});


/* ============================================================
   50 — REFRESH FEED
   ============================================================ */

listen("refreshFeedBtn", "click", async function() {
    this.disabled = true;

    try {
        await loadAllData();

        homeVisibleCycles = 1;

        renderEverything();

        showToast("GoCat refreshed.");

    } catch (error) {
        console.error(error);

        showToast("Refresh failed: " + error.message);

    } finally {
        this.disabled = false;
    }
});


/* ============================================================
   51 — MODAL CLOSE BUTTONS
   ============================================================ */

document.querySelectorAll("[data-close]")
    .forEach(button => {
        button.addEventListener("click", function() {
            hideModal(this.dataset.close);
        });
    });


/* ============================================================
   52 — GLOBAL BUTTON ACTIONS
   ============================================================ */

document.addEventListener("click", function(event) {
    const button = event.target.closest("button");

    if (!button || !currentUser) return;

    if (button.dataset.followUser) {
        toggleFollow(button.dataset.followUser);
    }

    if (button.dataset.likeVideo) {
        toggleVideoLike(button.dataset.likeVideo);
    }

    if (button.dataset.commentsVideo) {
        openComments(button.dataset.commentsVideo);
    }

    if (button.dataset.shareVideo) {
        shareVideo(button.dataset.shareVideo);
    }

    if (button.dataset.deleteVideo) {
        deleteVideo(button.dataset.deleteVideo);
    }

    if (button.dataset.profileUser) {
        openOtherProfile(button.dataset.profileUser);
    }

    if (button.dataset.chatUser) {
        openChat(button.dataset.chatUser);
    }

    if (button.dataset.likePost) {
        togglePostLike(button.dataset.likePost);
    }

    if (button.dataset.deletePost) {
        deletePost(button.dataset.deletePost);
    }

    if (button.dataset.openReelId) {
        openSpecificReel(button.dataset.openReelId);
    }

    if (button.hasAttribute("data-create-short")) {
        openUpload("short");
    }

    if (button.dataset.goPage) {
        if (button.dataset.goPage === "profile") {
            currentProfileUserId = currentUser.id;
            profileMode = "home";
        }

        openPage(button.dataset.goPage);
    }

    if (button.dataset.removeHistory) {
        removeHistoryItem(button.dataset.removeHistory);
    }

    if (button.dataset.studioWatch) {
        const videoId = button.dataset.studioWatch;

        const video = videos.find(item =>
            String(item.id) === String(videoId)
        );

        if (video && isShort(video)) {
            openSpecificReel(videoId);

        } else {
            openPage("home");

            setTimeout(() => {
                document.querySelector(
                    `[data-play-video="${CSS.escape(String(videoId))}"]`
                )?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }, 200);
        }
    }
});


/* ============================================================
   53 — SIGN OUT
   ============================================================ */

async function signOutGoCat() {
    if (!db) return;

    try {
        const result = await db.auth.signOut();

        if (result.error) {
            throw result.error;
        }

        currentUser = null;
        currentProfile = null;
        currentProfileUserId = null;
        currentChatUserId = null;
        currentCommentVideoId = null;

        isGoCatAdmin = false;

        users = [];
        videos = [];
        posts = [];
        follows = [];
        notifications = [];

        openLoginScreen();

    } catch (error) {
        showToast("Sign out failed: " + error.message);
    }
}


listen("logoutBtn", "click", signOutGoCat);
listen("settingsLogout", "click", signOutGoCat);


/* ============================================================
   54 — AUTHENTICATION SESSION
   ============================================================ */

if (db) {
    db.auth.onAuthStateChange((event, session) => {

        if (event === "SIGNED_OUT") {
            currentUser = null;
            currentProfile = null;
            currentProfileUserId = null;
            currentChatUserId = null;

            isGoCatAdmin = false;

            openLoginScreen();
        }

    });
}


/* ============================================================
   55 — INITIALIZE APPLICATION
   ============================================================ */

async function initializeGoCat() {
    const loader = $("loader");

    try {
        if (!db) {
            throw new Error(
                "Supabase library failed to load. Check your internet connection."
            );
        }

        const sessionResult = await Promise.race([
            db.auth.getSession(),

            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(
                        new Error("Supabase connection timed out.")
                    );
                }, 15000);
            })
        ]);

        if (sessionResult.error) {
            throw sessionResult.error;
        }

        const session = sessionResult.data.session;

        if (session?.user) {
            currentUser = session.user;

            await Promise.race([
                startGoCat(),

                new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(
                            new Error(
                                "GoCat data loading timed out. Check Supabase permissions."
                            )
                        );
                    }, 25000);
                })
            ]);

        } else {
            openLoginScreen();
        }

    } catch (error) {
        console.error("GOCAT STARTUP ERROR:", error);

        openLoginScreen();

        showAuthMessage(
            "GoCat could not load: " + error.message
        );

    } finally {
        loader?.classList.add("hide");
    }
}


/* ============================================================
   56 — CLEANUP TEMPORARY OBJECT URLS
   ============================================================ */

window.addEventListener("beforeunload", function() {
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }

    if (editorMusicObjectURL) {
        URL.revokeObjectURL(editorMusicObjectURL);
    }
});


/* ============================================================
   57 — START GOCAT
   ============================================================ */

initializeGoCat();

console.log(
    "%cGOCAT LOADED SUCCESSFULLY",
    "color:#16d28a;font-size:18px;font-weight:bold;"
);
