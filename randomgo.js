/* =========================================================
   GOCAT — APPLICATION JAVASCRIPT
   Supabase Auth, Videos, Reels, Posts, Follows and Chats
   ========================================================= */


/* =========================================================
   01. SUPABASE CONFIG
   ========================================================= */

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


/* =========================================================
   02. APPLICATION DATA
   ========================================================= */

let currentUser = null;
let currentProfile = null;

let users = [];
let videos = [];
let posts = [];
let follows = [];
let notifications = [];

let currentPage = "home";
let currentProfileUserId = null;
let currentCommentVideoId = null;
let currentChatUserId = null;

let activeHomeTopic = "All";
let exploreMode = "videos";
let profileMode = "home";

let homeOffset = 0;
let reelsOffset = 0;
let postsOffset = 0;
let exploreOffset = 0;

const PAGE_SIZE = 5;

let uploadMode = "video";
let selectedVideoFile = null;
let exportedReelFile = null;

let currentObjectURL = null;


/* =========================================================
   03. SHORT DOM HELPER
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   04. BASIC HELPERS
   ========================================================= */

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

function getUsername(userId) {
    const person = users.find(
        user => String(user.id) === String(userId)
    );

    return person?.username || "GoCat user";
}

function getUser(userId) {
    return users.find(
        user => String(user.id) === String(userId)
    );
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
    if (minutes < 60) return minutes + "m ago";

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h ago";

    const days = Math.floor(hours / 24);
    if (days < 30) return days + "d ago";

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
    element.style.color = success ? "#078c5d" : "#e34e68";
}

function getVideoURL(path) {
    if (!path) return "";

    if (String(path).startsWith("http")) {
        return path;
    }

    const result = db.storage
        .from(VIDEO_BUCKET)
        .getPublicUrl(path);

    return result.data.publicUrl;
}

function getPostImageURL(path) {
    if (!path) return "";

    if (String(path).startsWith("http")) {
        return path;
    }

    const result = db.storage
        .from(POST_BUCKET)
        .getPublicUrl(path);

    return result.data.publicUrl;
}

function showModal(id) {
    $(id)?.classList.remove("hidden");
}

function hideModal(id) {
    $(id)?.classList.add("hidden");
}

function addLocalNotification(icon, message) {
    notifications.unshift({
        id: crypto.randomUUID(),
        icon,
        text: message,
        created_at: new Date().toISOString()
    });

    notifications = notifications.slice(0, 100);

    localStorage.setItem(
        "gocat_notifications_" + currentUser.id,
        JSON.stringify(notifications)
    );

    renderNotifications();
}


/* =========================================================
   05. AUTHENTICATION SCREENS
   ========================================================= */

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

    $("authTitle").textContent = "Create your account";
    $("authSubtitle").textContent =
        "Join the GoCat community.";

    showAuthMessage("");
}

function openApp() {
    $("authScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
}


/* =========================================================
   06. LOGIN
   ========================================================= */

$("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    const button = this.querySelector('button[type="submit"]');

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
        showAuthMessage(error.message || "Login failed.");
    }

    button.disabled = false;
    button.textContent = "Log in";
});


/* =========================================================
   07. REGISTER
   ========================================================= */

$("registerForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const username = $("registerUsername").value.trim();
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;
    const confirm = $("registerConfirm").value;

    if (password !== confirm) {
        showAuthMessage("Passwords do not match.");
        return;
    }

    const button = this.querySelector('button[type="submit"]');

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

        if (!result.data.user) {
            throw new Error("Account could not be created.");
        }

        if (result.data.session) {
            currentUser = result.data.user;
            await startGoCat();
        } else {
            showAuthMessage(
                "Account created. Check your email if confirmation is enabled.",
                true
            );
            openLoginScreen();
            showAuthMessage("Account created. You can now log in.", true);
        }

    } catch (error) {
        showAuthMessage(error.message || "Registration failed.");
    }

    button.disabled = false;
    button.textContent = "Create account";
});


/* =========================================================
   08. PROFILE CREATION
   ========================================================= */

async function ensureProfile() {
    const result = await db
        .from("users")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (result.error) throw result.error;

    if (result.data) {
        currentProfile = result.data;
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

    if (insert.error) throw insert.error;

    currentProfile = insert.data;
}


/* =========================================================
   09. LOAD DATABASE DATA
   ========================================================= */

async function loadAllData() {
    const userResult = await db
        .from("users")
        .select("id,username,email,bio,created_at")
        .order("created_at", { ascending: false });

    if (userResult.error) throw userResult.error;

    users = userResult.data || [];

    const videoResult = await db
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false });

    if (videoResult.error) throw videoResult.error;

    const likeResult = await db
        .from("likes")
        .select("video_id,user_id");

    if (likeResult.error) throw likeResult.error;

    const commentResult = await db
        .from("comments")
        .select("*")
        .order("created_at", { ascending: true });

    if (commentResult.error) throw commentResult.error;

    const followResult = await db
        .from("follows")
        .select("follower_id,following_id");

    if (followResult.error) throw followResult.error;

    const videoLikes = likeResult.data || [];
    const videoComments = commentResult.data || [];

    videos = (videoResult.data || []).map(video => {
        return {
            ...video,

            likes: videoLikes
                .filter(item => item.video_id === video.id)
                .map(item => String(item.user_id)),

            comments: videoComments.filter(
                item => item.video_id === video.id
            )
        };
    });

    follows = followResult.data || [];

    await loadPosts();
}


