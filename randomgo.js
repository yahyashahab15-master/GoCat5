/* =========================================================
   GOCAT — FINAL CLOUD VERSION
   Supabase Auth + Database + Storage
   ========================================================= */

/* SUPABASE CONFIG */

const SUPABASE_URL =
    "https://rfwgvsijxweyzwvuqslt.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0O";

const SUPABASE_BUCKET = "videos";

/* GLOBALS */

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

let uploadMode = "video";
let homeFeedOffset = 0;
let shortsFeedOffset = 0;

const HOME_FEED_PAGE_SIZE = 5;
const SHORTS_FEED_PAGE_SIZE = 4;

/* SUPABASE SDK LOADER */

async function loadSupabaseSDK() {
    if (
        window.supabase &&
        typeof window.supabase.createClient === "function"
    ) {
        return;
    }

    await new Promise(function(resolve, reject) {
        const script = document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.onload = resolve;

        script.onerror = function() {
            reject(new Error("Could not load Supabase."));
        };

        document.head.appendChild(script);
    });
}

/* DOM */

const authScreen = document.getElementById("authScreen");
const app = document.getElementById("app");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authMessage = document.getElementById("authMessage");

const showRegister = document.getElementById("showRegister");
const showLogin = document.getElementById("showLogin");

const homeFeed = document.getElementById("homeFeed");
const followingFeed = document.getElementById("followingFeed");
const profileVideos = document.getElementById("profileVideos");

const exploreVideos = document.getElementById("exploreVideos");
const explorePeople = document.getElementById("explorePeople");

const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");

const uploadModal = document.getElementById("uploadModal");
const commentsModal = document.getElementById("commentsModal");
const editModal = document.getElementById("editModal");

const videoFile = document.getElementById("videoFile");
const selectedFile = document.getElementById("selectedFile");

const videoTitle = document.getElementById("videoTitle");
const videoDescription = document.getElementById("videoDescription");

const publishVideo = document.getElementById("publishVideo");

const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");

const dropArea = document.getElementById("dropArea");
const videoTopic = document.getElementById("videoTopic");

const uploadProgressBox =
    document.getElementById("uploadProgressBox");

const progressBar =
    document.getElementById("progressBar");

const progressPercent =
    document.getElementById("progressPercent");

const commentsList =
    document.getElementById("commentsList");

const commentsCount =
    document.getElementById("commentsCount");

const commentForm =
    document.getElementById("commentForm");

const commentInput =
    document.getElementById("commentInput");

const editUsername =
    document.getElementById("editUsername");

const editBio =
    document.getElementById("editBio");

const saveProfileBtn =
    document.getElementById("saveProfile");

const notificationList =
    document.getElementById("notificationList");

const suggestedCreators =
    document.getElementById("suggestedCreators");

const authLoginInput =
    document.getElementById("loginUsername");

/* BASIC HELPERS */

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

    return name.trim().charAt(0).toUpperCase();
}

function escapeHTML(value) {
    if (value === null || value === undefined) {
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

    if (allowed.includes(topic)) {
        return topic;
    }

    return "Other";
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

    if (seconds < 10) {
        return "Just now";
    }

    if (seconds < 60) {
        return seconds + "s ago";
    }

    const minutes =
        Math.floor(seconds / 60);

    if (minutes < 60) {
        return minutes + "m ago";
    }

    const hours =
        Math.floor(minutes / 60);

    if (hours < 24) {
        return hours + "h ago";
    }

    const days =
        Math.floor(hours / 24);

    if (days < 30) {
        return days + "d ago";
    }

    const months =
        Math.floor(days / 30);

    if (months < 12) {
        return months + "mo ago";
    }

    return Math.floor(months / 12) + "y ago";
}

function showToast(message) {
    if (!toast || !toastText) {
        return;
    }

    toastText.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(function() {
        toast.classList.remove("show");
    }, 2800);
}

function setAuthMessage(message, success = false) {
    if (!authMessage) {
        return;
    }

    authMessage.textContent = message;

    authMessage.style.color = success
        ? "#19a66b"
        : "#ff4d67";
}

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
        icon: icon,
        text: text,
        createdAt: Date.now()
    });

    if (notifications.length > 100) {
        notifications = notifications.slice(0, 100);
    }

    saveStoredNotifications();
    renderNotifications();
}

/* LOADER */

function hideGoCatLoader() {
    const loader =
        document.getElementById("gocatLoadingScreen");

    if (!loader) {
        return;
    }

    loader.classList.add("hide");

    setTimeout(function() {
        if (loader.parentNode) {
            loader.remove();
        }
    }, 500);
}

/* AUTH SCREEN */

function showLoginScreen() {
    authScreen.classList.remove("hidden");
    app.classList.add("hidden");

    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");

    authTitle.textContent = "Welcome back";
    authSubtitle.textContent =
        "Sign in to continue to GoCat";

    if (authLoginInput) {
        authLoginInput.placeholder = "Email";
    }

    setAuthMessage("");
}

function showRegisterScreen() {
    authScreen.classList.remove("hidden");
    app.classList.add("hidden");

    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");

    authTitle.textContent = "Create your GoCat account";
    authSubtitle.textContent = "Join the GoCat community";

    setAuthMessage("");
}

function showApp() {
    authScreen.classList.add("hidden");
    app.classList.remove("hidden");
}

/* GET CURRENT AUTH USER */

async function getAuthUser() {
    const result =
        await supabaseClient.auth.getUser();

    if (result.error) {
        console.error(result.error);
        return null;
    }

    return result.data.user || null;
}

