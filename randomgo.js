/* ==========================================================
   GOCAT — SUPABASE CLOUD APP
   Existing tables preserved: users, videos, likes, comments,
   follows. Added tables: posts, post_likes, messages.
   ========================================================== */

const SUPABASE_URL = "https://rfwgvsijxweyzwvuqslt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0O";
const VIDEO_BUCKET = "videos";
const POST_BUCKET = "post-media";

let supabaseClient = null;
let currentUser = null;
let users = [];
let videos = [];
let follows = [];
let posts = [];
let postLikes = [];
let notifications = [];
let currentPage = "home";
let currentVideoId = null;
let currentProfileUserId = null;
let activeHomeTopic = "All";
let exploreMode = "videos";
let homeLimit = 5;
let exploreLimit = 6;
let peopleLimit = 6;
let postLimit = 6;
let reelLimit = 5;
let currentChatUserId = null;
let chatChannel = null;
let uploadMode = "video";
let selectedVideoFile = null;
let editedReelFile = null;
let reelObjectUrl = null;
let postImageFile = null;
let isUploading = false;
let viewRecorded = new Set();

const TOPICS = [
    "Gaming",
    "Cooking",
    "School",
    "Technology",
    "Sports",
    "Art",
    "Entertainment",
    "Other"
];

const $ = (selector, root = document) =>
    root.querySelector(selector);

const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

/* BASIC HELPERS */

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function makeId() {
    return window.crypto?.randomUUID?.() ||
        Date.now().toString(36) +
        Math.random().toString(36).slice(2);
}

function initial(name) {
    return String(name || "G")
        .trim()
        .charAt(0)
        .toUpperCase() || "G";
}

function normalizeTopic(topic) {
    return TOPICS.includes(topic) ? topic : "Other";
}

function topicIcon(topic) {
    return ({
        Gaming: "🎮",
        Cooking: "🍳",
        School: "📚",
        Technology: "💻",
        Sports: "⚽",
        Art: "🎨",
        Entertainment: "😂",
        Other: "🌍"
    })[normalizeTopic(topic)];
}

function timestampNumber(value) {
    if (typeof value === "number") {
        return value;
    }

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return Date.now();
    }

    const numeric = Number(value);

    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }

    const parsed = Date.parse(value);

    return Number.isFinite(parsed)
        ? parsed
        : Date.now();
}

function timeAgo(value) {
    const seconds = Math.max(
        0,
        Math.floor(
            (Date.now() - timestampNumber(value)) / 1000
        )
    );

    if (seconds < 60) {
        return "Just now";
    }

    if (seconds < 3600) {
        return Math.floor(seconds / 60) + "m ago";
    }

    if (seconds < 86400) {
        return Math.floor(seconds / 3600) + "h ago";
    }

    if (seconds < 2592000) {
        return Math.floor(seconds / 86400) + "d ago";
    }

    return new Date(
        timestampNumber(value)
    ).toLocaleDateString();
}

function toast(message) {
    const box = $("#toast");

    if (!box) {
        return;
    }

    box.textContent = message;
    box.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(function() {
        box.classList.remove("show");
    }, 2800);
}

function showLoader(show) {
    const loader = $("#loader");

    if (!loader) {
        return;
    }

    loader.classList.toggle("hide", !show);

    if (!show) {
        setTimeout(function() {
            loader.remove();
        }, 450);
    }
}

function setAuthMessage(message, success = false) {
    const box = $("#authMessage");

    if (!box) {
        return;
    }

    box.textContent = message;

    box.style.color = success
        ? "#07895b"
        : "#d13d59";
}

function getUser(userId) {
    return users.find(function(user) {
        return user.id === userId;
    }) || null;
}

/* WATCH HISTORY */

function getWatchHistory() {
    if (!currentUser) {
        return {};
    }

    try {
        return JSON.parse(
            localStorage.getItem(
                "gocat_watch_" + currentUser.id
            ) || "{}"
        );
    } catch (error) {
        return {};
    }
}

function saveWatchHistory(history) {
    if (!currentUser) {
        return;
    }

    localStorage.setItem(
        "gocat_watch_" + currentUser.id,
        JSON.stringify(history)
    );
}

function rememberVideo(video) {
    if (!currentUser || !video) {
        return;
    }

    const history = getWatchHistory();
    const topic = normalizeTopic(video.topic);

    history[video.id] = {
        topic: topic,
        watchedAt: Date.now()
    };

    const recent = Object.entries(history)
        .sort(function(a, b) {
            return timestampNumber(b[1].watchedAt) -
                timestampNumber(a[1].watchedAt);
        })
        .slice(0, 150);

    saveWatchHistory(
        Object.fromEntries(recent)
    );
}

/* LOCAL NOTIFICATIONS */

function addLocalNotification(icon, message) {
    if (!currentUser) {
        return;
    }

    try {
        const key =
            "gocat_notifications_" + currentUser.id;

        const items = JSON.parse(
            localStorage.getItem(key) || "[]"
        );

        items.unshift({
            id: makeId(),
            icon: icon,
            message: message,
            created_at: Date.now()
        });

        localStorage.setItem(
            key,
            JSON.stringify(items.slice(0, 100))
        );

        notifications = items.slice(0, 100);

        renderNotifications();
    } catch (error) {
        console.warn(
            "Notification could not be saved",
            error
        );
    }
}

function loadLocalNotifications() {
    if (!currentUser) {
        return [];
    }

    try {
        return JSON.parse(
            localStorage.getItem(
                "gocat_notifications_" + currentUser.id
            ) || "[]"
        );
    } catch (error) {
        return [];
    }
}

/* SUPABASE AUTH AND PROFILE */

async function ensureProfile(authUser) {
    const lookup = await supabaseClient
        .from("users")
        .select("id,username,email,bio,created_at")
        .eq("id", authUser.id)
        .maybeSingle();

    if (lookup.error) {
        throw lookup.error;
    }

    if (lookup.data) {
        return lookup.data;
    }

    let username = String(
        authUser.user_metadata?.username ||
        "gocat_user"
    )
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 20);

    if (username.length < 3) {
        username =
            "gocat_user_" +
            Math.floor(Math.random() * 9999);
    }

    const insert = await supabaseClient
        .from("users")
        .insert({
            id: authUser.id,
            username: username,
            email: authUser.email || "",
            bio: "Welcome to my GoCat profile.",
            created_at: Date.now(),
            password_hash: null
        })
        .select("id,username,email,bio,created_at")
        .single();

    if (insert.error) {
        throw insert.error;
    }

    return insert.data;
}

/* LOAD USERS */

async function loadUsers() {
    const result = await supabaseClient
        .from("users")
        .select("id,username,email,bio,created_at")
        .order("created_at", {
            ascending: false
        });

    if (result.error) {
        throw result.error;
    }

    users = result.data || [];
}

/* LOAD FOLLOWS */

async function loadFollows() {
    const result = await supabaseClient
        .from("follows")
        .select("follower_id,following_id");

    if (result.error) {
        throw result.error;
    }

    follows = result.data || [];

    if (currentUser) {
        currentUser.following = follows
            .filter(function(row) {
                return row.follower_id === currentUser.id;
            })
            .map(function(row) {
                return row.following_id;
            });

        currentUser.followers = follows
            .filter(function(row) {
                return row.following_id === currentUser.id;
            })
            .map(function(row) {
                return row.follower_id;
            });
    }
}

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
            .select(
                "id,video_id,user_id,text,created_at"
            )
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

    videos = (videoResult.data || []).map(function(row) {
        const publicUrl = supabaseClient
            .storage
            .from(VIDEO_BUCKET)
            .getPublicUrl(row.storage_path)
            .data.publicUrl;

        return {
            id: row.id,
            ownerId: row.owner_id,
            title: row.title || "Untitled video",
            description: row.description || "",
            topic: normalizeTopic(row.topic),
            storagePath: row.storage_path,
            file: publicUrl,
            createdAt: row.created_at,
            views: Number(row.views || 0),
            isReel: row.is_short === true,

            likes: likes
                .filter(function(item) {
                    return item.video_id === row.id;
                })
                .map(function(item) {
                    return item.user_id;
                }),

            comments: comments
                .filter(function(item) {
                    return item.video_id === row.id;
                })
                .map(function(item) {
                    return {
                        id: item.id,
                        userId: item.user_id,
                        username:
                            getUser(item.user_id)?.username ||
                            "GoCat user",
                        text: item.text,
                        createdAt: item.created_at
                    };
                })
        };
    });
}

/* LOAD POSTS */