/* =========================================================
   10. LOAD POSTS
   ========================================================= */

async function loadPosts() {
    const result = await db
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });

    if (result.error) {
        console.warn("Posts could not be loaded:", result.error.message);
        posts = [];
        return;
    }

    const likes = await db
        .from("post_likes")
        .select("post_id,user_id");

    const postLikes = likes.data || [];

    posts = (result.data || []).map(post => ({
        ...post,
        likes: postLikes
            .filter(like => like.post_id === post.id)
            .map(like => String(like.user_id))
    }));
}


/* =========================================================
   11. START GOCAT
   ========================================================= */

async function startGoCat() {
    try {
        await ensureProfile();
        await loadAllData();

        notifications = JSON.parse(
            localStorage.getItem(
                "gocat_notifications_" + currentUser.id
            ) || "[]"
        );

        openApp();

        $("welcomeName").textContent =
            currentProfile.username || "Creator";

        $("topProfileBtn").textContent =
            getInitial(currentProfile.username);

        renderEverything();
        openPage("home");

    } catch (error) {
        console.error(error);
        showToast("Could not load GoCat: " + error.message);
    }
}


/* =========================================================
   12. RENDER ALL PAGES
   ========================================================= */

function renderEverything() {
    renderSuggestedCreators();
    renderHomeFeed();
    renderReels();
    renderExplore();
    renderFollowing();
    renderPosts();
    renderProfile();
    renderNotifications();
    renderChatFriends();
}


/* =========================================================
   13. VIDEO CARD
   ========================================================= */

function videoCard(video) {
    const owner = getUser(video.owner_id);

    const username = owner?.username || "GoCat creator";

    const isOwner =
        String(video.owner_id) === String(currentUser.id);

    const isFollowing = follows.some(item =>
        String(item.follower_id) === String(currentUser.id) &&
        String(item.following_id) === String(video.owner_id)
    );

    const liked = video.likes?.includes(String(currentUser.id));

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
                    !isOwner
                    ? `
                        <button
                            class="follow-btn"
                            data-follow-user="${escapeHTML(video.owner_id)}">
                            ${isFollowing ? "Following" : "＋ Follow"}
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
                    isOwner
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


/* =========================================================
   14. FOR YOU RECOMMENDATIONS
   ========================================================= */

function scoreVideo(video) {
    let score = 0;

    if (activeHomeTopic !== "All") {
        if (video.topic !== activeHomeTopic) return -100;
        score += 10;
    }

    const isFollowing = follows.some(item =>
        String(item.follower_id) === String(currentUser.id) &&
        String(item.following_id) === String(video.owner_id)
    );

    if (isFollowing) score += 5;

    const watched = JSON.parse(
        localStorage.getItem(
            "gocat_watched_" + currentUser.id
        ) || "[]"
    );

    if (watched.includes(video.id)) score -= 2;

    const age =
        Date.now() - new Date(video.created_at).getTime();

    const hoursOld = age / 3600000;

    score += Math.max(0, 5 - hoursOld / 24);

    score += Math.min(
        Number(video.views || 0) / 100,
        3
    );

    return score;
}

function renderHomeFeed() {
    let selected = videos
        .filter(video => video.is_short !== true)
        .slice()
        .sort((a, b) => scoreVideo(b) - scoreVideo(a));

    if (activeHomeTopic !== "All") {
        selected = selected.filter(
            video => video.topic === activeHomeTopic
        );
    }

    const start = homeOffset;
    const page = selected.slice(start, start + PAGE_SIZE);

    const feed = $("homeFeed");
    feed.innerHTML = page.map(videoCard).join("");

    $("homeEmpty").classList.toggle(
        "hidden",
        selected.length !== 0
    );

    $("homeLoadMoreWrap").classList.toggle(
        "hidden",
        start + PAGE_SIZE >= selected.length
    );

    $("homeCount").textContent =
        "Showing " + Math.min(start + PAGE_SIZE, selected.length) +
        " of " + selected.length;
}


/* =========================================================
   15. LOAD MORE HOME
   ========================================================= */

$("homeLoadMore").addEventListener("click", function() {
    homeOffset += PAGE_SIZE;
    renderHomeFeed();
});


/* =========================================================
   16. SUGGESTED CREATORS
   ========================================================= */

function renderSuggestedCreators() {
    const container = $("suggestedCreators");

    const suggestions = users
        .filter(user =>
            String(user.id) !== String(currentUser.id)
        )
        .filter(user =>
            !follows.some(item =>
                String(item.follower_id) === String(currentUser.id) &&
                String(item.following_id) === String(user.id)
            )
        )
        .slice(0, 12);

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


/* =========================================================
   17. REELS
   ========================================================= */

function renderReels() {
    const container = $("reelsFeed");

    const reelVideos = videos.filter(
        video => video.is_short === true
    );

    if (!reelVideos.length) {
        container.innerHTML = `
            <div class="reel-empty">
                <div>
                    <h2>No Reels yet 🐱</h2>
                    <p>Upload the first GoCat Reel.</p>
                    <button
                        class="primary-btn"
                        id="emptyCreateReel">
                        Create Reel
                    </button>
                </div>
            </div>
        `;
        return;
    }

    const page = reelVideos.slice(
        0,
        reelsOffset + PAGE_SIZE
    );

    container.innerHTML = page.map(video => {
        const owner = getUser(video.owner_id);
        const username = owner?.username || "Creator";

        const liked =
            video.likes?.includes(String(currentUser.id));

        const following = follows.some(item =>
            String(item.follower_id) === String(currentUser.id) &&
            String(item.following_id) === String(video.owner_id)
        );

        const isOwner =
            String(video.owner_id) === String(currentUser.id);

        return `
            <article class="reel-item">

                <video
                    class="reel-video"
                    src="${escapeHTML(getVideoURL(video.storage_path))}"
                    playsinline
                    loop
                    muted
                    preload="metadata">
                </video>

                <button class="reel-sound-btn" data-reel-sound>
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
                            !isOwner
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

    activateReelObserver();
}