/* CREATE / ENSURE PROFILE */

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
        authUser.user_metadata?.username ||
        "gocat_user";

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

        if (check.error) {
            break;
        }

        if (!check.data) {
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

/* LOAD USERS */

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

/* LOAD VIDEOS — continues in Part 2 */

/* LOAD VIDEOS */

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

    if (videoResult.error) {
        throw videoResult.error;
    }

    if (likeResult.error) {
        throw likeResult.error;
    }

    if (commentResult.error) {
        throw commentResult.error;
    }

    const likes = likeResult.data || [];
    const comments = commentResult.data || [];

    videos = (videoResult.data || []).map(function(video) {
        const videoLikes = likes
            .filter(function(item) {
                return item.video_id === video.id;
            })
            .map(function(item) {
                return item.user_id;
            });

        const videoComments = comments
            .filter(function(item) {
                return item.video_id === video.id;
            })
            .map(function(item) {
                const commentUser = users.find(function(user) {
                    return user.id === item.user_id;
                });

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
                .data
                .publicUrl;

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
            isShort: video.is_short === true,
            comments: videoComments
        };
    });

    return videos;
}

/* LOAD EVERYTHING */

async function loadAllData() {
    await loadUsers();
    await loadVideos();
}

/* CURRENT USER */

async function loadCurrentProfile() {
    const authUser = await getAuthUser();

    if (!authUser) {
        currentUser = null;
        return null;
    }

    let profile = users.find(function(user) {
        return user.id === authUser.id;
    });

    if (!profile) {
        profile = await ensureProfile(authUser);

        if (profile) {
            users.push(profile);
        }
    }

    if (!profile) {
        currentUser = {
            id: authUser.id,
            username:
                authUser.user_metadata?.username ||
                "GoCat User",
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
                "follower_id.eq." +
                profile.id +
                ",following_id.eq." +
                profile.id
            );

    const rows = followResult.data || [];

    const following = rows
        .filter(function(row) {
            return row.follower_id === profile.id;
        })
        .map(function(row) {
            return row.following_id;
        });

    const followers = rows
        .filter(function(row) {
            return row.following_id === profile.id;
        })
        .map(function(row) {
            return row.follower_id;
        });

    currentUser = {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        bio: profile.bio || "",
        followers: followers,
        following: following,
        createdAt: profile.created_at
    };

    notifications = getStoredNotifications();

    return currentUser;
}

/* UPDATE CURRENT USER UI */

function updateUserUI() {
    if (!currentUser) {
        return;
    }

    const initial = getInitial(currentUser.username);

    const topAvatar =
        document.getElementById("topAvatar");

    const commentAvatar =
        document.getElementById("commentAvatar");

    const welcomeName =
        document.getElementById("welcomeName");

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

/* PROFILE FOLLOW COUNTS */

async function getFollowLists(userId) {
    const result =
        await supabaseClient
            .from("follows")
            .select("follower_id,following_id")
            .or(
                "follower_id.eq." +
                userId +
                ",following_id.eq." +
                userId
            );

    if (result.error) {
        return {
            followers: [],
            following: []
        };
    }

    const rows = result.data || [];

    return {
        followers: rows
            .filter(function(row) {
                return row.following_id === userId;
            })
            .map(function(row) {
                return row.follower_id;
            }),

        following: rows
            .filter(function(row) {
                return row.follower_id === userId;
            })
            .map(function(row) {
                return row.following_id;
            })
    };
}

/* SHOW PAGE */

function showPage(page) {
    currentPage = page;

    document.querySelectorAll(".page").forEach(function(section) {
        section.classList.toggle(
            "hidden",
            section.id !== "page-" + page
        );
    });

    document.querySelectorAll(".nav-item").forEach(function(button) {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    const sidebar = document.querySelector(".sidebar");

    if (sidebar) {
        sidebar.classList.remove("open");
    }

    if (page === "home") renderHome();
    if (page === "shorts") renderShorts();
    if (page === "explore") renderExplore();
    if (page === "following") renderFollowing();

    if (page === "profile") {
        if (!currentProfileUserId) {
            currentProfileUserId =
                currentUser ? currentUser.id : null;
        }

        renderProfile();
    }

    if (page === "notifications") {
        renderNotifications();
    }
}

/* SEARCH */

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

    return list.filter(function(video) {
        const owner = users.find(function(user) {
            return user.id === video.ownerId;
        });

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

/* CREATE VIDEO CARD */

function createVideoCard(video) {
    const owner = users.find(function(user) {
        return user.id === video.ownerId;
    });

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
            class="video-card ${video.isShort ? "short-card" : ""}"
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
                    ? `
                        <button
                            class="follow-btn"
                            data-follow="${escapeHTML(owner.id)}"
                        >
                            ${following ? "Following" : "Follow"}
                        </button>
                    `
                    : ""
                }
            </div>

            <div class="video-info">
                <h3>${escapeHTML(video.title)}</h3>

                ${
                    video.description
                    ? `<p>${escapeHTML(video.description)}</p>`
                    : ""
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
                >
                    ❤️ ${video.likes.length}
                </button>

                <button
                    class="action-btn"
                    data-comment="${escapeHTML(video.id)}"
                >
                    💬 ${video.comments.length}
                </button>

                <button
                    class="action-btn"
                    data-share="${escapeHTML(video.id)}"
                >
                    ↗ Share
                </button>

                ${
                    mine
                    ? `
                        <button
                            class="action-btn delete-btn"
                            data-delete="${escapeHTML(video.id)}"
                        >
                            🗑 Delete
                        </button>
                    `
                    : ""
                }
            </div>
        </article>
    `;
}

/* ATTACH VIDEO EVENTS */

function attachVideoEvents(container) {
    if (!container) {
        return;
    }

    container
        .querySelectorAll("[data-like]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                toggleLike(button.dataset.like);
            });
        });

    container
        .querySelectorAll("[data-comment]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                openComments(button.dataset.comment);
            });
        });

    container
        .querySelectorAll("[data-share]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                shareVideo(button.dataset.share);
            });
        });

    container
        .querySelectorAll("[data-follow]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                toggleFollow(button.dataset.follow);
            });
        });

    container
        .querySelectorAll("[data-delete]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                deleteVideo(button.dataset.delete);
            });
        });

    container
        .querySelectorAll(".profile-user-btn")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                showUserProfile(button.dataset.user);
            });
        });

    container
        .querySelectorAll("[data-view]")
        .forEach(function(videoElement) {
            videoElement.addEventListener(
                "play",
                function() {
                    registerVideoView(videoElement.dataset.view);
                },
                { once: true }
            );
        });
}

/* REGISTER VIDEO VIEW */

async function registerVideoView(videoId) {
    const video = videos.find(function(item) {
        return item.id === videoId;
    });

    if (!video) {
        return;
    }

    rememberWatchedVideo(video);

    if (video._viewed) {
        return;
    }

    video._viewed = true;

    video.views =
        Number(video.views || 0) + 1;

    await supabaseClient
        .from("videos")
        .update({
            views: video.views
        })
        .eq("id", video.id);
}

/* WATCH HISTORY */

function getWatchHistory() {
    if (!currentUser) {
        return {};
    }

    try {
        return JSON.parse(
            localStorage.getItem(
                "gocat_watch_history_" + currentUser.id
            ) || "{}"
        );
    } catch (error) {
        return {};
    }
}

function rememberWatchedVideo(video) {
    if (!currentUser || !video) {
        return;
    }

    const history = getWatchHistory();

    history[video.id] = {
        topic: normalizeTopic(video.topic),
        ownerId: video.ownerId,
        watchedAt: Date.now()
    };

    const recent = Object.entries(history)
        .sort(function(a, b) {
            return Number(b[1].watchedAt || 0) -
                Number(a[1].watchedAt || 0);
        })
        .slice(0, 150);

    localStorage.setItem(
        "gocat_watch_history_" + currentUser.id,
        JSON.stringify(Object.fromEntries(recent))
    );
}

/* RECOMMENDATION ENGINE */

function getRecommendedVideos(list) {
    if (!currentUser) {
        return list.slice();
    }

    const history = getWatchHistory();
    const topicInterest = {};
    const now = Date.now();

    videos.forEach(function(video) {
        const topic = normalizeTopic(video.topic);

        if (
            video.likes &&
            video.likes.includes(currentUser.id)
        ) {
            topicInterest[topic] =
                (topicInterest[topic] || 0) + 5;
        }

        const watched = history[video.id];

        if (
            watched &&
            watched.watchedAt &&
            now - watched.watchedAt < 30 * 86400000
        ) {
            topicInterest[topic] =
                (topicInterest[topic] || 0) + 2;
        }
    });

    const followed = new Set(currentUser.following || []);

    return list
        .map(function(video) {
            const topic = normalizeTopic(video.topic);

            const created =
                new Date(video.createdAt).getTime();

            const ageDays = Number.isFinite(created)
                ? Math.max(0, (now - created) / 86400000)
                : 30;

            const watch = history[video.id];

            const watchedRecently =
                watch &&
                now - Number(watch.watchedAt || 0) <
                    7 * 86400000;

            const interestScore =
                (topicInterest[topic] || 0) * 3;

            const creatorScore =
                followed.has(video.ownerId) ? 5 : 0;

            const popularityScore =
                Math.log1p((video.likes || []).length) * 2 +
                Math.log1p(Number(video.views || 0)) * 0.7;

            const freshnessScore =
                Math.max(0, 5 - ageDays * 0.35);

            const repeatPenalty =
                watchedRecently ? 4 : 0;

            const ownPostPenalty =
                video.ownerId === currentUser.id ? 1 : 0;

            return {
                video: video,
                score:
                    interestScore +
                    creatorScore +
                    popularityScore +
                    freshnessScore -
                    repeatPenalty -
                    ownPostPenalty
            };
        })
        .sort(function(a, b) {
            return b.score - a.score ||
                new Date(b.video.createdAt) -
                new Date(a.video.createdAt);
        })
        .map(function(item) {
            return item.video;
        });
}

/* HOME FEED */

function renderHome() {
    if (!homeFeed) {
        return;
    }

    let list = videos.filter(function(video) {
        return !video.isShort;
    });

    if (activeHomeTopic !== "All") {
        list = list.filter(function(video) {
            return normalizeTopic(video.topic) === activeHomeTopic;
        });
    }

    list = getRecommendedVideos(filterVideos(list));

    const visibleCount =
        HOME_FEED_PAGE_SIZE + homeFeedOffset;

    const visible = list.slice(0, visibleCount);

    homeFeed.innerHTML = visible.length
        ? visible.map(createVideoCard).join("")
        : `
            <div class="empty-state feed-empty-state">
                <div>🎬</div>
                <h2>
                    ${
                        activeHomeTopic !== "All"
                        ? "No videos in this topic yet"
                        : "No videos yet"
                    }
                </h2>
                <p>
                    Like videos and follow creators so GoCat can learn what you enjoy.
                </p>
                <button class="main-btn upload-trigger" type="button">
                    Upload Video
                </button>
            </div>
        `;

    if (list.length > visible.length) {
        homeFeed.insertAdjacentHTML("beforeend", `
            <div class="feed-pagination">
                <button
                    class="outline-btn feed-more-btn"
                    id="loadMoreFeed"
                    type="button"
                >
                    Show more videos ↓
                </button>
                <span>${visible.length} of ${list.length} videos</span>
            </div>
        `);

        const moreButton =
            document.getElementById("loadMoreFeed");

        if (moreButton) {
            moreButton.addEventListener("click", function() {
                homeFeedOffset += HOME_FEED_PAGE_SIZE;
                renderHome();
            });
        }
    }

    attachVideoEvents(homeFeed);

    homeFeed
        .querySelectorAll(".upload-trigger")
        .forEach(function(button) {
            button.addEventListener("click", openUploadModal);
        });

    renderSuggestedCreators();
}

/* SHORTS FEED */

function renderShorts() {
    const box = document.getElementById("shortsFeed");

    if (!box) {
        return;
    }

    const list = filterVideos(
        videos.filter(function(video) {
            return video.isShort === true;
        })
    ).sort(function(a, b) {
        return new Date(b.createdAt) -
            new Date(a.createdAt);
    });

    const visibleCount =
        SHORTS_FEED_PAGE_SIZE + shortsFeedOffset;

    const visible = list.slice(0, visibleCount);

    box.innerHTML = visible.length
        ? visible.map(createVideoCard).join("")
        : `
            <div class="empty-state shorts-empty-state">
                <div>▶️</div>
                <h2>No Shorts yet</h2>
                <p>
                    Upload a vertical video up to 60 seconds to start the Shorts feed.
                </p>
                <button
                    class="main-btn short-upload-trigger"
                    type="button"
                >
                    Create your first Short
                </button>
            </div>
        `;

    if (list.length > visible.length) {
        box.insertAdjacentHTML("beforeend", `
            <div class="feed-pagination">
                <button
                    class="outline-btn feed-more-btn"
                    id="loadMoreShorts"
                    type="button"
                >
                    Show more Shorts ↓
                </button>
                <span>${visible.length} of ${list.length} Shorts</span>
            </div>
        `);

        const moreButton =
            document.getElementById("loadMoreShorts");

        if (moreButton) {
            moreButton.addEventListener("click", function() {
                shortsFeedOffset += SHORTS_FEED_PAGE_SIZE;
                renderShorts();
            });
        }
    }

    attachVideoEvents(box);

    box.querySelectorAll(".short-upload-trigger").forEach(function(button) {
        button.addEventListener("click", function() {
            openUploadModal("short");
        });
    });
}

/* SUGGESTED CREATORS */

function renderSuggestedCreators() {
    if (!suggestedCreators) {
        return;
    }

    if (!currentUser) {
        suggestedCreators.innerHTML = "";
        return;
    }

    const candidates = users
        .filter(function(user) {
            return (
                user.id !== currentUser.id &&
                !currentUser.following.includes(user.id)
            );
        })
        .filter(function(user) {
            return videos.some(function(video) {
                return video.ownerId === user.id;
            });
        })
        .slice(0, 6);

    if (!candidates.length) {
        suggestedCreators.innerHTML = `
            <div class="empty-state">
                <div>👥</div>
                <h2>You're all caught up</h2>
                <p>Explore GoCat to find more creators.</p>
            </div>
        `;
        return;
    }

    suggestedCreators.innerHTML = candidates.map(function(user) {
        const followed =
            currentUser.following.includes(user.id);

        return `
            <div class="suggested-creator">
                <button
                    class="suggested-avatar"
                    data-suggested-profile="${escapeHTML(user.id)}"
                >
                    ${escapeHTML(getInitial(user.username))}
                </button>

                <div class="suggested-info">
                    <strong>${escapeHTML(user.username)}</strong>
                    <span>
                        ${
                            videos.filter(function(video) {
                                return video.ownerId === user.id;
                            }).length
                        }
                        videos
                    </span>
                </div>

                <button
                    class="follow-btn"
                    data-suggested-follow="${escapeHTML(user.id)}"
                >
                    ${followed ? "Following" : "Follow"}
                </button>
            </div>
        `;
    }).join("");

    suggestedCreators
        .querySelectorAll("[data-suggested-follow]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                toggleFollow(button.dataset.suggestedFollow);
            });
        });

    suggestedCreators
        .querySelectorAll("[data-suggested-profile]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                showUserProfile(button.dataset.suggestedProfile);
            });
        });
}

/* RENDER FOLLOWING */

function renderFollowing() {
    if (!followingFeed || !currentUser) {
        return;
    }

    let list = videos.filter(function(video) {
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

/* RENDER EXPLORE */

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

    const people = users.filter(function(user) {
        if (!query) {
            return true;
        }

        return user.username
            .toLowerCase()
            .includes(query);
    });

    explorePeople.innerHTML = people.length
        ? people.map(function(user) {
            if (currentUser && user.id === currentUser.id) {
                return "";
            }

            const followed =
                currentUser &&
                currentUser.following.includes(user.id);

            const videoCount = videos.filter(function(video) {
                return video.ownerId === user.id;
            }).length;

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
                    >
                        View Profile
                    </button>

                    <button
                        class="main-btn person-follow-btn"
                        data-person-follow="${escapeHTML(user.id)}"
                    >
                        ${followed ? "Following" : "Follow"}
                    </button>
                </div>
            `;
        }).join("")
        : `
            <div class="empty-state">
                <div>👤</div>
                <h2>No creators found</h2>
            </div>
        `;

    explorePeople
        .querySelectorAll("[data-person]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                showUserProfile(button.dataset.person);
            });
        });

    explorePeople
        .querySelectorAll("[data-person-follow]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                toggleFollow(button.dataset.personFollow);
            });
        });
}

