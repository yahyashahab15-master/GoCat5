/* =========================================================
   GOCAT — FINAL CLOUD VERSION
   Supabase Auth + Database + Storage
   ========================================================= */


/* =========================================================
   SUPABASE CONFIG
   ========================================================= */

const SUPABASE_URL =
    "https://rfwgvsijxweyzwvuqslt.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0O";

const SUPABASE_BUCKET = "videos";


/* =========================================================
   GLOBALS
   ========================================================= */

let supabaseClient = null;

let users = [];
let videos = [];

let currentUser = null;
let currentVideoId = null;
let currentProfileUserId = null;

let currentPage = "home";
let exploreMode = "videos";
let activeHomeTopic = "All";

let notifications = [];
let isLoading = false;


/* =========================================================
   DOM HELPERS
   ========================================================= */

const getElement = id =>
    document.getElementById(id);

const authScreen = getElement("authScreen");
const app = getElement("app");

const loginForm = getElement("loginForm");
const registerForm = getElement("registerForm");

const authTitle = getElement("authTitle");
const authSubtitle = getElement("authSubtitle");
const authMessage = getElement("authMessage");

const showRegister = getElement("showRegister");
const showLogin = getElement("showLogin");

const homeFeed = getElement("homeFeed");
const followingFeed = getElement("followingFeed");

const profileVideos = getElement("profileVideos");
const exploreVideos = getElement("exploreVideos");
const explorePeople = getElement("explorePeople");

const searchInput = getElement("searchInput");
const clearSearch = getElement("clearSearch");

const uploadModal = getElement("uploadModal");
const commentsModal = getElement("commentsModal");
const editModal = getElement("editModal");

const videoFile = getElement("videoFile");
const selectedFile = getElement("selectedFile");

const videoTitle = getElement("videoTitle");
const videoDescription = getElement("videoDescription");
const videoTopic = getElement("videoTopic");

const publishVideo = getElement("publishVideo");

const toast = getElement("toast");
const toastText = getElement("toastText");

const dropArea = getElement("dropArea");

const uploadProgressBox =
    getElement("uploadProgressBox");

const progressBar =
    getElement("progressBar");

const progressPercent =
    getElement("progressPercent");

const commentsList =
    getElement("commentsList");

const commentsCount =
    getElement("commentsCount");

const commentForm =
    getElement("commentForm");

const commentInput =
    getElement("commentInput");

const editUsername =
    getElement("editUsername");

const editBio =
    getElement("editBio");

const saveProfileBtn =
    getElement("saveProfile");

const notificationList =
    getElement("notificationList");

const suggestedCreators =
    getElement("suggestedCreators");

const authLoginInput =
    getElement("loginUsername");


/* =========================================================
   SUPABASE SDK
   ========================================================= */

async function loadSupabaseSDK() {

    if (
        window.supabase &&
        typeof window.supabase.createClient === "function"
    ) {
        return;
    }

    await new Promise((resolve, reject) => {

        const script =
            document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.onload = resolve;

        script.onerror = () => {
            reject(
                new Error("Could not load Supabase.")
            );
        };

        document.head.appendChild(script);

    });

}


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function createId() {

    if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
    ) {
        return window.crypto.randomUUID();
    }

    return (
        Date.now().toString(36) +
        Math.random().toString(36).substring(2)
    );

}


function getInitial(name) {

    if (!name) {
        return "?";
    }

    return name
        .trim()
        .charAt(0)
        .toUpperCase();

}


function escapeHTML(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function normalizeTopic(topic) {

    const allowed = [
        "Gaming",
        "Cooking",
        "School",
        "Technology",
        "Sports",
        "Art",
        "Entertainment",
        "Other"
    ];

    return allowed.includes(topic)
        ? topic
        : "Other";

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

    return icons[normalizeTopic(topic)] || "🌍";

}


function formatDate(timestamp) {

    if (!timestamp) {
        return "Just now";
    }

    const difference =
        Date.now() - Number(timestamp);

    const seconds =
        Math.floor(difference / 1000);

    if (seconds < 10) return "Just now";
    if (seconds < 60) return seconds + "s ago";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + "m ago";

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h ago";

    const days = Math.floor(hours / 24);
    if (days < 30) return days + "d ago";

    const months = Math.floor(days / 30);
    if (months < 12) return months + "mo ago";

    return Math.floor(months / 12) + "y ago";

}


function showToast(message) {

    if (!toast || !toastText) {
        return;
    }

    toastText.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);

}


function setAuthMessage(message, success = false) {

    if (!authMessage) {
        return;
    }

    authMessage.textContent = message;

    authMessage.style.color =
        success ? "#19a66b" : "#ff4d67";

}


/* =========================================================
   NOTIFICATIONS STORAGE
   ========================================================= */

function getStoredNotifications() {

    if (!currentUser) {
        return [];
    }

    try {

        return JSON.parse(
            localStorage.getItem(
                "gocat_notifications_" + currentUser.id
            ) || "[]"
        );

    } catch {
        return [];
    }

}


function saveStoredNotifications() {

    if (!currentUser) {
        return;
    }

    localStorage.setItem(
        "gocat_notifications_" + currentUser.id,
        JSON.stringify(notifications)
    );

}


function addNotification(icon, text) {

    if (!currentUser) {
        return;
    }

    notifications.unshift({
        id: createId(),
        icon,
        text,
        createdAt: Date.now()
    });

    notifications = notifications.slice(0, 100);

    saveStoredNotifications();
    renderNotifications();

}


/* =========================================================
   LOADER
   ========================================================= */

function hideGoCatLoader() {

    const loader =
        getElement("gocatLoadingScreen");

    if (!loader) {
        return;
    }

    loader.classList.add("hide");

    setTimeout(() => {
        loader.remove();
    }, 500);

}


/* =========================================================
   AUTH SCREEN
   ========================================================= */

function showLoginScreen() {

    authScreen.classList.remove("hidden");
    app.classList.add("hidden");

    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");

    authTitle.textContent = "Welcome back";
    authSubtitle.textContent =
        "Sign in to continue to GoCat";

    if (authLoginInput) {
        authLoginInput.placeholder = "Email address";
    }

    setAuthMessage("");

}