function activateReelObserver() {
    const feed = $("reelsFeed");

    const reelObserver = new IntersectionObserver(entries => {
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
    reelsOffset += PAGE_SIZE;
    renderReels();
});


/* =========================================================
   18. EXPLORE
   ========================================================= */

function renderExplore() {
    renderExploreVideos();
    renderExplorePeople();
    renderExplorePosts();
}

function renderExploreVideos() {
    const query = $("searchInput").value
        .trim()
        .toLowerCase();

    const filtered = videos.filter(video => {
        const matchesSearch =
            !query ||
            String(video.title || "").toLowerCase().includes(query) ||
            String(video.description || "").toLowerCase().includes(query) ||
            getUsername(video.owner_id).toLowerCase().includes(query);

        return matchesSearch;
    });

    const page = filtered.slice(
        exploreOffset,
        exploreOffset + PAGE_SIZE
    );

    $("exploreVideos").innerHTML =
        page.filter(video => video.is_short !== true)
            .map(videoCard)
            .join("");

    $("exploreLoadMoreWrap").classList.toggle(
        "hidden",
        exploreOffset + PAGE_SIZE >= filtered.length
    );

    $("exploreCount").textContent =
        "Showing " + Math.min(exploreOffset + PAGE_SIZE, filtered.length) +
        " of " + filtered.length;
}

function renderExplorePeople() {
    const query = $("searchInput").value
        .trim()
        .toLowerCase();

    const people = users.filter(user => {
        if (String(user.id) === String(currentUser.id)) {
            return false;
        }

        return (
            !query ||
            String(user.username || "").toLowerCase().includes(query)
        );
    });

    $("explorePeople").innerHTML = people.map(user => {
        const following = follows.some(item =>
            String(item.follower_id) === String(currentUser.id) &&
            String(item.following_id) === String(user.id)
        );

        return `
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
                    ${following ? "Following" : "＋ Follow"}
                </button>

            </div>
        `;
    }).join("");
}

function renderExplorePosts() {
    const query = $("searchInput").value
        .trim()
        .toLowerCase();

    const found = posts.filter(post =>
        !query ||
        String(post.content || "").toLowerCase().includes(query) ||
        getUsername(post.user_id).toLowerCase().includes(query)
    );

    $("explorePosts").innerHTML =
        found.slice(0, PAGE_SIZE).map(postCard).join("");
}


/* =========================================================
   19. EXPLORE TABS
   ========================================================= */

document.querySelectorAll("[data-explore-tab]").forEach(button => {
    button.addEventListener("click", function() {
        exploreMode = this.dataset.exploreTab;

        document.querySelectorAll("[data-explore-tab]")
            .forEach(item => item.classList.remove("active"));

        this.classList.add("active");

        $("exploreVideos").classList.toggle(
            "hidden",
            exploreMode !== "videos"
        );

        $("explorePeople").classList.toggle(
            "hidden",
            exploreMode !== "people"
        );

        $("explorePosts").classList.toggle(
            "hidden",
            exploreMode !== "posts"
        );

        renderExplore();
    });
});


/* =========================================================
   20. FOLLOWING PAGE
   ========================================================= */

function renderFollowing() {
    const followingIds = follows
        .filter(item =>
            String(item.follower_id) === String(currentUser.id)
        )
        .map(item => String(item.following_id));

    const selected = videos.filter(video =>
        followingIds.includes(String(video.owner_id)) &&
        video.is_short !== true
    );

    $("followingFeed").innerHTML =
        selected.map(videoCard).join("");

    $("followingEmpty").classList.toggle(
        "hidden",
        selected.length > 0
    );
}


/* =========================================================
   21. FOLLOW / UNFOLLOW
   ========================================================= */

async function toggleFollow(userId) {
    if (String(userId) === String(currentUser.id)) {
        return;
    }

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

            showToast("Unfollowed creator.");

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

            addLocalNotification(
                "👥",
                "You followed " + getUsername(userId)
            );

            showToast("You are now following " + getUsername(userId));
        }

        renderEverything();

    } catch (error) {
        showToast("Follow error: " + error.message);
        console.error(error);
    }
}


