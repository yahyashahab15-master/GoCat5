/* ============================================================
   GOCAT — PROFESSIONAL CREATOR PLATFORM
   Supabase authentication, content, uploads and creator tools
   ============================================================ */


/* ============================================================
   01 — SUPABASE CONFIGURATION
   ============================================================ */

const SUPABASE_URL =
    "https://rfwgvsijxweyzwvuqslt.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0O";

const VIDEO_BUCKET = "videos";
const POST_BUCKET = "post-media";

const db = window.supabase?.createClient
    ? window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      )
    : null;


/* ============================================================
   02 — GLOBAL STATE
   ============================================================ */

let currentUser = null;
let currentProfile = null;

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

let editorAudioContext = null;
let editorVideoSource = null;
let editorVideoGain = null;
let editorMusicBuffer = null;
let editorMusicObjectURL = null;

let currentUploadPath = null;

const PAGE_SIZE = 5;

let settings = {
    theme: "dark",
    autoplay: true,
    muted: true,
    history: true
};


/* ============================================================
   03 — DOM HELPER
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


/* ============================================================
   04 — GENERAL HELPERS
   ============================================================ */

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
    return String(userId) === String(currentUser?.id);
}


function isFollowing(userId) {
    return follows.some(item =>
        String(item.follower_id) === String(currentUser.id) &&
        String(item.following_id) === String(userId)
    );
}