/* RENDER PROFILE */

async function renderProfile() {
    if (!currentUser) {
        return;
    }

    const userId =
        currentProfileUserId || currentUser.id;

    const user = users.find(function(item) {
        return item.id === userId;
    });

    if (!user) {
        return;
    }

    const ownProfile = user.id === currentUser.id;
    const follows = await getFollowLists(user.id);

    const userVideos = videos.filter(function(video) {
        return video.ownerId === user.id;
    });

    document.getElementById("profileUsername").textContent =
        user.username;

    document.getElementById("profileEmail").textContent =
        ownProfile ? user.email : "GoCat creator";

    document.getElementById("profileBio").textContent =
        user.bio || "No bio yet.";

    document.getElementById("profileAvatar").textContent =
        getInitial(user.username);

    document.getElementById("postCount").textContent =
        userVideos.length;

    document.getElementById("followersCount").textContent =
        follows.followers.length;

    document.getElementById("followingCount").textContent =
        follows.following.length;

    document.getElementById("profileVideosTitle").textContent =
        ownProfile ? "Your Videos" : user.username + "'s Videos";

    const profileButton =
        document.getElementById("editProfileBtn");

    if (ownProfile) {
        profileButton.textContent = "✎ Edit Profile";

        profileButton.onclick = function() {
            editUsername.value = currentUser.username;
            editBio.value = currentUser.bio;
            editModal.classList.remove("hidden");
        };
    } else {
        const following =
            currentUser.following.includes(user.id);

        profileButton.textContent =
            following ? "✓ Following" : "+ Follow";

        profileButton.onclick = function() {
            toggleFollow(user.id);
        };
    }

    const profileUpload =
        document.getElementById("profileUploadBtn");

    if (ownProfile) {
        profileUpload.classList.remove("hidden");
    } else {
        profileUpload.classList.add("hidden");
    }

    userVideos.sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    profileVideos.innerHTML = userVideos.length
        ? userVideos.map(createVideoCard).join("")
        : `
            <div class="empty-state">
                <div>🎬</div>
                <h2>No videos yet</h2>
                <p>
                    ${
                        ownProfile
                        ? "Upload your first video."
                        : "This creator hasn't uploaded anything yet."
                    }
                </p>
            </div>
        `;

    attachVideoEvents(profileVideos);
}