function showRegisterScreen() {

    authScreen.classList.remove("hidden");
    app.classList.add("hidden");

    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");

    authTitle.textContent =
        "Create your GoCat account";

    authSubtitle.textContent =
        "Join the GoCat community";

    setAuthMessage("");

}


function showApp() {

    authScreen.classList.add("hidden");
    app.classList.remove("hidden");

}


/* =========================================================
   SUPABASE AUTH USER
   ========================================================= */

async function getAuthUser() {

    const result =
        await supabaseClient.auth.getUser();

    if (result.error) {
        console.error(result.error);
        return null;
    }

    return result.data.user || null;

}


/* =========================================================
   CREATE PROFILE IF MISSING
   ========================================================= */

async function ensureProfile(authUser) {

    if (!authUser) {
        return null;
    }

    const existing =
        await supabaseClient
            .from("users")
            .select("*")
            .eq("id", authUser.id)
            .maybeSingle();

    if (existing.error) {
        console.error(existing.error);
        return null;
    }

    if (existing.data) {
        return existing.data;
    }

    let username =
        authUser.user_metadata?.username || "gocat_user";

    username = String(username)
        .trim()
        .replace(/\s+/g, "_")
        .substring(0, 20);

    if (!username) {
        username = "gocat_user";
    }

    let attempt = username;
    let counter = 1;

    while (true) {

        const check =
            await supabaseClient
                .from("users")
                .select("id")
                .eq("username", attempt)
                .maybeSingle();

        if (check.error || !check.data) {
            break;
        }

        counter++;

        attempt =
            username.substring(0, 16) +
            "_" +
            counter;

    }

    const insert =
        await supabaseClient
            .from("users")
            .insert({
                id: authUser.id,
                username: attempt,
                email: authUser.email || "",
                password_hash: null,
                bio: "Welcome to my GoCat profile.",
                created_at: Date.now()
            })
            .select("*")
            .single();

    if (insert.error) {
        console.error(insert.error);
        return null;
    }

    return insert.data;

}


/* =========================================================
   LOAD USERS
   ========================================================= */

async function loadUsers() {

    const result =
        await supabaseClient
            .from("users")
            .select("id,username,email,bio,created_at")
            .order("created_at", {
                ascending: false
            });

    if (result.error) {
        throw result.error;
    }

    users = result.data || [];

    return users;

}


/* =========================================================
   LOAD VIDEOS
   ========================================================= */

async function loadVideos() {

    const [
        videoResult,
        likeResult,
        commentResult
    ] = await Promise.all([

        supabaseClient
            .from("videos")
            .select("*")
            .order("created_at", {
                ascending: false
            }),

        supabaseClient
            .from("likes")
            .select("video_id,user_id"),

        supabaseClient
            .from("comments")
            .select("id,video_id,user_id,text,created_at")
            .order("created_at", {
                ascending: true
            })

    ]);

    if (videoResult.error) throw videoResult.error;
    if (likeResult.error) throw likeResult.error;
    if (commentResult.error) throw commentResult.error;

    const likes = likeResult.data || [];
    const comments = commentResult.data || [];

    videos = (videoResult.data || []).map(video => {

        const videoLikes =
            likes
                .filter(item => item.video_id === video.id)
                .map(item => item.user_id);

        const videoComments =
            comments
                .filter(item => item.video_id === video.id)
                .map(item => {

                    const commentUser =
                        users.find(user => user.id === item.user_id);

                    return {
                        id: item.id,
                        userId: item.user_id,
                        username: commentUser
                            ? commentUser.username
                            : "Unknown",
                        text: item.text,
                        createdAt: item.created_at
                    };

                });

        const publicUrl =
            supabaseClient
                .storage
                .from(SUPABASE_BUCKET)
                .getPublicUrl(video.storage_path)
                .data.publicUrl;

        return {
            id: video.id,
            ownerId: video.owner_id,
            title: video.title,
            description: video.description || "",
            topic: normalizeTopic(video.topic),
            file: publicUrl,
            storagePath: video.storage_path,
            createdAt: video.created_at,
            likes: videoLikes,
            views: Number(video.views || 0),
            comments: videoComments
        };

    });

    return videos;

}


/* =========================================================
   LOAD ALL DATA
   ========================================================= */

async function loadAllData() {

    await loadUsers();
    await loadVideos();

}


/* =========================================================
   CURRENT PROFILE
   ========================================================= */

async function loadCurrentProfile() {

    const authUser = await getAuthUser();

    if (!authUser) {
        currentUser = null;
        return null;
    }

    let profile =
        users.find(user => user.id === authUser.id);

    if (!profile) {

        profile = await ensureProfile(authUser);

        if (profile) {
            users.push(profile);
        }

    }

    if (!profile) {

        currentUser = {
            id: authUser.id,
            username: authUser.user_metadata?.username || "GoCat User",
            email: authUser.email || "",
            bio: "",
            followers: [],
            following: [],
            createdAt: Date.now()
        };

        return currentUser;

    }

    const followResult =
        await supabaseClient
            .from("follows")
            .select("follower_id,following_id")
            .or(
                "follower_id.eq." + profile.id +
                ",following_id.eq." + profile.id
            );

    const rows = followResult.data || [];

    const following =
        rows
            .filter(row => row.follower_id === profile.id)
            .map(row => row.following_id);

    const followers =
        rows
            .filter(row => row.following_id === profile.id)
            .map(row => row.follower_id);

    currentUser = {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        bio: profile.bio || "",
        followers,
        following,
        createdAt: profile.created_at
    };

    notifications = getStoredNotifications();

    return currentUser;

}


/* =========================================================
   UPDATE USER UI
   ========================================================= */

function updateUserUI() {

    if (!currentUser) {
        return;
    }

    const initial = getInitial(currentUser.username);

    const topAvatar = getElement("topAvatar");
    const commentAvatar = getElement("commentAvatar");
    const welcomeName = getElement("welcomeName");

    if (topAvatar) {
        topAvatar.textContent = initial;
    }

    if (commentAvatar) {
        commentAvatar.textContent = initial;
    }

    if (welcomeName) {
        welcomeName.textContent = currentUser.username;
    }

}


/* =========================================================
   GET FOLLOW LISTS
   ========================================================= */