async function loadPosts() {
    const [
        postResult,
        likeResult
    ] = await Promise.all([
        supabaseClient
            .from("posts")
            .select("*")
            .order("created_at", {
                ascending: false
            }),

        supabaseClient
            .from("post_likes")
            .select("post_id,user_id")
    ]);

    if (postResult.error) {
        throw postResult.error;
    }

    if (likeResult.error) {
        throw likeResult.error;
    }

    postLikes = likeResult.data || [];

    posts = (postResult.data || []).map(function(row) {
        return {
            id: row.id,
            userId: row.user_id,
            content: row.content || "",
            mediaPath: row.media_path,

            imageUrl: row.media_path
                ? supabaseClient
                    .storage
                    .from(POST_BUCKET)
                    .getPublicUrl(row.media_path)
                    .data.publicUrl
                : "",

            createdAt: row.created_at,

            likes: postLikes
                .filter(function(like) {
                    return like.post_id === row.id;
                })
                .map(function(like) {
                    return like.user_id;
                })
        };
    });
}

/* LOAD ALL DATA */

async function loadAllData() {
    await loadUsers();
    await loadFollows();

    await Promise.all([
        loadVideos(),
        loadPosts()
    ]);
}

/* START SESSION */

async function startSession() {
    showLoader(true);

    const authResult =
        await supabaseClient.auth.getUser();

    if (authResult.error) {
        throw authResult.error;
    }

    const authUser = authResult.data.user;

    if (!authUser) {
        showLogin();
        showLoader(false);
        return;
    }

    await ensureProfile(authUser);

    await loadUsers();

    currentUser = getUser(authUser.id);

    if (!currentUser) {
        throw new Error(
            "Your GoCat profile could not be loaded."
        );
    }

    await loadFollows();

    await Promise.all([
        loadVideos(),
        loadPosts()
    ]);

    notifications = loadLocalNotifications();

    currentProfileUserId = currentUser.id;

    $("#authScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    updateUserUI();
    renderAll();

    subscribeToMessages();

    showLoader(false);
}

/* AUTH SCREEN */

function showLogin() {
    $("#authScreen").classList.remove("hidden");
    $("#app").classList.add("hidden");

    $("#loginForm").classList.remove("hidden");
    $("#registerForm").classList.add("hidden");

    $("#authTitle").textContent = "Welcome back";
    $("#authSubtitle").textContent =
        "Sign in to continue to GoCat.";

    setAuthMessage("");
}

function showRegister() {
    $("#authScreen").classList.remove("hidden");
    $("#app").classList.add("hidden");

    $("#loginForm").classList.add("hidden");
    $("#registerForm").classList.remove("hidden");

    $("#authTitle").textContent = "Join GoCat";
    $("#authSubtitle").textContent =
        "Create your creator account.";

    setAuthMessage("");
}

/* LOGIN */

async function handleLogin(event) {
    event.preventDefault();

    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;

    setAuthMessage("Signing you in...", true);

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

        await startSession();
    } catch (error) {
        console.error(error);

        setAuthMessage(
            error.message || "Could not sign in."
        );
    }
}

/* REGISTER */

async function handleRegister(event) {
    event.preventDefault();

    const username =
        $("#registerUsername").value.trim();

    const email =
        $("#registerEmail").value.trim();

    const password =
        $("#registerPassword").value;

    const confirm =
        $("#registerConfirm").value;

    if (username.length < 3) {
        return setAuthMessage(
            "Username must have at least 3 characters."
        );
    }

    if (password.length < 6) {
        return setAuthMessage(
            "Password must have at least 6 characters."
        );
    }

    if (password !== confirm) {
        return setAuthMessage(
            "The passwords do not match."
        );
    }

    if (
        users.some(function(user) {
            return user.username?.toLowerCase() ===
                username.toLowerCase();
        })
    ) {
        return setAuthMessage(
            "That username is already in use."
        );
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

        if (result.data.session) {
            await ensureProfile(result.data.user);
            await startSession();
        } else {
            setAuthMessage(
                "Account created. Check your email to confirm it before logging in.",
                true
            );
        }
    } catch (error) {
        console.error(error);

        setAuthMessage(
            error.message || "Could not create your account."
        );
    }
}

/* LOGOUT */

async function logout() {
    try {
        if (chatChannel) {
            await supabaseClient.removeChannel(chatChannel);
        }

        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error(error);
    }

    currentUser = null;
    users = [];
    videos = [];
    posts = [];
    follows = [];
    currentChatUserId = null;

    showLogin();
    toast("You have logged out.");
}

/* RECOMMENDATIONS */

function topicInterestScores() {
    const scores = {};
    const history = getWatchHistory();

    Object.values(history).forEach(function(item) {
        const topic = normalizeTopic(item.topic);

        scores[topic] =
            (scores[topic] || 0) + 2;
    });

    videos.forEach(function(video) {
        if (
            video.likes.includes(currentUser?.id)
        ) {
            const topic = normalizeTopic(video.topic);

            scores[topic] =
                (scores[topic] || 0) + 5;
        }
    });

    return scores;
}

function recommendVideos(source, includeReels = false) {
    const interests = topicInterestScores();
    const history = getWatchHistory();
    const following = new Set(
        currentUser?.following || []
    );

    const now = Date.now();

    return source
        .filter(function(video) {
            return includeReels
                ? video.isReel
                : !video.isReel;
        })

        .filter(function(video) {
            return activeHomeTopic === "All" ||
                normalizeTopic(video.topic) === activeHomeTopic;
        })

        .map(function(video) {
            const topic = normalizeTopic(video.topic);

            const ageDays = Math.max(
                0,
                (
                    now -
                    timestampNumber(video.createdAt)
                ) / 86400000
            );

            const historyItem = history[video.id];

            const recentlyWatched =
                historyItem &&
                now - timestampNumber(historyItem.watchedAt) <
                    5 * 86400000;

            const topicScore =
                (interests[topic] || 0) * 3;

            const followScore =
                following.has(video.ownerId) ? 7 : 0;

            const engagementScore =
                Math.log1p(video.likes.length) * 2 +
                Math.log1p(video.views) * 0.8;

            const freshnessScore =
                Math.max(0, 8 - ageDays * 0.45);

            const repeatPenalty =
                recentlyWatched ? 8 : 0;

            const ownVideoPenalty =
                video.ownerId === currentUser?.id ? 1 : 0;

            return {
                video: video,

                score:
                    topicScore +
                    followScore +
                    engagementScore +
                    freshnessScore -
                    repeatPenalty -
                    ownVideoPenalty
            };
        })

        .sort(function(a, b) {
            return b.score - a.score ||
                timestampNumber(b.video.createdAt) -
                timestampNumber(a.video.createdAt);
        })

        .map(function(item) {
            return item.video;
        });
}

function currentSearch() {
    return $("#searchInput").value
        .trim()
        .toLowerCase();
}

function filterBySearch(list) {
    const query = currentSearch();

    if (!query) {
        return list;
    }

    return list.filter(function(item) {
        const owner = getUser(
            item.ownerId || item.userId
        );

        const text = [
            item.title,
            item.description,
            item.topic,
            item.content,
            owner?.username
        ]
            .join(" ")
            .toLowerCase();

        return text.includes(query);
    });
}

/* VIDEO CARDS */

function videoCard(video) {
    const owner = getUser(video.ownerId);

    if (!owner) {
        return "";
    }

    const own =
        video.ownerId === currentUser.id;

    const liked =
        video.likes.includes(currentUser.id);

    const following =
        currentUser.following.includes(owner.id);

    return `
        <article
            class="video-card"
            data-video-card="${escapeHTML(video.id)}"
        >
            <div class="video-player-wrap">
                <video
                    class="video-player"
                    src="${escapeHTML(video.file)}"
                    controls
                    playsinline
                    preload="metadata"
                    data-watch="${escapeHTML(video.id)}"
                ></video>
            </div>

            <div class="video-owner">
                <div class="owner-avatar">
                    ${escapeHTML(initial(owner.username))}
                </div>

                <div class="owner-name">
                    <button
                        class="profile-user-btn"
                        data-profile-user="${escapeHTML(owner.id)}"
                    >
                        ${escapeHTML(owner.username)}
                    </button>
                </div>

                ${
                    own
                    ? ""
                    : `
                        <button
                            class="follow-btn"
                            data-follow-user="${escapeHTML(owner.id)}"
                        >
                            ${following ? "Following" : "Follow"}
                        </button>
                    `
                }
            </div>

            <div class="video-info">
                <h3>${escapeHTML(video.title)}</h3>
                <p>${escapeHTML(video.description)}</p>

                <span class="video-topic">
                    ${topicIcon(video.topic)}
                    ${escapeHTML(video.topic)}
                </span>
            </div>

            <div class="video-meta">
                <span>👁 ${video.views}</span>
                <span>${timeAgo(video.createdAt)}</span>
            </div>

            <div class="video-actions">
                <button
                    class="action-btn ${liked ? "liked" : ""}"
                    data-like-video="${escapeHTML(video.id)}"
                >
                    ${liked ? "♥" : "♡"}
                    ${video.likes.length}
                </button>

                <button
                    class="action-btn"
                    data-comment-video="${escapeHTML(video.id)}"
                >
                    💬 ${video.comments.length}
                </button>

                <button
                    class="action-btn"
                    data-share-video="${escapeHTML(video.id)}"
                >
                    ↗ Share
                </button>

                ${
                    own
                    ? `
                        <button
                            class="action-btn delete-btn"
                            data-delete-video="${escapeHTML(video.id)}"
                        >
                            Delete
                        </button>
                    `
                    : ""
                }
            </div>
        </article>
    `;
}