/* =========================================================
   22. LIKE / UNLIKE VIDEO
   ========================================================= */

async function toggleVideoLike(videoId) {
    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video) return;

    const alreadyLiked =
        video.likes.includes(String(currentUser.id));

    try {
        if (alreadyLiked) {
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

            addLocalNotification(
                "❤️",
                "You liked a video."
            );
        }

        renderEverything();

    } catch (error) {
        showToast("Like error: " + error.message);
        console.error(error);
    }
}


/* =========================================================
   23. VIDEO VIEWS
   ========================================================= */

document.addEventListener("play", async function(event) {
    const videoElement = event.target;

    if (!videoElement.dataset.playVideo) return;

    const videoId = videoElement.dataset.playVideo;

    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video) return;

    const watchedKey = "gocat_watched_" + currentUser.id;

    let watched = JSON.parse(
        localStorage.getItem(watchedKey) || "[]"
    );

    if (watched.includes(videoId)) return;

    watched.push(videoId);

    localStorage.setItem(
        watchedKey,
        JSON.stringify(watched.slice(-200))
    );

    video.views = Number(video.views || 0) + 1;

    await db
        .from("videos")
        .update({ views: video.views })
        .eq("id", videoId);

}, true);


/* =========================================================
   24. COMMENTS
   ========================================================= */

async function openComments(videoId) {
    currentCommentVideoId = videoId;

    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video) return;

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

    $("commentsList").innerHTML = comments.map(comment => `
        <div class="comment-item">
            <strong>${escapeHTML(getUsername(comment.user_id))}</strong>
            <p>${escapeHTML(comment.text)}</p>
            <small>${formatDate(comment.created_at)}</small>
        </div>
    `).join("");

    if (!comments.length) {
        $("commentsList").innerHTML =
            "<p class='muted-text'>No comments yet. Start the conversation!</p>";
    }
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
        showToast("Could not post comment: " + result.error.message);
        return;
    }

    $("commentInput").value = "";

    await renderComments();
    await loadAllData();

    renderHomeFeed();
    renderReels();

    showToast("Comment posted!");
});


/* =========================================================
   25. SHARE VIDEO
   ========================================================= */

async function shareVideo(videoId) {
    const url = location.href.split("?")[0] +
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
            showToast("Sharing was not available.");
        }
    }
}


/* =========================================================
   26. DELETE VIDEO
   ========================================================= */

async function deleteVideo(videoId) {
    const video = videos.find(item =>
        String(item.id) === String(videoId)
    );

    if (!video) return;

    if (!confirm("Delete this video permanently?")) {
        return;
    }

    if (String(video.owner_id) !== String(currentUser.id)) {
        showToast("You can only delete your own videos.");
        return;
    }

    try {
        const result = await db
            .from("videos")
            .delete()
            .eq("id", videoId)
            .eq("owner_id", currentUser.id);

        if (result.error) throw result.error;

        if (video.storage_path) {
            await db.storage
                .from(VIDEO_BUCKET)
                .remove([video.storage_path]);
        }

        await loadAllData();
        renderEverything();

        showToast("Video deleted.");

    } catch (error) {
        showToast("Delete error: " + error.message);
    }
}


/* =========================================================
   27. CREATE VIDEO / REEL UPLOAD
   ========================================================= */

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
            ? "Create a vertical video for your followers."
            : "Share a video with the GoCat community.";

    $("publishVideoBtn").textContent =
        mode === "reel" ? "Publish Reel" : "Publish video";

    showModal("uploadModal");
}

$("uploadTopBtn").addEventListener("click", () => {
    openUpload("video");
});

$("createReelBtn").addEventListener("click", () => {
    openUpload("reel");
});

$("videoFile").addEventListener("change", function() {
    const file = this.files[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
        showToast("Please select a video file.");
        return;
    }

    selectedVideoFile = file;
    exportedReelFile = null;

    $("selectedVideoName").textContent = file.name;

    if (uploadMode === "reel") {
        prepareReelPreview(file);
    }
});


/* =========================================================
   28. REEL PREVIEW
   ========================================================= */

function prepareReelPreview(file) {
    const video = $("reelPreview");

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }

    currentObjectURL = URL.createObjectURL(file);

    video.src = currentObjectURL;

    $("reelEditor").classList.remove("hidden");

    $("editorStatus").textContent =
        "Choose your trim, filter, framing and overlay text.";

    video.onloadedmetadata = function() {
        $("trimEnd").value =
            video.duration.toFixed(1);
    };
}

$("reelOverlayText").addEventListener("input", function() {
    $("reelOverlayPreview").textContent = this.value;
});

$("reelFilter").addEventListener("change", function() {
    const video = $("reelPreview");

    const filters = {
        none: "none",
        warm: "sepia(.4) saturate(1.3)",
        cool: "hue-rotate(15deg) saturate(.9)",
        mono: "grayscale(1)",
        vivid: "saturate(1.8) contrast(1.1)"
    };

    video.style.filter = filters[this.value] || "none";
});