async function getFollowLists(userId) {

    const result =
        await supabaseClient
            .from("follows")
            .select("follower_id,following_id")
            .or(
                "follower_id.eq." + userId +
                ",following_id.eq." + userId
            );

    if (result.error) {
        console.error(result.error);

        return {
            followers: [],
            following: []
        };
    }

    const rows = result.data || [];

    return {
        followers: rows
            .filter(row => row.following_id === userId)
            .map(row => row.follower_id),

        following: rows
            .filter(row => row.follower_id === userId)
            .map(row => row.following_id)
    };

}


/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function showPage(page) {

    currentPage = page;

    document.querySelectorAll(".page").forEach(section => {

        section.classList.toggle(
            "hidden",
            section.id !== "page-" + page
        );

    });

    document.querySelectorAll(".nav-item").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.page === page
        );

    });

    const sidebar =
        document.querySelector(".sidebar");

    if (sidebar && window.innerWidth <= 800) {
        sidebar.classList.remove("open");
    }

    if (page === "home") renderHome();
    if (page === "explore") renderExplore();
    if (page === "following") renderFollowing();

    if (page === "profile") {

        if (!currentProfileUserId && currentUser) {
            currentProfileUserId = currentUser.id;
        }

        renderProfile();

    }

    if (page === "notifications") {
        renderNotifications();
    }

}


/* =========================================================
   SEARCH
   ========================================================= */

function getSearchValue() {

    return searchInput
        ? searchInput.value.trim().toLowerCase()
        : "";

}


function filterVideos(list) {

    const query = getSearchValue();

    if (!query) {
        return list;
    }

    return list.filter(video => {

        const owner =
            users.find(user => user.id === video.ownerId);

        const searchable = [
            video.title,
            video.description,
            video.topic,
            owner ? owner.username : ""
        ]
            .join(" ")
            .toLowerCase();

        return searchable.includes(query);

    });

}


/* =========================================================
   CREATE VIDEO CARD
   ========================================================= */

function createVideoCard(video) {

    const owner =
        users.find(user => user.id === video.ownerId);

    if (!owner) {
        return "";
    }

    const liked =
        currentUser &&
        video.likes.includes(currentUser.id);

    const following =
        currentUser &&
        currentUser.following.includes(owner.id);

    const mine =
        currentUser &&
        currentUser.id === owner.id;

    return `

        <article
            class="video-card"
            data-video-id="${escapeHTML(video.id)}"
        >

            <div class="video-player-wrap">

                <video
                    class="video-player"
                    src="${escapeHTML(video.file)}"
                    controls
                    preload="metadata"
                    playsinline
                    data-view="${escapeHTML(video.id)}"
                ></video>

            </div>


            <div class="video-owner">

                <div class="owner-avatar">
                    ${escapeHTML(getInitial(owner.username))}
                </div>

                <div class="owner-name">

                    <button
                        class="profile-user-btn"
                        data-user="${escapeHTML(owner.id)}"
                    >
                        ${escapeHTML(owner.username)}
                    </button>

                    <span class="verified">✓</span>

                </div>

                ${
                    !mine
                    ?
                    `
                        <button
                            class="follow-btn"
                            data-follow="${escapeHTML(owner.id)}"
                        >
                            ${following ? "Following" : "Follow"}
                        </button>
                    `
                    :
                    ""
                }

            </div>


            <div class="video-info">

                <h3>${escapeHTML(video.title)}</h3>

                ${
                    video.description
                    ?
                    `<p>${escapeHTML(video.description)}</p>`
                    :
                    ""
                }

                <div class="video-topic">
                    ${topicEmoji(video.topic)}
                    ${escapeHTML(normalizeTopic(video.topic))}
                </div>

            </div>


            <div class="video-meta">

                <span>👁 ${Number(video.views || 0)}</span>

                <span>${formatDate(video.createdAt)}</span>

            </div>


            <div class="video-actions">

                <button
                    class="action-btn ${liked ? "liked" : ""}"
                    data-like="${escapeHTML(video.id)}"
                    type="button"
                >
                    ❤️ ${video.likes.length}
                </button>

                <button
                    class="action-btn"
                    data-comment="${escapeHTML(video.id)}"
                    type="button"
                >
                    💬 ${video.comments.length}
                </button>

                <button
                    class="action-btn"
                    data-share="${escapeHTML(video.id)}"
                    type="button"
                >
                    ↗ Share
                </button>

                ${
                    mine
                    ?
                    `
                        <button
                            class="action-btn"
                            data-delete="${escapeHTML(video.id)}"
                            type="button"
                        >
                            🗑 Delete
                        </button>
                    `
                    :
                    ""
                }

            </div>

        </article>

    `;

}


/* =========================================================
   ATTACH VIDEO EVENTS
   ========================================================= */

function attachVideoEvents(container) {

    if (!container) {
        return;
    }

    container.querySelectorAll("[data-like]").forEach(button => {

        button.addEventListener("click", () => {
            toggleLike(button.dataset.like);
        });

    });

    container.querySelectorAll("[data-comment]").forEach(button => {

        button.addEventListener("click", () => {
            openComments(button.dataset.comment);
        });

    });

    container.querySelectorAll("[data-share]").forEach(button => {

        button.addEventListener("click", () => {
            shareVideo(button.dataset.share);
        });

    });

    container.querySelectorAll("[data-follow]").forEach(button => {

        button.addEventListener("click", () => {
            toggleFollow(button.dataset.follow);
        });

    });

    container.querySelectorAll("[data-delete]").forEach(button => {

        button.addEventListener("click", () => {
            deleteVideo(button.dataset.delete);
        });

    });

    container.querySelectorAll(".profile-user-btn").forEach(button => {

        button.addEventListener("click", () => {
            showUserProfile(button.dataset.user);
        });

    });

    container.querySelectorAll("[data-view]").forEach(videoElement => {

        videoElement.addEventListener(
            "play",
            () => {
                registerVideoView(videoElement.dataset.view);
            },
            { once: true }
        );

    });

}


/* =========================================================
   VIDEO VIEWS
   ========================================================= */

async function registerVideoView(videoId) {

    const video =
        videos.find(item => item.id === videoId);

    if (!video || video._viewed) {
        return;
    }

    video._viewed = true;

    video.views =
        Number(video.views || 0) + 1;

    const result =
        await supabaseClient
            .from("videos")
            .update({ views: video.views })
            .eq("id", video.id);

    if (result.error) {
        console.error(result.error);
    }

}


/* =========================================================
   RENDER HOME
   ========================================================= */