/* VIDEO PLAYBACK / VIEWS */

function attachWatchEvents(root) {
    $$("video[data-watch]", root).forEach(function(videoElement) {
        videoElement.addEventListener(
            "play",
            function() {
                const id = videoElement.dataset.watch;

                const video = videos.find(function(item) {
                    return item.id === id;
                });

                if (!video) {
                    return;
                }

                rememberVideo(video);

                if (viewRecorded.has(id)) {
                    return;
                }

                viewRecorded.add(id);
                video.views += 1;

                supabaseClient
                    .from("videos")
                    .update({
                        views: video.views
                    })
                    .eq("id", id)
                    .then(function(result) {
                        if (result.error) {
                            console.warn(result.error);
                        }
                    });
            },
            { once: true }
        );
    });
}

/* HOME RECOMMENDATIONS */

function renderHome() {
    const list = filterBySearch(
        recommendVideos(videos, false)
    );

    const visible = list.slice(0, homeLimit);

    $("#homeFeed").innerHTML =
        visible.map(videoCard).join("");

    $("#homeEmpty").classList.toggle(
        "hidden",
        list.length > 0
    );

    $("#homeLoadMoreWrap").classList.toggle(
        "hidden",
        list.length <= visible.length
    );

    $("#homeCount").textContent =
        `${visible.length} of ${list.length} videos`;

    attachWatchEvents($("#homeFeed"));

    renderSuggestedCreators();
}

/* SUGGESTED CREATORS */

function renderSuggestedCreators() {
    const box = $("#suggestedCreators");

    if (!box || !currentUser) {
        return;
    }

    const candidates = users.filter(function(user) {
        return (
            user.id !== currentUser.id &&
            !currentUser.following.includes(user.id)
        );
    });

    const scored = candidates
        .map(function(user) {
            const creatorVideos = videos.filter(function(video) {
                return video.ownerId === user.id;
            });

            const interest = topicInterestScores();

            const creatorTopicMatch =
                creatorVideos.reduce(function(sum, video) {
                    return sum +
                        (interest[normalizeTopic(video.topic)] || 0);
                }, 0);

            return {
                user: user,
                count: creatorVideos.length,
                score:
                    creatorTopicMatch +
                    creatorVideos.length
            };
        })
        .filter(function(item) {
            return item.count > 0;
        })
        .sort(function(a, b) {
            return b.score - a.score;
        })
        .slice(0, 6);

    if (!scored.length) {
        box.innerHTML = `
            <div class="muted-text">
                No new creator suggestions yet.
                Explore videos to discover accounts.
            </div>
        `;
        return;
    }

    box.innerHTML = scored.map(function(item) {
        return `
            <div class="creator-card">
                <div class="creator-avatar">
                    ${escapeHTML(initial(item.user.username))}
                </div>

                <div class="creator-info">
                    <strong>${escapeHTML(item.user.username)}</strong>
                    <small>${item.count} videos</small>
                </div>

                <button
                    class="mini-follow"
                    data-follow-user="${escapeHTML(item.user.id)}"
                >
                    Follow
                </button>
            </div>
        `;
    }).join("");
}

/* FOLLOWING FEED */

function renderFollowing() {
    const list = filterBySearch(
        videos.filter(function(video) {
            return (
                currentUser.following.includes(video.ownerId) &&
                !video.isReel
            );
        })
    );

    $("#followingFeed").innerHTML =
        list.map(videoCard).join("");

    $("#followingEmpty").classList.toggle(
        "hidden",
        list.length > 0
    );

    attachWatchEvents($("#followingFeed"));
}

/* EXPLORE */

function renderExplore() {
    const videoBox = $("#exploreVideos");
    const peopleBox = $("#explorePeople");
    const loadMore = $("#exploreLoadMoreWrap");

    if (exploreMode === "videos") {
        videoBox.classList.remove("hidden");
        peopleBox.classList.add("hidden");

        const list = filterBySearch(
            videos.filter(function(video) {
                return !video.isReel;
            })
        );

        const visible = list.slice(0, exploreLimit);

        videoBox.innerHTML =
            visible.map(videoCard).join("") ||
            `
                <div class="empty-card">
                    <div>🔎</div>
                    <h3>No videos found</h3>
                    <p>Try another search.</p>
                </div>
            `;

        loadMore.classList.toggle(
            "hidden",
            list.length <= visible.length
        );

        $("#exploreCount").textContent =
            `${visible.length} of ${list.length} videos`;

        attachWatchEvents(videoBox);
    } else {
        videoBox.classList.add("hidden");
        peopleBox.classList.remove("hidden");

        const query = currentSearch();

        const candidates = users.filter(function(user) {
            return (
                user.id !== currentUser.id &&
                (
                    !query ||
                    user.username.toLowerCase().includes(query)
                )
            );
        });

        const visible = candidates.slice(0, peopleLimit);

        peopleBox.innerHTML = visible.map(function(user) {
            const followed =
                currentUser.following.includes(user.id);

            const count = videos.filter(function(video) {
                return video.ownerId === user.id;
            }).length;

            return `
                <article class="person-card">
                    <div class="person-avatar">
                        ${escapeHTML(initial(user.username))}
                    </div>

                    <h3>${escapeHTML(user.username)}</h3>
                    <p>${count} videos</p>

                    <button
                        class="soft-btn"
                        data-profile-user="${escapeHTML(user.id)}"
                    >
                        View profile
                    </button>

                    <button
                        class="primary-btn"
                        data-follow-user="${escapeHTML(user.id)}"
                    >
                        ${followed ? "Following" : "Follow"}
                    </button>
                </article>
            `;
        }).join("") || `
            <div class="empty-card">
                <div>👥</div>
                <h3>No creators found</h3>
                <p>Try another username.</p>
            </div>
        `;

        loadMore.classList.toggle(
            "hidden",
            candidates.length <= visible.length
        );

        $("#exploreCount").textContent =
            `${visible.length} of ${candidates.length} creators`;
    }
}

/* REELS */

function reelCard(video) {
    const owner = getUser(video.ownerId);

    if (!owner) {
        return "";
    }

    const liked =
        video.likes.includes(currentUser.id);

    const following =
        currentUser.following.includes(owner.id);

    const own =
        video.ownerId === currentUser.id;

    return `
        <article
            class="reel-item"
            data-reel-card="${escapeHTML(video.id)}"
        >
            <video
                class="reel-video"
                src="${escapeHTML(video.file)}"
                playsinline
                loop
                muted
                preload="metadata"
                data-reel-video="${escapeHTML(video.id)}"
            ></video>

            <div class="reel-shade"></div>

            <button
                class="reel-sound"
                type="button"
                data-reel-sound="${escapeHTML(video.id)}"
                aria-label="Toggle sound"
            >
                🔇
            </button>

            <div class="reel-info">
                <div class="reel-user-row">
                    <div class="reel-user-avatar">
                        ${escapeHTML(initial(owner.username))}
                    </div>

                    <button
                        class="reel-username"
                        data-profile-user="${escapeHTML(owner.id)}"
                    >
                        @${escapeHTML(owner.username)}
                    </button>

                    ${
                        own
                        ? ""
                        : `
                            <button
                                class="reel-follow"
                                data-follow-user="${escapeHTML(owner.id)}"
                            >
                                ${following ? "Following" : "Follow"}
                            </button>
                        `
                    }
                </div>

                <p class="reel-caption">
                    ${escapeHTML(video.title)}
                    ${
                        video.description
                        ? " · " + escapeHTML(video.description)
                        : ""
                    }
                </p>

                <small>
                    ${topicIcon(video.topic)}
                    ${escapeHTML(video.topic)}
                </small>
            </div>

            <div class="reel-actions">
                <button
                    class="reel-action ${liked ? "liked" : ""}"
                    data-like-video="${escapeHTML(video.id)}"
                    aria-label="Like"
                >
                    ${liked ? "♥" : "♡"}
                </button>

                <button
                    class="reel-action"
                    data-comment-video="${escapeHTML(video.id)}"
                    aria-label="Comments"
                >
                    💬
                </button>

                <button
                    class="reel-action"
                    data-share-video="${escapeHTML(video.id)}"
                    aria-label="Share"
                >
                    ↗
                </button>

                ${
                    own
                    ? `
                        <button
                            class="reel-action"
                            data-delete-video="${escapeHTML(video.id)}"
                            aria-label="Delete"
                        >
                            ⌫
                        </button>
                    `
                    : ""
                }
            </div>
        </article>
    `;
}