/* SHOW USER PROFILE */

function showUserProfile(userId) {
    currentProfileUserId = userId;
    showPage("profile");
}

/* TOGGLE FOLLOW */

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
            const result = await supabaseClient
                .from("follows")
                .delete()
                .eq("follower_id", currentUser.id)
                .eq("following_id", userId);

            if (result.error) {
                throw result.error;
            }

            const target = users.find(function(user) {
                return user.id === userId;
            });

            showToast(
                "Unfollowed " +
                (target ? target.username : "creator")
            );
        } else {
            const result = await supabaseClient
                .from("follows")
                .insert({
                    follower_id: currentUser.id,
                    following_id: userId
                });

            if (result.error) {
                throw result.error;
            }

            const target = users.find(function(user) {
                return user.id === userId;
            });

            addNotification(
                "👥",
                (target ? target.username : "A creator") +
                " is now followed by you."
            );

            showToast(
                "Following " +
                (target ? target.username : "creator")
            );
        }

        await loadCurrentProfile();
        await loadAllData();

        renderHome();
        renderShorts();
        renderFollowing();
        renderExplore();
        renderSuggestedCreators();
        renderProfile();
    } catch (error) {
        console.error(error);
        showToast("Could not update follow.");
    }
}

/* TOGGLE LIKE */