function renderHome() {

    if (!homeFeed) {
        return;
    }

    let list = videos.slice();

    if (activeHomeTopic !== "All") {

        list = list.filter(video => {
            return normalizeTopic(video.topic) === activeHomeTopic;
        });

    }

    list = filterVideos(list);

    homeFeed.innerHTML = list.length
        ? list.map(createVideoCard).join("")
        : `
            <div class="empty-state">

                <div>🎬</div>

                <h2>
                    ${activeHomeTopic !== "All"
                        ? "No videos in this topic yet"
                        : "No videos yet"}
                </h2>

                <p>
                    Upload a video and start your GoCat profile.
                </p>

                <button class="main-btn upload-trigger" type="button">
                    Upload Video
                </button>

            </div>
        `;

    attachVideoEvents(homeFeed);

    homeFeed.querySelectorAll(".upload-trigger").forEach(button => {
        button.addEventListener("click", openUploadModal);
    });

    renderSuggestedCreators();

}


/* =========================================================
   SUGGESTED CREATORS
   ========================================================= */

function renderSuggestedCreators() {

    if (!suggestedCreators || !currentUser) {
        return;
    }

    const candidates =
        users
            .filter(user => {
                return (
                    user.id !== currentUser.id &&
                    !currentUser.following.includes(user.id)
                );
            })
            .filter(user => {
                return videos.some(video => video.ownerId === user.id);
            })
            .slice(0, 8);

    if (!candidates.length) {

        suggestedCreators.innerHTML = `
            <div class="empty-state suggested-empty">

                <div>👥</div>

                <h2>You're all caught up</h2>

                <p>Explore GoCat to find more creators.</p>

            </div>
        `;

        return;
    }

    suggestedCreators.innerHTML =
        candidates.map(user => {

            const videoCount =
                videos.filter(video => video.ownerId === user.id).length;

            return `

                <div class="suggested-creator">

                    <button
                        class="suggested-avatar"
                        data-suggested-profile="${escapeHTML(user.id)}"
                        type="button"
                    >
                        ${escapeHTML(getInitial(user.username))}
                    </button>

                    <div class="suggested-info">

                        <strong>
                            ${escapeHTML(user.username)}
                        </strong>

                        <span>
                            ${videoCount} videos
                        </span>

                    </div>

                    <button
                        class="follow-btn"
                        data-suggested-follow="${escapeHTML(user.id)}"
                        type="button"
                    >
                        Follow
                    </button>

                </div>

            `;

        }).join("");

    suggestedCreators
        .querySelectorAll("[data-suggested-follow]")
        .forEach(button => {

            button.addEventListener("click", () => {
                toggleFollow(button.dataset.suggestedFollow);
            });

        });

    suggestedCreators
        .querySelectorAll("[data-suggested-profile]")
        .forEach(button => {

            button.addEventListener("click", () => {
                showUserProfile(button.dataset.suggestedProfile);
            });

        });

}


/* =========================================================
   RENDER FOLLOWING
   ========================================================= */

function renderFollowing() {

    if (!followingFeed || !currentUser) {
        return;
    }

    let list =
        videos.filter(video => {
            return currentUser.following.includes(video.ownerId);
        });

    list = filterVideos(list);

    followingFeed.innerHTML = list.length
        ? list.map(createVideoCard).join("")
        : `
            <div class="empty-state">
                <div>👥</div>
                <h2>You're not following anyone yet</h2>
                <p>Visit Explore and follow some creators.</p>
            </div>
        `;

    attachVideoEvents(followingFeed);

}


/* =========================================================
   RENDER EXPLORE
   ========================================================= */

function renderExplore() {

    if (!exploreVideos || !explorePeople) {
        return;
    }

    if (exploreMode === "people") {

        exploreVideos.classList.add("hidden");
        explorePeople.classList.remove("hidden");

        renderExplorePeople();

        return;
    }

    exploreVideos.classList.remove("hidden");
    explorePeople.classList.add("hidden");

    const list = filterVideos(videos);

    exploreVideos.innerHTML = list.length
        ? list.map(createVideoCard).join("")
        : `
            <div class="empty-state">
                <div>🔎</div>
                <h2>Nothing found</h2>
                <p>Try another search.</p>
            </div>
        `;

    attachVideoEvents(exploreVideos);

}


function renderExplorePeople() {

    const query = getSearchValue();

    const people = users.filter(user => {

        if (!query) {
            return true;
        }

        return user.username
            .toLowerCase()
            .includes(query);

    });

    explorePeople.innerHTML =
        people.map(user => {

            if (currentUser && user.id === currentUser.id) {
                return "";
            }

            const followed =
                currentUser &&
                currentUser.following.includes(user.id);

            const videoCount =
                videos.filter(video => video.ownerId === user.id).length;

            return `

                <div class="person-card">

                    <div class="person-avatar">
                        ${escapeHTML(getInitial(user.username))}
                    </div>

                    <h3>${escapeHTML(user.username)}</h3>

                    <p>${videoCount} videos</p>

                    <button
                        class="outline-btn person-view-btn"
                        data-person="${escapeHTML(user.id)}"
                        type="button"
                    >
                        View Profile
                    </button>

                    <button
                        class="main-btn person-follow-btn"
                        data-person-follow="${escapeHTML(user.id)}"
                        type="button"
                    >
                        ${followed ? "Following" : "Follow"}
                    </button>

                </div>

            `;

        }).join("");

    explorePeople
        .querySelectorAll("[data-person]")
        .forEach(button => {

            button.addEventListener("click", () => {
                showUserProfile(button.dataset.person);
            });

        });

    explorePeople
        .querySelectorAll("[data-person-follow]")
        .forEach(button => {

            button.addEventListener("click", () => {
                toggleFollow(button.dataset.personFollow);
            });

        });

}


/* =========================================================
   RENDER PROFILE
   ========================================================= */