function isShort(video) {
    return video.is_short === true ||
        video.is_short === "true";
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
        return JSON.parse(
            localStorage.getItem(key) ||
            JSON.stringify(fallback)
        );
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


function getVideoURL(path) {
    if (!path) return "";

    if (String(path).startsWith("http")) {
        return path;
    }

    return db.storage
        .from(VIDEO_BUCKET)
        .getPublicUrl(path)
        .data.publicUrl;
}


function getPostImageURL(path) {
    if (!path) return "";

    if (String(path).startsWith("http")) {
        return path;
    }

    return db.storage
        .from(POST_BUCKET)
        .getPublicUrl(path)
        .data.publicUrl;
}


/* ============================================================
   05 — SETTINGS STORAGE
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

    $("themeIcon").textContent =
        settings.theme === "dark" ? "☀" : "◐";

    $("themeLabel").textContent =
        settings.theme === "dark"
            ? "Light appearance"
            : "Dark appearance";

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


/* ============================================================
   06 — AUTHENTICATION
   ============================================================ */

function openLoginScreen() {
    $("authScreen").classList.remove("hidden");
    $("app").classList.add("hidden");

    $("loginForm").classList.remove("hidden");
    $("registerForm").classList.add("hidden");

    $("authTitle").textContent = "Welcome back";

    $("authSubtitle").textContent =
        "Sign in to continue to your workspace.";

    showAuthMessage("");
}


function openRegisterScreen() {
    $("authScreen").classList.remove("hidden");
    $("app").classList.add("hidden");

    $("loginForm").classList.add("hidden");
    $("registerForm").classList.remove("hidden");

    $("authTitle").textContent =
        "Create your account";

    $("authSubtitle").textContent =
        "Join the GoCat creator community.";

    showAuthMessage("");
}


function openApp() {
    $("authScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
}


listen("showRegister", "click", openRegisterScreen);
listen("showLogin", "click", openLoginScreen);


/* ============================================================
   07 — LOGIN
   ============================================================ */

listen("loginForm", "submit", async function(event) {
    event.preventDefault();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    const button =
        this.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Signing in...";

    try {
        const result = await db.auth.signInWithPassword({
            email,
            password
        });

        if (result.error) {
            throw result.error;
        }

        currentUser = result.data.user;

        await startGoCat();

    } catch (error) {
        console.error(error);

        showAuthMessage(
            error.message || "Login failed."
        );

    } finally {
        button.disabled = false;
        button.textContent = "Sign in";
    }
});


/* ============================================================
   08 — REGISTER
   ============================================================ */

listen("registerForm", "submit", async function(event) {
    event.preventDefault();

    const username = $("registerUsername").value.trim();
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;
    const confirm = $("registerConfirm").value;

    if (username.length < 3) {
        showAuthMessage(
            "Username must have at least 3 characters."
        );
        return;
    }

    if (password !== confirm) {
        showAuthMessage("Passwords do not match.");
        return;
    }

    const button =
        this.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Creating account...";

    try {
        const result = await db.auth.signUp({
            email,
            password,
            options: {
                data: { username }
            }
        });

        if (result.error) {
            throw result.error;
        }

        if (result.data.session) {
            currentUser = result.data.user;
            await startGoCat();
        } else {
            openLoginScreen();

            showAuthMessage(
                "Account created. Sign in after any required email confirmation.",
                true
            );
        }

    } catch (error) {
        console.error(error);

        showAuthMessage(
            error.message || "Registration failed."
        );

    } finally {
        button.disabled = false;
        button.textContent = "Create account";
    }
});


/* ============================================================
   09 — USER PROFILE
   Existing users table and TEXT IDs are preserved.
   ============================================================ */

async function ensureProfile() {
    const existing = await db
        .from("users")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (existing.error) {
        throw existing.error;
    }

    if (existing.data) {
        currentProfile = existing.data;
        return;
    }

    let username =
        currentUser.user_metadata?.username ||
        "gocat_user";

    username = username
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 20);

    const insert = await db
        .from("users")
        .insert({
            id: currentUser.id,
            username: username,
            email: currentUser.email || "",
            bio: "Welcome to my GoCat channel."
        })
        .select("*")
        .single();

    if (insert.error) {
        throw insert.error;
    }

    currentProfile = insert.data;
}


/* ============================================================
   10 — LOAD USERS
   ============================================================ */

async function loadUsers() {
    const result = await db
        .from("users")
        .select("id,username,email,bio,created_at")
        .order("created_at", { ascending: false });

    if (result.error) {
        throw result.error;
    }

    users = result.data || [];

    const hasCurrent = users.some(user =>
        String(user.id) === String(currentUser.id)
    );

    if (!hasCurrent && currentProfile) {
        users.unshift(currentProfile);
    }

    currentProfile =
        users.find(user =>
            String(user.id) === String(currentUser.id)
        ) || currentProfile;
}


/* ============================================================
   11 — LOAD VIDEOS, LIKES AND COMMENTS
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

    if (videoResult.error) {
        throw videoResult.error;
    }

    if (likeResult.error) {
        throw likeResult.error;
    }

    if (commentResult.error) {
        throw commentResult.error;
    }

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


/* ============================================================
   12 — LOAD FOLLOWS
   ============================================================ */

async function loadFollows() {
    const result = await db
        .from("follows")
        .select("follower_id,following_id");

    if (result.error) {
        throw result.error;
    }

    follows = result.data || [];
}


/* ============================================================
   13 — LOAD POSTS
   ============================================================ */

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
        console.warn(
            "Post likes:",
            likesResult.error.message
        );
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


/* ============================================================
   14 — LOAD ALL DATABASE DATA
   ============================================================ */

async function loadAllData() {
    await Promise.all([
        loadUsers(),
        loadVideos(),
        loadFollows(),
        loadPosts()
    ]);
}


/* ============================================================
   15 — START APPLICATION
   ============================================================ */

async function startGoCat() {
    try {
        await ensureProfile();
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
        console.error(error);

        showToast(
            "Could not load GoCat: " + error.message
        );
    }
}


function updateUserInterface() {
    const username =
        currentProfile?.username || "Creator";

    $("welcomeName").textContent = username;

    $("topProfileBtn").textContent =
        getInitial(username);

    $("sidebarAvatar").textContent =
        getInitial(username);

    $("sidebarUsername").textContent =
        username;

    $("settingsAvatar").textContent =
        getInitial(username);

    $("settingsUsername").textContent =
        username;

    $("settingsEmail").textContent =
        currentUser.email || "";
}


/* ============================================================
   16 — RENDER ALL SECTIONS
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
   17 — VIDEO CARD
   ============================================================ */

function videoCard(video) {
    const username = getUsername(video.owner_id);

    const own = isOwnContent(video.owner_id);
    const following = isFollowing(video.owner_id);

    const liked = video.likes?.includes(
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
                    !own
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
                    own
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


/* ============================================================
   18 — POST CARD
   ============================================================ */

function postCard(post) {
    const username = getUsername(post.user_id);
    const own = isOwnContent(post.user_id);

    const liked = post.likes?.includes(
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
                    own
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


/* ============================================================
   19 — HOME SHORT CARD
   ============================================================ */

function homeShortCard(video) {
    const username = getUsername(video.owner_id);

    const liked = video.likes?.includes(
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

                    <small>
                        ${Number(video.views || 0)} views
                    </small>

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
   20 — HOME FEED DATA
   ============================================================ */

function getHomeFeedData() {
    const query = $("searchInput").value
        .trim()
        .toLowerCase();

    function matchesSearch(item, type) {
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
        .filter(video => matchesSearch(video, "video"))
        .slice()
        .sort((a, b) => {
            function score(video) {
                let points = 0;

                if (isFollowing(video.owner_id)) {
                    points += 4;
                }

                const ageHours =
                    (Date.now() -
                        new Date(video.created_at).getTime()) /
                    3600000;

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
            }

            return score(b) - score(a);
        });

    const shorts = videos
        .filter(video => isShort(video))
        .filter(video =>
            activeHomeTopic === "All" ||
            video.topic === activeHomeTopic
        )
        .filter(video => matchesSearch(video, "video"))
        .slice()
        .sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );

    const communityPosts = posts
        .filter(post => matchesSearch(post, "post"))
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


/* ============================================================
   21 — BUILD REPEATING HOME FEED
   4 VIDEOS → 4 SHORTS → 2 POSTS → REPEAT
   ============================================================ */

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


/* ============================================================
   22 — RENDER HOME FEED
   ============================================================ */

function renderHomeFeed() {
    const cycles = buildHomeFeedCycles();

    const visible = cycles.slice(
        0,
        homeVisibleCycles
    );

    $("homeFeed").innerHTML = visible.join("");

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

    $("homeEmpty").classList.toggle(
        "hidden",
        total > 0
    );

    $("homeLoadMoreWrap").classList.toggle(
        "hidden",
        homeVisibleCycles >= cycles.length
    );

    $("homeCount").textContent =
        "Showing " + shown + " of " + total;
}


listen("homeLoadMore", "click", function() {
    homeVisibleCycles += 1;
    renderHomeFeed();
});


/* ============================================================
   23 — HOME TOPIC FILTER
   ============================================================ */

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
   24 — SUGGESTED CREATORS
   ============================================================ */

function renderSuggestedCreators() {
    const suggestions = users
        .filter(user => !isOwnContent(user.id))
        .filter(user => !isFollowing(user.id))
        .slice(0, 15);

    $("suggestedCreators").innerHTML =
        suggestions.map(user => `
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


/* ============================================================
   25 — FOLLOW AND UNFOLLOW
   ============================================================ */

async function toggleFollow(userId) {
    if (isOwnContent(userId)) return;

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
   26 — VIDEO LIKES
   ============================================================ */

async function toggleVideoLike(videoId) {
    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video) return;

    const liked = video.likes.includes(
        String(currentUser.id)
    );

    try {
        if (liked) {
            const result = await db
                .from("likes")
                .delete()
                .eq("video_id", videoId)
                .eq("user_id", currentUser.id);

            if (result.error) throw result.error;

            video.likes = video.likes.filter(
                id => id !== String(currentUser.id)
            );

        } else {
            const result = await db
                .from("likes")
                .insert({
                    video_id: videoId,
                    user_id: currentUser.id
                });

            if (result.error) throw result.error;

            video.likes.push(String(currentUser.id));
        }

        renderEverything();

    } catch (error) {
        console.error(error);
        showToast("Like error: " + error.message);
    }
}


/* ============================================================
   27 — COMMENTS
   ============================================================ */

async function openComments(videoId) {
    currentCommentVideoId = videoId;

    $("commentsList").innerHTML =
        "<p class='muted-text'>Loading comments...</p>";

    showModal("commentsModal");

    await renderComments();
}


async function renderComments() {
    const result = await db
        .from("comments")
        .select("*")
        .eq("video_id", currentCommentVideoId)
        .order("created_at", { ascending: true });

    if (result.error) {
        $("commentsList").textContent =
            result.error.message;
        return;
    }

    const comments = result.data || [];

    $("commentsList").innerHTML = comments.length
        ? comments.map(comment => `
            <div class="comment-item">

                <strong>
                    ${escapeHTML(getUsername(comment.user_id))}
                </strong>

                <p>${escapeHTML(comment.text)}</p>

                <small>${formatDate(comment.created_at)}</small>

            </div>
        `).join("")
        : "<p class='muted-text'>No comments yet.</p>";
}


listen("commentForm", "submit", async function(event) {
    event.preventDefault();

    const text = $("commentInput").value.trim();

    if (!text || !currentCommentVideoId) return;

    const result = await db
        .from("comments")
        .insert({
            video_id: currentCommentVideoId,
            user_id: currentUser.id,
            text: text
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
   28 — SHARE VIDEO
   ============================================================ */

async function shareVideo(videoId) {
    const url =
        location.origin +
        location.pathname +
        "?video=" + encodeURIComponent(videoId);

    try {
        if (navigator.share) {
            await navigator.share({
                title: "GoCat video",
                text: "Watch this on GoCat.",
                url: url
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


/* ============================================================
   29 — SHARED VIDEO LINK
   ============================================================ */

function checkSharedVideoLink() {
    const params = new URLSearchParams(location.search);
    const videoId = params.get("video");

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
            const card = document.querySelector(
                `[data-play-video="${CSS.escape(String(video.id))}"]`
            );

            card?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }, 300);
    }
}


/* ============================================================
   30 — DELETE VIDEO
   ============================================================ */

async function deleteVideo(videoId) {
    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video || !isOwnContent(video.owner_id)) return;

    if (!confirm("Delete this video permanently?")) {
        return;
    }

    const result = await db
        .from("videos")
        .delete()
        .eq("id", videoId)
        .eq("owner_id", currentUser.id);

    if (result.error) {
        showToast("Delete failed: " + result.error.message);
        return;
    }

    if (video.storage_path) {
        const removal = await db.storage
            .from(VIDEO_BUCKET)
            .remove([video.storage_path]);

        if (removal.error) {
            console.warn("Storage cleanup:", removal.error.message);
        }
    }

    await loadVideos();

    renderEverything();

    showToast("Video deleted.");
}


/* ============================================================
   31 — SHORTS PAGE
   ============================================================ */

function renderReels() {
    const container = $("reelsFeed");

    const allReels = videos.filter(video =>
        isShort(video)
    );

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

        $("reelsLoadMoreWrap").classList.add("hidden");
        return;
    }

    container.innerHTML = page.map(video => {
        const username = getUsername(video.owner_id);

        const liked = video.likes.includes(
            String(currentUser.id)
        );

        const following = isFollowing(video.owner_id);

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
                        ${video.likes.length || 0}
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

                </div>

            </article>
        `;
    }).join("");

    $("reelsLoadMoreWrap").classList.toggle(
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

    if (!("IntersectionObserver" in window)) {
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


listen("reelsLoadMore", "click", function() {
    reelsVisible += PAGE_SIZE;
    renderReels();
});


function openSpecificReel(videoId) {
    const allReels = videos.filter(video => isShort(video));

    const index = allReels.findIndex(video =>
        String(video.id) === String(videoId)
    );

    if (index >= 0) {
        reelsVisible = Math.max(reelsVisible, index + 1);
    }

    openPage("reels");

    setTimeout(() => {
        const item = document.querySelector(
            `[data-reel-item="${CSS.escape(String(videoId))}"]`
        );

        item?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, 200);
}


/* ============================================================
   32 — EXPLORE TABS
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

    $("exploreVideos").classList.toggle(
        "hidden",
        mode !== "videos" && mode !== "reels"
    );

    $("explorePeople").classList.toggle(
        "hidden",
        mode !== "people"
    );

    $("explorePosts").classList.toggle(
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


/* ============================================================
   33 — EXPLORE RENDERER
   ============================================================ */

function renderExplore() {
    const query = $("searchInput").value
        .trim()
        .toLowerCase();

    if (exploreMode === "videos") {
        const found = videos.filter(video =>
            !isShort(video) &&
            (
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
            isShort(video) &&
            (
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
            !isOwnContent(user.id) &&
            (
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
    $("exploreLoadMoreWrap").classList.toggle(
        "hidden",
        exploreVisible >= total
    );

    $("exploreCount").textContent =
        "Showing " + Math.min(exploreVisible, total) +
        " of " + total;
}


listen("exploreLoadMore", "click", function() {
    exploreVisible += 6;
    renderExplore();
});


/* ============================================================
   34 — FOLLOWING PAGE
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

    $("followingFeed").innerHTML =
        selected.map(videoCard).join("");

    $("followingEmpty").classList.toggle(
        "hidden",
        selected.length > 0
    );
}


/* ============================================================
   35 — UPLOAD MODAL
   ============================================================ */

function resetUploadForm() {
    $("uploadForm").reset();

    $("videoFile").value = "";
    $("selectedVideoName").textContent = "";

    $("uploadProgress").classList.add("hidden");
    $("uploadProgressBar").style.width = "0%";

    $("uploadStatus").textContent = "";

    $("reelEditor").classList.add("hidden");

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

    $("uploadTitle").textContent =
        uploadMode === "short"
            ? "Create a Short"
            : "Upload video";

    $("uploadDescription").textContent =
        uploadMode === "short"
            ? "Prepare and publish a vertical video."
            : "Publish a video to your GoCat channel.";

    $("publishVideoBtn").textContent =
        uploadMode === "short"
            ? "Publish Short"
            : "Publish video";
}


function openUpload(mode = "video") {
    resetUploadForm();
    setUploadMode(mode);
    showModal("uploadModal");
}


listen("uploadTopBtn", "click", function() {
    openUpload("video");
});


listen("createReelBtn", "click", function() {
    openUpload("short");
});


document.querySelectorAll("[data-upload-mode]").forEach(button => {
    button.addEventListener("click", function() {
        const mode = this.dataset.uploadMode;

        if (mode !== uploadMode) {
            setUploadMode(mode);
        }
    });
});


/* ============================================================
   36 — VIDEO FILE SELECTION
   ============================================================ */

listen("videoFile", "change", function() {
    const file = this.files[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
        showToast("Please select a video file.");
        this.value = "";
        return;
    }

    const maxSize = 1024 * 1024 * 1024;

    if (file.size > maxSize) {
        showToast("This file is larger than 1 GB.");
        this.value = "";
        return;
    }

    selectedVideoFile = file;
    exportedReelFile = null;

    $("selectedVideoName").textContent =
        file.name + " • " +
        (file.size / (1024 * 1024)).toFixed(1) +
        " MB";

    if (uploadMode === "short") {
        prepareReelEditor(file);
    }
});


/* ============================================================
   37 — OPEN SHORTS EDITOR
   ============================================================ */

function prepareReelEditor(file) {
    const preview = $("reelPreview");

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }

    currentObjectURL = URL.createObjectURL(file);

    preview.src = currentObjectURL;
    preview.style.filter = "none";
    preview.style.transform = "none";
    preview.playbackRate = 1;

    $("reelEditor").classList.remove("hidden");

    $("editorProjectStatus").textContent = file.name;

    $("editorStatus").textContent =
        "Choose your edits and export your Short.";

    $("editorOverlayPreview").style.justifyContent = "flex-end";

    $("previewTextOne").textContent = "";
    $("previewTextTwo").textContent = "";
    $("previewSticker").textContent = "";

    showModal("editorModal");

    preview.onloadedmetadata = function() {
        const duration = preview.duration;

        $("trimStart").value = 0;
        $("trimEnd").value = duration.toFixed(1);

        $("trimStart").max = duration;
        $("trimEnd").max = duration;

        $("trimStartRange").max = Math.ceil(duration * 10);
        $("trimEndRange").max = Math.ceil(duration * 10);

        $("trimStartRange").value = 0;
        $("trimEndRange").value = Math.ceil(duration * 10);

        $("timelineDuration").textContent =
            formatTime(duration);

        $("editorTimecode").textContent =
            "00:00 / " + formatTime(duration);

        updateEditorPreview();
    };
}


/* ============================================================
   38 — EDITOR PANEL NAVIGATION
   ============================================================ */

document.querySelectorAll("[data-editor-tab]").forEach(button => {
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


/* ============================================================
   39 — EDITOR PREVIEW FILTERS
   ============================================================ */

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

    return filters[$("reelFilter").value] || "";
}


function updateEditorPreview() {
    const preview = $("reelPreview");

    if (!preview) return;

    const brightness = Number($("reelBrightness").value);
    const contrast = Number($("reelContrast").value);
    const saturation = Number($("reelSaturation").value);
    const blur = Number($("reelBlur").value);

    const filterParts = [
        getEditorFilter(),
        "brightness(" + brightness + "%)",
        "contrast(" + contrast + "%)",
        "saturate(" + saturation + "%)",
        "blur(" + blur + "px)"
    ].filter(Boolean);

    preview.style.filter = filterParts.join(" ");

    const rotation = Number($("reelRotation").value || 0);

    preview.style.transform =
        "rotate(" + rotation + "deg)";

    preview.playbackRate =
        Number($("reelSpeed").value || 1);

    $("brightnessValue").textContent =
        brightness + "%";

    $("contrastValue").textContent =
        contrast + "%";

    $("saturationValue").textContent =
        saturation + "%";

    $("blurValue").textContent =
        blur + "px";

    $("previewTextOne").textContent =
        $("reelOverlayText").value;

    $("previewTextTwo").textContent =
        $("reelOverlayTextTwo").value;

    $("previewSticker").textContent =
        $("reelSticker").value;

    $("previewTextOne").style.fontSize =
        Number($("reelTextSize").value) + "px";

    $("previewTextOne").style.color =
        $("reelTextColor").value;

    const position = $("reelTextPosition").value;

    const previewOverlay = $("editorOverlayPreview");

    if (position === "top") {
        previewOverlay.style.justifyContent = "flex-start";
    } else if (position === "middle") {
        previewOverlay.style.justifyContent = "center";
    } else {
        previewOverlay.style.justifyContent = "flex-end";
    }

    const framing = $("reelFraming").value;

    if (framing === "contain") {
        preview.style.objectFit = "contain";
    } else {
        preview.style.objectFit = "cover";
    }
}


/* Bind all editor inputs */

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


/* ============================================================
   40 — TRIM CONTROLS
   ============================================================ */

function syncTrimInputs(changed) {
    const preview = $("reelPreview");

    if (!preview.duration) return;

    let start = Number($("trimStart").value || 0);
    let end = Number($("trimEnd").value || preview.duration);

    if (changed === "start") {
        start = Math.max(0, Math.min(start, end - .1));
        $("trimStart").value = start.toFixed(1);
    }

    if (changed === "end") {
        end = Math.min(preview.duration, Math.max(end, start + .1));
        $("trimEnd").value = end.toFixed(1);
    }

    $("trimStartRange").value = Math.round(start * 10);
    $("trimEndRange").value = Math.round(end * 10);

    $("timelineDuration").textContent =
        formatTime(end - start);
}


listen("trimStart", "input", () => syncTrimInputs("start"));
listen("trimEnd", "input", () => syncTrimInputs("end"));


listen("trimStartRange", "input", function() {
    $("trimStart").value =
        (Number(this.value) / 10).toFixed(1);

    syncTrimInputs("start");
});


listen("trimEndRange", "input", function() {
    $("trimEnd").value =
        (Number(this.value) / 10).toFixed(1);

    syncTrimInputs("end");
});


listen("reelPreview", "timeupdate", function() {
    const preview = this;

    if (!preview.duration) return;

    $("editorTimecode").textContent =
        formatTime(preview.currentTime) +
        " / " +
        formatTime(preview.duration);

    const start = Number($("trimStart").value || 0);
    const end = Number($("trimEnd").value || preview.duration);

    const position = Math.max(
        0,
        Math.min(
            100,
            ((preview.currentTime - start) / Math.max(.1, end - start)) * 100
        )
    );

    $("timelinePlayhead").style.left =
        position + "%";

    if (preview.currentTime >= end) {
        preview.pause();
    }
});


/* ============================================================
   41 — EDITOR PLAY BUTTON
   ============================================================ */

listen("editorPreviewPlay", "click", async function() {
    const preview = $("reelPreview");

    const start = Number($("trimStart").value || 0);
    const end = Number($("trimEnd").value || preview.duration);

    if (preview.paused) {
        if (
            preview.currentTime < start ||
            preview.currentTime >= end
        ) {
            preview.currentTime = start;
        }

        try {
            await preview.play();

            this.textContent = "Ⅱ";

        } catch {
            showToast("Preview playback was blocked.");
        }

    } else {
        preview.pause();
        this.textContent = "▶";
    }
});


listen("reelPreview", "play", () => {
    $("editorPreviewPlay").textContent = "Ⅱ";
});

listen("reelPreview", "pause", () => {
    $("editorPreviewPlay").textContent = "▶";
});


/* ============================================================
   42 — EDITOR MUSIC FILE
   ============================================================ */

listen("musicFile", "change", async function() {
    const file = this.files[0];

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

    $("musicFileName").textContent =
        file.name + " • " +
        (file.size / (1024 * 1024)).toFixed(1) +
        " MB";

    showToast("Music selected. It will be mixed during export.");
});


listen("removeMusicBtn", "click", function() {
    editorMusicBuffer = null;

    if (editorMusicObjectURL) {
        URL.revokeObjectURL(editorMusicObjectURL);
        editorMusicObjectURL = null;
    }

    $("musicFile").value = "";
    $("musicFileName").textContent = "";

    showToast("Background music removed.");
});


/* ============================================================
   43 — LOAD MUSIC INTO AUDIO BUFFER
   ============================================================ */

async function loadEditorMusic() {
    const file = $("musicFile").files[0];

    if (!file) return null;

    if (!editorAudioContext) {
        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            return null;
        }

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
   44 — CANVAS TEXT WRAPPING
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

        const width = context.measureText(testLine).width;

        if (width > maxWidth && line) {
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
   45 — DRAW EDITED VIDEO FRAME
   ============================================================ */

function drawEditedFrame(context, preview, width, height) {
    const sourceWidth = preview.videoWidth;
    const sourceHeight = preview.videoHeight;

    if (!sourceWidth || !sourceHeight) return;

    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);

    const framing = $("reelFraming").value;

    const ratio = width / height;

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
        Number($("reelRotation").value || 0) *
        Math.PI / 180;

    const brightness = Number($("reelBrightness").value) / 100;
    const contrast = Number($("reelContrast").value) / 100;
    const saturation = Number($("reelSaturation").value) / 100;
    const blur = Number($("reelBlur").value);

    const cssFilter = [
        getEditorFilter(),
        "brightness(" + brightness + ")",
        "contrast(" + contrast + ")",
        "saturate(" + saturation + ")",
        "blur(" + blur + "px)"
    ].filter(Boolean).join(" ");

    context.save();

    context.translate(width / 2, height / 2);
    context.rotate(rotation);

    context.filter = cssFilter;

    if (
        Math.abs(Number($("reelRotation").value)) === 90 ||
        Math.abs(Number($("reelRotation").value)) === 270
    ) {
        const rotatedScale = framing === "contain"
            ? Math.min(
                width / sourceHeight,
                height / sourceWidth
            )
            : Math.max(
                width / sourceHeight,
                height / sourceWidth
            );

        context.drawImage(
            preview,
            -(sourceWidth * rotatedScale) / 2,
            -(sourceHeight * rotatedScale) / 2,
            sourceWidth * rotatedScale,
            sourceHeight * rotatedScale
        );

    } else {
        context.drawImage(
            preview,
            -drawWidth / 2,
            -drawHeight / 2,
            drawWidth,
            drawHeight
        );
    }

    context.restore();

    context.filter = "none";

    const mainText = $("reelOverlayText").value.trim();
    const secondText = $("reelOverlayTextTwo").value.trim();
    const sticker = $("reelSticker").value;

    const textColor = $("reelTextColor").value;
    const textSize = Number($("reelTextSize").value);

    const position = $("reelTextPosition").value;

    let textY = height * .82;

    if (position === "top") {
        textY = height * .15;
    }

    if (position === "middle") {
        textY = height * .5;
    }

    context.save();

    context.textAlign = "center";
    context.textBaseline = "middle";

    if (sticker) {
        context.font = "64px Arial";
        context.fillText(
            sticker,
            width / 2,
            textY - 90
        );
    }

    if (mainText) {
        context.font =
            "900 " +
            Math.round(textSize * (width / 720)) +
            "px Arial";

        context.fillStyle = textColor;
        context.strokeStyle = "rgba(0,0,0,.85)";
        context.lineWidth = Math.max(3, width / 180);

        drawWrappedText(
            context,
            mainText,
            width / 2,
            textY,
            width * .82,
            textSize * 1.25
        );
    }

    if (secondText) {
        const secondaryY =
            textY + textSize * 1.8;

        context.font =
            "600 " +
            Math.round(19 * (width / 720)) +
            "px Arial";

        context.fillStyle = "#ffffff";
        context.strokeStyle = "rgba(0,0,0,.85)";
        context.lineWidth = Math.max(2, width / 260);

        drawWrappedText(
            context,
            secondText,
            width / 2,
            secondaryY,
            width * .82,
            25 * (width / 720)
        );
    }

    context.restore();
}


/* ============================================================
   46 — BUILD EDITOR AUDIO MIX
   ============================================================ */

async function buildEditorAudioMix(preview, canvasStream) {
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
                fallback.getTracks().forEach(track => track.stop());
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

    /*
       Create the video media source only once.
       Browsers do not allow creating multiple sources
       from the same video element.
    */

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

    const videoVolume =
        Number($("reelVolume").value) / 100;

    editorVideoGain.gain.value = videoVolume;

    editorVideoGain.connect(destination);

    let musicSource = null;
    let musicGain = null;

    const musicFile = $("musicFile").files[0];

    if (musicFile) {
        const buffer = await loadEditorMusic();

        if (buffer) {
            musicSource =
                editorAudioContext.createBufferSource();

            musicGain =
                editorAudioContext.createGain();

            musicSource.buffer = buffer;
            musicSource.loop = true;

            musicGain.gain.value =
                Number($("musicVolume").value) / 100;

            musicSource.connect(musicGain);
            musicGain.connect(destination);

            const fadeIn =
                Number($("musicFadeIn").value);

            if (fadeIn > 0) {
                musicGain.gain.setValueAtTime(
                    0,
                    editorAudioContext.currentTime
                );

                musicGain.gain.linearRampToValueAtTime(
                    Number($("musicVolume").value) / 100,
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
                if (musicSource) {
                    musicSource.stop();
                }
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
   47 — EXPORT EDITED SHORT
   ============================================================ */

listen("exportReelBtn", "click", async function() {
    const button = this;
    const preview = $("reelPreview");

    if (!selectedVideoFile) {
        showToast("Choose a video first.");
        return;
    }

    if (
        !window.MediaRecorder ||
        !HTMLCanvasElement.prototype.captureStream
    ) {
        showToast(
            "This browser does not support video export. The original file can still be uploaded."
        );

        $("editorStatus").textContent =
            "Export is not supported by this browser. Use the original clip or try a supported desktop browser.";

        return;
    }

    const start = Math.max(
        0,
        Number($("trimStart").value || 0)
    );

    const end = Math.min(
        preview.duration,
        Number($("trimEnd").value || preview.duration)
    );

    if (!Number.isFinite(end) || end <= start) {
        showToast("Choose a valid trim range.");
        return;
    }

    const resolution =
        Number($("reelResolution").value || 720);

    const square =
        $("reelFraming").value === "square";

    const width = resolution;
    const height = square ? resolution : Math.round(resolution * 16 / 9);

    const fps =
        Number($("reelFrameRate").value || 30);

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
        alpha: false
    });

    if (!context) {
        showToast("Could not create the video canvas.");
        return;
    }

    const canvasStream = canvas.captureStream(fps);

    let recorder = null;
    let audioMix = null;
    let animationId = null;
    let finished = false;

    const chunks = [];

    const mimeTypes = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
    ];

    const mimeType = mimeTypes.find(type =>
        MediaRecorder.isTypeSupported(type)
    );

    if (!mimeType) {
        showToast("No supported export format was found.");
        canvasStream.getTracks().forEach(track => track.stop());
        return;
    }

    button.disabled = true;
    button.textContent = "Exporting...";

    $("editorStatus").textContent =
        "Preparing video and audio tracks...";

    try {
        preview.pause();

        preview.currentTime = start;

        await new Promise((resolve, reject) => {
            if (Math.abs(preview.currentTime - start) < .05) {
                resolve();
                return;
            }

            preview.onseeked = resolve;

            setTimeout(() => {
                if (preview.currentTime < start - .1) {
                    reject(new Error("Could not seek to the trim start."));
                }
            }, 10000);
        });

        audioMix = await buildEditorAudioMix(
            preview,
            canvasStream
        );

        recorder = new MediaRecorder(canvasStream, {
            mimeType
        });

        recorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        const exportFinished = new Promise((resolve, reject) => {
            recorder.onstop = resolve;
            recorder.onerror = reject;
        });

        const speed =
            Number($("reelSpeed").value || 1);

        preview.playbackRate = speed;

        function stopExport() {
            if (finished) return;

            finished = true;

            preview.pause();

            if (recorder && recorder.state !== "inactive") {
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

        $("editorStatus").textContent =
            "Exporting " + resolution + "p at " + fps + " FPS...";

        drawLoop();

        await exportFinished;

        if (!chunks.length) {
            throw new Error("The browser produced an empty video.");
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

        $("editorStatus").textContent =
            "Export completed. Your edited Short is ready to publish.";

        $("selectedVideoName").textContent =
            exportedReelFile.name +
            " • " +
            (exportedReelFile.size / (1024 * 1024)).toFixed(1) +
            " MB";

        hideModal("editorModal");

        $("uploadStatus").textContent =
            "Edited Short ready. Add your title and publish.";

        showToast("Short exported successfully!");

    } catch (error) {
        console.error("Export error:", error);

        $("editorStatus").textContent =
            "Export failed: " + error.message;

        showToast("Export failed: " + error.message);

    } finally {
        finished = true;

        if (animationId) {
            cancelAnimationFrame(animationId);
        }

        preview.pause();

        if (audioMix) {
            audioMix.cleanup();
        }

        canvasStream.getTracks().forEach(track => {
            track.stop();
        });

        button.disabled = false;
        button.textContent = "Export edited Short";
    }
});


/* ============================================================
   48 — CLOSE EDITOR
   ============================================================ */

function closeEditor() {
    $("reelPreview").pause();

    hideModal("editorModal");
}


listen("editorCloseBtn", "click", closeEditor);


/* ============================================================
   49 — SHORTS PLAYBACK SETTINGS
   ============================================================ */

listen("reelsFeed", "click", function(event) {
    const soundButton = event.target.closest("[data-reel-sound]");

    if (!soundButton) return;

    const item = soundButton.closest(".reel-item");
    const video = item?.querySelector(".reel-video");

    if (!video) return;

    video.muted = !video.muted;

    soundButton.textContent =
        video.muted ? "Muted" : "Sound";
});


/* ============================================================
   50 — TUS RESUMABLE UPLOAD SUPPORT
   Large video files use resumable upload when available.
   ============================================================ */

function loadTusLibrary() {
    if (window.tus?.Upload) {
        return Promise.resolve(true);
    }

    return new Promise(resolve => {
        const existing = document.querySelector(
            'script[data-gocat-tus="true"]'
        );

        if (existing) {
            existing.addEventListener("load", () => {
                resolve(Boolean(window.tus?.Upload));
            });

            existing.addEventListener("error", () => {
                resolve(false);
            });

            return;
        }

        const script = document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/tus-js-client@4/dist/tus.min.js";

        script.dataset.gocatTus = "true";

        script.onload = () => {
            resolve(Boolean(window.tus?.Upload));
        };

        script.onerror = () => {
            resolve(false);
        };

        document.head.appendChild(script);
    });
}


async function uploadWithTus(file, path, progressCallback) {
    const tusReady = await loadTusLibrary();

    if (!tusReady) {
        return false;
    }

    const sessionResult = await db.auth.getSession();

    if (sessionResult.error) {
        throw sessionResult.error;
    }

    const session = sessionResult.data.session;

    if (!session?.access_token) {
        throw new Error("Your session expired. Please sign in again.");
    }

    const endpoint =
        SUPABASE_URL + "/storage/v1/upload/resumable";

    const metadata = {
        bucketName: VIDEO_BUCKET,
        objectName: path,
        contentType: file.type || "video/mp4",
        cacheControl: "3600"
    };

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

            chunkSize: 6 * 1024 * 1024,

            headers: {
                authorization:
                    "Bearer " + session.access_token,

                apikey: SUPABASE_KEY
            },

            metadata: metadata,

            onError(error) {
                reject(error);
            },

            onProgress(bytesUploaded, bytesTotal) {
                const percent = Math.round(
                    (bytesUploaded / bytesTotal) * 100
                );

                progressCallback(percent);
            },

            onSuccess() {
                resolve(true);
            }
        });

        upload.findPreviousUploads().then(previous => {
            if (previous.length) {
                upload.resumeFromPreviousUpload(previous[0]);
            }

            upload.start();
        }).catch(reject);
    });
}


/* ============================================================
   51 — STORAGE UPLOAD WITH FALLBACK
   ============================================================ */

async function uploadVideoFile(file, path, progressCallback) {
    /*
       Resumable uploads are used for larger clips.
       Smaller clips use Supabase's regular upload.
    */

    if (file.size > 6 * 1024 * 1024) {
        progressCallback(2);

        const resumable = await uploadWithTus(
            file,
            path,
            progressCallback
        );

        if (resumable) {
            return;
        }
    }

    progressCallback(15);

    const result = await db.storage
        .from(VIDEO_BUCKET)
        .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "video/mp4"
        });

    if (result.error) {
        throw result.error;
    }

    progressCallback(100);
}


/* ============================================================
   52 — PUBLISH VIDEO OR SHORT
   ============================================================ */

listen("uploadForm", "submit", async function(event) {
    event.preventDefault();

    const file =
        exportedReelFile || selectedVideoFile;

    if (!file) {
        showToast("Select a video first.");
        return;
    }

    const title = $("videoTitle").value.trim();
    const description = $("videoDescription").value.trim();
    const topic = $("videoTopic").value;

    if (!title) {
        showToast("Add a title.");
        $("videoTitle").focus();
        return;
    }

    if (!file.type.startsWith("video/")) {
        showToast("The selected file is not a video.");
        return;
    }

    const button = $("publishVideoBtn");

    button.disabled = true;
    button.textContent = "Uploading...";

    $("uploadProgress").classList.remove("hidden");

    $("uploadStatus").textContent =
        "Preparing upload...";

    $("uploadProgressBar").style.width = "0%";

    const extension =
        file.name.split(".").pop().toLowerCase() || "mp4";

    const path =
        currentUser.id + "/" +
        Date.now() + "-" +
        Math.random().toString(36).slice(2, 8) +
        "." + extension;

    currentUploadPath = path;

    try {
        await uploadVideoFile(
            file,
            path,
            function(percent) {
                $("uploadProgressBar").style.width =
                    percent + "%";

                $("uploadStatus").textContent =
                    "Uploading: " + percent + "%";
            }
        );

        $("uploadStatus").textContent =
            "Saving video information...";

        const insert = await db
            .from("videos")
            .insert({
                owner_id: currentUser.id,
                title: title,
                description: description,
                topic: topic,
                storage_path: path,
                views: 0,
                is_short: uploadMode === "short"
            });

        if (insert.error) {
            await db.storage
                .from(VIDEO_BUCKET)
                .remove([path]);

            throw insert.error;
        }

        $("uploadProgressBar").style.width = "100%";

        $("uploadStatus").textContent =
            "Published successfully.";

        await loadVideos();

        homeVisibleCycles = 1;
        reelsVisible = Math.max(reelsVisible, PAGE_SIZE);

        renderEverything();

        currentUploadPath = null;

        hideModal("uploadModal");

        resetUploadForm();

        showToast(
            uploadMode === "short"
                ? "Your Short has been published!"
                : "Your video has been published!"
        );

    } catch (error) {
        console.error("Upload error:", error);

        /*
           If the database insert failed after storage upload,
           remove the uploaded object to avoid orphaned files.
        */

        if (currentUploadPath) {
            await db.storage
                .from(VIDEO_BUCKET)
                .remove([currentUploadPath]);
        }

        $("uploadStatus").textContent =
            error.message || "Upload failed.";

        showToast("Upload failed: " + error.message);

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
   53 — OPEN UPLOAD BUTTONS
   ============================================================ */

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
   54 — CREATE POSTS
   ============================================================ */

listen("postImage", "change", function() {
    $("postImageName").textContent =
        this.files[0]?.name || "";
});


listen("createPostForm", "submit", async function(event) {
    event.preventDefault();

    const content = $("postContent").value.trim();
    const imageFile = $("postImage").files[0];

    if (!content && !imageFile) {
        showToast("Write something or select an image.");
        return;
    }

    if (imageFile && !imageFile.type.startsWith("image/")) {
        showToast("Please select an image.");
        return;
    }

    const button =
        this.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Publishing...";

    let storagePath = null;

    try {
        if (imageFile) {
            storagePath =
                currentUser.id + "/" +
                Date.now() + "-" +
                imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");

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
        $("postImageName").textContent = "";

        await loadPosts();

        postsVisible = Math.max(postsVisible, PAGE_SIZE);

        renderPosts();
        renderHomeFeed();
        renderExplore();
        renderProfile();

        showToast("Post published!");

    } catch (error) {
        console.error(error);

        if (storagePath) {
            await db.storage
                .from(POST_BUCKET)
                .remove([storagePath]);
        }

        showToast("Post failed: " + error.message);

    } finally {
        button.disabled = false;
        button.textContent = "Publish post";
    }
});


/* ============================================================
   55 — POST LIKES
   ============================================================ */

async function togglePostLike(postId) {
    const post = posts.find(item =>
        String(item.id) === String(postId)
    );

    if (!post) return;

    const liked = post.likes.includes(
        String(currentUser.id)
    );

    try {
        if (liked) {
            const result = await db
                .from("post_likes")
                .delete()
                .eq("post_id", postId)
                .eq("user_id", currentUser.id);

            if (result.error) {
                throw result.error;
            }

            post.likes = post.likes.filter(
                id => id !== String(currentUser.id)
            );

        } else {
            const result = await db
                .from("post_likes")
                .insert({
                    post_id: postId,
                    user_id: currentUser.id
                });

            if (result.error) {
                throw result.error;
            }

            post.likes.push(String(currentUser.id));
        }

        renderPosts();
        renderHomeFeed();
        renderExplore();
        renderProfile();

    } catch (error) {
        showToast("Post like failed: " + error.message);
    }
}


/* ============================================================
   56 — DELETE POST
   ============================================================ */

async function deletePost(postId) {
    const post = posts.find(item =>
        String(item.id) === String(postId)
    );

    if (!post || !isOwnContent(post.user_id)) {
        return;
    }

    if (!confirm("Delete this post?")) {
        return;
    }

    const result = await db
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", currentUser.id);

    if (result.error) {
        showToast("Delete failed: " + result.error.message);
        return;
    }

    if (post.media_path) {
        await db.storage
            .from(POST_BUCKET)
            .remove([post.media_path]);
    }

    await loadPosts();

    renderEverything();

    showToast("Post deleted.");
}


/* ============================================================
   57 — POSTS PAGE
   ============================================================ */

function renderPosts() {
    const page = posts.slice(0, postsVisible);

    $("postsFeed").innerHTML =
        page.map(postCard).join("");

    $("postsLoadMoreWrap").classList.toggle(
        "hidden",
        postsVisible >= posts.length
    );
}


listen("postsLoadMore", "click", function() {
    postsVisible += PAGE_SIZE;
    renderPosts();
});


/* ============================================================
   58 — PROFILE PAGE
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

    $("profileUsername").textContent =
        profile.username || "Creator";

    $("profileEmail").textContent =
        own ? currentUser.email : "";

    $("profileBio").textContent =
        profile.bio || "Welcome to GoCat.";

    $("profileAvatar").textContent =
        getInitial(profile.username);

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

    $("profileVideoCount").textContent =
        regularVideos.length;

    $("profileShortCount").textContent =
        myReels.length;

    $("profileFollowerCount").textContent =
        followers;

    $("profileFollowingCount").textContent =
        following;

    $("profilePostCount").textContent =
        myPosts.length;

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

    $("profileReels").innerHTML =
        myReels.map(videoCard).join("");

    $("profileVideos").innerHTML =
        regularVideos.map(videoCard).join("");

    $("profilePosts").innerHTML =
        myPosts.map(postCard).join("");

    renderProfileTab(profileMode);
}


/* ============================================================
   59 — PROFILE TABS
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
        $(id).classList.toggle(
            "hidden",
            name !== tab
        );
    });
}


document.querySelectorAll("[data-profile-tab]").forEach(button => {
    button.addEventListener("click", function() {
        renderProfileTab(this.dataset.profileTab);
    });
});


/* ============================================================
   60 — EDIT PROFILE
   ============================================================ */

listen("editProfileForm", "submit", async function(event) {
    event.preventDefault();

    const username = $("editUsername").value.trim();
    const bio = $("editBio").value.trim();

    if (username.length < 3) {
        showToast("Username must have at least 3 characters.");
        return;
    }

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
        showToast("Profile update failed: " + result.error.message);
        return;
    }

    currentProfile = result.data;

    await loadAllData();

    currentProfileUserId = currentUser.id;

    renderEverything();
    updateUserInterface();

    hideModal("editProfileModal");

    showToast("Channel updated.");
});


/* ============================================================
   61 — CREATOR STUDIO
   ============================================================ */

function renderStudio() {
    const mine = videos.filter(video =>
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

    $("studioVideos").textContent = mine.length;

    $("studioViews").textContent =
        totalViews.toLocaleString();

    $("studioLikes").textContent =
        totalLikes.toLocaleString();

    $("studioFollowers").textContent =
        followers.toLocaleString();

    $("studioContent").innerHTML = mine.length
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
   62 — WATCH HISTORY
   Stored locally in this browser.
   ============================================================ */

function getHistoryKey() {
    return "gocat_watch_history_" + currentUser.id;
}


function getWatchHistory() {
    return safeJSON(getHistoryKey(), []);
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

    $("historyEmpty").classList.toggle(
        "hidden",
        items.length > 0
    );

    $("historyFeed").innerHTML = items.map(item => {
        const video = item.video;

        const username = getUsername(video.owner_id);

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

                    <p>${escapeHTML(username)}</p>

                    <p>
                        ${formatDate(item.watched_at)}
                        ·
                        ${isShort(video) ? "Short" : "Video"}
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
   63 — VIDEO VIEW TRACKING
   ============================================================ */

async function registerVideoView(videoId) {
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
        console.warn("View count update:", result.error);
    }
}


document.addEventListener("play", function(event) {
    const element = event.target;

    const videoId = element.dataset.playVideo;

    if (!videoId || !currentUser) return;

    addToWatchHistory(videoId);

    registerVideoView(videoId);

}, true);


/* ============================================================
   64 — MUTUAL FRIENDS FOR MESSAGES
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

    $("chatFriends").innerHTML = friends.length
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
   65 — OPEN CHAT
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

    $("chatTitle").textContent =
        getUsername(userId);

    $("messageInput").disabled = false;
    $("sendMessageBtn").disabled = false;

    renderChatFriends();

    await loadMessages();
}


/* ============================================================
   66 — LOAD MESSAGES
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

        $("chatMessages").innerHTML =
            "<p class='chat-empty'>Could not load messages. Check your Messages table and permissions.</p>";

        return;
    }

    const messages = result.data || [];

    $("chatMessages").innerHTML = messages.length
        ? messages.map(message => {
            const mine =
                String(message.sender_id) === String(currentUser.id);

            return `
                <div class="chat-bubble ${mine ? "mine" : ""}">

                    ${escapeHTML(message.text)}

                    <time>
                        ${formatDate(message.created_at)}
                    </time>

                </div>
            `;
        }).join("")
        : "<p class='chat-empty'>No messages yet. Say hello!</p>";

    $("chatMessages").scrollTop =
        $("chatMessages").scrollHeight;
}


/* ============================================================
   67 — SEND MESSAGE
   ============================================================ */

listen("chatForm", "submit", async function(event) {
    event.preventDefault();

    const text = $("messageInput").value.trim();

    if (!text || !currentChatUserId) return;

    const result = await db
        .from("messages")
        .insert({
            sender_id: currentUser.id,
            recipient_id: currentChatUserId,
            text: text
        });

    if (result.error) {
        showToast("Message failed: " + result.error.message);
        return;
    }

    $("messageInput").value = "";

    await loadMessages();
});


/* ============================================================
   68 — NOTIFICATIONS
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
   69 — NAVIGATION
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
    if (!allowedPages.includes(page)) {
        return;
    }

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

    $("sidebar").classList.remove("open");

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

    if (!navigation) return;

    event.preventDefault();

    const page = navigation.dataset.page;

    if (page === "profile") {
        currentProfileUserId = currentUser.id;
        profileMode = "home";
    }

    openPage(page);
});


/* ============================================================
   70 — PROFILE BUTTON
   ============================================================ */

listen("topProfileBtn", "click", function() {
    currentProfileUserId = currentUser.id;
    profileMode = "home";

    openPage("profile");
});


/* ============================================================
   71 — MOBILE MENU
   ============================================================ */

listen("mobileMenuBtn", "click", function() {
    $("sidebar").classList.toggle("open");
});


/* ============================================================
   72 — SEARCH
   ============================================================ */

listen("searchInput", "input", function() {
    const query = this.value.trim();

    $("clearSearch").classList.toggle(
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
    $("searchInput").value = "";

    this.classList.add("hidden");

    homeVisibleCycles = 1;
    exploreVisible = 6;

    renderHomeFeed();
    renderExplore();
});


/* ============================================================
   73 — THEME
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
   74 — SETTINGS PAGE
   ============================================================ */

function renderSettings() {
    $("settingTheme").value = settings.theme;
    $("settingAutoplay").checked = settings.autoplay;
    $("settingMuted").checked = settings.muted;
    $("settingHistory").checked = settings.history;

    $("settingsUsername").textContent =
        currentProfile.username || "Creator";

    $("settingsEmail").textContent =
        currentUser.email || "";

    $("settingsAvatar").textContent =
        getInitial(currentProfile.username);
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

    if (!settings.history) {
        showToast("New watch history entries are paused.");
    } else {
        showToast("Watch history enabled.");
    }
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
   75 — REFRESH HOME
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

        showToast(
            "Refresh failed: " + error.message
        );

    } finally {
        this.disabled = false;
    }
});


/* ============================================================
   76 — MODAL CLOSE BUTTONS
   ============================================================ */

document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", function() {
        hideModal(this.dataset.close);
    });
});


/* ============================================================
   77 — GLOBAL BUTTON ACTIONS
   ============================================================ */

document.addEventListener("click", function(event) {
    const button = event.target.closest("button");

    if (!button) return;

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

    if (button.dataset.createShort !== undefined) {
        openUpload("short");
    }

    if (button.dataset.openUpload) {
        openUpload(button.dataset.openUpload);
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
                const element = document.querySelector(
                    `[data-play-video="${CSS.escape(String(videoId))}"]`
                );

                element?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }, 200);
        }
    }

});


/* ============================================================
   78 — SIGN OUT
   ============================================================ */

async function signOutGoCat() {
    const result = await db.auth.signOut();

    if (result.error) {
        showToast(result.error.message);
        return;
    }

    currentUser = null;
    currentProfile = null;
    currentProfileUserId = null;

    openLoginScreen();
}


listen("logoutBtn", "click", signOutGoCat);
listen("settingsLogout", "click", signOutGoCat);


/* ============================================================
   79 — AUTH SESSION
   ============================================================ */

async function initializeGoCat() {
    const loader = $("loader");

    try {
        const result = await db.auth.getSession();

        if (result.error) {
            throw result.error;
        }

        const session = result.data.session;

        if (session?.user) {
            currentUser = session.user;

            await startGoCat();

        } else {
            openLoginScreen();
        }

    } catch (error) {
        console.error(error);

        openLoginScreen();

        showAuthMessage(
            "Could not connect to GoCat: " + error.message
        );

    } finally {
        loader?.classList.add("hide");
    }
}


db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;
        currentProfileUserId = null;

        openLoginScreen();
    }
});


/* ============================================================
   80 — START APPLICATION
   ============================================================ */

initializeGoCat();