async function toggleLike(videoId) {
    if (!currentUser) {
        showLoginScreen();
        return;
    }

    const video = videos.find(function(item) {
        return item.id === videoId;
    });

    if (!video) {
        return;
    }

    const liked = video.likes.includes(currentUser.id);

    try {
        if (liked) {
            const result = await supabaseClient
                .from("likes")
                .delete()
                .eq("video_id", videoId)
                .eq("user_id", currentUser.id);

            if (result.error) {
                throw result.error;
            }

            video.likes = video.likes.filter(function(id) {
                return id !== currentUser.id;
            });
        } else {
            const result = await supabaseClient
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
        renderShorts();
        renderFollowing();
        renderExplore();
        renderProfile();
    } catch (error) {
        console.error(error);
        showToast("Could not update like.");
    }
}

/* SHARE VIDEO */

async function shareVideo(videoId) {
    const video = videos.find(function(item) {
        return item.id === videoId;
    });

    if (!video) {
        return;
    }

    const shareUrl = video.file;
    const shareText = "Check out " + video.title + " on GoCat!";

    if (navigator.share) {
        try {
            await navigator.share({
                title: video.title,
                text: shareText,
                url: shareUrl
            });
        } catch (error) {
            // User cancelled the share dialog.
        }

        return;
    }

    try {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Video link copied!");
    } catch (error) {
        showToast("Could not copy video link.");
    }
}

/* DELETE VIDEO */

async function deleteVideo(videoId) {
    if (!currentUser) {
        return;
    }

    const video = videos.find(function(item) {
        return item.id === videoId;
    });

    if (!video) {
        return;
    }

    if (video.ownerId !== currentUser.id) {
        showToast("You can only delete your own videos.");
        return;
    }

    const confirmed =
        window.confirm("Delete this video from GoCat?");

    if (!confirmed) {
        return;
    }

    try {
        const storageResult = await supabaseClient
            .storage
            .from(SUPABASE_BUCKET)
            .remove([video.storagePath]);

        if (storageResult.error) {
            console.warn(storageResult.error);
        }

        const dbResult = await supabaseClient
            .from("videos")
            .delete()
            .eq("id", videoId);

        if (dbResult.error) {
            throw dbResult.error;
        }

        videos = videos.filter(function(item) {
            return item.id !== videoId;
        });

        showToast("Video deleted.");

        homeFeedOffset = 0;
        shortsFeedOffset = 0;

        renderHome();
        renderShorts();
        renderFollowing();
        renderExplore();
        renderProfile();
    } catch (error) {
        console.error(error);
        showToast("Could not delete video.");
    }
}

/* COMMENTS */

function openComments(videoId) {
    currentVideoId = videoId;

    const video = videos.find(function(item) {
        return item.id === videoId;
    });

    if (!video) {
        return;
    }

    renderComments(video);
    commentsModal.classList.remove("hidden");
}

function renderComments(video) {
    commentsCount.textContent =
        video.comments.length +
        (video.comments.length === 1 ? " comment" : " comments");

    if (video.comments.length === 0) {
        commentsList.innerHTML = `
            <div class="empty-state">
                <div>💬</div>
                <h2>No comments yet</h2>
                <p>Be the first person to comment.</p>
            </div>
        `;
        return;
    }

    commentsList.innerHTML = video.comments
        .slice()
        .reverse()
        .map(function(comment) {
            return `
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
            `;
        })
        .join("");
}

async function submitComment(event) {
    event.preventDefault();

    if (!currentUser) {
        showLoginScreen();
        return;
    }

    const text = commentInput.value.trim();

    if (!text) {
        return;
    }

    const video = videos.find(function(item) {
        return item.id === currentVideoId;
    });

    if (!video) {
        return;
    }

    try {
        const newComment = {
            id: createId(),
            video_id: video.id,
            user_id: currentUser.id,
            text: text,
            created_at: Date.now()
        };

        const result = await supabaseClient
            .from("comments")
            .insert(newComment);

        if (result.error) {
            throw result.error;
        }

        video.comments.push({
            id: newComment.id,
            userId: currentUser.id,
            username: currentUser.username,
            text: text,
            createdAt: newComment.created_at
        });

        commentInput.value = "";

        renderComments(video);
        renderHome();
        renderShorts();
        renderFollowing();
        renderExplore();
        renderProfile();

        const owner = users.find(function(user) {
            return user.id === video.ownerId;
        });

        if (owner && owner.id !== currentUser.id) {
            addNotification(
                "💬",
                currentUser.username + " commented on your video."
            );
        }
    } catch (error) {
        console.error(error);
        showToast("Could not post comment.");
    }
}

/* UPLOAD MODAL */

function openUploadModal(mode = "video") {
    if (!currentUser) {
        showLoginScreen();
        return;
    }

    uploadMode = mode === "short" ? "short" : "video";

    const title =
        document.getElementById("uploadModalTitle");

    const hint =
        document.getElementById("uploadModalHint");

    const modeHint =
        document.getElementById("uploadModeHint");

    if (title) {
        title.textContent =
            uploadMode === "short"
                ? "Create a Short"
                : "Upload a Video";
    }

    if (hint) {
        hint.textContent =
            uploadMode === "short"
                ? "Share a quick vertical video with GoCat."
                : "Share a video with the GoCat community.";
    }

    if (modeHint) {
        modeHint.textContent =
            uploadMode === "short"
                ? "Shorts must be 60 seconds or less. Portrait 9:16 works best."
                : "Choose a video file up to 50 MB.";
    }

    videoFile.value = "";
    selectedFile.classList.add("hidden");
    selectedFile.textContent = "";

    publishVideo.textContent =
        uploadMode === "short"
            ? "Publish Short"
            : "Publish Video";

    uploadModal.classList.remove("hidden");
}

function getVideoDuration(file) {
    return new Promise(function(resolve, reject) {
        const objectUrl = URL.createObjectURL(file);
        const probe = document.createElement("video");

        probe.preload = "metadata";

        probe.onloadedmetadata = function() {
            const duration = probe.duration;
            URL.revokeObjectURL(objectUrl);
            resolve(duration);
        };

        probe.onerror = function() {
            URL.revokeObjectURL(objectUrl);
            reject(new Error(
                "This video could not be read. Try an MP4 file."
            ));
        };

        probe.src = objectUrl;
    });
}

function closeModal(modal) {
    if (!modal) {
        return;
    }

    modal.classList.add("hidden");

    if (modal === uploadModal) {
        uploadMode = "video";
    }
}

/* FILE SELECT */

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

/* PUBLISH VIDEO OR SHORT */

async function publishUploadedVideo() {
    if (isLoading) {
        return;
    }

    const file = videoFile.files[0];
    const isShortUpload = uploadMode === "short";

    if (!file) {
        showToast("Choose a video first.");
        return;
    }

    const title = videoTitle.value.trim();
    const description = videoDescription.value.trim();

    const topic = normalizeTopic(
        videoTopic ? videoTopic.value : "Other"
    );

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

    if (isShortUpload) {
        try {
            const duration = await getVideoDuration(file);

            if (
                !Number.isFinite(duration) ||
                duration <= 0 ||
                duration > 60
            ) {
                showToast("A Short must be 60 seconds or less.");
                return;
            }
        } catch (error) {
            showToast(error.message || "Could not check this video.");
            return;
        }
    }

    isLoading = true;
    publishVideo.disabled = true;

    uploadProgressBox.classList.remove("hidden");
    progressBar.style.width = "10%";
    progressPercent.textContent = "10%";

    const videoId = createId();

    const extension = (
        file.name.split(".").pop() || "mp4"
    ).toLowerCase();

    const storagePath =
        currentUser.id + "/" + videoId + "." + extension;

    try {
        progressBar.style.width = "30%";
        progressPercent.textContent = "30%";

        const upload = await supabaseClient
            .storage
            .from(SUPABASE_BUCKET)
            .upload(storagePath, file, {
                cacheControl: "3600",
                contentType: file.type || "video/mp4",
                upsert: false
            });

        if (upload.error) {
            throw upload.error;
        }

        progressBar.style.width = "70%";
        progressPercent.textContent = "70%";

        const insert = await supabaseClient
            .from("videos")
            .insert({
                id: videoId,
                owner_id: currentUser.id,
                title: title,
                description: description,
                topic: topic,
                storage_path: storagePath,
                created_at: Date.now(),
                views: 0,
                is_short: isShortUpload
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

        showToast(
            isShortUpload
                ? "Your Short is live!"
                : "Your video was uploaded!"
        );

        videoFile.value = "";
        videoTitle.value = "";
        videoDescription.value = "";

        if (videoTopic) {
            videoTopic.value = "Other";
        }

        selectedFile.classList.add("hidden");
        selectedFile.textContent = "";

        await loadAllData();

        closeModal(uploadModal);

        uploadMode = "video";
        homeFeedOffset = 0;
        shortsFeedOffset = 0;

        renderHome();
        renderShorts();
        renderFollowing();
        renderExplore();
        renderProfile();
    } catch (error) {
        console.error(error);
        showToast(error.message || "Could not upload video.");
    } finally {
        isLoading = false;
        publishVideo.disabled = false;

        setTimeout(function() {
            uploadProgressBox.classList.add("hidden");
            progressBar.style.width = "0%";
            progressPercent.textContent = "0%";
        }, 700);
    }
}

/* SAVE PROFILE */

async function saveProfile() {
    if (!currentUser) {
        return;
    }

    const username = editUsername.value.trim();
    const bio = editBio.value.trim();

    if (username.length < 3) {
        showToast("Username must be at least 3 characters.");
        return;
    }

    try {
        const result = await supabaseClient
            .from("users")
            .update({
                username: username,
                bio: bio
            })
            .eq("id", currentUser.id)
            .select("*")
            .single();

        if (result.error) {
            throw result.error;
        }

        currentUser.username = result.data.username;
        currentUser.bio = result.data.bio || "";

        const index = users.findIndex(function(user) {
            return user.id === currentUser.id;
        });

        if (index !== -1) {
            users[index] = result.data;
        }

        closeModal(editModal);
        updateUserUI();

        renderHome();
        renderShorts();
        renderFollowing();
        renderExplore();
        renderProfile();

        showToast("Profile updated!");
    } catch (error) {
        console.error(error);
        showToast("Could not save profile.");
    }
}

/* NOTIFICATIONS */

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

    notificationList.innerHTML = notifications
        .map(function(notification) {
            return `
                <div class="notification">
                    <div class="notification-icon">
                        ${escapeHTML(notification.icon)}
                    </div>

                    <div class="notification-text">
                        <strong>${escapeHTML(notification.text)}</strong>

                        <div class="notification-time">
                            ${formatDate(notification.createdAt)}
                        </div>
                    </div>
                </div>
            `;
        })
        .join("");
}

/* THEME */

function applyGoCatTheme(isDark) {
    document.body.classList.toggle("dark", isDark);

    localStorage.setItem(
        "gocat_theme",
        isDark ? "dark" : "light"
    );

    const button = document.getElementById("themeBtn");

    if (!button) {
        return;
    }

    const icon = button.querySelector(".theme-icon");
    const label = button.querySelector(".theme-label");
    const status = button.querySelector(".theme-status");

    if (icon) {
        icon.textContent = isDark ? "☀️" : "🌙";
    }

    if (label) {
        label.textContent = isDark ? "Light Mode" : "Dark Mode";
    }

    if (status) {
        status.textContent = isDark ? "DARK" : "LIGHT";
    }
}

function loadTheme() {
    applyGoCatTheme(
        localStorage.getItem("gocat_theme") === "dark"
    );
}

function toggleTheme() {
    applyGoCatTheme(
        !document.body.classList.contains("dark")
    );
}

/* LOGOUT */

async function logout() {
    await supabaseClient.auth.signOut();

    currentUser = null;
    users = [];
    videos = [];
    currentProfileUserId = null;
    notifications = [];

    showLoginScreen();
    showToast("Logged out.");
}

/* AUTH — REGISTER */

async function handleRegister(event) {
    event.preventDefault();

    const username =
        document.getElementById("registerUsername").value.trim();

    const email =
        document.getElementById("registerEmail").value.trim();

    const password =
        document.getElementById("registerPassword").value;

    const confirmPassword =
        document.getElementById("registerConfirm").value;

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
        const result = await supabaseClient
            .auth
            .signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username
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
            const profile = await ensureProfile(result.data.user);

            if (!profile) {
                throw new Error(
                    "Account created, but the GoCat profile could not be created."
                );
            }

            setAuthMessage("Account created!", true);
            await startUserSession();
            return;
        }

        setAuthMessage(
            "Account created. Check your email to confirm your account.",
            true
        );
    } catch (error) {
        console.error(error);
        setAuthMessage(error.message || "Could not create account.");
    }
}