$("reelFraming").addEventListener("change", function() {
    $("reelPreview").style.objectFit =
        this.value === "contain" ? "contain" : "cover";
});


/* =========================================================
   29. EXPORT EDITED REEL
   ========================================================= */

$("exportReelBtn").addEventListener("click", async function() {
    if (!selectedVideoFile) {
        showToast("Choose a video first.");
        return;
    }

    if (!window.MediaRecorder) {
        showToast("Video export is not supported by this browser.");
        $("editorStatus").textContent =
            "Your browser cannot export the edits. The original video will be used.";
        return;
    }

    const preview = $("reelPreview");
    const canvas = document.createElement("canvas");

    canvas.width = 720;
    canvas.height = 1280;

    const context = canvas.getContext("2d");

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

    const filterMap = {
        none: "none",
        warm: "sepia(.4) saturate(1.3)",
        cool: "hue-rotate(15deg) saturate(.9)",
        mono: "grayscale(1)",
        vivid: "saturate(1.8) contrast(1.1)"
    };

    const recorderSupported =
        MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
            ? "video/webm;codecs=vp9"
            : "video/webm";

    let stream = null;
    let audioStream = null;
    let recorder = null;
    let chunks = [];

    this.disabled = true;
    this.textContent = "Rendering...";

    $("editorStatus").textContent =
        "Rendering your edited video. Keep this window open.";

    try {
        const canvasStream = canvas.captureStream(30);

        if (preview.captureStream) {
            audioStream = preview.captureStream();

            audioStream.getAudioTracks().forEach(track => {
                canvasStream.addTrack(track);
            });
        }

        stream = canvasStream;

        recorder = new MediaRecorder(stream, {
            mimeType: recorderSupported
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

        function drawFrame() {
            if (preview.paused || preview.ended) return;

            const width = preview.videoWidth;
            const height = preview.videoHeight;

            if (!width || !height) return;

            const cover =
                $("reelFraming").value === "cover";

            const scale = cover
                ? Math.max(720 / width, 1280 / height)
                : Math.min(720 / width, 1280 / height);

            const drawWidth = width * scale;
            const drawHeight = height * scale;

            const x = (720 - drawWidth) / 2;
            const y = (1280 - drawHeight) / 2;

            context.fillStyle = "#000";
            context.fillRect(0, 0, 720, 1280);

            context.filter =
                filterMap[$("reelFilter").value] || "none";

            context.drawImage(
                preview,
                x,
                y,
                drawWidth,
                drawHeight
            );

            context.filter = "none";

            const overlay = $("reelOverlayText").value.trim();

            if (overlay) {
                context.font = "bold 43px Arial";
                context.textAlign = "center";
                context.fillStyle = "white";
                context.strokeStyle = "black";
                context.lineWidth = 5;

                context.strokeText(overlay, 360, 1140);
                context.fillText(overlay, 360, 1140);
            }

            if (preview.currentTime < end && !preview.paused) {
                requestAnimationFrame(drawFrame);
            }
        }

        preview.pause();

        preview.currentTime = start;

        await new Promise(resolve => {
            preview.onseeked = resolve;
        });

        recorder.start();

        await preview.play();

        drawFrame();

        await new Promise(resolve => {
            const check = setInterval(() => {
                if (
                    preview.currentTime >= end ||
                    preview.ended
                ) {
                    clearInterval(check);
                    preview.pause();

                    if (recorder.state !== "inactive") {
                        recorder.stop();
                    }

                    resolve();
                }
            }, 100);
        });

        await finished;

        const blob = new Blob(chunks, {
            type: recorderSupported
        });

        exportedReelFile = new File(
            [blob],
            "gocat-reel.webm",
            { type: recorderSupported }
        );

        $("editorStatus").textContent =
            "Edits prepared! Your edited Reel is ready to upload.";

        showToast("Reel edits completed!");

    } catch (error) {
        console.error(error);

        $("editorStatus").textContent =
            "Export failed. You can still upload the original video.";

        showToast("Could not export the edited Reel.");

    } finally {
        preview.pause();

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
        }

        this.disabled = false;
        this.textContent = "Apply edits and prepare Reel";
    }
});


/* =========================================================
   30. PUBLISH VIDEO
   ========================================================= */

$("uploadForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    let file = exportedReelFile || selectedVideoFile;

    if (!file) {
        showToast("Choose a video first.");
        return;
    }

    const title = $("videoTitle").value.trim();
    const description = $("videoDescription").value.trim();
    const topic = $("videoTopic").value;

    if (!title) {
        showToast("Add a title.");
        return;
    }

    const button = $("publishVideoBtn");

    button.disabled = true;
    button.textContent = "Uploading...";

    const progress = $("uploadProgress");
    const progressBar = $("uploadProgressBar");

    progress.classList.remove("hidden");
    progressBar.style.width = "10%";

    try {
        const extension =
            file.name.split(".").pop().toLowerCase() || "mp4";

        const path =
            currentUser.id + "/" +
            Date.now() + "." + extension;

        const upload = await db.storage
            .from(VIDEO_BUCKET)
            .upload(path, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type
            });

        if (upload.error) throw upload.error;

        progressBar.style.width = "75%";

        const insert = await db
            .from("videos")
            .insert({
                owner_id: currentUser.id,
                title: title,
                description: description,
                topic: topic,
                storage_path: path,
                views: 0,
                is_short: uploadMode === "reel"
            });

        if (insert.error) {
            await db.storage
                .from(VIDEO_BUCKET)
                .remove([path]);

            throw insert.error;
        }

        progressBar.style.width = "100%";

        await loadAllData();
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
        showToast("Upload failed: " + error.message);

    } finally {
        button.disabled = false;

        button.textContent =
            uploadMode === "reel"
                ? "Publish Reel"
                : "Publish video";
    }
});