/* REEL AUTOPLAY */

let reelObserver = null;

function setupReelPlayback() {
    const box = $("#reelsFeed");

    if (!box) {
        return;
    }

    if (reelObserver) {
        reelObserver.disconnect();
    }

    reelObserver = new IntersectionObserver(
        function(entries) {
            entries.forEach(function(entry) {
                const video = entry.target;

                if (
                    entry.isIntersecting &&
                    entry.intersectionRatio >= 0.65
                ) {
                    $$(".reel-video", box).forEach(function(other) {
                        if (other !== video) {
                            other.pause();
                        }
                    });

                    const data = videos.find(function(item) {
                        return item.id === video.dataset.reelVideo;
                    });

                    if (data) {
                        rememberVideo(data);
                    }

                    video.play().catch(function() {});

                    if (
                        data &&
                        !viewRecorded.has(data.id)
                    ) {
                        viewRecorded.add(data.id);
                        data.views += 1;

                        supabaseClient
                            .from("videos")
                            .update({
                                views: data.views
                            })
                            .eq("id", data.id)
                            .then(function(result) {
                                if (result.error) {
                                    console.warn(result.error);
                                }
                            });
                    }
                } else {
                    video.pause();
                }
            });
        },
        {
            root: box,
            threshold: [0, .65, 1]
        }
    );

    $$(".reel-video", box).forEach(function(video) {
        reelObserver.observe(video);
    });
}

/* RENDER REELS */

function renderReels() {
    const box = $("#reelsFeed");

    const list = filterBySearch(
        recommendVideos(videos, true)
    );

    const visible = list.slice(0, reelLimit);

    if (!visible.length) {
        box.innerHTML = `
            <div class="reel-empty">
                <div>
                    <div style="font-size:54px">▶️</div>
                    <h2>No Reels yet</h2>
                    <p>
                        Create a vertical video and share it with GoCat.
                    </p>
                    <button class="primary-btn" data-create-reel>
                        Create Reel
                    </button>
                </div>
            </div>
        `;
    } else {
        box.innerHTML = visible
            .map(reelCard)
            .join("");
    }

    $("#reelsLoadMoreWrap").classList.toggle(
        "hidden",
        list.length <= visible.length
    );

    setupReelPlayback();
}

/* PROFILE */

async function renderProfile() {
    if (!currentUser) {
        return;
    }

    const userId =
        currentProfileUserId || currentUser.id;

    const user = getUser(userId);

    if (!user) {
        return;
    }

    const own =
        user.id === currentUser.id;

    const ownVideos = videos.filter(function(video) {
        return video.ownerId === user.id;
    });

    const followers = follows.filter(function(row) {
        return row.following_id === user.id;
    }).length;

    const following = follows.filter(function(row) {
        return row.follower_id === user.id;
    }).length;

    $("#profileAvatar").textContent =
        initial(user.username);

    $("#profileUsername").textContent =
        user.username;

    $("#profileEmail").textContent =
        own
            ? (user.email || "")
            : "GoCat creator";

    $("#profileBio").textContent =
        user.bio || "No bio yet.";

    $("#profilePostCount").textContent =
        ownVideos.length;

    $("#profileFollowers").textContent =
        followers;

    $("#profileFollowing").textContent =
        following;

    $("#profileVideosHeading").textContent =
        own
            ? "Your videos"
            : user.username + "'s videos";

    $("#profileUploadBtn").classList.toggle(
        "hidden",
        !own
    );

    const action = $("#profileActionBtn");

    if (own) {
        action.textContent = "Edit profile";
    } else {
        action.textContent =
            currentUser.following.includes(user.id)
                ? "Following"
                : "Follow";
    }

    $("#profileVideos").innerHTML =
        ownVideos.map(videoCard).join("") ||
        `
            <div class="empty-card">
                <div>🎬</div>
                <h3>No videos yet</h3>
                <p>
                    ${
                        own
                        ? "Upload your first video."
                        : "This creator has not uploaded videos."
                    }
                </p>
            </div>
        `;

    attachWatchEvents($("#profileVideos"));
}

async function openProfile(userId) {
    currentProfileUserId = userId;
    showPage("profile");
    await renderProfile();
}

/* VIDEO LIKES */

async function toggleVideoLike(videoId) {
    const video = videos.find(function(item) {
        return item.id === videoId;
    });

    if (!video) {
        return;
    }

    const liked =
        video.likes.includes(currentUser.id);

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

            const interests = JSON.parse(
                localStorage.getItem(
                    "gocat_topic_likes_" + currentUser.id
                ) || "{}"
            );

            const topic = normalizeTopic(video.topic);

            interests[topic] =
                (interests[topic] || 0) + 1;

            localStorage.setItem(
                "gocat_topic_likes_" + currentUser.id,
                JSON.stringify(interests)
            );

            if (video.ownerId !== currentUser.id) {
                addLocalNotification(
                    "❤️",
                    "You liked a video by " +
                    (getUser(video.ownerId)?.username || "a creator")
                );
            }
        }

        renderAllFeeds();
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Could not update like."
        );
    }
}

/* FOLLOWS */

async function toggleFollow(userId) {
    if (userId === currentUser.id) {
        return;
    }

    const exists =
        currentUser.following.includes(userId);

    try {
        const result = exists
            ? await supabaseClient
                .from("follows")
                .delete()
                .eq("follower_id", currentUser.id)
                .eq("following_id", userId)
            : await supabaseClient
                .from("follows")
                .insert({
                    follower_id: currentUser.id,
                    following_id: userId
                });

        if (result.error) {
            throw result.error;
        }

        await loadFollows();

        renderAllFeeds();

        await renderProfile();

        toast(
            exists
                ? "Unfollowed creator."
                : "You are now following this creator."
        );
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Could not update follow."
        );
    }
}

/* SHARE VIDEO */

function shareVideo(videoId) {
    const video = videos.find(function(item) {
        return item.id === videoId;
    });

    if (!video) {
        return;
    }

    const shareData = {
        title: video.title,
        text: "Watch this on GoCat",
        url: video.file
    };

    if (navigator.share) {
        navigator.share(shareData).catch(function() {});
    } else if (navigator.clipboard?.writeText) {
        navigator.clipboard
            .writeText(video.file)
            .then(function() {
                toast("Video link copied!");
            });
    } else {
        toast("Sharing is not available in this browser.");
    }
}

/* DELETE VIDEO */

async function deleteVideo(videoId) {
    const video = videos.find(function(item) {
        return item.id === videoId;
    });

    if (
        !video ||
        video.ownerId !== currentUser.id
    ) {
        return;
    }

    if (!confirm("Delete this video from GoCat?")) {
        return;
    }

    try {
        const removed = await supabaseClient
            .storage
            .from(VIDEO_BUCKET)
            .remove([video.storagePath]);

        if (removed.error) {
            console.warn(removed.error);
        }

        const result = await supabaseClient
            .from("videos")
            .delete()
            .eq("id", videoId);

        if (result.error) {
            throw result.error;
        }

        videos = videos.filter(function(item) {
            return item.id !== videoId;
        });

        viewRecorded.delete(videoId);

        renderAllFeeds();

        toast("Video deleted.");
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Could not delete the video."
        );
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

    $("#commentsModal").classList.remove("hidden");
}

function renderComments(video) {
    $("#commentsList").innerHTML =
        video.comments.length
            ? video.comments.map(function(comment) {
                return `
                    <div class="comment-item">
                        <strong>
                            ${escapeHTML(
                                comment.username ||
                                getUser(comment.userId)?.username ||
                                "GoCat user"
                            )}
                        </strong>

                        <p>${escapeHTML(comment.text)}</p>

                        <small>
                            ${timeAgo(comment.createdAt)}
                        </small>
                    </div>
                `;
            }).join("")
            : `
                <p class="muted-text">
                    No comments yet. Start the conversation!
                </p>
            `;
}