/* AUTH — LOGIN */

async function handleLogin(event) {
    event.preventDefault();

    const email =
        document.getElementById("loginUsername").value.trim();

    const password =
        document.getElementById("loginPassword").value;

    if (!email) {
        setAuthMessage("Enter your email.");
        return;
    }

    setAuthMessage("Signing in...", true);

    try {
        const result = await supabaseClient
            .auth
            .signInWithPassword({
                email: email,
                password: password
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

/* START USER SESSION */

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
    renderShorts();
    renderFollowing();
    renderExplore();
    renderProfile();
    renderNotifications();

    hideGoCatLoader();
}

/* REFRESH ALL */

async function refreshAll() {
    try {
        homeFeedOffset = 0;
        shortsFeedOffset = 0;

        await loadAllData();
        await loadCurrentProfile();

        updateUserUI();

        renderHome();
        renderShorts();
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

/* SEARCH */

function handleSearchInput() {
    homeFeedOffset = 0;
    shortsFeedOffset = 0;

    if (!searchInput) {
        return;
    }

    clearSearch.classList.toggle(
        "hidden",
        !searchInput.value
    );

    if (currentPage === "home") {
        renderHome();
    }

    if (currentPage === "shorts") {
        renderShorts();
    }

    if (currentPage === "following") {
        renderFollowing();
    }

    if (currentPage === "explore") {
        renderExplore();
    }

    if (currentPage === "profile") {
        renderProfile();
    }
}

/* TOPIC BUTTONS */

function bindTopicButtons() {
    document
        .querySelectorAll(".topic-chip")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                activeHomeTopic = button.dataset.topic;
                homeFeedOffset = 0;

                document
                    .querySelectorAll(".topic-chip")
                    .forEach(function(item) {
                        item.classList.toggle(
                            "active",
                            item === button
                        );
                    });

                showPage("home");
            });
        });
}

/* EXPLORE TABS */

function bindExploreTabs() {
    document
        .querySelectorAll(".explore-tab")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                exploreMode = button.dataset.explore;

                document
                    .querySelectorAll(".explore-tab")
                    .forEach(function(item) {
                        item.classList.toggle(
                            "active",
                            item === button
                        );
                    });

                renderExplore();
            });
        });
}