/* =========================================================
   31. POSTS
   ========================================================= */

function postCard(post) {
    const username = getUsername(post.user_id);

    const owner =
        String(post.user_id) === String(currentUser.id);

    const liked =
        post.likes?.includes(String(currentUser.id));

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
                    owner
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

function renderPosts() {
    const page = posts.slice(
        0,
        postsOffset + PAGE_SIZE
    );

    $("postsFeed").innerHTML =
        page.map(postCard).join("");

    $("postsLoadMoreWrap").classList.toggle(
        "hidden",
        postsOffset + PAGE_SIZE >= posts.length
    );
}


/* =========================================================
   32. CREATE POST
   ========================================================= */

$("postImage").addEventListener("change", function() {
    $("postImageName").textContent =
        this.files[0]?.name || "";
});

$("createPostForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const content = $("postContent").value.trim();
    const imageFile = $("postImage").files[0];

    if (!content && !imageFile) {
        showToast("Write something or select a picture.");
        return;
    }

    const button = this.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Publishing...";

    let mediaPath = null;

    try {
        if (imageFile) {
            if (!imageFile.type.startsWith("image/")) {
                throw new Error("Please select an image.");
            }

            const path =
                currentUser.id + "/" +
                Date.now() + "-" +
                imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");

            const upload = await db.storage
                .from(POST_BUCKET)
                .upload(path, imageFile, {
                    upsert: false,
                    contentType: imageFile.type
                });

            if (upload.error) throw upload.error;

            mediaPath = path;
        }

        const result = await db
            .from("posts")
            .insert({
                user_id: currentUser.id,
                content: content,
                media_path: mediaPath
            });

        if (result.error) throw result.error;

        $("postContent").value = "";
        $("postImage").value = "";
        $("postImageName").textContent = "";

        await loadPosts();

        renderPosts();

        showToast("Post published!");

    } catch (error) {
        showToast("Post failed: " + error.message);

    } finally {
        button.disabled = false;
        button.textContent = "Publish";
    }
});


/* =========================================================
   33. POST LIKES
   ========================================================= */

async function togglePostLike(postId) {
    const post = posts.find(item =>
        String(item.id) === String(postId)
    );

    if (!post) return;

    const liked = post.likes.includes(String(currentUser.id));

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

    } catch (error) {
        showToast("Post like error: " + error.message);
    }
}


/* =========================================================
   34. DELETE POST
   ========================================================= */