async function submitComment(event) {
    event.preventDefault();

    const text = $("#commentInput").value.trim();

    const video = videos.find(function(item) {
        return item.id === currentVideoId;
    });

    if (!text || !video) {
        return;
    }

    try {
        const result = await supabaseClient
            .from("comments")
            .insert({
                video_id: video.id,
                user_id: currentUser.id,
                text: text,
                created_at: Date.now()
            })
            .select("id,created_at")
            .single();

        if (result.error) {
            throw result.error;
        }

        video.comments.push({
            id: result.data.id,
            userId: currentUser.id,
            username: currentUser.username,
            text: text,
            createdAt: result.data.created_at
        });

        $("#commentInput").value = "";

        renderComments(video);
        renderAllFeeds();

        toast("Comment posted.");
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Could not post comment."
        );
    }
}

/* VIDEO UPLOAD + REEL EDITOR */

function openUpload(mode = "video") {
    uploadMode = mode;

    selectedVideoFile = null;
    editedReelFile = null;

    $("#videoFile").value = "";
    $("#videoTitle").value = "";
    $("#videoDescription").value = "";
    $("#selectedVideoName").textContent = "";

    $("#uploadTitle").textContent =
        mode === "reel"
            ? "Create a Reel"
            : "Upload a video";

    $("#uploadDescription").textContent =
        mode === "reel"
            ? "Edit your vertical clip before sharing."
            : "Share a video with the GoCat community.";

    $("#publishVideoBtn").textContent =
        mode === "reel"
            ? "Publish Reel"
            : "Publish video";

    $("#reelEditor").classList.toggle(
        "hidden",
        mode !== "reel"
    );

    $("#uploadModal").classList.remove("hidden");
}

function setSelectedVideo(file) {
    selectedVideoFile = file;
    editedReelFile = null;

    $("#selectedVideoName").textContent =
        file ? file.name : "";

    if (file && uploadMode === "reel") {
        if (reelObjectUrl) {
            URL.revokeObjectURL(reelObjectUrl);
        }

        reelObjectUrl = URL.createObjectURL(file);

        const preview = $("#reelPreview");

        preview.src = reelObjectUrl;
        preview.load();

        $("#trimStart").value = "0";
        $("#trimEnd").value = "";

        $("#editorStatus").textContent =
            "Choose a trim range, filter and text overlay, then apply edits.";
    }
}

function filterForCanvas(name) {
    return ({
        none: "none",
        warm: "saturate(1.15) sepia(.22)",
        cool: "saturate(1.08) hue-rotate(12deg)",
        mono: "grayscale(1)",
        vivid: "saturate(1.55) contrast(1.12)"
    })[name] || "none";
}

function updateReelEditorPreview() {
    const preview = $("#reelPreview");
    const overlay = $("#reelOverlayPreview");

    if (!preview) {
        return;
    }

    overlay.textContent =
        $("#reelOverlayText").value;

    const filter = $("#reelFilter").value;

    preview.style.filter =
        filterForCanvas(filter);

    preview.style.objectFit =
        $("#reelFraming").value;
}

/* EXPORT EDITED REEL */

async function exportEditedReel() {
    const preview = $("#reelPreview");
    const status = $("#editorStatus");

    if (!selectedVideoFile || !preview.src) {
        return toast("Choose a Reel video first.");
    }

    if (
        !window.MediaRecorder ||
        !HTMLCanvasElement.prototype.captureStream
    ) {
        return toast(
            "Reel export is not supported in this browser. Try current Chrome or Edge."
        );
    }

    await new Promise(function(resolve) {
        if (preview.readyState >= 1) {
            return resolve();
        }

        preview.onloadedmetadata = resolve;
        preview.onerror = function() {
            resolve();
        };
    });

    const start = Math.max(
        0,
        Number($("#trimStart").value || 0)
    );

    const enteredEnd = Number(
        $("#trimEnd").value || preview.duration
    );

    const end = Math.min(
        preview.duration,
        enteredEnd || preview.duration
    );

    if (
        !Number.isFinite(preview.duration) ||
        end <= start
    ) {
        return toast("Choose a valid trim range.");
    }

    const canvas = document.createElement("canvas");

    canvas.width = 720;
    canvas.height = 1280;

    const ctx = canvas.getContext("2d");

    const canvasStream = canvas.captureStream(30);

    let sourceStream = null;

    try {
        sourceStream = preview.captureStream
            ? preview.captureStream()
            : null;
    } catch (error) {
        sourceStream = null;
    }

    const tracks = [
        ...canvasStream.getVideoTracks()
    ];

    if (sourceStream) {
        tracks.push(
            ...sourceStream.getAudioTracks()
        );
    }

    const mixedStream = new MediaStream(tracks);

    const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
    ];

    const mimeType = mimeTypes.find(function(type) {
        return MediaRecorder.isTypeSupported(type);
    });

    let recorder;

    try {
        recorder = mimeType
            ? new MediaRecorder(mixedStream, {
                mimeType: mimeType
            })
            : new MediaRecorder(mixedStream);
    } catch (error) {
        return toast(
            "This browser cannot export the edited Reel."
        );
    }

    const chunks = [];

    recorder.ondataavailable = function(event) {
        if (event.data && event.data.size) {
            chunks.push(event.data);
        }
    };

    status.textContent =
        "Rendering your edited Reel... keep this window open.";

    $("#exportReelBtn").disabled = true;

    preview.pause();
    preview.currentTime = start;

    await new Promise(function(resolve) {
        const done = function() {
            resolve();
        };

        preview.addEventListener(
            "seeked",
            done,
            { once: true }
        );

        setTimeout(done, 800);
    });

    const text = $("#reelOverlayText").value.trim();
    const filter = filterForCanvas(
        $("#reelFilter").value
    );

    const framing = $("#reelFraming").value;

    function drawFrame() {
        ctx.fillStyle = "#050806";
        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        const vw = preview.videoWidth || 720;
        const vh = preview.videoHeight || 1280;

        const scale = framing === "contain"
            ? Math.min(
                canvas.width / vw,
                canvas.height / vh
            )
            : Math.max(
                canvas.width / vw,
                canvas.height / vh
            );

        const dw = vw * scale;
        const dh = vh * scale;

        ctx.save();
        ctx.filter = filter;

        ctx.drawImage(
            preview,
            (canvas.width - dw) / 2,
            (canvas.height - dh) / 2,
            dw,
            dh
        );

        ctx.restore();

        if (text) {
            ctx.save();

            ctx.textAlign = "center";
            ctx.font = "bold 46px Arial";
            ctx.lineWidth = 5;
            ctx.strokeStyle = "rgba(0,0,0,.75)";
            ctx.fillStyle = "white";

            const maxWidth = canvas.width - 70;
            const words = text.split(/\s+/);
            const lines = [];

            let line = "";

            words.forEach(function(word) {
                const test = line
                    ? line + " " + word
                    : word;

                if (
                    ctx.measureText(test).width > maxWidth &&
                    line
                ) {
                    lines.push(line);
                    line = word;
                } else {
                    line = test;
                }
            });

            if (line) {
                lines.push(line);
            }

            const lineHeight = 56;

            const baseY =
                canvas.height -
                150 -
                (lines.length - 1) * lineHeight;

            lines.slice(0, 3).forEach(function(item, index) {
                ctx.strokeText(
                    item,
                    canvas.width / 2,
                    baseY + index * lineHeight,
                    maxWidth
                );

                ctx.fillText(
                    item,
                    canvas.width / 2,
                    baseY + index * lineHeight,
                    maxWidth
                );
            });

            ctx.restore();
        }
    }

    let animationId = 0;
    let finished = false;

    const stop = function() {
        if (finished) {
            return;
        }

        finished = true;

        cancelAnimationFrame(animationId);

        preview.pause();

        if (recorder.state !== "inactive") {
            recorder.stop();
        }
    };

    const drawLoop = function() {
        drawFrame();

        if (
            preview.currentTime >= end ||
            preview.ended
        ) {
            return stop();
        }

        animationId = requestAnimationFrame(drawLoop);
    };

    recorder.onstop = function() {
        canvasStream
            .getTracks()
            .forEach(function(track) {
                track.stop();
            });

        if (sourceStream) {
            sourceStream
                .getTracks()
                .forEach(function(track) {
                    track.stop();
                });
        }

        if (!chunks.length) {
            status.textContent =
                "Export failed. Try another browser or a smaller clip.";

            $("#exportReelBtn").disabled = false;
            return;
        }

        const blob = new Blob(chunks, {
            type: recorder.mimeType || "video/webm"
        });

        editedReelFile = new File(
            [blob],
            "gocat-reel.webm",
            { type: blob.type }
        );

        $("#selectedVideoName").textContent =
            "Edited Reel ready · " +
            (blob.size / (1024 * 1024)).toFixed(1) +
            " MB";

        status.textContent =
            "Edits applied. Publish Reel to upload this edited clip.";

        $("#exportReelBtn").disabled = false;
    };

    recorder.start(250);

    try {
        await preview.play();
        drawLoop();
    } catch (error) {
        stop();

        status.textContent =
            "Could not play the selected clip for export.";

        $("#exportReelBtn").disabled = false;
    }
}