/* GENERAL CLICK EVENTS */

function bindGeneralEvents() {

    /* AUTH */

    showRegister.addEventListener("click", function() {
        showRegisterScreen();
    });

    showLogin.addEventListener("click", function() {
        showLoginScreen();
    });

    loginForm.addEventListener("submit", handleLogin);
    registerForm.addEventListener("submit", handleRegister);

    /* PASSWORD VISIBILITY */

    document
        .querySelectorAll(".password-btn")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                const target =
                    document.getElementById(button.dataset.target);

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

    document
        .querySelectorAll(".nav-item")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                if (button.dataset.page) {
                    showPage(button.dataset.page);
                }
            });
        });

    /* PROFILE TOP BUTTON */

    const profileTopBtn =
        document.getElementById("profileTopBtn");

    if (profileTopBtn) {
        profileTopBtn.addEventListener("click", function() {
            if (!currentUser) {
                return;
            }

            currentProfileUserId = currentUser.id;
            showPage("profile");
        });
    }

    /* NORMAL VIDEO UPLOAD BUTTONS */

    document
        .querySelectorAll(".upload-trigger")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                openUploadModal("video");
            });
        });

    /* SHORTS UPLOAD BUTTONS */

    document
        .querySelectorAll(".short-upload-trigger")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                openUploadModal("short");
            });
        });

    /* TOP UPLOAD BUTTON */

    const uploadTopBtn =
        document.getElementById("uploadTopBtn");

    if (uploadTopBtn) {
        uploadTopBtn.addEventListener("click", function() {
            openUploadModal("video");
        });
    }

    /* FILE INPUT */

    videoFile.addEventListener("change", updateSelectedFile);

    dropArea.addEventListener("dragover", function(event) {
        event.preventDefault();
        dropArea.classList.add("dragging");
    });

    dropArea.addEventListener("dragleave", function() {
        dropArea.classList.remove("dragging");
    });

    dropArea.addEventListener("drop", function(event) {
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

    /* SEARCH INPUT */

    searchInput.addEventListener(
        "input",
        handleSearchInput
    );

    clearSearch.addEventListener("click", function() {
        searchInput.value = "";
        clearSearch.classList.add("hidden");
        handleSearchInput();
    });

    /* TOPICS */

    bindTopicButtons();

    /* EXPLORE TABS */

    bindExploreTabs();

    /* REFRESH FEED */

    const refreshFeed =
        document.getElementById("refreshFeed");

    if (refreshFeed) {
        refreshFeed.addEventListener("click", refreshAll);
    }

    /* THEME */

    const themeBtn =
        document.getElementById("themeBtn");

    if (themeBtn) {
        themeBtn.addEventListener("click", toggleTheme);
    }

    /* LOGOUT */

    const logoutBtn =
        document.getElementById("logoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }

    /* COMMENTS */

    commentForm.addEventListener(
        "submit",
        submitComment
    );

    /* SAVE PROFILE */

    saveProfileBtn.addEventListener(
        "click",
        saveProfile
    );

    /* CLEAR NOTIFICATIONS */

    const clearNotifications =
        document.getElementById("clearNotifications");

    if (clearNotifications) {
        clearNotifications.addEventListener("click", function() {
            notifications = [];

            saveStoredNotifications();
            renderNotifications();

            showToast("Notifications cleared.");
        });
    }

    /* CLOSE MODALS */

    document
        .querySelectorAll("[data-close]")
        .forEach(function(button) {
            button.addEventListener("click", function() {
                const target =
                    document.getElementById(button.dataset.close);

                closeModal(target);
            });
        });

    document
        .querySelectorAll(".modal-overlay")
        .forEach(function(overlay) {
            overlay.addEventListener("click", function() {
                const modal = overlay.closest(".modal");
                closeModal(modal);
            });
        });

    /* MOBILE SIDEBAR MENU */

    const mobileMenu =
        document.getElementById("mobileMenu");

    const sidebar =
        document.querySelector(".sidebar");

    if (mobileMenu && sidebar) {
        mobileMenu.addEventListener("click", function() {
            sidebar.classList.toggle("open");
        });
    }
}

/* INITIALIZE GOCAT */

async function initGoCat() {
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
        async function(event, session) {
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

/* START GOCAT */

initGoCat();