async function renderProfile() {

    if (!currentUser) {
        return;
    }

    const userId =
        currentProfileUserId || currentUser.id;

    const user =
        users.find(item => item.id === userId);

    if (!user) {
        return;
    }

    const ownProfile =
        user.id === currentUser.id;

    const follows =
        await getFollowLists(user.id);

    const userVideos =
        videos.filter(video => video.ownerId === user.id);

    getElement("profileUsername").textContent =
        user.username;

    getElement("profileEmail").textContent =
        ownProfile
            ? user.email
            : "GoCat creator";

    getElement("profileBio").textContent =
        user.bio || "No bio yet.";

    getElement("profileAvatar").textContent =
        getInitial(user.username);

    getElement("postCount").textContent =
        userVideos.length;

    getElement("followersCount").textContent =
        follows.followers.length;

    getElement("followingCount").textContent =
        follows.following.length;

    getElement("profileVideosTitle").textContent =
        ownProfile
            ? "Your Videos"
            : user.username + "'s Videos";

    const profileButton =
        getElement("editProfileBtn");

    if (ownProfile) {

        profileButton.textContent = "✎ Edit Profile";

        profileButton.onclick = () => {

            editUsername.value = currentUser.username;
            editBio.value = currentUser.bio;

            editModal.classList.remove("hidden");

        };

    } else {

        const following =
            currentUser.following.includes(user.id);

        profileButton.textContent =
            following ? "✓ Following" : "+ Follow";

        profileButton.onclick = () => {
            toggleFollow(user.id);
        };

    }

    const profileUpload =
        getElement("profileUploadBtn");

    profileUpload.classList.toggle(
        "hidden",
        !ownProfile
    );

    profileVideos.innerHTML = userVideos.length
        ? userVideos
            .slice()
            .sort((a,b) => Number(b.createdAt) - Number(a.createdAt))
            .map(createVideoCard)
            .join("")
        : `
            <div class="empty-state">
                <div>🎬</div>
                <h2>No videos yet</h2>
                <p>
                    ${ownProfile
                        ? "Upload your first video."
                        : "This creator hasn't uploaded anything yet."}
                </p>
            </div>
        `;

    attachVideoEvents(profileVideos);

}


/* =========================================================
   SHOW CREATOR PROFILE
   ========================================================= */

function showUserProfile(userId) {

    currentProfileUserId = userId;

    showPage("profile");

}


/* =========================================================
   FOLLOW / UNFOLLOW
   ========================================================= */

async function toggleFollow(userId) {

    if (!currentUser) {
        showLoginScreen();
        return;
    }

    if (userId === currentUser.id) {
        showToast("You cannot follow yourself.");
        return;
    }

    const alreadyFollowing =
        currentUser.following.includes(userId);

    try {

        if (alreadyFollowing) {

            const result =
                await supabaseClient
                    .from("follows")
                    .delete()
                    .eq("follower_id", currentUser.id)
                    .eq("following_id", userId);

            if (result.error) {
                throw result.error;
            }

            showToast("Unfollowed creator.");

        } else {

            const result =
                await supabaseClient
                    .from("follows")
                    .insert({
                        follower_id: currentUser.id,
                        following_id: userId
                    });

            if (result.error) {
                throw result.error;
            }

            const target =
                users.find(user => user.id === userId);

            addNotification(
                "👥",
                "You are now following " +
                (target ? target.username : "a creator") + "."
            );

            showToast("Following creator!");

        }

        await loadAllData();
        await loadCurrentProfile();

        renderHome();
        renderFollowing();
        renderExplore();
        renderProfile();

    } catch (error) {

        console.error(error);
        showToast("Could not update follow.");

    }

}


/* =========================================================
   LIKE / UNLIKE
   ========================================================= */

async function toggleLike(videoId) {

    if (!currentUser) {
        showLoginScreen();
        return;
    }

    const video =
        videos.find(item => item.id === videoId);

    if (!video) {
        return;
    }

    const liked =
        video.likes.includes(currentUser.id);

    try {

        if (liked) {

            const result =
                await supabaseClient
                    .from("likes")
                    .delete()
                    .eq("video_id", videoId)
                    .eq("user_id", currentUser.id);

            if (result.error) {
                throw result.error;
            }

            video.likes =
                video.likes.filter(id => id !== currentUser.id);

        } else {

            const result =
                await supabaseClient
                    .from("likes")
                    .insert({
                        video_id: videoId,
                        user_id: currentUser.id
                    });

            if (result.error) {
                throw result.error;
            }

            video.likes.push(currentUser.id);

        }

        renderHome();
        renderFollowing();
        renderExplore();
        renderProfile();

    } catch (error) {

        console.error(error);
        showToast("Could not update like.");

    }

}


/* =========================================================
   SHARE VIDEO
   ========================================================= */

async function shareVideo(videoId) {

    const video =
        videos.find(item => item.id === videoId);

    if (!video) {
        return;
    }

    const shareUrl = video.file;

    const shareText =
        "Check out " + video.title + " on GoCat!";

    if (navigator.share) {

        try {

            await navigator.share({
                title: video.title,
                text: shareText,
                url: shareUrl
            });

        } catch {
            // User cancelled the share window.
        }

        return;
    }

    try {

        await navigator.clipboard.writeText(shareUrl);
        showToast("Video link copied!");

    } catch {

        showToast("Could not copy video link.");

    }

}


/* =========================================================
   DELETE VIDEO
   ========================================================= */

async function deleteVideo(videoId) {

    if (!currentUser) {
        return;
    }

    const video =
        videos.find(item => item.id === videoId);

    if (!video || video.ownerId !== currentUser.id) {
        showToast("You can only delete your own videos.");
        return;
    }

    if (!window.confirm("Delete this video from GoCat?")) {
        return;
    }

    try {

        const storageResult =
            await supabaseClient
                .storage
                .from(SUPABASE_BUCKET)
                .remove([video.storagePath]);

        if (storageResult.error) {
            console.warn(storageResult.error);
        }

        const dbResult =
            await supabaseClient
                .from("videos")
                .delete()
                .eq("id", videoId);

        if (dbResult.error) {
            throw dbResult.error;
        }

        videos =
            videos.filter(item => item.id !== videoId);

        showToast("Video deleted.");

        renderHome();
        renderFollowing();
        renderExplore();
        renderProfile();

    } catch (error) {

        console.error(error);
        showToast("Could not delete video.");

    }

}


/* =========================================================
   COMMENTS
   ========================================================= */

function openComments(videoId) {

    currentVideoId = videoId;

    const video =
        videos.find(item => item.id === videoId);

    if (!video) {
        return;
    }

    renderComments(video);

    commentsModal.classList.remove("hidden");

}