async function deletePost(postId) {
    const post = posts.find(item =>
        String(item.id) === String(postId)
    );

    if (!post) return;

    if (String(post.user_id) !== String(currentUser.id)) {
        return;
    }

    if (!confirm("Delete this post?")) return;

    const result = await db
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", currentUser.id);

    if (result.error) {
        showToast("Could not delete post.");
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

    showToast("Post deleted.");
}


/* =========================================================
   35. MIXED HOME FEED
   ========================================================= */

function renderMixedFeed() {
    const items = [];

    videos.forEach(video => {
        items.push({
            type: video.is_short ? "reel" : "video",
            data: video,
            date: new Date(video.created_at).getTime()
        });
    });

    posts.forEach(post => {
        items.push({
            type: "post",
            data: post,
            date: new Date(post.created_at).getTime()
        });
    });

    items.sort((a, b) => b.date - a.date);

    const selected = items.filter(item => {
        if (activeHomeTopic === "All") return true;

        if (
            item.type === "video" ||
            item.type === "reel"
        ) {
            return item.data.topic === activeHomeTopic;
        }

        return false;
    });

    const page = selected.slice(
        homeOffset,
        homeOffset + PAGE_SIZE
    );

    $("homeFeed").innerHTML = page.map(item => {
        if (item.type === "video") {
            return videoCard(item.data);
        }

        if (item.type === "post") {
            return postCard(item.data);
        }

        return reelFeedCard(item.data);

    }).join("");

    $("homeEmpty").classList.toggle(
        "hidden",
        selected.length !== 0
    );

    $("homeLoadMoreWrap").classList.toggle(
        "hidden",
        homeOffset + PAGE_SIZE >= selected.length
    );

    $("homeCount").textContent =
        "Showing " + Math.min(homeOffset + PAGE_SIZE, selected.length) +
        " of " + selected.length;
}

function reelFeedCard(video) {
    const owner = getUsername(video.owner_id);

    return `
        <article class="feed-post-card feed-reel-card">

            <div class="feed-post-top">
                <div class="feed-post-avatar">
                    ${escapeHTML(getInitial(owner))}
                </div>

                <div class="feed-post-user">
                    <strong>${escapeHTML(owner)}</strong>
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

                <span class="reel-thumb-label">▶ REEL</span>
            </div>

            <button
                class="feed-reel-open"
                data-open-reels>
                Watch Reel
            </button>

        </article>
    `;
}


/* =========================================================
   36. MIXED FEED REFRESH
   ========================================================= */

$("refreshFeedBtn").addEventListener("click", async function() {
    this.disabled = true;

    try {
        await loadAllData();

        homeOffset = 0;

        renderEverything();

        showToast("Feed refreshed.");

    } catch (error) {
        showToast("Could not refresh feed.");
    }

    this.disabled = false;
});

$("homeLoadMore").addEventListener("click", function() {
    homeOffset += PAGE_SIZE;
    renderMixedFeed();
});


/* =========================================================
   37. PROFILE
   ========================================================= */

function openProfile(userId) {
    currentProfileUserId = userId;

    openPage("profile");

    renderProfile();
}

function renderProfile() {
    const profileId =
        currentProfileUserId || currentUser.id;

    const profile =
        getUser(profileId) ||
        currentProfile;

    if (!profile) return;

    const mine =
        String(profileId) === String(currentUser.id);

    $("profileUsername").textContent =
        profile.username || "Creator";

    $("profileEmail").textContent =
        mine ? currentUser.email : "";

    $("profileBio").textContent =
        profile.bio || "Welcome to GoCat.";

    $("profileAvatar").textContent =
        getInitial(profile.username);

    $("profileActionBtn").textContent =
        mine ? "Edit profile" : "Follow";

    $("profileActionBtn").onclick = function() {
        if (mine) {
            $("editUsername").value = profile.username || "";
            $("editBio").value = profile.bio || "";

            showModal("editProfileModal");
        } else {
            toggleFollow(profileId);
        }
    };

    const myVideos = videos.filter(video =>
        String(video.owner_id) === String(profileId)
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
        myVideos.length;

    $("profileFollowerCount").textContent =
        followerCount;

    $("profileFollowingCount").textContent =
        followingCount;

    $("profilePostCount").textContent =
        myPosts.length;

    $("profileHome").innerHTML = `
        <div class="video-grid">
            ${myVideos.slice(0, 3).map(videoCard).join("")}
        </div>

        <div class="posts-feed">
            ${myPosts.slice(0, 3).map(postCard).join("")}
        </div>
    `;

    $("profileReels").innerHTML =
        myVideos
            .filter(video => video.is_short === true)
            .map(videoCard)
            .join("");

    $("profileVideos").innerHTML =
        myVideos
            .filter(video => video.is_short !== true)
            .map(videoCard)
            .join("");

    $("profilePosts").innerHTML =
        myPosts.map(postCard).join("");

    renderProfileTab(profileMode);
}


/* =========================================================
   38. PROFILE TABS
   ========================================================= */

function renderProfileTab(tab) {
    profileMode = tab;

    document.querySelectorAll("[data-profile-tab]")
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.profileTab === tab
            );
        });

    ["home", "reels", "videos", "posts"].forEach(name => {
        const element = $("profile" + name[0].toUpperCase() + name.slice(1));

        if (element) {
            element.classList.toggle("hidden", name !== tab);
        }
    });
}

document.querySelectorAll("[data-profile-tab]").forEach(button => {
    button.addEventListener("click", function() {
        renderProfileTab(this.dataset.profileTab);
    });
});


/* =========================================================
   39. EDIT PROFILE
   ========================================================= */

$("editProfileForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const username = $("editUsername").value.trim();
    const bio = $("editBio").value.trim();

    if (username.length < 3) {
        showToast("Username must be at least 3 characters.");
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

    renderEverything();

    hideModal("editProfileModal");

    $("welcomeName").textContent = username;
    $("topProfileBtn").textContent = getInitial(username);

    showToast("Profile updated!");
});


/* =========================================================
   40. NOTIFICATIONS
   ========================================================= */

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


/* =========================================================
   41. CHAT FRIENDS
   ========================================================= */

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
        String(user.id) !== String(currentUser.id) &&
        followingIds.includes(String(user.id)) &&
        followerIds.includes(String(user.id))
    );
}

function renderChatFriends() {
    const friends = getMutualFriends();

    $("chatFriends").innerHTML = friends.length
        ? friends.map(user => `
            <button
                class="chat-friend"
                data-chat-user="${escapeHTML(user.id)}">

                <span class="chat-friend-avatar">
                    ${escapeHTML(getInitial(user.username))}
                </span>

                ${escapeHTML(user.username)}

            </button>
        `).join("")
        : "<p class='muted-text'>No mutual follows yet.</p>";
}


/* =========================================================
   42. OPEN CHAT
   ========================================================= */

