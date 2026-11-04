/* ============================================================
   GOCAT — COMPLETE APPLICATION
   YouTube-style Home Feed + Reels + Explore + Profiles
   Supabase Auth + Database + Storage
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

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


/* ============================================================
   02 — GLOBAL DATA
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

const PAGE_SIZE = 5;


/* ============================================================
   03 — DOM HELPER
   ============================================================ */

function $(id) {
    return document.getElementById(id);
}


/* ============================================================
   04 — BASIC HELPERS
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
    if (
        currentProfile &&
        String(currentProfile.id) === String(userId)
    ) {
        return currentProfile.username || "Creator";
    }

    return getUser(userId)?.username || "GoCat creator";
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
        Cooking: "🍳",
        School: "📚",
        Technology: "💻",
        Sports: "⚽",
        Art: "🎨",
        Entertainment: "😂",
        Other: "🌍"
    };

    return icons[topic] || "🌍";
}


function showToast(message) {
    const toast = $("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}


function showAuthMessage(message, success = false) {
    const element = $("authMessage");

    if (!element) return;

    element.textContent = message;

    element.style.color = success
        ? "#078c5d"
        : "#e34e68";
}


function showModal(id) {
    $(id)?.classList.remove("hidden");
}


function hideModal(id) {
    $(id)?.classList.add("hidden");
}


function getVideoURL(path) {
    if (!path) return "";

    if (String(path).startsWith("http")) {
        return path;
    }

    return db.storage
        .from(VIDEO_BUCKET)
        .getPublicUrl(path).data.publicUrl;
}


function getPostImageURL(path) {
    if (!path) return "";

    if (String(path).startsWith("http")) {
        return path;
    }

    return db.storage
        .from(POST_BUCKET)
        .getPublicUrl(path).data.publicUrl;
}


function safeLocalJSON(key, fallback = []) {
    try {
        return JSON.parse(
            localStorage.getItem(key) || JSON.stringify(fallback)
        );
    } catch {
        return fallback;
    }
}


/* ============================================================
   05 — AUTHENTICATION SCREENS
   ============================================================ */

function openLoginScreen() {
    $("authScreen").classList.remove("hidden");
    $("app").classList.add("hidden");

    $("loginForm").classList.remove("hidden");
    $("registerForm").classList.add("hidden");

    $("authTitle").textContent = "Welcome back";

    $("authSubtitle").textContent =
        "Sign in to continue to GoCat.";

    showAuthMessage("");
}


function openRegisterScreen() {
    $("authScreen").classList.remove("hidden");
    $("app").classList.add("hidden");

    $("loginForm").classList.add("hidden");
    $("registerForm").classList.remove("hidden");

    $("authTitle").textContent =
        "Create your GoCat account";

    $("authSubtitle").textContent =
        "Join the GoCat community.";

    showAuthMessage("");
}


function openApp() {
    $("authScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
}


$("showRegister").addEventListener(
    "click",
    openRegisterScreen
);


$("showLogin").addEventListener(
    "click",
    openLoginScreen
);


/* ============================================================
   06 — LOGIN
   ============================================================ */

$("loginForm").addEventListener("submit", async function(event) {
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

        if (result.error) throw result.error;

        currentUser = result.data.user;

        await startGoCat();

    } catch (error) {
        console.error(error);
        showAuthMessage(error.message || "Login failed.");
    }

    button.disabled = false;
    button.textContent = "Log in";
});


/* ============================================================
   07 — REGISTER
   ============================================================ */

$("registerForm").addEventListener("submit", async function(event) {
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
                data: {
                    username: username
                }
            }
        });

        if (result.error) throw result.error;

        if (result.data.session) {
            currentUser = result.data.user;
            await startGoCat();
        } else {
            openLoginScreen();

            showAuthMessage(
                "Account created. Log in after any required email confirmation.",
                true
            );
        }

    } catch (error) {
        console.error(error);
        showAuthMessage(error.message || "Registration failed.");
    }

    button.disabled = false;
    button.textContent = "Create account";
});