/* PUBLISH VIDEO OR REEL */

async function publishVideo(event) {
    event.preventDefault();

    if (isUploading) {
        return;
    }

    const file =
        uploadMode === "reel" && editedReelFile
            ? editedReelFile
            : selectedVideoFile;

    const title =
        $("#videoTitle").value.trim();

    const description =
        $("#videoDescription").value.trim();

    if (!file) {
        return toast("Choose a video first.");
    }

    if (!file.type.startsWith("video/")) {
        return toast("Choose a valid video file.");
    }

    if (!title) {
        return toast("Add a title or caption.");
    }

    isUploading = true;

    const button = $("#publishVideoBtn");

    button.disabled = true;
    button.textContent = "Uploading...";

    const progress = $("#uploadProgress");
    const bar = $("#uploadProgressBar");

    progress.classList.remove("hidden");
    bar.style.width = "10%";

    const id = makeId();

    const extension = (
        file.name.split(".").pop() || "mp4"
    )
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const storagePath =
        `${currentUser.id}/${id}.${extension}`;

    try {
        const upload = await supabaseClient
            .storage
            .from(VIDEO_BUCKET)
            .upload(storagePath, file, {
                cacheControl: "3600",
                contentType: file.type || "video/mp4",
                upsert: false
            });

        if (upload.error) {
            throw upload.error;
        }

        bar.style.width = "75%";

        const insert = await supabaseClient
            .from("videos")
            .insert({
                id: id,
                owner_id: currentUser.id,
                title: title,
                description: description,
                topic: normalizeTopic($("#videoTopic").value),
                storage_path: storagePath,
                created_at: Date.now(),
                views: 0,
                is_short: uploadMode === "reel"
            });

        if (insert.error) {
            await supabaseClient
                .storage
                .from(VIDEO_BUCKET)
                .remove([storagePath]);

            throw insert.error;
        }

        bar.style.width = "100%";

        await loadVideos();

        renderAllFeeds();

        closeModal("uploadModal");

        toast(
            uploadMode === "reel"
                ? "Your Reel is live!"
                : "Video uploaded!"
        );

        if (uploadMode === "reel") {
            showPage("reels");
        } else {
            showPage("home");
        }
    } catch (error) {
        console.error(error);

        toast(
            error.message ||
            "Upload failed. Check your videos bucket size limit and access policies."
        );
    } finally {
        isUploading = false;

        button.disabled = false;

        button.textContent =
            uploadMode === "reel"
                ? "Publish Reel"
                : "Publish video";

        setTimeout(function() {
            progress.classList.add("hidden");
            bar.style.width = "0";
        }, 600);
    }
}

/* POSTS */

function renderPosts() {
    const box = $("#postsFeed");

    const visible = posts.slice(0, postLimit);

    box.innerHTML = visible.map(function(post) {
        const owner = getUser(post.userId);

        if (!owner) {
            return "";
        }

        const liked =
            post.likes.includes(currentUser.id);

        return `
            <article
                class="post-card"
                data-post-id="${escapeHTML(post.id)}"
            >
                <div class="post-author">
                    <div class="post-avatar">
                        ${escapeHTML(initial(owner.username))}
                    </div>

                    <div>
                        <div class="post-author-name">
                            ${escapeHTML(owner.username)}
                        </div>

                        <div class="post-time">
                            ${timeAgo(post.createdAt)}
                        </div>
                    </div>
                </div>

                ${
                    post.content
                    ? `
                        <p class="post-content">
                            ${escapeHTML(post.content)}
                        </p>
                    `
                    : ""
                }

                ${
                    post.imageUrl
                    ? `
                        <img
                            class="post-image"
                            src="${escapeHTML(post.imageUrl)}"
                            alt="Post image"
                            loading="lazy"
                        >
                    `
                    : ""
                }

                <div class="post-actions">
                    <button
                        class="post-like-btn ${liked ? "liked" : ""}"
                        data-like-post="${escapeHTML(post.id)}"
                    >
                        ${liked ? "♥" : "♡"}
                        ${post.likes.length} likes
                    </button>

                    ${
                        owner.id === currentUser.id
                        ? `
                            <button
                                class="post-like-btn"
                                data-delete-post="${escapeHTML(post.id)}"
                            >
                                Delete post
                            </button>
                        `
                        : ""
                    }
                </div>
            </article>
        `;
    }).join("") || `
        <div class="empty-card">
            <div>📝</div>
            <h3>No posts yet</h3>
            <p>Share the first update with your community.</p>
        </div>
    `;

    $("#postsLoadMoreWrap").classList.toggle(
        "hidden",
        posts.length <= visible.length
    );
}

/* CREATE POST */

async function createPost(event) {
    event.preventDefault();

    const content =
        $("#postContent").value.trim();

    const image = postImageFile;

    if (!content && !image) {
        return toast(
            "Write something or choose a picture."
        );
    }

    if (image && image.size > 5 * 1024 * 1024) {
        return toast(
            "Post images must be 5 MB or smaller."
        );
    }

    let mediaPath = null;

    try {
        if (image) {
            const extension = (
                image.name.split(".").pop() || "jpg"
            ).toLowerCase();

            mediaPath =
                `${currentUser.id}/${makeId()}.${extension}`;

            const upload = await supabaseClient
                .storage
                .from(POST_BUCKET)
                .upload(mediaPath, image, {
                    contentType: image.type,
                    upsert: false
                });

            if (upload.error) {
                throw upload.error;
            }
        }

        const result = await supabaseClient
            .from("posts")
            .insert({
                user_id: currentUser.id,
                content: content,
                media_path: mediaPath
            })
            .select("*")
            .single();

        if (result.error) {
            if (mediaPath) {
                await supabaseClient
                    .storage
                    .from(POST_BUCKET)
                    .remove([mediaPath]);
            }

            throw result.error;
        }

        $("#postContent").value = "";
        $("#postImage").value = "";
        $("#postImageName").textContent = "";

        postImageFile = null;

        await loadPosts();

        renderPosts();

        toast("Post published!");
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Could not publish the post."
        );
    }
}

/* POST LIKES */

async function togglePostLike(postId) {
    const post = posts.find(function(item) {
        return item.id === postId;
    });

    if (!post) {
        return;
    }

    const liked =
        post.likes.includes(currentUser.id);

    try {
        const result = liked
            ? await supabaseClient
                .from("post_likes")
                .delete()
                .eq("post_id", postId)
                .eq("user_id", currentUser.id)
            : await supabaseClient
                .from("post_likes")
                .insert({
                    post_id: postId,
                    user_id: currentUser.id
                });

        if (result.error) {
            throw result.error;
        }

        post.likes = liked
            ? post.likes.filter(function(id) {
                return id !== currentUser.id;
            })
            : [...post.likes, currentUser.id];

        renderPosts();
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Could not update post like."
        );
    }
}

/* DELETE POST */

async function deletePost(postId) {
    const post = posts.find(function(item) {
        return item.id === postId;
    });

    if (
        !post ||
        post.userId !== currentUser.id
    ) {
        return;
    }

    if (!confirm("Delete this post?")) {
        return;
    }

    try {
        const result = await supabaseClient
            .from("posts")
            .delete()
            .eq("id", postId);

        if (result.error) {
            throw result.error;
        }

        if (post.mediaPath) {
            await supabaseClient
                .storage
                .from(POST_BUCKET)
                .remove([post.mediaPath]);
        }

        posts = posts.filter(function(item) {
            return item.id !== postId;
        });

        renderPosts();

        toast("Post deleted.");
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Could not delete post."
        );
    }
}


/* PRIVATE CHATS — MUTUAL FOLLOWERS ONLY */

function getMutualFriends() {
    return users.filter(function(user) {
        return (
            user.id !== currentUser.id &&
            follows.some(function(row) {
                return (
                    row.follower_id === currentUser.id &&
                    row.following_id === user.id
                );
            }) &&
            follows.some(function(row) {
                return (
                    row.follower_id === user.id &&
                    row.following_id === currentUser.id
                );
            })
        );
    });
}