async function openChat(userId) {
    currentChatUserId = userId;

    const username = getUsername(userId);

    $("chatTitle").textContent = username;

    $("messageInput").disabled = false;
    $("sendMessageBtn").disabled = false;

    document.querySelectorAll(".chat-friend")
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.chatUser === String(userId)
            );
        });

    await loadMessages();
}


/* =========================================================
   43. LOAD MESSAGES
   ========================================================= */

async function loadMessages() {
    if (!currentChatUserId) return;

    const query = `and(sender_id.eq.${currentUser.id},recipient_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},recipient_id.eq.${currentUser.id})`;

    const result = await db
        .from("messages")
        .select("*")
        .or(query)
        .order("created_at", { ascending: true });

    if (result.error) {
        $("chatMessages").innerHTML =
            "<p class='chat-empty'>Could not load messages. Check your Messages table and permissions.</p>";

        console.error(result.error);
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


/* =========================================================
   44. SEND MESSAGE
   ========================================================= */

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
        showToast("Message could not be sent: " + result.error.message);
        return;
    }

    $("messageInput").value = "";

    await loadMessages();
});


/* =========================================================
   45. PAGE NAVIGATION
   ========================================================= */

function openPage(page) {
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

    if (page === "home") renderMixedFeed();
    if (page === "reels") renderReels();
    if (page === "explore") renderExplore();
    if (page === "following") renderFollowing();
    if (page === "posts") renderPosts();
    if (page === "profile") renderProfile();
    if (page === "chats") renderChatFriends();
    if (page === "notifications") renderNotifications();

    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", function(event) {
        event.preventDefault();
        openPage(this.dataset.page);
    });
});


/* =========================================================
   46. MOBILE SIDEBAR
   ========================================================= */

$("mobileMenuBtn").addEventListener("click", function() {
    $("sidebar").classList.toggle("open");
});


/* =========================================================
   47. TOP PROFILE BUTTON
   ========================================================= */

$("topProfileBtn").addEventListener("click", function() {
    currentProfileUserId = currentUser.id;
    profileMode = "home";
    openPage("profile");
});


/* =========================================================
   48. SEARCH
   ========================================================= */

$("searchInput").addEventListener("input", function() {
    const value = this.value.trim();

    $("clearSearch").classList.toggle(
        "hidden",
        value.length === 0
    );

    exploreOffset = 0;

    if (currentPage === "explore") {
        renderExplore();
    } else if (currentPage === "home") {
        renderMixedFeed();
    }
});

$("clearSearch").addEventListener("click", function() {
    $("searchInput").value = "";

    this.classList.add("hidden");

    renderExplore();
    renderMixedFeed();
});


/* =========================================================
   49. HOME TOPIC FILTERS
   ========================================================= */

document.querySelectorAll("[data-topic]").forEach(button => {
    button.addEventListener("click", function() {
        activeHomeTopic = this.dataset.topic;

        homeOffset = 0;

        document.querySelectorAll("[data-topic]")
            .forEach(item => item.classList.remove("active"));

        this.classList.add("active");

        renderMixedFeed();
    });
});


/* =========================================================
   50. THEME SWITCH
   ========================================================= */

function updateTheme() {
    const dark =
        document.body.classList.contains("dark");

    $("themeIcon").textContent =
        dark ? "☀️" : "🌙";

    $("themeLabel").textContent =
        dark ? "Light mode" : "Dark mode";
}

const savedTheme =
    localStorage.getItem("gocat_theme");

if (savedTheme === "dark") {
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


/* =========================================================
   51. LOGOUT
   ========================================================= */

$("logoutBtn").addEventListener("click", async function() {
    const result = await db.auth.signOut();

    if (result.error) {
        showToast(result.error.message);
        return;
    }

    currentUser = null;
    currentProfile = null;

    openLoginScreen();

    showToast("Logged out.");
});


/* =========================================================
   52. MODAL CLOSE BUTTONS
   ========================================================= */

document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", function() {
        hideModal(this.dataset.close);
    });
});


/* =========================================================
   53. GLOBAL BUTTON ACTIONS
   ========================================================= */

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
        currentProfileUserId = button.dataset.profileUser;
        profileMode = "home";
        openPage("profile");
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

    if (button.dataset.openReels !== undefined) {
        openPage("reels");
    }

    if (button.dataset.reelSound !== undefined) {
        const item = button.closest(".reel-item");
        const video = item.querySelector("video");

        video.muted = !video.muted;

        button.textContent =
            video.muted ? "🔇" : "🔊";
    }

    if (button.id === "emptyCreateReel") {
        openUpload("reel");
    }
});


/* =========================================================
   54. AUTH FORM SWITCHES
   ========================================================= */

$("showRegister").addEventListener(
    "click",
    openRegisterScreen
);

$("showLogin").addEventListener(
    "click",
    openLoginScreen
);


/* =========================================================
   55. SUPABASE AUTH SESSION
   ========================================================= */

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
            "Could not connect to GoCat. Please refresh."
        );

    } finally {
        if (loader) {
            loader.classList.add("hide");
        }
    }
}

db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;
        openLoginScreen();
    }
});


/* =========================================================
   56. START APPLICATION
   ========================================================= */

initializeGoCat();