function renderComments(video) {

    commentsCount.textContent =
        video.comments.length +
        (video.comments.length === 1
            ? " comment"
            : " comments");

    if (!video.comments.length) {

        commentsList.innerHTML = `
            <div class="empty-state">
                <div>💬</div>
                <h2>No comments yet</h2>
                <p>Be the first person to comment.</p>
            </div>
        `;

        return;
    }

    commentsList.innerHTML =
        video.comments
            .slice()
            .reverse()
            .map(comment => `

                <div class="comment">

                    <div class="comment-avatar">
                        ${escapeHTML(getInitial(comment.username))}
                    </div>

                    <div class="comment-body">

                        <div class="comment-user">
                            ${escapeHTML(comment.username)}
                        </div>

                        <div class="comment-text">
                            ${escapeHTML(comment.text)}
                        </div>

                        <div class="comment-time">
                            ${formatDate(comment.createdAt)}
                        </div>

                    </div>

                </div>

            `)
            .join("");

}


/* =========================================================
   POST COMMENT
   ========================================================= */

async function submitComment(event) {

    event.preventDefault();

    if (!currentUser) {
        showLoginScreen();
        return;
    }

    const text =
        commentInput.value.trim();

    if (!text) {
        return;
    }

    const video =
        videos.find(item => item.id === currentVideoId);

    if (!video) {
        return;
    }

    try {

        const newComment = {
            id: createId(),
            video_id: video.id,
            user_id: currentUser.id,
            text,
            created_at: Date.now()
        };

        const result =
            await supabaseClient
                .from("comments")
                .insert(newComment);

        if (result.error) {
            throw result.error;
        }

        video.comments.push({
            id: newComment.id,
            userId: currentUser.id,
            username: currentUser.username,
            text,
            createdAt: newComment.created_at
        });

        commentInput.value = "";

        renderComments(video);
        renderHome();
        renderFollowing();
        renderExplore();
        renderProfile();

        const owner =
            users.find(user => user.id === video.ownerId);

        if (owner && owner.id !== currentUser.id) {

            addNotification(
                "💬",
                currentUser.username +
                " commented on your video."
            );

        }

    } catch (error) {

        console.error(error);
        showToast("Could not post comment.");

    }

}


/* =========================================================
   UPLOAD MODAL
   ========================================================= */

function openUploadModal() {

    if (!currentUser) {
        showLoginScreen();
        return;
    }

    uploadModal.classList.remove("hidden");

}


function closeModal(modal) {

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");

}


/* =========================================================
   FILE SELECT
   ========================================================= */

function updateSelectedFile() {

    const file = videoFile.files[0];

    if (!file) {

        selectedFile.classList.add("hidden");
        selectedFile.textContent = "";

        return;
    }

    selectedFile.textContent = file.name;
    selectedFile.classList.remove("hidden");

}


/* =========================================================
   UPLOAD VIDEO TO SUPABASE
   ========================================================= */

async function publishUploadedVideo() {

    if (isLoading) {
        return;
    }

    const file = videoFile.files[0];

    if (!file) {
        showToast("Choose a video first.");
        return;
    }

    const title =
        videoTitle.value.trim();

    const description =
        videoDescription.value.trim();

    const topic =
        normalizeTopic(videoTopic.value);

    if (!title) {
        showToast("Give your video a title.");
        return;
    }

    if (!file.type.startsWith("video/")) {
        showToast("Please choose a video file.");
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        showToast("Video is larger than 50 MB.");
        return;
    }

    isLoading = true;
    publishVideo.disabled = true;

    uploadProgressBox.classList.remove("hidden");

    progressBar.style.width = "10%";
    progressPercent.textContent = "10%";

    const videoId = createId();

    const extension =
        (file.name.split(".").pop() || "mp4").toLowerCase();

    const storagePath =
        currentUser.id + "/" + videoId + "." + extension;

    try {

        progressBar.style.width = "30%";
        progressPercent.textContent = "30%";

        const upload =
            await supabaseClient
                .storage
                .from(SUPABASE_BUCKET)
                .upload(
                    storagePath,
                    file,
                    {
                        cacheControl: "3600",
                        contentType: file.type || "video/mp4",
                        upsert: false
                    }
                );

        if (upload.error) {
            throw upload.error;
        }

        progressBar.style.width = "70%";
        progressPercent.textContent = "70%";

        const insert =
            await supabaseClient
                .from("videos")
                .insert({
                    id: videoId,
                    owner_id: currentUser.id,
                    title,
                    description,
                    topic,
                    storage_path: storagePath,
                    created_at: Date.now(),
                    views: 0
                });

        if (insert.error) {

            await supabaseClient
                .storage
                .from(SUPABASE_BUCKET)
                .remove([storagePath]);

            throw insert.error;
        }

        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";

        showToast("Your video was uploaded!");

        videoFile.value = "";
        videoTitle.value = "";
        videoDescription.value = "";
        videoTopic.value = "Other";

        selectedFile.classList.add("hidden");
        selectedFile.textContent = "";

        await loadAllData();

        closeModal(uploadModal);

        renderHome();
        renderFollowing();
        renderExplore();
        renderProfile();

    } catch (error) {

        console.error(error);

        showToast(
            error.message || "Could not upload video."
        );

    } finally {

        isLoading = false;
        publishVideo.disabled = false;

        setTimeout(() => {

            uploadProgressBox.classList.add("hidden");

            progressBar.style.width = "0%";
            progressPercent.textContent = "0%";

        }, 700);

    }

}


/* =========================================================
   SAVE PROFILE
   ========================================================= */

async function saveProfile() {

    if (!currentUser) {
        return;
    }

    const username =
        editUsername.value.trim();

    const bio =
        editBio.value.trim();

    if (username.length < 3) {
        showToast("Username must be at least 3 characters.");
        return;
    }

    try {

        const result =
            await supabaseClient
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

        currentUser.username =
            result.data.username;

        currentUser.bio =
            result.data.bio || "";

        const index =
            users.findIndex(user => user.id === currentUser.id);

        if (index !== -1) {
            users[index] = result.data;
        }

        closeModal(editModal);

        updateUserUI();

        renderHome();
        renderFollowing();
        renderExplore();
        renderProfile();

        showToast("Profile updated!");

    } catch (error) {

        console.error(error);
        showToast("Could not save profile.");

    }

}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function renderNotifications() {

    if (!notificationList) {
        return;
    }

    if (!notifications.length) {

        notificationList.innerHTML = `
            <div class="empty-state">
                <div>🔔</div>
                <h2>No notifications yet</h2>
                <p>Your GoCat activity will appear here.</p>
            </div>
        `;

        return;
    }

    notificationList.innerHTML =
        notifications.map(notification => `

            <div class="notification">

                <div class="notification-icon">
                    ${escapeHTML(notification.icon)}
                </div>

                <div class="notification-text">

                    <strong>
                        ${escapeHTML(notification.text)}
                    </strong>

                    <div class="notification-time">
                        ${formatDate(notification.createdAt)}
                    </div>

                </div>

            </div>

        `).join("");

}