function renderChats() {
    const friends = getMutualFriends();

    $("#chatFriends").innerHTML = friends
        .map(function(user) {
            return `
                <button
                    class="chat-friend ${
                        currentChatUserId === user.id
                            ? "active"
                            : ""
                    }"
                    data-chat-user="${escapeHTML(user.id)}"
                >
                    <span class="chat-friend-avatar">
                        ${escapeHTML(initial(user.username))}
                    </span>
                    <span>${escapeHTML(user.username)}</span>
                </button>
            `;
        })
        .join("") ||
        `
            <p class="muted-text">
                You have no mutual-follow friends yet.
            </p>
        `;

    if (
        !currentChatUserId ||
        !friends.some(function(user) {
            return user.id === currentChatUserId;
        })
    ) {
        currentChatUserId = null;

        $("#chatTitle").textContent = "Choose a friend";

        $("#chatMessages").innerHTML = `
            <p class="chat-empty">
                Follow each other to start a private chat.
            </p>
        `;

        $("#messageInput").disabled = true;
        $("#sendMessageBtn").disabled = true;
    }
}

/* OPEN CONVERSATION */

async function openChat(userId) {
    const friend = getUser(userId);

    if (
        !friend ||
        !getMutualFriends().some(function(user) {
            return user.id === userId;
        })
    ) {
        toast(
            "Chats are available between mutual followers."
        );
        return;
    }

    currentChatUserId = userId;

    $("#chatTitle").textContent =
        "Chat with " + friend.username;

    $("#messageInput").disabled = false;
    $("#sendMessageBtn").disabled = false;

    renderChats();

    await loadConversation();
}

/* LOAD CONVERSATION */

async function loadConversation() {
    if (!currentChatUserId) {
        return;
    }

    const other = currentChatUserId;

    const result = await supabaseClient
        .from("messages")
        .select(
            "id,sender_id,recipient_id,content,created_at"
        )
        .or(
            `and(sender_id.eq.${currentUser.id},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${currentUser.id})`
        )
        .order("created_at", {
            ascending: true
        })
        .limit(150);

    if (result.error) {
        console.error(result.error);
        toast("Could not load this conversation.");
        return;
    }

    $("#chatMessages").innerHTML =
        (result.data || []).map(function(message) {
            const mine =
                message.sender_id === currentUser.id;

            return `
                <div class="chat-bubble ${mine ? "mine" : ""}">
                    ${escapeHTML(message.content)}
                    <time>${timeAgo(message.created_at)}</time>
                </div>
            `;
        }).join("") ||
        `
            <p class="chat-empty">
                Say hello to start the conversation.
            </p>
        `;

    $("#chatMessages").scrollTop =
        $("#chatMessages").scrollHeight;
}

/* SEND MESSAGE */

async function sendMessage(event) {
    event.preventDefault();

    const content =
        $("#messageInput").value.trim();

    if (!content || !currentChatUserId) {
        return;
    }

    try {
        const result = await supabaseClient
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                recipient_id: currentChatUserId,
                content: content
            });

        if (result.error) {
            throw result.error;
        }

        $("#messageInput").value = "";

        await loadConversation();
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Message could not be sent."
        );
    }
}

/* REALTIME CHAT UPDATES */

function subscribeToMessages() {
    if (chatChannel) {
        supabaseClient.removeChannel(chatChannel);
    }

    chatChannel = supabaseClient
        .channel("gocat-messages-" + currentUser.id)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "messages"
            },
            function(payload) {
                const row = payload.new;

                const relevant =
                    row.sender_id === currentUser.id ||
                    row.recipient_id === currentUser.id;

                if (
                    relevant &&
                    currentChatUserId &&
                    (
                        row.sender_id === currentChatUserId ||
                        row.recipient_id === currentChatUserId
                    )
                ) {
                    loadConversation();
                }
            }
        )
        .subscribe();
}

/* PROFILE EDITING */

async function saveProfile(event) {
    event.preventDefault();

    const username =
        $("#editUsername").value.trim();

    const bio =
        $("#editBio").value.trim();

    if (username.length < 3) {
        return toast(
            "Username needs at least 3 characters."
        );
    }

    const duplicate = users.some(function(user) {
        return (
            user.id !== currentUser.id &&
            user.username.toLowerCase() === username.toLowerCase()
        );
    });

    if (duplicate) {
        return toast("That username is already taken.");
    }

    try {
        const result = await supabaseClient
            .from("users")
            .update({
                username: username,
                bio: bio
            })
            .eq("id", currentUser.id)
            .select(
                "id,username,email,bio,created_at"
            )
            .single();

        if (result.error) {
            throw result.error;
        }

        const index = users.findIndex(function(user) {
            return user.id === currentUser.id;
        });

        users[index] = result.data;

        currentUser.username =
            result.data.username;

        currentUser.bio =
            result.data.bio || "";

        $("#editProfileModal").classList.add("hidden");

        updateUserUI();
        renderAll();

        toast("Profile updated.");
    } catch (error) {
        console.error(error);

        toast(
            error.message || "Could not save profile."
        );
    }
}

/* UPDATE USER DISPLAY */

function updateUserUI() {
    if (!currentUser) {
        return;
    }

    $("#welcomeName").textContent =
        currentUser.username;

    $("#topProfileBtn").textContent =
        initial(currentUser.username);
}

/* NOTIFICATIONS */

function renderNotifications() {
    const list = notifications;

    $("#notificationList").innerHTML =
        list.map(function(item) {
            return `
                <article class="notification-item">
                    <span class="notification-icon">
                        ${escapeHTML(item.icon || "🔔")}
                    </span>

                    <div>
                        <p>
                            ${escapeHTML(
                                item.message ||
                                item.text ||
                                "GoCat activity"
                            )}
                        </p>

                        <small>
                            ${timeAgo(
                                item.created_at ||
                                item.createdAt
                            )}
                        </small>
                    </div>
                </article>
            `;
        }).join("") ||
        `
            <div class="empty-card">
                <div>🔔</div>
                <h3>No notifications yet</h3>
                <p>Your activity will appear here.</p>
            </div>
        `;
}

/* PAGE RENDER HELPERS */

function renderAllFeeds() {
    renderHome();
    renderReels();
    renderFollowing();
    renderExplore();
    renderPosts();
    renderSuggestedCreators();
    renderProfile();
}

function renderAll() {
    updateUserUI();

    renderHome();
    renderReels();
    renderExplore();
    renderFollowing();
    renderPosts();
    renderChats();
    renderNotifications();
    renderProfile();
}

/* NAVIGATION */