/* ============================================================
   08 — ENSURE USER PROFILE
   users.id IS TEXT — KEEP IT THAT WAY
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
            bio: "Welcome to my GoCat profile."
        })
        .select("*")
        .single();

    if (insert.error) {
        throw insert.error;
    }

    currentProfile = insert.data;
}


/* ============================================================
   09 — LOAD USERS
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

    if (
        !users.some(user =>
            String(user.id) === String(currentUser.id)
        )
    ) {
        users.unshift(currentProfile);
    }

    currentProfile =
        users.find(user =>
            String(user.id) === String(currentUser.id)
        ) || currentProfile;
}


/* ============================================================
   10 — LOAD VIDEOS, LIKES AND COMMENTS
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


/* ============================================================
   11 — LOAD FOLLOWS
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
   12 — LOAD POSTS AND POST LIKES
   ============================================================ */

async function loadPosts() {
    const result = await db
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });

    if (result.error) {
        console.warn("Posts could not load:", result.error.message);
        posts = [];
        return;
    }

    const likesResult = await db
        .from("post_likes")
        .select("post_id,user_id");

    if (likesResult.error) {
        console.warn(
            "Post likes could not load:",
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
   13 — LOAD ALL DATA
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
   14 — START GOCAT
   ============================================================ */

async function startGoCat() {
    try {
        await ensureProfile();
        await loadAllData();

        currentProfileUserId = currentUser.id;

        notifications = safeLocalJSON(
            "gocat_notifications_" + currentUser.id,
            []
        );

        $("welcomeName").textContent =
            currentProfile.username || "Creator";

        $("topProfileBtn").textContent =
            getInitial(currentProfile.username);

        openApp();

        renderEverything();

        openPage("home");

    } catch (error) {
        console.error(error);

        showToast(
            "GoCat loading error: " + error.message
        );
    }
}


/* ============================================================
   15 — RENDER ALL PAGES
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
}


/* ============================================================
   16 — VIDEO CARD
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
                            ${following ? "Following" : "＋ Follow"}
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
                <span>▶ ${Number(video.views || 0)} views</span>
                <span>${formatDate(video.created_at)}</span>
            </div>

            <div class="video-actions">

                <button
                    class="action-btn ${liked ? "liked" : ""}"
                    data-like-video="${escapeHTML(video.id)}">
                    ${liked ? "♥" : "♡"} ${video.likes?.length || 0}
                </button>

                <button
                    class="action-btn"
                    data-comments-video="${escapeHTML(video.id)}">
                    💬 ${video.comments?.length || 0}
                </button>

                <button
                    class="action-btn"
                    data-share-video="${escapeHTML(video.id)}">
                    ↗ Share
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
   17 — POST CARD
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
   18 — HOME SHORTS CARD
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
                        ▶ ${Number(video.views || 0)} views
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
                    💬
                </button>

            </div>

        </article>
    `;
}


/* ============================================================
   19 — HOME FEED DATA
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
            const score = video => {
                let points = 0;

                if (isFollowing(video.owner_id)) {
                    points += 5;
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
            };

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
   20 — BUILD REPEATING YOUTUBE-STYLE SECTIONS
   ============================================================ */

function buildHomeFeedCycles() {
    const data = getHomeFeedData();

    const regularVideos = data.regularVideos;
    const shorts = data.shorts;
    const communityPosts = data.communityPosts;

    let videoIndex = 0;
    let shortsIndex = 0;
    let postIndex = 0;

    const cycles = [];

    while (
        videoIndex < regularVideos.length ||
        shortsIndex < shorts.length ||
        postIndex < communityPosts.length
    ) {
        const sections = [];

        /* FOUR REGULAR VIDEOS */

        if (videoIndex < regularVideos.length) {
            const group = regularVideos.slice(
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

        /* FOUR SHORTS */

        if (shortsIndex < shorts.length) {
            const group = shorts.slice(
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
                                <p>Quick videos to discover.</p>
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

        /* ONE OR TWO POSTS */

        if (postIndex < communityPosts.length) {
            const group = communityPosts.slice(
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
   21 — RENDER HOME FEED
   ============================================================ */

function renderHomeFeed() {
    const cycles = buildHomeFeedCycles();

    const visibleCycles = cycles.slice(
        0,
        homeVisibleCycles
    );

    $("homeFeed").innerHTML =
        visibleCycles.join("");

    const data = getHomeFeedData();

    const totalItems =
        data.regularVideos.length +
        data.shorts.length +
        data.communityPosts.length;

    const shownItems = Math.min(
        totalItems,
        visibleCycles.reduce((total, html) => {
            const matches = html.match(
                /class="video-card"|class="post-card"|class="home-short-card"/g
            );

            return total + (matches ? matches.length : 0);
        }, 0)
    );

    $("homeEmpty").classList.toggle(
        "hidden",
        totalItems > 0
    );

    $("homeLoadMoreWrap").classList.toggle(
        "hidden",
        homeVisibleCycles >= cycles.length
    );

    $("homeCount").textContent =
        "Showing " + shownItems +
        " of " + totalItems + " items";
}


/* ============================================================
   22 — HOME LOAD MORE
   ============================================================ */

$("homeLoadMore").addEventListener("click", function() {
    homeVisibleCycles += 1;
    renderHomeFeed();
});


/* ============================================================
   23 — HOME TOPIC FILTERS
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
        .slice(0, 12);

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
   25 — FOLLOW / UNFOLLOW
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

            follows = follows.filter(item => item !== existing);

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
   27 — VIDEO COMMENTS
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

                <p>${escapeHTML(comment.text)}</p>

                <small>${formatDate(comment.created_at)}</small>
            </div>
        `).join("")
        : "<p class='muted-text'>No comments yet. Start the conversation!</p>";
}


$("commentForm").addEventListener("submit", async function(event) {
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
        location.href.split("?")[0] +
        "?video=" + encodeURIComponent(videoId);

    try {
        if (navigator.share) {
            await navigator.share({
                title: "GoCat video",
                text: "Check out this video on GoCat!",
                url: url
            });
        } else {
            await navigator.clipboard.writeText(url);
            showToast("Video link copied!");
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            showToast("Sharing is unavailable.");
        }
    }
}


/* ============================================================
   29 — DELETE VIDEO
   ============================================================ */

async function deleteVideo(videoId) {
    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video || !isOwnContent(video.owner_id)) return;

    if (!confirm("Delete this video permanently?")) return;

    const result = await db
        .from("videos")
        .delete()
        .eq("id", videoId)
        .eq("owner_id", currentUser.id);

    if (result.error) {
        showToast("Delete error: " + result.error.message);
        return;
    }

    if (video.storage_path) {
        await db.storage
            .from(VIDEO_BUCKET)
            .remove([video.storage_path]);
    }

    await loadVideos();

    renderEverything();

    showToast("Video deleted.");
}


/* ============================================================
   30 — REELS PAGE
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
                    <h2>No Reels yet 🐱</h2>
                    <p>Be the first to create a GoCat Reel.</p>

                    <button
                        class="primary-btn"
                        data-create-reel>
                        Create Reel
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
                    muted
                    preload="metadata"
                    data-play-video="${escapeHTML(video.id)}">
                </video>

                <button
                    class="reel-sound-btn"
                    data-reel-sound>
                    🔇
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
                        💬
                    </button>

                    <button
                        class="reel-action"
                        data-share-video="${escapeHTML(video.id)}">
                        ↗
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

    reelObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const video = entry.target;

            if (entry.isIntersecting) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });
    }, {
        root: feed,
        threshold: 0.65
    });

    feed.querySelectorAll(".reel-video").forEach(video => {
        reelObserver.observe(video);
    });
}


$("reelsLoadMore").addEventListener("click", function() {
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
        const items =
            Array.from(document.querySelectorAll("[data-reel-item]"));

        const target = items.find(item =>
            item.dataset.reelItem === String(videoId)
        );

        target?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, 180);
}


/* ============================================================
   31 — EXPLORE TABS
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


/* ============================================================
   32 — EXPLORE REEL CARD
   ============================================================ */

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
                    <small>GoCat Reel</small>
                </div>

            </div>

            <div class="reel-thumb">

                <video
                    src="${escapeHTML(getVideoURL(video.storage_path))}"
                    muted
                    playsinline
                    preload="metadata">
                </video>

                <span class="reel-thumb-label">
                    ▶ REEL
                </span>

            </div>

            <p class="feed-post-content">
                ${escapeHTML(video.title)}
            </p>

            <button
                class="feed-reel-open"
                data-open-reel-id="${escapeHTML(video.id)}">
                Watch this Reel
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
    }

    else if (exploreMode === "reels") {
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
    }

    else if (exploreMode === "people") {
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
                        View profile
                    </button>

                    <button
                        class="soft-btn"
                        data-follow-user="${escapeHTML(user.id)}">
                        ${isFollowing(user.id) ? "Following" : "＋ Follow"}
                    </button>

                </div>
            `).join("");

        updateExploreMore(found.length);
    }

    else if (exploreMode === "posts") {
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


$("exploreLoadMore").addEventListener("click", function() {
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
   35 — OPEN UPLOAD MODAL
   ============================================================ */

function openUpload(mode = "video") {
    uploadMode = mode;

    selectedVideoFile = null;
    exportedReelFile = null;

    $("videoFile").value = "";
    $("selectedVideoName").textContent = "";

    $("videoTitle").value = "";
    $("videoDescription").value = "";

    $("reelEditor").classList.add("hidden");

    $("uploadTitle").textContent =
        mode === "reel" ? "Create a Reel" : "Upload video";

    $("uploadDescription").textContent =
        mode === "reel"
            ? "Create a vertical video for GoCat."
            : "Share a video with the GoCat community.";

    $("publishVideoBtn").textContent =
        mode === "reel" ? "Publish Reel" : "Publish video";

    showModal("uploadModal");
}


$("uploadTopBtn").addEventListener("click", function() {
    openUpload("video");
});


$("createReelBtn").addEventListener("click", function() {
    openUpload("reel");
});


/* ============================================================
   36 — VIDEO FILE SELECTION
   ============================================================ */

$("videoFile").addEventListener("change", function() {
    const file = this.files[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
        showToast("Please select a video.");
        return;
    }

    selectedVideoFile = file;
    exportedReelFile = null;

    $("selectedVideoName").textContent = file.name;

    if (uploadMode === "reel") {
        prepareReelPreview(file);
    }
});


/* ============================================================
   37 — REEL PREVIEW
   ============================================================ */

function prepareReelPreview(file) {
    const preview = $("reelPreview");

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }

    currentObjectURL = URL.createObjectURL(file);

    preview.src = currentObjectURL;

    $("reelEditor").classList.remove("hidden");

    $("editorStatus").textContent =
        "Choose your trim, filter, framing and text.";

    preview.onloadedmetadata = function() {
        $("trimStart").value = "0";

        $("trimEnd").value =
            preview.duration.toFixed(1);
    };
}


$("reelOverlayText").addEventListener("input", function() {
    $("reelOverlayPreview").textContent = this.value;
});


$("reelFilter").addEventListener("change", function() {
    const filters = {
        none: "none",
        warm: "sepia(.4) saturate(1.3)",
        cool: "hue-rotate(15deg) saturate(.9)",
        mono: "grayscale(1)",
        vivid: "saturate(1.8) contrast(1.1)"
    };

    $("reelPreview").style.filter =
        filters[this.value] || "none";
});


$("reelFraming").addEventListener("change", function() {
    $("reelPreview").style.objectFit =
        this.value === "contain" ? "contain" : "cover";
});


/* ============================================================
   38 — APPLY REEL EDITS
   ============================================================ */

$("exportReelBtn").addEventListener("click", async function() {
    const preview = $("reelPreview");

    if (!selectedVideoFile) {
        showToast("Choose a video first.");
        return;
    }

    if (
        !window.MediaRecorder ||
        !preview.captureStream
    ) {
        $("editorStatus").textContent =
            "This browser cannot export edits. You can still upload the original video.";

        showToast("Video export is not supported here.");
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

    if (end <= start) {
        showToast("Trim end must be after trim start.");
        return;
    }

    const canvas = document.createElement("canvas");

    canvas.width = 720;
    canvas.height = 1280;

    const ctx = canvas.getContext("2d");

    const filterMap = {
        none: "none",
        warm: "sepia(.4) saturate(1.3)",
        cool: "hue-rotate(15deg) saturate(.9)",
        mono: "grayscale(1)",
        vivid: "saturate(1.8) contrast(1.1)"
    };

    const filter =
        filterMap[$("reelFilter").value] || "none";

    const framing = $("reelFraming").value;
    const overlay = $("reelOverlayText").value.trim();

    const canvasStream = canvas.captureStream(30);

    let sourceStream = null;
    let recorder = null;
    let animationId = null;

    const chunks = [];

    const mimeType =
        MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
            ? "video/webm;codecs=vp9"
            : "video/webm";

    const button = this;

    button.disabled = true;
    button.textContent = "Rendering...";

    $("editorStatus").textContent =
        "Rendering edits. Keep this window open.";

    try {
        sourceStream = preview.captureStream();

        sourceStream.getAudioTracks().forEach(track => {
            canvasStream.addTrack(track);
        });

        recorder = new MediaRecorder(canvasStream, {
            mimeType
        });

        recorder.ondataavailable = event => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        const finished = new Promise((resolve, reject) => {
            recorder.onstop = resolve;
            recorder.onerror = reject;
        });

        let stopped = false;

        function stopRecording() {
            if (stopped) return;

            stopped = true;

            preview.pause();

            if (recorder.state !== "inactive") {
                recorder.stop();
            }
        }

        function drawFrame() {
            if (stopped) return;

            const width = preview.videoWidth;
            const height = preview.videoHeight;

            if (!width || !height) {
                animationId = requestAnimationFrame(drawFrame);
                return;
            }

            const scale = framing === "cover"
                ? Math.max(720 / width, 1280 / height)
                : Math.min(720 / width, 1280 / height);

            const drawWidth = width * scale;
            const drawHeight = height * scale;

            const x = (720 - drawWidth) / 2;
            const y = (1280 - drawHeight) / 2;

            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, 720, 1280);

            ctx.filter = filter;

            ctx.drawImage(
                preview,
                x,
                y,
                drawWidth,
                drawHeight
            );

            ctx.filter = "none";

            if (overlay) {
                ctx.font = "bold 42px Arial";
                ctx.textAlign = "center";
                ctx.fillStyle = "white";
                ctx.strokeStyle = "black";
                ctx.lineWidth = 5;

                ctx.strokeText(overlay, 360, 1140);
                ctx.fillText(overlay, 360, 1140);
            }

            if (preview.currentTime >= end || preview.ended) {
                stopRecording();
                return;
            }

            animationId = requestAnimationFrame(drawFrame);
        }

        preview.pause();

        preview.currentTime = start;

        await new Promise(resolve => {
            preview.onseeked = resolve;
        });

        recorder.start();

        await preview.play();

        drawFrame();

        await finished;

        exportedReelFile = new File(
            chunks,
            "gocat-reel.webm",
            { type: mimeType }
        );

        $("editorStatus").textContent =
            "Edits applied. Your Reel is ready to upload.";

        showToast("Reel edits completed!");

    } catch (error) {
        console.error(error);

        $("editorStatus").textContent =
            "Export failed. You can still upload the original video.";

        showToast("Could not export the edited video.");

    } finally {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }

        preview.pause();

        canvasStream.getTracks().forEach(track => track.stop());

        if (sourceStream) {
            sourceStream.getTracks().forEach(track => track.stop());
        }

        button.disabled = false;
        button.textContent = "Apply edits";
    }
});


/* ============================================================
   39 — PUBLISH VIDEO OR REEL
   ============================================================ */

$("uploadForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const file = exportedReelFile || selectedVideoFile;

    if (!file) {
        showToast("Choose a video first.");
        return;
    }

    const title = $("videoTitle").value.trim();
    const description = $("videoDescription").value.trim();
    const topic = $("videoTopic").value;

    if (!title) {
        showToast("Add a title first.");
        return;
    }

    const button = $("publishVideoBtn");
    const bar = $("uploadProgressBar");

    button.disabled = true;
    button.textContent = "Uploading...";

    $("uploadProgress").classList.remove("hidden");

    bar.style.width = "10%";

    let storagePath = null;

    try {
        const extension =
            file.name.split(".").pop().toLowerCase() || "mp4";

        storagePath =
            currentUser.id + "/" +
            Date.now() + "." + extension;

        const upload = await db.storage
            .from(VIDEO_BUCKET)
            .upload(storagePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type
            });

        if (upload.error) throw upload.error;

        bar.style.width = "70%";

        const result = await db
            .from("videos")
            .insert({
                owner_id: currentUser.id,
                title: title,
                description: description,
                topic: topic,
                storage_path: storagePath,
                views: 0,
                is_short: uploadMode === "reel"
            });

        if (result.error) throw result.error;

        bar.style.width = "100%";

        await loadVideos();

        homeVisibleCycles = 1;
        reelsVisible = Math.max(reelsVisible, PAGE_SIZE);

        renderEverything();

        hideModal("uploadModal");

        $("uploadForm").reset();

        selectedVideoFile = null;
        exportedReelFile = null;

        showToast(
            uploadMode === "reel"
                ? "Your Reel was published!"
                : "Your video was published!"
        );

    } catch (error) {
        console.error(error);

        if (storagePath) {
            await db.storage
                .from(VIDEO_BUCKET)
                .remove([storagePath]);
        }

        showToast("Upload failed: " + error.message);

    } finally {
        button.disabled = false;

        button.textContent =
            uploadMode === "reel"
                ? "Publish Reel"
                : "Publish video";
    }
});


/* ============================================================
   40 — CREATE POSTS
   ============================================================ */

$("postImage").addEventListener("change", function() {
    $("postImageName").textContent =
        this.files[0]?.name || "";
});


$("createPostForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const content = $("postContent").value.trim();
    const imageFile = $("postImage").files[0];

    if (!content && !imageFile) {
        showToast("Write something or choose a photo.");
        return;
    }

    const button =
        this.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Publishing...";

    let storagePath = null;

    try {
        if (imageFile) {
            if (!imageFile.type.startsWith("image/")) {
                throw new Error("Please choose an image.");
            }

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

            if (upload.error) throw upload.error;
        }

        const result = await db
            .from("posts")
            .insert({
                user_id: currentUser.id,
                content: content,
                media_path: storagePath
            });

        if (result.error) throw result.error;

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
        button.textContent = "Publish";
    }
});


/* ============================================================
   41 — POST LIKES
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

            if (result.error) throw result.error;

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

            if (result.error) throw result.error;

            post.likes.push(String(currentUser.id));
        }

        renderPosts();
        renderHomeFeed();
        renderExplore();
        renderProfile();

    } catch (error) {
        console.error(error);
        showToast("Post like failed: " + error.message);
    }
}


/* ============================================================
   42 — DELETE POST
   ============================================================ */

async function deletePost(postId) {
    const post = posts.find(item =>
        String(item.id) === String(postId)
    );

    if (!post || !isOwnContent(post.user_id)) return;

    if (!confirm("Delete this post?")) return;

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

    renderPosts();
    renderHomeFeed();
    renderExplore();
    renderProfile();

    showToast("Post deleted.");
}


/* ============================================================
   43 — POSTS PAGE
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


$("postsLoadMore").addEventListener("click", function() {
    postsVisible += PAGE_SIZE;
    renderPosts();
});


/* ============================================================
   44 — PROFILE PAGE
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
            ? "Edit profile"
            : isFollowing(profileId)
                ? "Following"
                : "＋ Follow";

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

    const myReels = myVideos.filter(video =>
        isShort(video)
    );

    const myRegularVideos = myVideos.filter(video =>
        !isShort(video)
    );

    const myPosts = posts.filter(post =>
        String(post.user_id) === String(profileId)
    );

    const followerCount = follows.filter(item =>
        String(item.following_id) === String(profileId)
    ).length;

    const followingCount = follows.filter(item =>
        String(item.follower_id) === String(profileId)
    ).length;

    $("profileVideoCount").textContent =
        myRegularVideos.length;

    $("profileFollowerCount").textContent =
        followerCount;

    $("profileFollowingCount").textContent =
        followingCount;

    $("profilePostCount").textContent =
        myPosts.length;

    $("profileHome").innerHTML = `
        <div class="section-heading">
            <h2>Videos</h2>
        </div>

        <div class="video-grid">
            ${myRegularVideos.slice(0, 3).map(videoCard).join("")}
        </div>

        <div class="section-heading">
            <h2>Reels</h2>
        </div>

        <div class="video-grid">
            ${myReels.slice(0, 3).map(videoCard).join("")}
        </div>

        <div class="section-heading">
            <h2>Posts</h2>
        </div>

        <div class="posts-feed">
            ${myPosts.slice(0, 3).map(postCard).join("")}
        </div>
    `;

    $("profileReels").innerHTML =
        myReels.map(videoCard).join("");

    $("profileVideos").innerHTML =
        myRegularVideos.map(videoCard).join("");

    $("profilePosts").innerHTML =
        myPosts.map(postCard).join("");

    renderProfileTab(profileMode);
}


/* ============================================================
   45 — PROFILE TABS
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
   46 — EDIT PROFILE
   ============================================================ */

$("editProfileForm").addEventListener("submit", async function(event) {
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

    $("welcomeName").textContent = username;
    $("topProfileBtn").textContent = getInitial(username);

    hideModal("editProfileModal");

    showToast("Profile updated!");
});


/* ============================================================
   47 — NOTIFICATIONS
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
                <div>🔔</div>
                <h3>No notifications yet</h3>
                <p>Your activity will appear here.</p>
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
                <small>${formatDate(item.created_at)}</small>
            </div>

        </div>
    `).join("");
}


$("clearNotificationsBtn").addEventListener("click", function() {
    notifications = [];

    localStorage.setItem(
        "gocat_notifications_" + currentUser.id,
        "[]"
    );

    renderNotifications();
});


/* ============================================================
   48 — MUTUAL FRIENDS
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
   49 — OPEN CHAT
   ============================================================ */

async function openChat(userId) {
    const allowed = getMutualFriends().some(user =>
        String(user.id) === String(userId)
    );

    if (!allowed) {
        showToast("Chats are available to mutual followers.");
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
   50 — LOAD MESSAGES
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
                    <time>${formatDate(message.created_at)}</time>
                </div>
            `;
        }).join("")
        : "<p class='chat-empty'>No messages yet. Say hello!</p>";

    $("chatMessages").scrollTop =
        $("chatMessages").scrollHeight;
}


/* ============================================================
   51 — SEND MESSAGE
   ============================================================ */

$("chatForm").addEventListener("submit", async function(event) {
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
   52 — NAVIGATION
   ============================================================ */

function openPage(page) {
    const allowedPages = [
        "home",
        "reels",
        "explore",
        "following",
        "posts",
        "chats",
        "notifications",
        "profile"
    ];

    if (!allowedPages.includes(page)) return;

    currentPage = page;

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
    if (currentPage === "posts") renderPosts();
    if (currentPage === "chats") renderChatFriends();
    if (currentPage === "notifications") renderNotifications();
    if (currentPage === "profile") renderProfile();
}


/* ============================================================
   53 — PROFILE NAVIGATION FIX
   Clicking Profile always opens MY profile
   ============================================================ */

document.addEventListener("click", function(event) {
    const button = event.target.closest("[data-page]");

    if (!button) return;

    event.preventDefault();

    const page = button.dataset.page;

    if (page === "profile") {
        currentProfileUserId = currentUser.id;
        profileMode = "home";
    }

    openPage(page);
});


/* ============================================================
   54 — TOP PROFILE BUTTON
   ============================================================ */

$("topProfileBtn").addEventListener("click", function() {
    currentProfileUserId = currentUser.id;
    profileMode = "home";

    openPage("profile");
});


/* ============================================================
   55 — MOBILE MENU
   ============================================================ */

$("mobileMenuBtn").addEventListener("click", function() {
    $("sidebar").classList.toggle("open");
});


/* ============================================================
   56 — SEARCH
   ============================================================ */

$("searchInput").addEventListener("input", function() {
    const query = this.value.trim();

    $("clearSearch").classList.toggle(
        "hidden",
        query.length === 0
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


$("clearSearch").addEventListener("click", function() {
    $("searchInput").value = "";

    this.classList.add("hidden");

    homeVisibleCycles = 1;
    exploreVisible = 6;

    renderHomeFeed();
    renderExplore();
});


/* ============================================================
   57 — THEME BUTTON
   ============================================================ */

function updateTheme() {
    const dark =
        document.body.classList.contains("dark");

    $("themeIcon").textContent =
        dark ? "☀️" : "🌙";

    $("themeLabel").textContent =
        dark ? "Light mode" : "Dark mode";
}


if (localStorage.getItem("gocat_theme") === "dark") {
    document.body.classList.add("dark");
}

updateTheme();


$("themeBtn").addEventListener("click", function() {
    document.body.classList.toggle("dark");

    const dark =
        document.body.classList.contains("dark");

    localStorage.setItem(
        "gocat_theme",
        dark ? "dark" : "light"
    );

    updateTheme();
});


/* ============================================================
   58 — REFRESH HOME FEED
   ============================================================ */

$("refreshFeedBtn").addEventListener("click", async function() {
    this.disabled = true;

    try {
        await loadAllData();

        homeVisibleCycles = 1;

        renderEverything();

        showToast("Feed refreshed!");

    } catch (error) {
        console.error(error);
        showToast("Could not refresh the feed.");
    }

    this.disabled = false;
});


/* ============================================================
   59 — VIDEO VIEWS
   One view per signed-in browser user per video
   ============================================================ */

document.addEventListener("play", async function(event) {
    const videoElement = event.target;
    const videoId = videoElement.dataset.playVideo;

    if (!videoId || !currentUser) return;

    const key = "gocat_viewed_" + currentUser.id;

    const viewed = safeLocalJSON(key, []);

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

    video.views = Number(video.views || 0) + 1;

    const result = await db
        .from("videos")
        .update({
            views: video.views
        })
        .eq("id", videoId);

    if (result.error) {
        console.warn("View count update failed:", result.error);
    }

}, true);


/* ============================================================
   60 — MODAL CLOSE BUTTONS
   ============================================================ */

document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", function() {
        hideModal(this.dataset.close);
    });
});


/* ============================================================
   61 — LOGOUT
   ============================================================ */

$("logoutBtn").addEventListener("click", async function() {
    const result = await db.auth.signOut();

    if (result.error) {
        showToast(result.error.message);
        return;
    }

    currentUser = null;
    currentProfile = null;
    currentProfileUserId = null;

    openLoginScreen();
});


/* ============================================================
   62 — GLOBAL BUTTON ACTIONS
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

    if (button.dataset.reelSound !== undefined) {
        const reel = button.closest(".reel-item");
        const video = reel?.querySelector(".reel-video");

        if (video) {
            video.muted = !video.muted;

            button.textContent =
                video.muted ? "🔇" : "🔊";
        }
    }

    if (button.dataset.createReel !== undefined) {
        openUpload("reel");
    }

    if (button.dataset.openUpload) {
        openUpload(button.dataset.openUpload);
    }

    if (button.dataset.goPage) {
        if (button.dataset.goPage === "profile") {
            currentProfileUserId = currentUser.id;
        }

        openPage(button.dataset.goPage);
    }
});


/* ============================================================
   63 — AUTH SESSION
   ============================================================ */

async function initializeGoCat() {
    const loader = $("loader");

    try {
        const result = await db.auth.getSession();

        if (result.error) throw result.error;

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
            "Could not connect to GoCat. Refresh and try again."
        );

    } finally {
        loader?.classList.add("hide");
    }
}


/* ============================================================
   64 — AUTH STATE CHANGES
   ============================================================ */

db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;
        currentProfileUserId = null;

        openLoginScreen();
    }
});


/* ============================================================
   65 — START APPLICATION
   ============================================================ */

initializeGoCat();