/* =========================================================
   THEME — FIXED
   IMPORTANT: CSS USES body.dark
   JAVASCRIPT NOW USES THE SAME CLASS.
   ========================================================= */

function applyGoCatTheme(isDark) {

    document.body.classList.toggle(
        "dark",
        isDark
    );

    localStorage.setItem(
        "gocat_theme",
        isDark ? "dark" : "light"
    );

    const themeBtn =
        getElement("themeBtn");

    if (!themeBtn) {
        return;
    }

    const icon =
        themeBtn.querySelector(".theme-icon");

    const label =
        themeBtn.querySelector(".theme-label");

    const status =
        themeBtn.querySelector(".theme-status");

    if (isDark) {

        if (icon) icon.textContent = "☀️";
        if (label) label.textContent = "Light Mode";
        if (status) status.textContent = "DARK";

    } else {

        if (icon) icon.textContent = "🌙";
        if (label) label.textContent = "Dark Mode";
        if (status) status.textContent = "LIGHT";

    }

}


function loadTheme() {

    const savedTheme =
        localStorage.getItem("gocat_theme");

    applyGoCatTheme(
        savedTheme === "dark"
    );

}


function toggleTheme() {

    const currentlyDark =
        document.body.classList.contains("dark");

    applyGoCatTheme(!currentlyDark);

}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    const result =
        await supabaseClient.auth.signOut();

    if (result.error) {
        console.error(result.error);
        showToast("Could not log out.");
        return;
    }

    currentUser = null;
    users = [];
    videos = [];
    currentProfileUserId = null;
    notifications = [];

    showLoginScreen();

}


/* =========================================================
   REGISTER
   ========================================================= */

async function handleRegister(event) {

    event.preventDefault();

    const username =
        getElement("registerUsername").value.trim();

    const email =
        getElement("registerEmail").value.trim();

    const password =
        getElement("registerPassword").value;

    const confirmPassword =
        getElement("registerConfirm").value;

    if (password !== confirmPassword) {
        setAuthMessage("Passwords do not match.");
        return;
    }

    if (username.length < 3) {
        setAuthMessage("Username must be at least 3 characters.");
        return;
    }

    if (password.length < 6) {
        setAuthMessage("Password must be at least 6 characters.");
        return;
    }

    setAuthMessage("Creating your account...", true);

    try {

        const result =
            await supabaseClient
                .auth
                .signUp({
                    email,
                    password,
                    options: {
                        data: {
                            username
                        }
                    }
                });

        if (result.error) {
            throw result.error;
        }

        if (!result.data.user) {
            throw new Error("Could not create account.");
        }

        if (result.data.session) {

            const profile =
                await ensureProfile(result.data.user);

            if (!profile) {
                throw new Error(
                    "Account created, but GoCat profile could not be created."
                );
            }

            await startUserSession();

            return;
        }

        setAuthMessage(
            "Account created. Check your email if confirmation is required.",
            true
        );

    } catch (error) {

        console.error(error);

        setAuthMessage(
            error.message || "Could not create account."
        );

    }

}


/* =========================================================
   LOGIN
   ========================================================= */

async function handleLogin(event) {

    event.preventDefault();

    const email =
        getElement("loginUsername").value.trim();

    const password =
        getElement("loginPassword").value;

    if (!email) {
        setAuthMessage("Enter your email.");
        return;
    }

    setAuthMessage("Signing in...", true);

    try {

        const result =
            await supabaseClient
                .auth
                .signInWithPassword({
                    email,
                    password
                });

        if (result.error) {
            throw result.error;
        }

        await startUserSession();

    } catch (error) {

        console.error(error);

        setAuthMessage(
            error.message || "Email or password is incorrect."
        );

    }

}


/* =========================================================
   START USER SESSION
   ========================================================= */

async function startUserSession() {

    const authUser = await getAuthUser();

    if (!authUser) {

        showLoginScreen();
        hideGoCatLoader();

        return;
    }

    await loadAllData();

    await loadCurrentProfile();

    showApp();

    currentProfileUserId = currentUser.id;

    updateUserUI();

    renderHome();
    renderFollowing();
    renderExplore();
    renderProfile();
    renderNotifications();

    hideGoCatLoader();

}


/* =========================================================
   REFRESH
   ========================================================= */

async function refreshAll() {

    try {

        await loadAllData();
        await loadCurrentProfile();

        updateUserUI();

        renderHome();
        renderFollowing();
        renderExplore();
        renderProfile();
        renderNotifications();

        showToast("Feed refreshed.");

    } catch (error) {

        console.error(error);
        showToast("Could not refresh GoCat.");

    }

}


/* =========================================================
   SEARCH INPUT
   ========================================================= */

function handleSearchInput() {

    if (!searchInput) {
        return;
    }

    clearSearch.classList.toggle(
        "hidden",
        !searchInput.value
    );

    if (currentPage === "home") renderHome();
    if (currentPage === "following") renderFollowing();
    if (currentPage === "explore") renderExplore();
    if (currentPage === "profile") renderProfile();

}


/* =========================================================
   TOPIC BUTTONS
   ========================================================= */

function bindTopicButtons() {

    document.querySelectorAll(".topic-chip").forEach(button => {

        button.addEventListener("click", () => {

            activeHomeTopic = button.dataset.topic;

            document.querySelectorAll(".topic-chip").forEach(item => {

                item.classList.toggle(
                    "active",
                    item === button
                );

            });

            showPage("home");

        });

    });

}


/* =========================================================
   EXPLORE TABS
   ========================================================= */