function showPage(page) {
    currentPage = page;

    $$(".page-section").forEach(function(section) {
        section.classList.toggle(
            "hidden",
            section.id !== "page-" + page
        );
    });

    $$("[data-page]").forEach(function(button) {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    $("#sidebar").classList.remove("open");

    if (page === "home") {
        renderHome();
    }

    if (page === "reels") {
        renderReels();
    }

    if (page === "explore") {
        renderExplore();
    }

    if (page === "following") {
        renderFollowing();
    }

    if (page === "posts") {
        renderPosts();
    }

    if (page === "chats") {
        renderChats();
    }

    if (page === "notifications") {
        renderNotifications();
    }

    if (page === "profile") {
        renderProfile();
    }
}

/* CLOSE MODAL */

function closeModal(id) {
    const modal = document.getElementById(id);

    if (modal) {
        modal.classList.add("hidden");
    }
}

/* THEME */

function applyTheme(dark) {
    document.body.classList.toggle("dark", dark);

    localStorage.setItem(
        "gocat_theme",
        dark ? "dark" : "light"
    );

    $("#themeIcon").textContent =
        dark ? "☀️" : "🌙";

    $("#themeLabel").textContent =
        dark ? "Light mode" : "Dark mode";
}

/* REFRESH FEEDS */

function refreshFeeds() {
    homeLimit = 5;
    exploreLimit = 6;
    peopleLimit = 6;
    postLimit = 6;
    reelLimit = 5;

    renderAllFeeds();
}

/* EVENT HANDLERS */

function bindEvents() {

    /* LOGIN AND REGISTER */

    $("#loginForm").addEventListener(
        "submit",
        handleLogin
    );

    $("#registerForm").addEventListener(
        "submit",
        handleRegister
    );

    $("#showRegister").addEventListener(
        "click",
        showRegister
    );

    $("#showLogin").addEventListener(
        "click",
        showLogin
    );

    $("#logoutBtn").addEventListener(
        "click",
        logout
    );

    /* THEME */

    $("#themeBtn").addEventListener(
        "click",
        function() {
            applyTheme(
                !document.body.classList.contains("dark")
            );
        }
    );

    /* MOBILE MENU */

    $("#mobileMenuBtn").addEventListener(
        "click",
        function() {
            $("#sidebar").classList.toggle("open");
        }
    );

    /* PROFILE BUTTON */

    $("#topProfileBtn").addEventListener(
        "click",
        function() {
            currentProfileUserId = currentUser.id;
            showPage("profile");
        }
    );

    /* UPLOAD BUTTONS */

    $("#uploadTopBtn").addEventListener(
        "click",
        function() {
            openUpload("video");
        }
    );

    $("#createReelBtn").addEventListener(
        "click",
        function() {
            openUpload("reel");
        }
    );

    /* REFRESH */

    $("#refreshFeedBtn").addEventListener(
        "click",
        async function() {
            try {
                await loadAllData();
                refreshFeeds();
                toast("Feed refreshed.");
            } catch (error) {
                toast(error.message);
            }
        }
    );

    /* LOAD MORE BUTTONS */

    $("#homeLoadMore").addEventListener(
        "click",
        function() {
            homeLimit += 5;
            renderHome();
        }
    );

    $("#exploreLoadMore").addEventListener(
        "click",
        function() {
            if (exploreMode === "videos") {
                exploreLimit += 6;
            } else {
                peopleLimit += 6;
            }

            renderExplore();
        }
    );

    $("#reelsLoadMore").addEventListener(
        "click",
        function() {
            reelLimit += 5;
            renderReels();
        }
    );

    $("#postsLoadMore").addEventListener(
        "click",
        function() {
            postLimit += 6;
            renderPosts();
        }
    );

    /* SEARCH */

    $("#searchInput").addEventListener(
        "input",
        function() {
            homeLimit = 5;
            exploreLimit = 6;
            peopleLimit = 6;
            reelLimit = 5;

            renderHome();
            renderExplore();
            renderReels();
            renderFollowing();
        }
    );

    $("#clearSearch").addEventListener(
        "click",
        function() {
            $("#searchInput").value = "";

            renderHome();
            renderExplore();
            renderReels();
            renderFollowing();
        }
    );

    /* TOPIC FILTERS */

    $$(".topic-chip").forEach(function(button) {
        button.addEventListener("click", function() {
            activeHomeTopic = button.dataset.topic;

            $$(".topic-chip").forEach(function(chip) {
                chip.classList.toggle(
                    "active",
                    chip === button
                );
            });

            homeLimit = 5;

            renderHome();
        });
    });

    /* EXPLORE TABS */

    $$("[data-explore-tab]").forEach(function(button) {
        button.addEventListener("click", function() {
            exploreMode = button.dataset.exploreTab;

            $$("[data-explore-tab]").forEach(function(tab) {
                tab.classList.toggle(
                    "active",
                    tab === button
                );
            });

            renderExplore();
        });
    });

    /* VIDEO FILE */

    $("#videoFile").addEventListener(
        "change",
        function(event) {
            const file = event.target.files[0];

            if (!file) {
                return;
            }

            setSelectedVideo(file);
        }
    );

    /* REEL EDITOR */

    $("#reelOverlayText").addEventListener(
        "input",
        updateReelEditorPreview
    );

    $("#reelFilter").addEventListener(
        "change",
        updateReelEditorPreview
    );

    $("#reelFraming").addEventListener(
        "change",
        updateReelEditorPreview
    );

    $("#exportReelBtn").addEventListener(
        "click",
        exportEditedReel
    );

    /* PUBLISH VIDEO */

    $("#uploadForm").addEventListener(
        "submit",
        publishVideo
    );

    /* COMMENTS */

    $("#commentForm").addEventListener(
        "submit",
        submitComment
    );

    /* PROFILE */

    $("#editProfileForm").addEventListener(
        "submit",
        saveProfile
    );

    /* POSTS */

    $("#createPostForm").addEventListener(
        "submit",
        createPost
    );

    $("#postImage").addEventListener(
        "change",
        function(event) {
            postImageFile =
                event.target.files[0] || null;

            $("#postImageName").textContent =
                postImageFile ? postImageFile.name : "";
        }
    );

    /* CHATS */

    $("#chatForm").addEventListener(
        "submit",
        sendMessage
    );

    /* CLEAR NOTIFICATIONS */

    $("#clearNotificationsBtn").addEventListener(
        "click",
        function() {
            notifications = [];

            localStorage.setItem(
                "gocat_notifications_" + currentUser.id,
                "[]"
            );

            renderNotifications();

            toast("Notifications cleared.");
        }
    );

    /* PROFILE ACTION */

    $("#profileActionBtn").addEventListener(
        "click",
        function() {
            const user = getUser(currentProfileUserId);

            if (!user) {
                return;
            }

            if (user.id !== currentUser.id) {
                return toggleFollow(user.id);
            }

            $("#editUsername").value =
                currentUser.username;

            $("#editBio").value =
                currentUser.bio || "";

            $("#editProfileModal").classList.remove("hidden");
        }
    );

    /* DYNAMIC BUTTONS */

    document.addEventListener(
        "click",
        function(event) {
            const target = event.target.closest("button");

            if (!target) {
                return;
            }

            if (target.dataset.page) {
                showPage(target.dataset.page);
            }

            if (target.dataset.goPage) {
                showPage(target.dataset.goPage);
            }

            if (target.dataset.openUpload) {
                openUpload(target.dataset.openUpload);
            }

            if (target.dataset.createReel !== undefined) {
                openUpload("reel");
            }

            if (target.dataset.close) {
                closeModal(target.dataset.close);
            }

            if (target.dataset.profileUser) {
                openProfile(target.dataset.profileUser);
            }

            if (target.dataset.followUser) {
                toggleFollow(target.dataset.followUser);
            }

            if (target.dataset.likeVideo) {
                toggleVideoLike(target.dataset.likeVideo);
            }

            if (target.dataset.commentVideo) {
                openComments(target.dataset.commentVideo);
            }

            if (target.dataset.shareVideo) {
                shareVideo(target.dataset.shareVideo);
            }

            if (target.dataset.deleteVideo) {
                deleteVideo(target.dataset.deleteVideo);
            }

            if (target.dataset.likePost) {
                togglePostLike(target.dataset.likePost);
            }

            if (target.dataset.deletePost) {
                deletePost(target.dataset.deletePost);
            }

            if (target.dataset.chatUser) {
                openChat(target.dataset.chatUser);
            }

            if (target.dataset.reelSound) {
                const video = $(
                    `[data-reel-video="${CSS.escape(target.dataset.reelSound)}"]`
                );

                if (video) {
                    video.muted = !video.muted;

                    target.textContent =
                        video.muted ? "🔇" : "🔊";
                }
            }
        }
    );

    /* CLOSE MODALS */

    $$("[data-close]").forEach(function(button) {
        button.addEventListener(
            "click",
            function() {
                closeModal(button.dataset.close);
            }
        );
    });

    /* PASSWORD VISIBILITY */

    $$(".show-password").forEach(function(button) {
        button.addEventListener(
            "click",
            function() {
                const input = document.getElementById(
                    button.dataset.target
                );

                if (!input) {
                    return;
                }

                input.type =
                    input.type === "password"
                        ? "text"
                        : "password";

                button.textContent =
                    input.type === "password"
                        ? "Show"
                        : "Hide";
            }
        );
    });

    /* TAP REEL TO PAUSE OR PLAY */

    $("#reelsFeed").addEventListener(
        "click",
        function(event) {
            const video = event.target
                .closest(".reel-item")
                ?.querySelector(".reel-video");

            if (
                video &&
                !event.target.closest("button")
            ) {
                if (video.paused) {
                    video.play().catch(function() {});
                } else {
                    video.pause();
                }
            }
        }
    );
}

/* INITIALIZE GOCAT */

async function initGoCat() {
    const savedTheme =
        localStorage.getItem("gocat_theme") === "dark";

    applyTheme(savedTheme);

    bindEvents();

    if (!window.supabase?.createClient) {
        showLoader(false);

        setAuthMessage(
            "Supabase could not load. Check your internet connection and refresh."
        );

        return;
    }

    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    try {
        const result =
            await supabaseClient.auth.getSession();

        if (result.error) {
            throw result.error;
        }

        if (result.data.session) {
            await startSession();
        } else {
            showLogin();
            showLoader(false);
        }
    } catch (error) {
        console.error(error);

        showLogin();
        showLoader(false);

        setAuthMessage(
            error.message || "Could not connect to GoCat."
        );
    }

    supabaseClient.auth.onAuthStateChange(
        function(event) {
            if (event === "SIGNED_OUT") {
                currentUser = null;

                $("#app").classList.add("hidden");

                showLogin();
            }
        }
    );
}

/* START GOCAT */

initGoCat();