function bindExploreTabs() {

    document.querySelectorAll(".explore-tab").forEach(button => {

        button.addEventListener("click", () => {

            exploreMode = button.dataset.explore;

            document.querySelectorAll(".explore-tab").forEach(item => {

                item.classList.toggle(
                    "active",
                    item === button
                );

            });

            renderExplore();

        });

    });

}


/* =========================================================
   GENERAL EVENTS
   ========================================================= */

function bindGeneralEvents() {

    /* AUTH */

    showRegister.addEventListener("click", showRegisterScreen);
    showLogin.addEventListener("click", showLoginScreen);

    loginForm.addEventListener("submit", handleLogin);
    registerForm.addEventListener("submit", handleRegister);


    /* PASSWORD VISIBILITY */

    document.querySelectorAll(".password-btn").forEach(button => {

        button.addEventListener("click", () => {

            const target =
                getElement(button.dataset.target);

            if (!target) {
                return;
            }

            if (target.type === "password") {

                target.type = "text";
                button.textContent = "🙈";

            } else {

                target.type = "password";
                button.textContent = "👁";

            }

        });

    });


    /* NAVIGATION */

    document.querySelectorAll(".nav-item").forEach(button => {

        button.addEventListener("click", () => {

            if (button.dataset.page) {
                showPage(button.dataset.page);
            }

        });

    });


    /* PROFILE TOP BUTTON */

    const profileTopBtn =
        getElement("profileTopBtn");

    if (profileTopBtn) {

        profileTopBtn.addEventListener("click", () => {

            if (!currentUser) {
                return;
            }

            currentProfileUserId = currentUser.id;
            showPage("profile");

        });

    }


    /* UPLOAD BUTTONS */

    document.querySelectorAll(".upload-trigger").forEach(button => {

        button.addEventListener("click", openUploadModal);

    });

    const uploadTopBtn =
        getElement("uploadTopBtn");

    if (uploadTopBtn) {
        uploadTopBtn.addEventListener("click", openUploadModal);
    }


    /* VIDEO FILE */

    videoFile.addEventListener("change", updateSelectedFile);


    dropArea.addEventListener("dragover", event => {

        event.preventDefault();
        dropArea.classList.add("dragging");

    });

    dropArea.addEventListener("dragleave", () => {

        dropArea.classList.remove("dragging");

    });

    dropArea.addEventListener("drop", event => {

        event.preventDefault();

        dropArea.classList.remove("dragging");

        const files = event.dataTransfer.files;

        if (files && files.length) {

            videoFile.files = files;
            updateSelectedFile();

        }

    });


    publishVideo.addEventListener(
        "click",
        publishUploadedVideo
    );


    /* SEARCH */

    searchInput.addEventListener(
        "input",
        handleSearchInput
    );

    clearSearch.addEventListener("click", () => {

        searchInput.value = "";

        clearSearch.classList.add("hidden");

        handleSearchInput();

    });


    /* TOPICS AND EXPLORE */

    bindTopicButtons();
    bindExploreTabs();


    /* REFRESH */

    const refreshFeed =
        getElement("refreshFeed");

    if (refreshFeed) {
        refreshFeed.addEventListener("click", refreshAll);
    }


    /* THEME */

    const themeBtn =
        getElement("themeBtn");

    if (themeBtn) {
        themeBtn.addEventListener("click", toggleTheme);
    }


    /* LOGOUT */

    const logoutBtn =
        getElement("logoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }


    /* COMMENTS */

    commentForm.addEventListener(
        "submit",
        submitComment
    );


    /* PROFILE */

    saveProfileBtn.addEventListener(
        "click",
        saveProfile
    );


    /* CLEAR NOTIFICATIONS */

    const clearNotifications =
        getElement("clearNotifications");

    if (clearNotifications) {

        clearNotifications.addEventListener("click", () => {

            notifications = [];

            saveStoredNotifications();
            renderNotifications();

            showToast("Notifications cleared.");

        });

    }


    /* CLOSE MODALS */

    document.querySelectorAll("[data-close]").forEach(button => {

        button.addEventListener("click", () => {

            closeModal(
                getElement(button.dataset.close)
            );

        });

    });

    document.querySelectorAll(".modal-overlay").forEach(overlay => {

        overlay.addEventListener("click", () => {

            closeModal(
                overlay.closest(".modal")
            );

        });

    });


    /* MOBILE MENU */

    const mobileMenu =
        getElement("mobileMenu");

    const sidebar =
        document.querySelector(".sidebar");

    if (mobileMenu && sidebar) {

        mobileMenu.addEventListener("click", () => {

            sidebar.classList.toggle("open");

        });

    }


    /* EXPLORE PEOPLE SHORTCUT */

    document.querySelectorAll("[data-page-button]").forEach(button => {

        button.addEventListener("click", () => {

            showPage(button.dataset.pageButton);

            exploreMode = "people";

            document.querySelectorAll(".explore-tab").forEach(tab => {
                tab.classList.toggle(
                    "active",
                    tab.dataset.explore === "people"
                );
            });

            renderExplore();

        });

    });

}


/* =========================================================
   INITIALIZE GOCAT
   ========================================================= */

async function initGoCat() {

    /* Restore theme before the app displays */
    loadTheme();

    try {

        await loadSupabaseSDK();

        supabaseClient =
            window.supabase.createClient(
                SUPABASE_URL,
                SUPABASE_PUBLISHABLE_KEY
            );

    } catch (error) {

        console.error(error);

        hideGoCatLoader();

        alert("GoCat could not load Supabase.");

        return;

    }

    bindGeneralEvents();

    try {

        const sessionResult =
            await supabaseClient.auth.getSession();

        if (sessionResult.error) {
            throw sessionResult.error;
        }

        if (sessionResult.data.session) {

            await startUserSession();

        } else {

            showLoginScreen();
            hideGoCatLoader();

        }

    } catch (error) {

        console.error(error);

        showLoginScreen();
        hideGoCatLoader();

    }


    /* AUTH STATE CHANGES */

    supabaseClient.auth.onAuthStateChange(
        async (event, session) => {

            if (event === "SIGNED_OUT") {

                currentUser = null;
                users = [];
                videos = [];

                showLoginScreen();

                return;
            }

            if (event === "SIGNED_IN" && session) {

                try {

                    await startUserSession();

                } catch (error) {

                    console.error(error);

                }

            }

        }
    );

}


/* =========================================================
   START
   ========================================================= */

initGoCat();
