/* ============================================================
   GOCAT — COMPLETE JAVASCRIPT
   Supabase auth, feed, videos, Reels, posts, profiles, follows,
   comments, studio, history, chat and uploads.
   ============================================================ */

/* ---------- 01 SUPABASE CONFIG (unchanged) ---------- */

const SUPABASE_URL = "https://rfwgvsijxweyzwvuqslt.supabase.co";
const SUPABASE_KEY = "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0O";

const VIDEO_BUCKET = "videos";
const POST_BUCKET = "post-media";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_VIDEO_DURATION = 1200;
const PAGE_SIZE = 5;

const db = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;


/* ---------- 02 STATE ---------- */

let currentUser = null, currentProfile = null, isGoCatAdmin = false;
let currentProfileUserId = null, currentCommentVideoId = null, currentCommentPostId = null, currentCommentParentId = null, currentChatUserId = null;
let chatRealtimeChannel = null, commentRealtimeChannel = null, feedRealtimeChannel = null;
let liveRefreshTimer = null, chatTypingTimer = null, feedRealtimeReady = false;
let activePlaybackVideoId = null, liveRenderPending = false;
let users = [], videos = [], posts = [], follows = [], notifications = [];
let currentPage = "home", activeHomeTopic = "All", exploreMode = "videos", profileMode = "home";
let homeVisibleCycles = 1, exploreVisible = 6, postsVisible = 5, reelsVisible = 5;
let uploadMode = "video", selectedVideoFile = null, exportedReelFile = null;
let currentObjectURL = null, reelObserver = null, tusLibraryPromise = null;
let editorAudioContext = null, editorVideoSource = null, editorVideoGain = null, editorMusicObjectURL = null;
let settings = { theme: "dark", autoplay: true, muted: true, history: true };


/* ---------- 03 ICONS ---------- */

const ICONS = {
    home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    shorts: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10.5 9l4 3-4 3z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.7 3.5 2.7 3.5 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    post: '<path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    message: '<path d="M4 5h16v11H9l-5 4z"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    heart: '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
    play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8L20 19M8.5 16L20 5"/>',
    effects: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    crop: '<path d="M6 2v14h14M2 6h14v14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    follow: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M19 8v6M16 11h6"/>',
    video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'
};

function icon(name) {
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        (ICONS[name] || "") + "</svg>";
}

function hydrateIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach(el => {
        el.innerHTML = icon(el.dataset.icon);
    });
}


/* ---------- 04 HELPERS ---------- */

const $ = id => document.getElementById(id);

function listen(id, event, callback) {
    const element = $(id);
    if (element) element.addEventListener(event, callback);
}

function esc(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

const compact = n => {
    n = Number(n || 0);
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(".0", "") + "K";
    return (n / 1e6).toFixed(1).replace(".0", "") + "M";
};

function nameHue(name) {
    let h = 0;
    for (const ch of String(name || "?")) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
}
const avatarBg = name =>
    `background:linear-gradient(135deg,hsl(${nameHue(name)} 60% 50%),hsl(${(nameHue(name) + 40) % 360} 60% 38%));color:#fff`;

function paintAvatar(id, name, avatarPath = "") {
    const el = $(id);
    if (!el) return;
    el.style.cssText = avatarBg(name);
    el.innerHTML = avatarPath
        ? `<img src="${esc(storageURL("profile-avatars", avatarPath))}" alt="" loading="lazy">`
        : esc(initial(name));
}

const initial = name => String(name || "?").trim().charAt(0).toUpperCase();
const getUser = id => users.find(u => String(u.id) === String(id));

function getUsername(id) {
    const user = getUser(id);
    if (user) return user.username || "Creator";
    if (currentProfile && String(currentProfile.id) === String(id)) return currentProfile.username || "Creator";
    return "GoCat creator";
}

const isOwnContent = id => !!currentUser && String(id) === String(currentUser.id);
const canManageContent = id => isOwnContent(id) || isGoCatAdmin;

function isFollowing(id) {
    return !!currentUser && follows.some(f =>
        String(f.follower_id) === String(currentUser.id) && String(f.following_id) === String(id));
}

const isReel = v => v?.is_short === true || v?.is_short === "true";
const hasLiked = item => !!currentUser && (item.likes || []).includes(String(currentUser.id));

function formatDate(value) {
    if (!value) return "Just now";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return "Just now";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24);
    if (d < 30) return d + "d ago";
    return date.toLocaleDateString();
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
}

function safeJSON(key, fallback = []) {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : fallback;
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
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function showAuthMessage(message, success = false) {
    const el = $("authMessage");
    if (!el) return;
    el.textContent = message;
    el.style.color = success ? "var(--accent)" : "var(--red)";
}

const showModal = id => $(id)?.classList.remove("hidden");
const hideModal = id => $(id)?.classList.add("hidden");

function storageURL(bucket, path) {
    if (!path || !db) return "";
    if (/^https?:\/\//i.test(String(path))) return path;
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
const getVideoURL = path => storageURL(VIDEO_BUCKET, path);
const getPostImageURL = path => storageURL(POST_BUCKET, path);

/* Insert a row whose text column might be "content" or "text". */
async function insertWithTextFallback(table, base, text, firstKey, secondKey) {
    let result = await db.from(table).insert({ ...base, [firstKey]: text });
    if (result.error && /column|schema cache/i.test(result.error.message || "")) {
        result = await db.from(table).insert({ ...base, [secondKey]: text });
    }
    return result;
}


/* ---------- 05 SETTINGS AND THEME ---------- */

const systemTheme = () => window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";

function loadSettings() {
    const saved = safeJSON("gocat_settings_v2", {});
    settings = {
        theme: saved.theme || systemTheme(),
        autoplay: saved.autoplay !== false,
        muted: saved.muted !== false,
        history: saved.history !== false
    };
}

function saveSettings() {
    try { localStorage.setItem("gocat_settings_v2", JSON.stringify(settings)); } catch {}
}

function applyTheme() {
    document.body.classList.toggle("light", settings.theme === "light");
    document.body.classList.toggle("dark", settings.theme !== "light");

    if ($("themeIcon")) $("themeIcon").innerHTML = icon(settings.theme === "dark" ? "sun" : "moon");
    if ($("themeLabel")) $("themeLabel").textContent = settings.theme === "dark" ? "Light appearance" : "Dark appearance";
    if ($("settingTheme")) $("settingTheme").value = settings.theme;
}

function applySettings() {
    loadSettings();
    applyTheme();
    if ($("settingAutoplay")) $("settingAutoplay").checked = settings.autoplay;
    if ($("settingMuted")) $("settingMuted").checked = settings.muted;
    if ($("settingHistory")) $("settingHistory").checked = settings.history;
}

hydrateIcons();
applySettings();


/* ---------- 06 AUTHENTICATION ---------- */

function openLoginScreen(message = "") {
    $("app")?.classList.remove("hidden");
    $("authScreen")?.classList.remove("hidden");
    $("loginForm")?.classList.remove("hidden");
    $("registerForm")?.classList.add("hidden");
    if ($("authTitle")) $("authTitle").textContent = "Welcome back";
    if ($("authSubtitle")) $("authSubtitle").textContent = "Sign in to like, follow, comment, post and chat.";
    showAuthMessage(message);
    setTimeout(() => $("loginEmail")?.focus(), 60);
}

function openRegisterScreen() {
    $("app")?.classList.remove("hidden");
    $("authScreen")?.classList.remove("hidden");
    $("loginForm")?.classList.add("hidden");
    $("registerForm")?.classList.remove("hidden");
    if ($("authTitle")) $("authTitle").textContent = "Create your account";
    if ($("authSubtitle")) $("authSubtitle").textContent = "Join the GoCat creator community.";
    showAuthMessage("");
    setTimeout(() => $("registerUsername")?.focus(), 60);
}

function closeAuthModal() {
    $("authScreen")?.classList.add("hidden");
    showAuthMessage("");
}

function requireAuth(action = "continue") {
    if (currentUser) return true;
    openLoginScreen("Sign in to " + action + ".");
    return false;
}

function openApp() {
    $("authScreen")?.classList.add("hidden");
    $("app")?.classList.remove("hidden");
    updateUserInterface();
}

listen("showRegister", "click", openRegisterScreen);
listen("showLogin", "click", openLoginScreen);
listen("authCloseBtn", "click", closeAuthModal);
listen("continueGuestBtn", "click", closeAuthModal);
document.querySelectorAll("[data-close-auth]").forEach(el => el.addEventListener("click", closeAuthModal));
listen("sidebarSignInBtn", "click", () => openLoginScreen());
document.addEventListener("click", event => {
    if (event.target.closest("[data-login-trigger]")) openLoginScreen();
});

listen("loginForm", "submit", async function (event) {
    event.preventDefault();

    const email = $("loginEmail")?.value.trim() || "";
    const password = $("loginPassword")?.value || "";
    const button = this.querySelector('button[type="submit"]');

    if (button) { button.disabled = true; button.textContent = "Signing in..."; }

    try {
        if (!db) throw new Error("Supabase did not load. Refresh the page.");

        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;

        currentUser = data.user;
        await startGoCat();

    } catch (error) {
        console.error("Login error:", error);
        showAuthMessage(error.message || "Login failed.");

    } finally {
        if (button) { button.disabled = false; button.textContent = "Sign in"; }
    }
});

listen("googleLoginBtn", "click", async function () {
    if (!db) return showAuthMessage("Supabase did not load. Refresh GoCat and try again.");
    const button = this;
    button.disabled = true;
    button.textContent = "Connecting to Google...";
    try {
        const { error } = await db.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: location.origin + location.pathname }
        });
        if (error) throw error;
    } catch (error) {
        console.error("Google sign-in:", error);
        showAuthMessage("Google sign-in is not configured yet: " + (error.message || "Check Supabase Auth provider settings."));
        button.disabled = false;
        button.textContent = "Continue with Google";
    }
});

listen("registerForm", "submit", async function (event) {
    event.preventDefault();

    const username = $("registerUsername")?.value.trim() || "";
    const email = $("registerEmail")?.value.trim() || "";
    const password = $("registerPassword")?.value || "";
    const confirmPassword = $("registerConfirm")?.value || "";
    const button = this.querySelector('button[type="submit"]');

    if (!db) return showAuthMessage("Supabase is not connected.");
    if (username.length < 3) return showAuthMessage("Username must have at least 3 characters.");
    if (password !== confirmPassword) return showAuthMessage("Passwords do not match.");

    if (button) { button.disabled = true; button.textContent = "Creating account..."; }

    try {
        const { data, error } = await db.auth.signUp({
            email, password, options: { data: { username } }
        });
        if (error) throw error;

        if (data.session && data.user) {
            currentUser = data.user;
            await startGoCat();
        } else {
            openLoginScreen();
            showAuthMessage("Account created. Confirm your email if required, then sign in.", true);
        }

    } catch (error) {
        console.error("Registration error:", error);
        showAuthMessage(error.message || "Registration failed.");

    } finally {
        if (button) { button.disabled = false; button.textContent = "Create account"; }
    }
});



/* ---------- 07 PROFILE, ADMIN, DATA LOADING ---------- */

async function ensureProfile() {
    const publicColumns = "id,username,bio,avatar_path,created_at";
    const existing = await db.from("users").select(publicColumns).eq("id", currentUser.id).maybeSingle();
    if (existing.error) throw existing.error;

    if (existing.data) {
        currentProfile = existing.data;
        return;
    }

    const base = (
        currentUser.user_metadata?.username ||
        (currentUser.email || "gocat_user").split("@")[0]
    ).trim().replace(/\s+/g, "_").slice(0, 20) || "gocat_user";

    for (let attempt = 0; attempt < 4; attempt++) {
        const username = attempt === 0
            ? base
            : base.slice(0, 14) + "_" + Math.random().toString(36).slice(2, 6);

        const insert = await db
            .from("users")
            .insert({ id: currentUser.id, username, email: currentUser.email, created_at: Date.now() })
            .select("id,username,bio,avatar_path,created_at")
            .maybeSingle();

        if (!insert.error) {
            currentProfile = insert.data || { id: currentUser.id, username, created_at: Date.now() };
            return;
        }

        if (!/duplicate|unique/i.test(insert.error.message || "")) throw insert.error;

        // Someone (or a database trigger) may have just created this profile.
        const again = await db.from("users").select(publicColumns).eq("id", currentUser.id).maybeSingle();
        if (again.data) { currentProfile = again.data; return; }
    }

    throw new Error("Could not create your profile.");
}

async function loadAdminStatus() {
    isGoCatAdmin = false;

    try {
        const result = await db.rpc("is_gocat_admin");
        if (result.error) {
            console.warn("Admin check skipped:", result.error.message);
            return;
        }
        isGoCatAdmin = result.data === true;
    } catch (error) {
        console.warn("Admin check skipped:", error.message);
    }
}

async function loadUsers() {
    // Only fetch the moderation flag for the verified owner/admin session.
    // Regular visitors do not need this private account-management field.
    const columns = isGoCatAdmin
        ? "id,username,bio,avatar_path,created_at,is_banned"
        : "id,username,bio,avatar_path,created_at";
    const result = await db
        .from("users")
        .select(columns)
        .order("created_at", { ascending: false });

    if (result.error) throw result.error;

    users = result.data || [];

    if (currentProfile && !users.some(u => String(u.id) === String(currentUser.id))) {
        users.unshift(currentProfile);
    }

    currentProfile = users.find(u => String(u.id) === String(currentUser.id)) || currentProfile;
}

async function loadVideos() {
    const [videoResult, likeResult, commentResult] = await Promise.all([
        db.from("videos").select("*").order("created_at", { ascending: false }),
        db.from("likes").select("video_id,user_id"),
        db.from("comments").select("*").order("created_at", { ascending: true })
    ]);

    if (videoResult.error) throw videoResult.error;
    if (likeResult.error) throw likeResult.error;
    if (commentResult.error) throw commentResult.error;

    const allLikes = likeResult.data || [];
    const allComments = commentResult.data || [];

    videos = (videoResult.data || []).map(video => ({
        ...video,
        likes: allLikes.filter(l => String(l.video_id) === String(video.id)).map(l => String(l.user_id)),
        comments: allComments.filter(c => String(c.video_id) === String(video.id))
    }));
}

async function loadFollows() {
    const result = await db.from("follows").select("follower_id,following_id");
    if (result.error) throw result.error;
    follows = result.data || [];
}

async function loadPosts() {
    const result = await db.from("posts").select("*").order("created_at", { ascending: false });

    if (result.error) {
        console.warn("Posts table:", result.error.message);
        posts = [];
        return;
    }

    const [likesResult, commentsResult] = await Promise.all([
        db.from("post_likes").select("post_id,user_id"),
        db.from("post_comments").select("*").order("created_at", { ascending: true })
    ]);

    if (likesResult.error) console.warn("Post likes:", likesResult.error.message);
    if (commentsResult.error) console.warn("Post comments (run gocat-fixes.sql):", commentsResult.error.message);

    const allLikes = likesResult.data || [];
    const allComments = commentsResult.data || [];

    posts = (result.data || []).map(post => ({
        ...post,
        likes: allLikes.filter(l => String(l.post_id) === String(post.id)).map(l => String(l.user_id)),
        comments: allComments.filter(c => String(c.post_id) === String(post.id))
    }));
}

async function loadAllData() {
    // Load each area independently so one denied/temporarily unavailable table
    // cannot prevent the homepage and the other sections from appearing.
    const jobs = [
        ["creators", loadUsers],
        ["videos", loadVideos],
        ["follows", loadFollows],
        ["posts", loadPosts]
    ];

    const results = await Promise.allSettled(jobs.map(([, load]) => load()));
    const failures = results
        .map((result, index) => result.status === "rejected"
            ? jobs[index][0] + ": " + (result.reason?.message || result.reason)
            : null)
        .filter(Boolean);

    if (failures.length) {
        console.warn("Some GoCat sections could not load:", failures.join(" | "));
    }
    return failures;
}

function renderLivePage() {
    renderSuggestedCreators();

    // Never replace a video element while the viewer is watching it.
    // Realtime changes are held until the clip ends or the viewer leaves the page.
    if (activePlaybackVideoId) {
        liveRenderPending = true;
        return;
    }

    liveRenderPending = false;
    if (currentPage === "home") renderHomeFeed();
    if (currentPage === "reels") renderReels();
    if (currentPage === "explore") renderExplore();
    if (currentPage === "following" && currentUser) renderFollowing();
    if (currentPage === "posts") renderPosts();
    if (currentPage === "profile") renderProfile();
    if (currentPage === "chats" && currentUser) {
        renderChatFriends();
        if (currentChatUserId) loadMessages();
    }
}

function queueLiveRefresh(delay = 450) {
    clearTimeout(liveRefreshTimer);
    liveRefreshTimer = setTimeout(async () => {
        if (!db || document.hidden) return;

        // View-count updates and other realtime events must not reset playback.
        if (activePlaybackVideoId) {
            liveRenderPending = true;
            return;
        }

        try { await loadAllData(); renderLivePage(); }
        catch (error) { console.warn("Live feed refresh:", error.message || error); }
    }, delay);
}

function subscribeToLiveFeed() {
    if (!db) return;
    if (feedRealtimeChannel) db.removeChannel(feedRealtimeChannel);
    const tables = ["videos", "likes", "comments", "posts", "post_likes", "post_comments", "follows"];
    let channel = db.channel("gocat-live-feed");
    tables.forEach(table => {
        channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => queueLiveRefresh());
    });
    ["watch_history", "gocat_notifications"].forEach(table => {
        channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
            if (!currentUser) return;
            loadAccountPersistence().then(() => {
                if (currentPage === "history") renderHistory();
                if (currentPage === "notifications") renderNotifications();
            }).catch(error => console.warn("Account activity sync:", error.message));
        });
    });
    feedRealtimeChannel = channel.subscribe(status => { feedRealtimeReady = status === "SUBSCRIBED"; });
}

setInterval(() => {
    if (!feedRealtimeReady && !document.hidden && db) queueLiveRefresh(0);
}, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) queueLiveRefresh(80); });


/* ---------- 08 START APP ---------- */

async function startGoCat() {
    try {
        if (!currentUser) throw new Error("No signed-in user was found.");
        await ensureProfile();
        await loadAdminStatus();
        await loadAllData();
        currentProfileUserId = currentUser.id;
        await loadAccountPersistence();
        updateUserInterface();
        openApp();
        subscribeToLiveFeed();
        renderEverything();
        openPage("home");
        checkSharedVideoLink();
    } catch (error) {
        console.error("GoCat startup:", error);
        openApp();
        openLoginScreen("Could not load your account: " + (error.message || error));
    }
}

async function startGuestGoCat() {
    currentUser = null;
    currentProfile = null;
    currentProfileUserId = null;
    currentChatUserId = null;
    isGoCatAdmin = false;
    notifications = [];

    try {
        await loadAllData();
    } catch (error) {
        // Keep the public shell usable even if Supabase cannot be reached.
        console.error("Guest data startup:", error);
    }

    updateUserInterface();
    openApp();
    subscribeToLiveFeed();

    try {
        renderEverything();
    } catch (error) {
        console.error("GoCat first render:", error);
    }

    // Always select Home on first load, including partial/offline startup.
    try {
        openPage("home");
    } catch (error) {
        console.error("GoCat home navigation:", error);
        currentPage = "home";
        document.querySelectorAll(".page-section").forEach(section => {
            section.classList.toggle("hidden", section.id !== "page-home");
        });
    }

    checkSharedVideoLink();
}

function updateUserInterface() {
    const signedIn = !!currentUser;
    const username = signedIn ? (currentProfile?.username || "Creator") : "Guest";
    if ($("welcomeName")) $("welcomeName").textContent = username;
    if ($("sidebarUsername")) $("sidebarUsername").textContent = username;
    if ($("settingsUsername")) $("settingsUsername").textContent = username;
    if ($("settingsEmail")) $("settingsEmail").textContent = signedIn ? (currentUser.email || "") : "Browsing without an account";
    paintAvatar("sidebarAvatar", username, currentProfile?.avatar_path || "");
    paintAvatar("settingsAvatar", username, currentProfile?.avatar_path || "");
    if ($("topProfileBtn")) {
        if (signedIn) {
            paintAvatar("topProfileBtn", username, currentProfile?.avatar_path || "");
            $("topProfileBtn").classList.remove("guest-signin-btn");
            $("topProfileBtn").setAttribute("aria-label", "Open your channel");
        } else {
            $("topProfileBtn").textContent = "Sign in";
            $("topProfileBtn").classList.add("guest-signin-btn");
            $("topProfileBtn").setAttribute("aria-label", "Sign in to GoCat");
        }
    }
    $("logoutBtn")?.classList.toggle("hidden", !signedIn);
    $("sidebarSignInBtn")?.classList.toggle("hidden", signedIn);
    $("settingsLogout")?.classList.toggle("hidden", !signedIn);
    $("adminNavBtn")?.classList.toggle("hidden", !isGoCatAdmin);
}


/* ---------- 09 CARDS ---------- */

const avatar = (name, cls = "", path = "") => `<span class="avatar ${cls}" style="${avatarBg(name)}">${path ? `<img src="${esc(storageURL("profile-avatars", path))}" alt="" loading="lazy">` : esc(initial(name))}</span>`;

const pill = (ic, label, attr, cls = "") =>
    `<button class="pill ${cls}" ${attr}>${icon(ic)}<span>${label}</span></button>`;

function videoCard(video) {
    const username = getUsername(video.owner_id);
    const liked = hasLiked(video);
    const following = isFollowing(video.owner_id);

    return `
        <article class="video-card">
            <div class="video-player-wrap">
                <video class="video-player" src="${esc(getVideoURL(video.storage_path))}#t=0.1"
                    controls playsinline preload="metadata" data-play-video="${esc(video.id)}"></video>
            </div>

            <div class="video-body">
                <button class="avatar-btn" data-profile-user="${esc(video.owner_id)}">${avatar(username, "", getUser(video.owner_id)?.avatar_path || "")}</button>

                <div class="video-text">
                    <h3>${esc(video.title)}</h3>
                    <div class="video-sub">
                        <button class="link-btn" data-profile-user="${esc(video.owner_id)}">${esc(username)}</button>
                    </div>
                    <div class="video-sub"><span>${compact(video.views)} views</span><span>${formatDate(video.created_at)}</span></div>
                </div>

                ${!isOwnContent(video.owner_id)
                    ? `<button class="follow-btn ${following ? "on" : ""}" data-follow-user="${esc(video.owner_id)}">${following ? "Following" : "Follow"}</button>`
                    : ""}
            </div>

            ${video.description ? `<p class="video-desc">${esc(video.description)}</p>` : ""}

            <div class="video-actions">
                ${pill("heart", video.likes?.length || 0, `data-like-video="${esc(video.id)}"`, liked ? "liked" : "")}
                ${pill("message", video.comments?.length || 0, `data-comments-video="${esc(video.id)}"`)}
                ${pill("share", "Share", `data-share-video="${esc(video.id)}"`)}
                ${canManageContent(video.owner_id) ? pill("trash", "Delete", `data-delete-video="${esc(video.id)}"`, "delete-btn") : ""}
            </div>
        </article>
    `;
}

function linkifyPostText(value) {
    const escaped = esc(value ?? "");
    return escaped.replace(/https?:\/\/[^\s<]+/gi, match => {
        let href = match;
        let trailing = "";
        while (/[),.!?;:]$/.test(href)) {
            trailing = href.slice(-1) + trailing;
            href = href.slice(0, -1);
        }
        if (!href) return match;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>${trailing}`;
    });
}

function postCard(post) {
    const username = getUsername(post.user_id);
    const liked = hasLiked(post);
    const imageURL = getPostImageURL(post.media_path);
    const isOwnPost = String(post.user_id) === String(currentUser?.id);

    return `
        <article class="post-card">
            <div class="post-head">
                ${avatar(username, "", getUser(post.user_id)?.avatar_path || "")}
                <div class="post-meta">
                    <strong>${esc(username)}</strong>
                    <small>${formatDate(post.created_at)}</small>
                </div>
                ${isOwnPost ? pill("edit", "Edit", `data-edit-post="${esc(post.id)}"`) : ""}
                ${canManageContent(post.user_id) ? pill("trash", "Delete", `data-delete-post="${esc(post.id)}"`, "delete-btn") : ""}
            </div>

            ${post.content ? `<p class="post-content">${linkifyPostText(post.content)}</p>` : ""}
            ${imageURL ? `<img class="post-image" src="${esc(imageURL)}" alt="Post image" loading="lazy">` : ""}

            <div class="post-actions">
                ${pill("heart", post.likes?.length || 0, `data-like-post="${esc(post.id)}"`, liked ? "liked" : "")}
                ${pill("message", post.comments?.length || 0, `data-comments-post="${esc(post.id)}"`)}
            </div>
        </article>
    `;
}

function homeReelCard(video) {
    return `
        <article class="home-short-card">
            <button class="home-short-open" data-open-reel-id="${esc(video.id)}">
                <div class="home-short-thumb">
                    <video src="${esc(getVideoURL(video.storage_path))}#t=0.1" muted playsinline preload="metadata"></video>
                    <div class="home-short-grad"></div>
                    <strong class="home-short-title">${esc(video.title)}</strong>
                </div>
                <div class="home-short-info"><small>${compact(video.views)} views</small></div>
            </button>
        </article>
    `;
}


/* ---------- 10 HOME FEED ---------- */

function getHomeFeedData() {
    const query = $("searchInput")?.value.trim().toLowerCase() || "";

    const matches = (item, type) => {
        if (!query) return true;
        const owner = type === "post" ? item.user_id : item.owner_id;
        return [item.title, item.description, item.content, getUsername(owner)]
            .join(" ").toLowerCase().includes(query);
    };

    const topicOK = v => activeHomeTopic === "All" || v.topic === activeHomeTopic;

    const score = video => {
        let points = isFollowing(video.owner_id) ? 4 : 0;
        const ageHours = (Date.now() - new Date(video.created_at).getTime()) / 3600000;
        points += Math.max(0, 4 - ageHours / 24);
        points += Math.min(Number(video.views || 0) / 100, 3);
        points += Math.min((video.likes?.length || 0) / 5, 2);
        return points;
    };

    return {
        regularVideos: videos.filter(v => !isReel(v) && topicOK(v) && matches(v, "video")).sort((a, b) => score(b) - score(a)),
        shorts: videos.filter(v => isReel(v) && topicOK(v) && matches(v, "video")).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        communityPosts: posts.filter(p => matches(p, "post")).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    };
}

function buildHomeFeedCycles() {
    const data = getHomeFeedData();
    let vi = 0, si = 0, pi = 0;
    const cycles = [];

    while (vi < data.regularVideos.length || si < data.shorts.length || pi < data.communityPosts.length) {
        const sections = [];

        if (vi < data.regularVideos.length) {
            const group = data.regularVideos.slice(vi, vi + 4);
            vi += group.length;
            sections.push(`
                <section class="home-feed-section">
                    <div class="home-feed-video-grid">${group.map(videoCard).join("")}</div>
                </section>`);
        }

        if (si < data.shorts.length) {
            const group = data.shorts.slice(si, si + 6);
            si += group.length;
            sections.push(`
                <section class="home-feed-section">
                    <div class="home-feed-heading">
                        <div class="home-shelf-title">
                            <span class="shorts-logo">${icon("shorts")}</span>
                            <h2>Reels</h2>
                        </div>
                        <button class="text-btn" data-go-page="reels">See all</button>
                    </div>
                    <div class="home-shorts-shelf">${group.map(homeReelCard).join("")}</div>
                </section>`);
        }

        if (pi < data.communityPosts.length) {
            const group = data.communityPosts.slice(pi, pi + 2);
            pi += group.length;
            sections.push(`
                <section class="home-feed-section">
                    <div class="home-feed-heading">
                        <h2>From the community</h2>
                        <button class="text-btn" data-go-page="posts">View posts</button>
                    </div>
                    <div class="home-feed-post-grid">${group.map(postCard).join("")}</div>
                </section>`);
        }

        cycles.push(sections.join(""));
    }

    return cycles;
}

function renderHomeFeed() {
    const container = $("homeFeed");
    if (!container) return;

    const cycles = buildHomeFeedCycles();
    const visible = cycles.slice(0, homeVisibleCycles);
    container.innerHTML = visible.join("");

    const data = getHomeFeedData();
    const total = data.regularVideos.length + data.shorts.length + data.communityPosts.length;

    const shown = visible.reduce((sum, html) => {
        const found = html.match(/class="video-card"|class="post-card"|class="home-short-card"/g);
        return sum + (found ? found.length : 0);
    }, 0);

    $("homeEmpty")?.classList.toggle("hidden", total > 0);
    $("homeLoadMoreWrap")?.classList.toggle("hidden", homeVisibleCycles >= cycles.length);
    if ($("homeCount")) $("homeCount").textContent = "Showing " + shown + " of " + total;
}

listen("homeLoadMore", "click", () => { homeVisibleCycles += 1; renderHomeFeed(); });

document.querySelectorAll("[data-topic]").forEach(button => {
    button.addEventListener("click", function () {
        activeHomeTopic = this.dataset.topic;
        homeVisibleCycles = 1;
        document.querySelectorAll("[data-topic]").forEach(i => i.classList.remove("active"));
        this.classList.add("active");
        renderHomeFeed();
    });
});


/* ---------- 11 CREATORS AND FOLLOWS ---------- */

function renderSuggestedCreators() {
    const container = $("suggestedCreators");
    if (!container) return;

    const suggestions = users.filter(u => !isOwnContent(u.id) && !isFollowing(u.id)).slice(0, 15);

    container.innerHTML = suggestions.length
        ? suggestions.map(user => `
            <div class="creator-card">
                ${avatar(user.username, "lg")}
                <div class="creator-info">
                    <strong>${esc(user.username)}</strong>
                    <small>GoCat creator</small>
                </div>
                <button class="mini-follow" data-follow-user="${esc(user.id)}">Follow</button>
            </div>`).join("")
        : "<p class='muted-text'>You are following everyone here.</p>";
}

async function toggleFollow(userId) {
    if (!requireAuth("follow creators") || isOwnContent(userId)) return;

    const existing = follows.find(f =>
        String(f.follower_id) === String(currentUser.id) && String(f.following_id) === String(userId));

    try {
        if (existing) {
            const result = await db.from("follows").delete()
                .eq("follower_id", currentUser.id).eq("following_id", userId);
            if (result.error) throw result.error;

            follows = follows.filter(f => f !== existing);
            showToast("Unfollowed " + getUsername(userId));

        } else {
            const result = await db.from("follows")
                .insert({ follower_id: currentUser.id, following_id: userId });
            if (result.error) throw result.error;

            follows.push({ follower_id: currentUser.id, following_id: userId });
            addLocalNotification("follow", "You started following " + getUsername(userId));
            showToast("Following " + getUsername(userId));
        }

        renderEverything();

    } catch (error) {
        console.error(error);
        showToast("Follow error: " + error.message);
    }
}


/* ---------- 12 LIKES AND COMMENTS ---------- */

async function toggleVideoLike(videoId) {
    if (!requireAuth("like videos")) return;
    const video = videos.find(v => String(v.id) === String(videoId));
    if (!video) return;

    video.likes = video.likes || [];
    const me = String(currentUser.id);
    const liked = video.likes.includes(me);

    try {
        const result = liked
            ? await db.from("likes").delete().eq("video_id", videoId).eq("user_id", currentUser.id)
            : await db.from("likes").insert({ video_id: videoId, user_id: currentUser.id });

        if (result.error) throw result.error;

        video.likes = liked ? video.likes.filter(id => id !== me) : [...video.likes, me];
        renderEverything();

    } catch (error) {
        console.error(error);
        showToast("Like error: " + error.message);
    }
}

async function openComments(videoId) {
    currentCommentVideoId = videoId;
    currentCommentPostId = null;
    currentCommentParentId = null;
    subscribeToComments();
    if ($("commentsModalTitle")) $("commentsModalTitle").textContent = "Video comments";
    if ($("commentsList")) $("commentsList").innerHTML = "<p class='muted-text'>Loading comments...</p>";
    $("commentForm")?.classList.toggle("hidden", !currentUser);
    $("commentGuestPrompt")?.classList.toggle("hidden", !!currentUser);
    showModal("commentsModal");
    await renderComments();
}

async function openPostComments(postId) {
    currentCommentPostId = postId;
    currentCommentVideoId = null;
    currentCommentParentId = null;
    subscribeToComments();
    if ($("commentsModalTitle")) $("commentsModalTitle").textContent = "Post comments";
    if ($("commentsList")) $("commentsList").innerHTML = "<p class='muted-text'>Loading comments...</p>";
    $("commentForm")?.classList.toggle("hidden", !currentUser);
    $("commentGuestPrompt")?.classList.toggle("hidden", !!currentUser);
    showModal("commentsModal");
    await renderComments();
}

async function renderComments() {
    if (!$("commentsList")) return;
    let result;
    if (currentCommentPostId !== null) {
        result = await db.from("post_comments").select("*").eq("post_id", String(currentCommentPostId)).order("created_at", { ascending: true });
    } else if (currentCommentVideoId !== null) {
        result = await db.from("comments").select("*").eq("video_id", currentCommentVideoId).order("created_at", { ascending: true });
    } else return;
    if (result.error) { $("commentsList").textContent = result.error.message; return; }
    const comments = result.data || [];
    const children = new Map();
    comments.forEach(item => {
        const key = item.parent_id ? String(item.parent_id) : "root";
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(item);
    });
    const renderBranch = (parent, depth = 0) => (children.get(parent) || []).map(item => {
        const own = !!currentUser && String(item.user_id) === String(currentUser.id);
        const body = item.content ?? item.text ?? "";
        return `<article class="comment-item ${depth ? "comment-reply" : ""}" data-comment-id="${esc(item.id)}">
            <div class="comment-avatar">${getUser(item.user_id)?.avatar_path ? `<img src="${esc(storageURL("profile-avatars", getUser(item.user_id).avatar_path))}" alt="" loading="lazy">` : esc(initial(getUsername(item.user_id)))}</div>
            <div class="comment-main">
                <div class="comment-meta"><strong>${esc(getUsername(item.user_id))}</strong><small>${formatDate(item.created_at)}</small></div>
                <p>${esc(body)}</p>
                <div class="comment-tools"><button type="button" class="text-btn" data-reply-comment="${esc(item.id)}">Reply</button>${own ? `<button type="button" class="text-btn danger-text" data-delete-comment="${esc(item.id)}">Delete</button>` : ""}</div>
                <div class="comment-replies">${renderBranch(String(item.id), depth + 1)}</div>
            </div>
        </article>`;
    }).join("");
    $("commentsList").innerHTML = comments.length ? renderBranch("root") : "<p class='muted-text'>No comments yet. Start the conversation.</p>";
}

listen("commentForm", "submit", async function (event) {
    event.preventDefault();
    if (!requireAuth("comment or reply")) return;

    const text = $("commentInput")?.value.trim() || "";
    if (!text || (currentCommentVideoId === null && currentCommentPostId === null)) return;

    const button = this.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
        let result;
        if (currentCommentPostId !== null) {
            result = await db.from("post_comments").insert({
                post_id: String(currentCommentPostId),
                user_id: currentUser.id,
                content: text,
                parent_id: currentCommentParentId,
                created_at: Date.now()
            });
        } else {
            result = await db.from("comments").insert({
                video_id: currentCommentVideoId,
                user_id: currentUser.id,
                text,
                parent_id: currentCommentParentId,
                created_at: Date.now()
            });
        }

        if (result.error) throw result.error;

        $("commentInput").value = "";
        currentCommentParentId = null;
        if ($("commentReplyingTo")) $("commentReplyingTo").textContent = "";
        if ($("commentInput")) $("commentInput").placeholder = "Add a comment";
        if (currentCommentPostId !== null) await loadPosts();
        else await loadVideos();

        await renderComments();
        renderEverything();
        showToast("Comment posted");
    } catch (error) {
        console.error("Comment error:", error);
        showToast("Comment error: " + error.message);
    } finally {
        if (button) button.disabled = false;
    }
});


function subscribeToComments() {
    if (commentRealtimeChannel) db.removeChannel(commentRealtimeChannel);
    const table = currentCommentPostId !== null ? "post_comments" : "comments";
    const key = currentCommentPostId !== null ? "post_id" : "video_id";
    const value = String(currentCommentPostId !== null ? currentCommentPostId : currentCommentVideoId);
    commentRealtimeChannel = db.channel("gocat-comments-" + table + "-" + value)
        .on("postgres_changes", { event: "*", schema: "public", table, filter: key + "=eq." + value }, () => renderComments())
        .subscribe();
}

async function deleteComment(commentId) {
    const table = currentCommentPostId !== null ? "post_comments" : "comments";
    const result = await db.from(table).delete().eq("id", commentId).eq("user_id", currentUser.id);
    if (result.error) return showToast("Could not delete comment: " + result.error.message);
    await renderComments();
    if (currentCommentPostId !== null) await loadPosts(); else await loadVideos();
    renderEverything();
}

function beginCommentReply(commentId) {
    currentCommentParentId = commentId;
    if ($("commentReplyingTo")) $("commentReplyingTo").textContent = "Replying to a comment · ";
    if ($("commentInput")) {
        $("commentInput").placeholder = "Write a reply...";
        $("commentInput").focus();
    }
}

/* ---------- 13 SHARE AND DELETE VIDEO ---------- */

async function shareVideo(videoId) {
    const url = location.origin + location.pathname + "?video=" + encodeURIComponent(videoId);

    try {
        if (navigator.share) {
            await navigator.share({ title: "GoCat video", text: "Watch this on GoCat.", url });
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            showToast("Link copied");
        } else {
            showToast("Sharing is not supported here.");
        }
    } catch (error) {
        if (error.name !== "AbortError") showToast("Sharing failed.");
    }
}

function scrollToVideo(videoId) {
    setTimeout(() => {
        document.querySelector(`[data-play-video="${CSS.escape(String(videoId))}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
}

function checkSharedVideoLink() {
    const videoId = new URLSearchParams(location.search).get("video");
    if (!videoId) return;

    const video = videos.find(v => String(v.id) === String(videoId));
    if (!video) return showToast("That video could not be found.");

    if (isReel(video)) {
        openSpecificReel(video.id);
    } else {
        openPage("home");
        scrollToVideo(video.id);
    }
}

async function deleteVideo(videoId) {
    const video = videos.find(v => String(v.id) === String(videoId));
    if (!video || !canManageContent(video.owner_id)) return;
    if (!confirm("Delete this video permanently?")) return;

    const result = await db.from("videos").delete().eq("id", videoId);
    if (result.error) return showToast("Delete failed: " + result.error.message);

    if (video.storage_path) {
        const removal = await db.storage.from(VIDEO_BUCKET).remove([video.storage_path]);
        if (removal.error) console.warn("Storage cleanup:", removal.error.message);
    }

    await loadVideos();
    renderEverything();
    showToast("Video deleted");
}


/* ---------- 14 SHORTS ---------- */

function renderReels() {
    const container = $("reelsFeed");
    if (!container) return;

    const allReels = videos.filter(isReel).sort((a, b) => {
        const rank = window.gocatRecommendationScore;
        return typeof rank === "function"
            ? rank(b, "video") - rank(a, "video")
            : new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    const page = allReels.slice(0, reelsVisible);

    if (!allReels.length) {
        container.innerHTML = `
            <div class="reel-empty">
                <div>
                    <h2>No Reels yet</h2>
                    <p>Be the first to publish one.</p>
                    <button class="primary-btn" data-create-short>Create Reel</button>
                </div>
            </div>`;
        $("reelsLoadMoreWrap")?.classList.add("hidden");
        return;
    }

    container.innerHTML = page.map(video => {
        const username = getUsername(video.owner_id);
        const liked = hasLiked(video);

        return `
            <article class="reel-item" data-reel-item="${esc(video.id)}">
                <video class="reel-video" src="${esc(getVideoURL(video.storage_path))}"
                    playsinline loop ${settings.muted ? "muted" : ""} preload="metadata"
                    data-play-video="${esc(video.id)}"></video>

                <button class="reel-sound-btn" data-reel-sound aria-label="Toggle sound">
                    ${icon(settings.muted ? "mute" : "volume")}
                </button>

                <div class="reel-shade"></div>

                <div class="reel-info">
                    <div class="reel-user-row">
                        <span class="reel-user-avatar" style="${avatarBg(username)}">${getUser(video.owner_id)?.avatar_path ? `<img src="${esc(storageURL("profile-avatars", getUser(video.owner_id).avatar_path))}" alt="" loading="lazy">` : esc(initial(username))}</span>
                        <button class="reel-username" data-profile-user="${esc(video.owner_id)}">@${esc(username)}</button>
                        ${!isOwnContent(video.owner_id)
                            ? `<button class="reel-follow" data-follow-user="${esc(video.owner_id)}">${isFollowing(video.owner_id) ? "Following" : "Follow"}</button>`
                            : ""}
                    </div>
                    <p class="reel-caption"><strong>${esc(video.title)}</strong></p>
                    ${video.description ? `<p class="reel-caption">${esc(video.description)}</p>` : ""}
                </div>

                <div class="reel-actions">
                    <button class="reel-action ${liked ? "liked" : ""}" data-like-video="${esc(video.id)}" aria-label="Like">${icon("heart")}</button>
                    <span class="reel-count">${video.likes?.length || 0}</span>
                    <button class="reel-action" data-comments-video="${esc(video.id)}" aria-label="Comments">${icon("message")}</button>
                    <span class="reel-count">${video.comments?.length || 0}</span>
                    <button class="reel-action" data-share-video="${esc(video.id)}" aria-label="Share">${icon("share")}</button>
                    ${canManageContent(video.owner_id)
                        ? `<button class="reel-action" data-delete-video="${esc(video.id)}" aria-label="Delete">${icon("trash")}</button>`
                        : ""}
                </div>
            </article>`;
    }).join("");

    $("reelsLoadMoreWrap")?.classList.toggle("hidden", reelsVisible >= allReels.length);
    observeReels();
}

function applyReelAudioPreference(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.defaultMuted = settings.muted;
    video.muted = settings.muted;
}

function updateReelSoundButtons() {
    document.querySelectorAll("[data-reel-sound]").forEach(button => {
        button.innerHTML = icon(settings.muted ? "mute" : "volume");
        button.setAttribute("aria-label", settings.muted ? "Turn Reels sound on" : "Mute Reels");
        button.title = settings.muted ? "Turn sound on for all Reels" : "Mute all Reels";
    });
}

function observeReels() {
    if (reelObserver) reelObserver.disconnect();
    document.querySelectorAll(".reel-video").forEach(applyReelAudioPreference);
    updateReelSoundButtons();

    const feed = $("reelsFeed");
    if (!feed || !("IntersectionObserver" in window)) return;

    reelObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const video = entry.target;
            applyReelAudioPreference(video);
            if (entry.isIntersecting && settings.autoplay) video.play().catch(() => {});
            else video.pause();
        });
    }, { root: feed, threshold: 0.7 });

    feed.querySelectorAll(".reel-video").forEach(v => reelObserver.observe(v));
}

listen("reelsLoadMore", "click", () => { reelsVisible += PAGE_SIZE; renderReels(); });

function openSpecificReel(videoId) {
    const rankedReels = videos.filter(isReel).sort((a, b) => {
        const rank = window.gocatRecommendationScore;
        return typeof rank === "function"
            ? rank(b, "video") - rank(a, "video")
            : new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    const index = rankedReels.findIndex(v => String(v.id) === String(videoId));
    if (index >= 0) reelsVisible = Math.max(reelsVisible, index + 1);

    openPage("reels");

    setTimeout(() => {
        document.querySelector(`[data-reel-item="${CSS.escape(String(videoId))}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
}

listen("reelsFeed", "click", function (event) {
    const soundButton = event.target.closest("[data-reel-sound]");
    if (!soundButton) return;

    const video = soundButton.closest(".reel-item")?.querySelector(".reel-video");
    if (!video) return;

    settings.muted = !settings.muted;
    saveSettings();
    document.querySelectorAll(".reel-video").forEach(applyReelAudioPreference);
    updateReelSoundButtons();
    if ($("settingMuted")) $("settingMuted").checked = settings.muted;
    showToast(settings.muted ? "Reels muted" : "Reels sound on");
});


/* ---------- 15 EXPLORE ---------- */

function setExploreTab(mode) {
    exploreMode = mode;
    exploreVisible = 6;

    document.querySelectorAll("[data-explore-tab]").forEach(b => {
        b.classList.toggle("active", b.dataset.exploreTab === mode);
    });

    $("exploreVideos")?.classList.toggle("hidden", mode !== "videos" && mode !== "reels");
    $("explorePeople")?.classList.toggle("hidden", mode !== "people");
    $("explorePosts")?.classList.toggle("hidden", mode !== "posts");

    renderExplore();
}

document.querySelectorAll("[data-explore-tab]").forEach(button => {
    button.addEventListener("click", function () { setExploreTab(this.dataset.exploreTab); });
});

function updateExploreMore(total) {
    $("exploreLoadMoreWrap")?.classList.add("hidden");
    if ($("exploreCount")) {
        $("exploreCount").textContent = "Showing " + total;
    }
}

function renderExplore() {
    const query = $("searchInput")?.value.trim().toLowerCase() || "";

    const videoMatch = v => !query ||
        String(v.title || "").toLowerCase().includes(query) ||
        String(v.description || "").toLowerCase().includes(query) ||
        getUsername(v.owner_id).toLowerCase().includes(query);

    if (exploreMode === "videos" || exploreMode === "reels") {
        const wantReels = exploreMode === "reels";
        const found = videos
            .filter(v => isReel(v) === wantReels && videoMatch(v))
            .sort((a, b) => {
                const rank = window.gocatRecommendationScore;
                return typeof rank === "function"
                    ? rank(b, "video") - rank(a, "video")
                    : new Date(b.created_at || 0) - new Date(a.created_at || 0);
            });
        const container = $("exploreVideos");

        container.className = wantReels ? "shorts-grid" : "video-grid";
        container.innerHTML = found.length
            ? found.map(wantReels ? homeReelCard : videoCard).join("")
            : "<div class='empty-card' style='grid-column:1/-1'><h3>No results</h3><p>Try a different search.</p></div>";

        updateExploreMore(found.length);
        return;
    }

    if (exploreMode === "people") {
        const found = users.filter(u => !isOwnContent(u.id) && (!query ||
            String(u.username || "").toLowerCase().includes(query) ||
            String(u.bio || "").toLowerCase().includes(query)));

        $("explorePeople").innerHTML = found.map(user => `
            <div class="person-card">
                ${avatar(user.username)}
                <h3>${esc(user.username)}</h3>
                <p>${esc(user.bio || "GoCat creator")}</p>
                <button class="soft-btn" data-profile-user="${esc(user.id)}">View channel</button>
                <button class="${isFollowing(user.id) ? "soft-btn" : "primary-btn"}" data-follow-user="${esc(user.id)}">
                    ${isFollowing(user.id) ? "Following" : "Follow"}
                </button>
            </div>`).join("");

        updateExploreMore(found.length);
        return;
    }

    const found = posts.filter(p => !query ||
        String(p.content || "").toLowerCase().includes(query) ||
        getUsername(p.user_id).toLowerCase().includes(query))
        .sort((a, b) => {
            const rank = window.gocatRecommendationScore;
            return typeof rank === "function"
                ? rank(b, "post") - rank(a, "post")
                : new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

    $("explorePosts").innerHTML = found.map(postCard).join("");
    updateExploreMore(found.length);
}

listen("exploreLoadMore", "click", () => { exploreVisible += 6; renderExplore(); });


/* ---------- 16 FOLLOWING PAGE ---------- */

function renderFollowing() {
    if (!currentUser) {
        if ($("followingFeed")) $("followingFeed").innerHTML = "";
        $("followingEmpty")?.classList.remove("hidden");
        return;
    }
    const ids = follows
        .filter(f => String(f.follower_id) === String(currentUser.id))
        .map(f => String(f.following_id));

    const selected = videos.filter(v => ids.includes(String(v.owner_id)) && !isReel(v));

    if ($("followingFeed")) $("followingFeed").innerHTML = selected.map(videoCard).join("");
    $("followingEmpty")?.classList.toggle("hidden", selected.length > 0);
}


/* ---------- 17 UPLOAD MODAL ---------- */

function resetUploadForm() {
    $("uploadForm")?.reset();

    if ($("videoFile")) $("videoFile").value = "";
    if ($("selectedVideoName")) $("selectedVideoName").textContent = "";
    $("uploadProgress")?.classList.add("hidden");
    if ($("uploadProgressBar")) $("uploadProgressBar").style.width = "0%";
    if ($("uploadStatus")) $("uploadStatus").textContent = "";

    selectedVideoFile = null;
    exportedReelFile = null;
}

function setUploadMode(mode) {
    uploadMode = mode === "short" ? "short" : "video";

    document.querySelectorAll("[data-upload-mode]").forEach(b => {
        b.classList.toggle("active", b.dataset.uploadMode === uploadMode);
    });

    const isS = uploadMode === "short";
    if ($("uploadTitle")) $("uploadTitle").textContent = isS ? "Create a Reel" : "Upload video";
    if ($("uploadDescription")) $("uploadDescription").textContent = isS
        ? "Edit and publish a vertical video."
        : "Publish a video to your GoCat channel.";
    if ($("publishVideoBtn")) $("publishVideoBtn").textContent = isS ? "Publish Reel" : "Publish video";
}

function openUpload(mode = "video") {
    if (!requireAuth("upload videos and Reels")) return;
    resetUploadForm();
    setUploadMode(mode);
    showModal("uploadModal");
}

listen("uploadTopBtn", "click", () => openUpload("video"));
listen("createReelBtn", "click", () => openUpload("short"));

document.querySelectorAll("[data-upload-mode]").forEach(button => {
    button.addEventListener("click", function () {
        if (this.dataset.uploadMode !== uploadMode) setUploadMode(this.dataset.uploadMode);
    });
});

document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-open-upload]");
    if (!button) return;
    openUpload(button.dataset.openUpload === "short" ? "short" : "video");
});


/* ---------- 18 VIDEO FILE SELECTION ---------- */

listen("videoFile", "change", function () {
    const input = this;
    const file = input.files?.[0];

    selectedVideoFile = null;
    exportedReelFile = null;
    if ($("selectedVideoName")) $("selectedVideoName").textContent = "";
    if (!file) return;

    const allowed = ["mp4", "mov", "webm", "m4v", "ogv", "ogg", "3gp", "mkv"];
    const ext = (file.name.split(".").pop() || "").toLowerCase();

    if (!(file.type.startsWith("video/") || allowed.includes(ext))) {
        showToast("Please select a supported video file.");
        input.value = "";
        return;
    }

    if (file.size > MAX_VIDEO_BYTES) {
        showToast("Maximum video size is 500 MB.");
        input.value = "";
        return;
    }

    const tempURL = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";

    probe.onloadedmetadata = function () {
        const { duration, videoWidth: width, videoHeight: height } = probe;
        URL.revokeObjectURL(tempURL);

        if (!Number.isFinite(duration) || !width || !height) {
            showToast("Could not read video information.");
            input.value = "";
            return;
        }

        if (duration > MAX_VIDEO_DURATION) {
            showToast("GoCat videos can be up to 20 minutes.");
            input.value = "";
            return;
        }

        if (Math.max(width, height) > 3840 || Math.min(width, height) > 2160) {
            showToast("Maximum resolution is 4K UHD.");
            input.value = "";
            return;
        }

        selectedVideoFile = file;

        if ($("selectedVideoName")) {
            $("selectedVideoName").textContent =
                file.name + ", " + (file.size / 1048576).toFixed(2) + " MB, " + width + "x" + height;
        }

        if (uploadMode === "short") prepareReelEditor(file);
        showToast("Video ready");
    };

    probe.onerror = function () {
        URL.revokeObjectURL(tempURL);
        showToast("Your browser could not read this video format.");
        input.value = "";
    };

    probe.src = tempURL;
});


/* ---------- 19 SHORTS EDITOR PREVIEW ---------- */

function prepareReelEditor(file) {
    const preview = $("reelPreview");
    if (!preview) return;

    if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = URL.createObjectURL(file);

    preview.src = currentObjectURL;
    preview.style.filter = "none";
    preview.style.transform = "none";
    preview.playbackRate = 1;

    if ($("editorProjectStatus")) $("editorProjectStatus").textContent = file.name;
    if ($("editorStatus")) $("editorStatus").textContent = "Choose your edits, then export your Reel.";
    ["previewTextOne", "previewTextTwo", "previewSticker"].forEach(id => { if ($(id)) $(id).textContent = ""; });

    showModal("editorModal");

    preview.onloadedmetadata = function () {
        const duration = preview.duration;

        if ($("trimStart")) { $("trimStart").value = 0; $("trimStart").max = duration; }
        if ($("trimEnd")) { $("trimEnd").value = duration.toFixed(1); $("trimEnd").max = duration; }
        if ($("trimStartRange")) { $("trimStartRange").max = Math.ceil(duration * 10); $("trimStartRange").value = 0; }
        if ($("trimEndRange")) { $("trimEndRange").max = Math.ceil(duration * 10); $("trimEndRange").value = Math.ceil(duration * 10); }
        if ($("timelineDuration")) $("timelineDuration").textContent = formatTime(duration);
        if ($("editorTimecode")) $("editorTimecode").textContent = "00:00 / " + formatTime(duration);

        updateEditorPreview();
    };
}

document.querySelectorAll("[data-editor-tab]").forEach(button => {
    button.addEventListener("click", function () {
        const tab = this.dataset.editorTab;
        document.querySelectorAll("[data-editor-tab]").forEach(i => i.classList.remove("active"));
        this.classList.add("active");
        document.querySelectorAll("[data-editor-panel]").forEach(p => {
            p.classList.toggle("hidden", p.dataset.editorPanel !== tab);
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
        `brightness(${brightness}%)`, `contrast(${contrast}%)`,
        `saturate(${saturation}%)`, `blur(${blur}px)`
    ].filter(Boolean).join(" ");

    preview.style.transform = `rotate(${Number($("reelRotation")?.value || 0)}deg)`;
    preview.playbackRate = Number($("reelSpeed")?.value || 1);

    [["brightnessValue", brightness + "%"], ["contrastValue", contrast + "%"],
     ["saturationValue", saturation + "%"], ["blurValue", blur + "px"]]
        .forEach(([id, v]) => { if ($(id)) $(id).textContent = v; });

    if ($("previewTextOne")) {
        $("previewTextOne").textContent = $("reelOverlayText")?.value || "";
        if ($("reelTextSize")) $("previewTextOne").style.fontSize = Number($("reelTextSize").value) + "px";
        if ($("reelTextColor")) $("previewTextOne").style.color = $("reelTextColor").value;
    }
    if ($("previewTextTwo")) $("previewTextTwo").textContent = $("reelOverlayTextTwo")?.value || "";
    if ($("previewSticker")) $("previewSticker").textContent = $("reelSticker")?.value || "";

    if ($("editorOverlayPreview")) {
        const pos = $("reelTextPosition")?.value;
        $("editorOverlayPreview").style.justifyContent =
            pos === "top" ? "flex-start" : pos === "middle" ? "center" : "flex-end";
    }

    if ($("reelFraming")) {
        preview.style.objectFit = $("reelFraming").value === "contain" ? "contain" : "cover";
    }
}

["reelFilter", "reelBrightness", "reelContrast", "reelSaturation", "reelBlur", "reelSpeed",
 "reelTextPosition", "reelTextSize", "reelTextColor", "reelOverlayText", "reelOverlayTextTwo",
 "reelSticker", "reelFraming", "reelRotation"].forEach(id => {
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
        if ($("trimStart")) $("trimStart").value = start.toFixed(1);
    }

    if (changed === "end") {
        end = Math.min(preview.duration, Math.max(end, start + 0.1));
        if ($("trimEnd")) $("trimEnd").value = end.toFixed(1);
    }

    if ($("trimStartRange")) $("trimStartRange").value = Math.round(start * 10);
    if ($("trimEndRange")) $("trimEndRange").value = Math.round(end * 10);
    if ($("timelineDuration")) $("timelineDuration").textContent = formatTime(end - start);
}

listen("trimStart", "input", () => syncTrimInputs("start"));
listen("trimEnd", "input", () => syncTrimInputs("end"));

listen("trimStartRange", "input", function () {
    if ($("trimStart")) $("trimStart").value = (Number(this.value) / 10).toFixed(1);
    syncTrimInputs("start");
});

listen("trimEndRange", "input", function () {
    if ($("trimEnd")) $("trimEnd").value = (Number(this.value) / 10).toFixed(1);
    syncTrimInputs("end");
});

listen("reelPreview", "timeupdate", function () {
    if (!this.duration) return;

    if ($("editorTimecode")) {
        $("editorTimecode").textContent = formatTime(this.currentTime) + " / " + formatTime(this.duration);
    }

    const start = Number($("trimStart")?.value || 0);
    const end = Number($("trimEnd")?.value || this.duration);
    const position = Math.max(0, Math.min(100, ((this.currentTime - start) / Math.max(0.1, end - start)) * 100));

    if ($("timelinePlayhead")) $("timelinePlayhead").style.left = position + "%";
    if (this.currentTime >= end) this.pause();
});

listen("editorPreviewPlay", "click", async function () {
    const preview = $("reelPreview");
    if (!preview) return;

    const start = Number($("trimStart")?.value || 0);
    const end = Number($("trimEnd")?.value || preview.duration);

    if (preview.paused) {
        if (preview.currentTime < start || preview.currentTime >= end) preview.currentTime = start;
        try { await preview.play(); } catch { showToast("Preview playback was blocked."); }
    } else {
        preview.pause();
    }
});

listen("reelPreview", "play", () => { if ($("editorPreviewPlay")) $("editorPreviewPlay").textContent = "Ⅱ"; });
listen("reelPreview", "pause", () => { if ($("editorPreviewPlay")) $("editorPreviewPlay").textContent = "▶"; });


/* ---------- 20 MUSIC ---------- */

listen("musicFile", "change", function () {
    const file = this.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
        showToast("Choose an audio file.");
        this.value = "";
        return;
    }

    if (editorMusicObjectURL) URL.revokeObjectURL(editorMusicObjectURL);
    editorMusicObjectURL = URL.createObjectURL(file);

    if ($("musicFileName")) $("musicFileName").textContent = file.name + ", " + (file.size / 1048576).toFixed(2) + " MB";
    showToast("Music selected");
});

listen("removeMusicBtn", "click", function () {
    if (editorMusicObjectURL) URL.revokeObjectURL(editorMusicObjectURL);
    editorMusicObjectURL = null;
    if ($("musicFile")) $("musicFile").value = "";
    if ($("musicFileName")) $("musicFileName").textContent = "";
    showToast("Music removed");
});

async function loadEditorMusic() {
    const file = $("musicFile")?.files?.[0];
    if (!file) return null;

    if (!editorAudioContext) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        editorAudioContext = new Ctx();
    }

    if (editorAudioContext.state === "suspended") await editorAudioContext.resume();

    return editorAudioContext.decodeAudioData(await file.arrayBuffer());
}


/* ---------- 21 EDITOR EXPORT ---------- */

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    let line = "", currentY = y;

    String(text || "").split(/\s+/).forEach(word => {
        const test = line ? line + " " + word : word;

        if (ctx.measureText(test).width > maxWidth && line) {
            ctx.strokeText(line, x, currentY);
            ctx.fillText(line, x, currentY);
            line = word;
            currentY += lineHeight;
        } else {
            line = test;
        }
    });

    if (line) {
        ctx.strokeText(line, x, currentY);
        ctx.fillText(line, x, currentY);
    }
}

function drawEditedFrame(ctx, preview, width, height) {
    const sw = preview.videoWidth, sh = preview.videoHeight;
    if (!sw || !sh) return;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const framing = $("reelFraming")?.value || "cover";
    const scale = framing === "contain"
        ? Math.min(width / sw, height / sh)
        : Math.max(width / sw, height / sh);

    const dw = sw * scale, dh = sh * scale;
    const rotation = Number($("reelRotation")?.value || 0) * Math.PI / 180;

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rotation);

    ctx.filter = [
        getEditorFilter(),
        `brightness(${Number($("reelBrightness")?.value || 100) / 100})`,
        `contrast(${Number($("reelContrast")?.value || 100) / 100})`,
        `saturate(${Number($("reelSaturation")?.value || 100) / 100})`,
        `blur(${Number($("reelBlur")?.value || 0)}px)`
    ].filter(Boolean).join(" ");

    ctx.drawImage(preview, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    ctx.filter = "none";

    const mainText = $("reelOverlayText")?.value.trim() || "";
    const secondText = $("reelOverlayTextTwo")?.value.trim() || "";
    const sticker = $("reelSticker")?.value || "";
    const color = $("reelTextColor")?.value || "#ffffff";
    const size = Number($("reelTextSize")?.value || 32);
    const position = $("reelTextPosition")?.value || "bottom";

    const textY = position === "top" ? height * 0.15 : position === "middle" ? height * 0.5 : height * 0.82;
    const ratio = width / 720;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (sticker) {
        ctx.font = `${64 * ratio}px Arial`;
        ctx.fillStyle = "#fff";
        ctx.fillText(sticker, width / 2, textY - 90 * ratio);
    }

    if (mainText) {
        ctx.font = `900 ${Math.round(size * ratio)}px Arial`;
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.lineWidth = Math.max(3, width / 180);
        drawWrappedText(ctx, mainText, width / 2, textY, width * 0.82, size * 1.25 * ratio);
    }

    if (secondText) {
        ctx.font = `600 ${19 * ratio}px Arial`;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.lineWidth = Math.max(2, width / 260);
        drawWrappedText(ctx, secondText, width / 2, textY + size * 1.8 * ratio, width * 0.82, 25 * ratio);
    }

    ctx.restore();
}

async function buildEditorAudioMix(preview, canvasStream) {
    const Ctx = window.AudioContext || window.webkitAudioContext;

    if (!Ctx) {
        const fallback = preview.captureStream();
        fallback.getAudioTracks().forEach(t => canvasStream.addTrack(t));
        return { cleanup: () => fallback.getTracks().forEach(t => t.stop()) };
    }

    if (!editorAudioContext) editorAudioContext = new Ctx();
    if (editorAudioContext.state === "suspended") await editorAudioContext.resume();

    const destination = editorAudioContext.createMediaStreamDestination();

    if (!editorVideoSource) {
        editorVideoSource = editorAudioContext.createMediaElementSource(preview);
        editorVideoGain = editorAudioContext.createGain();
        editorVideoSource.connect(editorVideoGain);
        editorVideoGain.connect(editorAudioContext.destination);
    }

    editorVideoGain.gain.value = Number($("reelVolume")?.value ?? 100) / 100;
    editorVideoGain.connect(destination);

    let musicSource = null;

    if ($("musicFile")?.files?.[0]) {
        const buffer = await loadEditorMusic();

        if (buffer) {
            const musicGain = editorAudioContext.createGain();
            const target = Number($("musicVolume")?.value ?? 40) / 100;

            musicSource = editorAudioContext.createBufferSource();
            musicSource.buffer = buffer;
            musicSource.loop = true;
            musicGain.gain.value = target;
            musicSource.connect(musicGain);
            musicGain.connect(destination);

            const fadeIn = Number($("musicFadeIn")?.value || 0);
            if (fadeIn > 0) {
                musicGain.gain.setValueAtTime(0, editorAudioContext.currentTime);
                musicGain.gain.linearRampToValueAtTime(target, editorAudioContext.currentTime + fadeIn);
            }

            musicSource.start(0);
        }
    }

    destination.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));

    return {
        cleanup: () => {
            try { musicSource?.stop(); } catch {}
            try { editorVideoGain.disconnect(destination); } catch {}
            destination.stream.getTracks().forEach(t => t.stop());
        }
    };
}

listen("exportReelBtn", "click", async function () {
    const button = this;
    const preview = $("reelPreview");

    if (!selectedVideoFile || !preview) return showToast("Choose a video first.");

    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
        return showToast("Your browser can't export video. Close the editor to upload the original.");
    }

    const start = Math.max(0, Number($("trimStart")?.value || 0));
    const end = Math.min(preview.duration, Number($("trimEnd")?.value || preview.duration));

    if (!Number.isFinite(end) || end <= start) return showToast("Choose a valid trim range.");

    const resolution = Number($("reelResolution")?.value || 720);
    const square = $("reelFraming")?.value === "square";
    const width = resolution;
    const height = square ? resolution : Math.round(resolution * 16 / 9);
    const fps = Number($("reelFrameRate")?.value || 30);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return showToast("Could not create video canvas.");

    const canvasStream = canvas.captureStream(fps);

    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find(t => MediaRecorder.isTypeSupported(t));

    if (!mimeType) {
        canvasStream.getTracks().forEach(t => t.stop());
        return showToast("No supported export format found.");
    }

    button.disabled = true;
    button.textContent = "Exporting...";
    if ($("editorStatus")) $("editorStatus").textContent = "Preparing video and audio...";

    let audioMix = null, animationId = null, finished = false, recorder = null;
    const chunks = [];

    try {
        preview.pause();

        await new Promise((resolve, reject) => {
            if (Math.abs(preview.currentTime - start) < 0.05) return resolve();

            const onSeeked = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error("Could not seek to trim start.")); };
            const cleanup = () => {
                preview.removeEventListener("seeked", onSeeked);
                preview.removeEventListener("error", onError);
            };

            preview.addEventListener("seeked", onSeeked, { once: true });
            preview.addEventListener("error", onError, { once: true });
            preview.currentTime = start;
        });

        audioMix = await buildEditorAudioMix(preview, canvasStream);
        recorder = new MediaRecorder(canvasStream, { mimeType });

        recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };

        const exportFinished = new Promise((resolve, reject) => {
            recorder.onstop = resolve;
            recorder.onerror = e => reject(e.error || new Error("Export failed."));
        });

        preview.playbackRate = Number($("reelSpeed")?.value || 1);

        const stopExport = () => {
            if (finished) return;
            finished = true;
            preview.pause();
            if (recorder?.state !== "inactive") recorder.stop();
        };

        const drawLoop = () => {
            if (finished) return;
            drawEditedFrame(ctx, preview, width, height);

            if (preview.currentTime >= end || preview.ended) return stopExport();
            animationId = requestAnimationFrame(drawLoop);
        };

        recorder.start(1000);
        await preview.play();

        if ($("editorStatus")) $("editorStatus").textContent = `Exporting ${resolution}p at ${fps} FPS...`;

        drawLoop();
        await exportFinished;

        if (!chunks.length) throw new Error("The exported video is empty.");

        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) throw new Error("The exported video is empty.");

        exportedReelFile = new File([blob], "gocat-short.webm", { type: mimeType, lastModified: Date.now() });

        if ($("selectedVideoName")) {
            $("selectedVideoName").textContent = exportedReelFile.name + ", " + (blob.size / 1048576).toFixed(2) + " MB";
        }

        const tooBig = blob.size > MAX_VIDEO_BYTES;
        if ($("editorStatus")) {
            $("editorStatus").textContent = tooBig
                ? "Export finished but exceeds 500 MB. Lower the resolution or frame rate."
                : "Your edited Reel is ready.";
        }

        hideModal("editorModal");
        showToast(tooBig ? "Export exceeds 500 MB. Reduce export quality." : "Reel exported");

    } catch (error) {
        console.error("Export error:", error);
        if ($("editorStatus")) $("editorStatus").textContent = "Export failed: " + error.message;
        showToast("Export failed: " + error.message);

    } finally {
        finished = true;
        if (animationId) cancelAnimationFrame(animationId);
        preview.pause();
        audioMix?.cleanup();
        canvasStream.getTracks().forEach(t => t.stop());
        button.disabled = false;
        button.textContent = "Export Reel";
    }
});

function closeEditor() {
    $("reelPreview")?.pause();
    hideModal("editorModal");
}

listen("editorCloseBtn", "click", closeEditor);


/* ---------- 22 SUPABASE UPLOAD (TUS with safe fallback) ---------- */

function loadTusLibrary() {
    if (window.tus?.Upload) return Promise.resolve(true);

    if (!tusLibraryPromise) {
        tusLibraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js";
            script.onload = () => window.tus?.Upload ? resolve(true) : reject(new Error("TUS library is unavailable."));
            script.onerror = () => reject(new Error("Could not load upload library."));
            document.head.appendChild(script);
        }).catch(error => { tusLibraryPromise = null; throw error; });
    }

    return tusLibraryPromise;
}

async function standardUpload(file, path) {
    const result = await db.storage.from(VIDEO_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "video/mp4"
    });

    if (result.error) throw result.error;
    return result.data;
}

async function uploadVideoFile(file, path, progress) {
    if (!db) throw new Error("Supabase is not connected.");
    if (!file || !file.size) throw new Error("Invalid video file.");
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Maximum video size is 500 MB.");

    const sessionResult = await db.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;

    const session = sessionResult.data.session;
    if (!session?.access_token) throw new Error("Your session expired. Sign in again.");

    progress(0);

    try {
        await loadTusLibrary();
    } catch (error) {
        console.warn("TUS unavailable, using standard upload:", error.message);
        const data = await standardUpload(file, path);
        progress(100);
        return data;
    }

    const projectId = new URL(SUPABASE_URL).hostname.split(".")[0];
    const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

    try {
        return await new Promise((resolve, reject) => {
            const upload = new window.tus.Upload(file, {
                endpoint,
                retryDelays: [0, 3000, 5000, 10000],
                headers: { authorization: "Bearer " + session.access_token, apikey: SUPABASE_KEY },
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true,
                chunkSize: 6 * 1024 * 1024,
                metadata: {
                    bucketName: VIDEO_BUCKET,
                    objectName: path,
                    contentType: file.type || "video/mp4",
                    cacheControl: "3600"
                },
                onError: reject,
                onProgress: (done, total) => progress(Math.max(0, Math.min(99, Math.round(done / total * 100)))),
                onSuccess: () => { progress(100); resolve({ path, uploadURL: upload.url }); }
            });

            upload.start();
        });

    } catch (tusError) {
        // The resumable endpoint can fail for network or policy reasons. Try the standard route once.
        console.warn("TUS upload failed, retrying with standard upload:", tusError);
        progress(0);
        const data = await standardUpload(file, path);
        progress(100);
        return data;
    }
}


/* ---------- 23 PUBLISH VIDEO OR SHORT ---------- */

async function insertVideoRecord(record) {
    const data = { created_at: Date.now(), ...record };
    let result = await db.from("videos").insert({ id: crypto.randomUUID(), ...data });

    // If "id" is an auto-number column the UUID is rejected, so retry without it.
    if (result.error && /uuid|integer|bigint|identity|invalid input/i.test(result.error.message || "")) {
        result = await db.from("videos").insert(data);
    }

    return result;
}

listen("uploadForm", "submit", async function (event) {
    event.preventDefault();

    const file = exportedReelFile || selectedVideoFile;

    if (!file) return showToast("Select a video first.");
    if (file.size > MAX_VIDEO_BYTES) return showToast("Your video must be smaller than 500 MB.");
    if (!currentUser) return showToast("Please sign in before uploading.");

    const title = $("videoTitle")?.value.trim() || "";
    const description = $("videoDescription")?.value.trim() || "";
    const topic = $("videoTopic")?.value || "Other";

    if (!title) return showToast("Add a video title.");

    const button = $("publishVideoBtn");
    if (!button) return;

    button.disabled = true;
    button.textContent = "Uploading...";

    $("uploadProgress")?.classList.remove("hidden");
    if ($("uploadProgressBar")) $("uploadProgressBar").style.width = "0%";
    if ($("uploadStatus")) $("uploadStatus").textContent = "Preparing upload...";

    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const path = currentUser.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 10) + "." + ext;
    const mode = uploadMode;

    let uploaded = false;

    try {
        await uploadVideoFile(file, path, percent => {
            if ($("uploadProgressBar")) $("uploadProgressBar").style.width = percent + "%";
            if ($("uploadStatus")) $("uploadStatus").textContent = "Uploading: " + percent + "%";
        });

        uploaded = true;

        if ($("uploadStatus")) $("uploadStatus").textContent = "Saving details...";

        const insert = await insertVideoRecord({
            owner_id: currentUser.id,
            title,
            description,
            topic,
            storage_path: path,
            views: 0,
            is_short: mode === "short"
        });

        if (insert.error) throw insert.error;

        await loadVideos();

        homeVisibleCycles = 1;
        reelsVisible = Math.max(reelsVisible, PAGE_SIZE);

        addLocalNotification("video", (mode === "short" ? "Reel" : "Video") + " published: " + title);
        renderEverything();

        hideModal("uploadModal");
        resetUploadForm();
        showToast(mode === "short" ? "Reel published" : "Video published");

    } catch (error) {
        console.error("VIDEO UPLOAD ERROR:", error);

        // Remove the orphaned file if the database record could not be saved.
        if (uploaded) {
            const removal = await db.storage.from(VIDEO_BUCKET).remove([path]);
            if (removal.error) console.error("Could not remove failed upload:", removal.error);
        }

        let message = error?.message || error?.error_description || "Unknown upload error.";

        if (/row-level security|policy|not authorized|unauthorized/i.test(message)) {
            message += " (Check your Supabase storage and table policies.)";
        } else if (/bucket not found/i.test(message)) {
            message += " (Create a public bucket named \"" + VIDEO_BUCKET + "\".)";
        }

        if ($("uploadStatus")) $("uploadStatus").textContent = message;
        showToast("Upload failed: " + message);

    } finally {
        button.disabled = false;
        button.textContent = uploadMode === "short" ? "Publish Reel" : "Publish video";
    }
});


/* ---------- 24 POSTS ---------- */

listen("postImage", "change", function () {
    if ($("postImageName")) $("postImageName").textContent = this.files?.[0]?.name || "";
});

listen("createPostForm", "submit", async function (event) {
    event.preventDefault();
    if (!requireAuth("publish posts")) return;

    const content = $("postContent")?.value.trim() || "";
    const imageFile = $("postImage")?.files?.[0];

    if (!content && !imageFile) return showToast("Write something or add an image.");
    if (imageFile && !imageFile.type.startsWith("image/")) return showToast("Please select an image.");

    const button = this.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Posting..."; }

    let storagePath = null;

    try {
        if (imageFile) {
            storagePath = currentUser.id + "/" + Date.now() + "-" + imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");

            const upload = await db.storage.from(POST_BUCKET).upload(storagePath, imageFile, {
                upsert: false, contentType: imageFile.type
            });
            if (upload.error) throw upload.error;
        }

        // posts.created_at is TIMESTAMPTZ in the live database.
        // Let its DEFAULT now() populate the value instead of sending Date.now().
        const result = await db.from("posts").insert({
            user_id: currentUser.id,
            content,
            media_path: storagePath
        });
        if (result.error) throw result.error;

        $("postContent").value = "";
        $("postImage").value = "";
        if ($("postImageName")) $("postImageName").textContent = "";

        await loadPosts();
        addLocalNotification("post", "You published a post");
        renderEverything();
        showToast("Post published");

    } catch (error) {
        console.error("Post error:", error);

        if (storagePath) {
            const removal = await db.storage.from(POST_BUCKET).remove([storagePath]);
            if (removal.error) console.warn("Post cleanup:", removal.error);
        }

        showToast("Post failed: " + error.message);

    } finally {
        if (button) { button.disabled = false; button.textContent = "Post"; }
    }
});

async function togglePostLike(postId) {
    if (!requireAuth("like posts")) return;
    const post = posts.find(p => String(p.id) === String(postId));
    if (!post) return;

    post.likes = post.likes || [];
    const me = String(currentUser.id);
    const liked = post.likes.includes(me);

    try {
        const result = liked
            ? await db.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUser.id)
            : await db.from("post_likes").insert({ post_id: postId, user_id: currentUser.id });

        if (result.error) throw result.error;

        post.likes = liked ? post.likes.filter(id => id !== me) : [...post.likes, me];
        renderEverything();

    } catch (error) {
        showToast("Like failed: " + error.message);
    }
}

async function editPost(postId) {
    const post = posts.find(p => String(p.id) === String(postId));
    if (!post || String(post.user_id) !== String(currentUser.id)) return;

    const editedContent = prompt("Edit your post:", post.content || "");
    if (editedContent === null) return;

    const content = editedContent.trim();
    if (!content && !post.media_path) {
        showToast("A post needs text or an image.");
        return;
    }

    try {
        const result = await db.from("posts")
            .update({ content })
            .eq("id", postId)
            .eq("user_id", currentUser.id)
            .select("id")
            .maybeSingle();

        if (result.error) throw result.error;
        if (!result.data) throw new Error("No post was updated. Check your Supabase UPDATE policy.");

        await loadPosts();
        renderEverything();
        showToast("Post updated");
    } catch (error) {
        console.error("Post edit error:", error);
        showToast("Edit failed: " + error.message);
    }
}

async function deletePost(postId) {
    const post = posts.find(p => String(p.id) === String(postId));
    if (!post || !canManageContent(post.user_id)) return;
    if (!confirm("Delete this post permanently?")) return;

    try {
        const result = await db.from("posts").delete().eq("id", postId);
        if (result.error) throw result.error;

        if (post.media_path) {
            const removal = await db.storage.from(POST_BUCKET).remove([post.media_path]);
            if (removal.error) console.warn("Media cleanup:", removal.error);
        }

        await loadPosts();
        renderEverything();
        showToast("Post deleted");

    } catch (error) {
        showToast("Delete failed: " + error.message);
    }
}

function renderPosts() {
    const container = $("postsFeed");
    if (!container) return;
    $("guestPostPrompt")?.classList.toggle("hidden", !!currentUser);
    $("createPostForm")?.classList.toggle("hidden", !currentUser);

    container.innerHTML = posts.length
        ? posts.slice(0, postsVisible).map(postCard).join("")
        : "<div class='empty-card'><h3>No posts yet</h3><p>Share the first update.</p></div>";

    $("postsLoadMoreWrap")?.classList.toggle("hidden", postsVisible >= posts.length);
}

listen("postsLoadMore", "click", () => { postsVisible += PAGE_SIZE; renderPosts(); });


/* ---------- 25 PROFILE ---------- */

function openOtherProfile(userId) {
    currentProfileUserId = userId;
    profileMode = "home";
    openPage("profile");
}

function renderProfile() {
    const profileId = currentProfileUserId || currentUser?.id;
    if (!profileId) return;
    const profile = getUser(profileId) ||
        (String(currentProfile?.id) === String(profileId) ? currentProfile : null);

    if (!profile) return;

    const own = isOwnContent(profileId);

    if ($("profileUsername")) $("profileUsername").textContent = profile.username || "Creator";
    if ($("profileEmail")) $("profileEmail").textContent = own ? (currentUser?.email || "") : "";
    if ($("profileBio")) $("profileBio").textContent = profile.bio || "Welcome to GoCat.";
    paintAvatar("profileAvatar", profile.username, profile.avatar_path || "");

    if ($("profileActionBtn")) {
        $("profileActionBtn").textContent = own ? "Edit channel" : isFollowing(profileId) ? "Following" : "Follow";
        $("profileActionBtn").onclick = function () {
            if (own) {
                $("editUsername").value = profile.username || "";
                $("editBio").value = profile.bio || "";
                if ($("editAvatarFile")) $("editAvatarFile").value = "";
                if ($("editAvatarName")) $("editAvatarName").textContent = profile.avatar_path ? "Current photo saved" : "No photo selected";
                showModal("editProfileModal");
            } else {
                toggleFollow(profileId);
            }
        };
    }

    const mine = videos.filter(v => String(v.owner_id) === String(profileId));
    const regular = mine.filter(v => !isReel(v));
    const reels = mine.filter(isReel);
    const myPosts = posts.filter(p => String(p.user_id) === String(profileId));

    const set = (id, value) => { if ($(id)) $(id).textContent = value; };
    set("profileVideoCount", regular.length);
    set("profileReelCount", reels.length);
    set("profileFollowerCount", follows.filter(f => String(f.following_id) === String(profileId)).length);
    set("profileFollowingCount", follows.filter(f => String(f.follower_id) === String(profileId)).length);
    set("profilePostCount", myPosts.length);

    const none = text => `<div class="empty-card"><p>${text}</p></div>`;

    if ($("profileHome")) {
        $("profileHome").innerHTML = `
            <div class="section-heading"><h2>Latest videos</h2></div>
            ${regular.length ? `<div class="video-grid">${regular.slice(0, 3).map(videoCard).join("")}</div>` : none("No videos yet.")}
            <div class="section-heading"><h2>Latest Reels</h2></div>
            ${reels.length ? `<div class="shorts-grid">${reels.slice(0, 6).map(homeReelCard).join("")}</div>` : none("No Reels yet.")}
            <div class="section-heading"><h2>Community posts</h2></div>
            <div class="posts-column">${myPosts.length ? myPosts.slice(0, 3).map(postCard).join("") : none("No posts yet.")}</div>`;
    }

    if ($("profileReels")) $("profileReels").innerHTML = reels.length ? `<div class="shorts-grid">${reels.map(homeReelCard).join("")}</div>` : none("No Reels yet.");
    if ($("profileVideos")) $("profileVideos").innerHTML = regular.length ? `<div class="video-grid">${regular.map(videoCard).join("")}</div>` : none("No videos yet.");
    if ($("profilePosts")) $("profilePosts").innerHTML = `<div class="posts-column">${myPosts.length ? myPosts.map(postCard).join("") : none("No posts yet.")}</div>`;

    renderProfileTab(profileMode);
}

function renderProfileTab(tab) {
    profileMode = tab;

    document.querySelectorAll("[data-profile-tab]").forEach(b => {
        b.classList.toggle("active", b.dataset.profileTab === tab);
    });

    Object.entries({ home: "profileHome", reels: "profileReels", videos: "profileVideos", posts: "profilePosts" })
        .forEach(([name, id]) => $(id)?.classList.toggle("hidden", name !== tab));
}

document.querySelectorAll("[data-profile-tab]").forEach(button => {
    button.addEventListener("click", function () { renderProfileTab(this.dataset.profileTab); });
});

listen("editProfileForm", "submit", async function (event) {
    event.preventDefault();

    const username = $("editUsername")?.value.trim() || "";
    const bio = $("editBio")?.value.trim() || "";
    const avatarFile = $("editAvatarFile")?.files?.[0];

    if (username.length < 3) return showToast("Username must have at least 3 characters.");
    if (avatarFile && (!avatarFile.type.startsWith("image/") || avatarFile.size > 2 * 1024 * 1024)) {
        return showToast("Choose a JPG, PNG or WebP image under 2 MB.");
    }

    try {
        let avatarPath = currentProfile?.avatar_path || null;
        if (avatarFile) {
            avatarPath = currentUser.id + "/avatar-" + Date.now() + "." + (avatarFile.type.split("/")[1] || "jpg").replace("jpeg","jpg");
            const upload = await db.storage.from("profile-avatars").upload(avatarPath, avatarFile, { upsert: true, contentType: avatarFile.type });
            if (upload.error) throw upload.error;
        }
        const result = await db.from("users").update({ username, bio, avatar_path: avatarPath })
            .eq("id", currentUser.id).select("id,username,bio,avatar_path,created_at").single();
        if (result.error) throw result.error;

        currentProfile = result.data;
        await loadAllData();
        currentProfileUserId = currentUser.id;

        renderEverything();
        updateUserInterface();
        hideModal("editProfileModal");
        showToast("Channel updated");

    } catch (error) {
        showToast("Profile update failed: " + error.message);
    }
});


/* ---------- 26 CREATOR STUDIO ---------- */

async function renderStudio() {
    if (!currentUser) return;
    const mine = isGoCatAdmin ? videos : videos.filter(v => isOwnContent(v.owner_id));

    const set = (id, value) => { if ($(id)) $(id).textContent = value; };
    set("studioVideos", mine.length);
    set("studioViews", mine.reduce((s, v) => s + Number(v.views || 0), 0).toLocaleString());
    set("studioLikes", mine.reduce((s, v) => s + (v.likes?.length || 0), 0).toLocaleString());
    set("studioFollowers", follows.filter(f => String(f.following_id) === String(currentUser.id)).length.toLocaleString());

    const container = $("studioContent");
    if (!container) return;

    container.innerHTML = mine.length
        ? mine.map(video => `
            <div class="studio-content-item">
                <div class="studio-content-thumb">
                    <video src="${esc(getVideoURL(video.storage_path))}#t=0.1" muted preload="metadata"></video>
                </div>
                <div class="studio-content-details">
                    <strong>${esc(video.title)}</strong>
                    <small>${isReel(video) ? "Reel" : "Video"}, ${Number(video.views || 0)} views, ${video.likes?.length || 0} likes</small>
                    <small>By ${esc(getUsername(video.owner_id))}, ${formatDate(video.created_at)}</small>
                </div>
                <div class="studio-content-actions">
                    <button class="soft-btn" data-studio-watch="${esc(video.id)}">View</button>
                    <button class="danger-outline-btn" data-delete-video="${esc(video.id)}">Delete</button>
                </div>
            </div>`).join("")
        : `<div class="empty-card" style="border:0">
                <h3>No uploads yet</h3>
                <p>Your published videos and Reels will appear here.</p>
                <button class="primary-btn" data-open-upload="video">Upload video</button>
           </div>`;

    const chart = $("studioViewsChart");
    if (!chart) return;
    if (!mine.length) {
        chart.textContent = "Publish a video or Reel to start collecting view analytics.";
        set("studioAnalyticsTotal", "0");
        set("studioAnalyticsSummary", "");
        return;
    }

    const dates = Array.from({ length: 14 }, (_, index) =>
        new Date(Date.now() - (13 - index) * 86400000).toISOString().slice(0, 10)
    );
    try {
        const { data, error } = await db.from("video_views")
            .select("video_id,view_date")
            .in("video_id", mine.map(video => String(video.id)))
            .gte("view_date", dates[0])
            .lte("view_date", dates[13]);
        if (error) throw error;

        const counts = new Map(dates.map(date => [date, 0]));
        (data || []).forEach(row => {
            const date = String(row.view_date);
            if (counts.has(date)) counts.set(date, counts.get(date) + 1);
        });
        const values = dates.map(date => counts.get(date) || 0);
        const total = values.reduce((sum, value) => sum + value, 0);
        const peak = Math.max(1, ...values);
        chart.innerHTML = `<div class="studio-chart-bars" role="list">${dates.map((date, index) => {
            const value = values[index];
            const height = value ? Math.max(8, Math.round(value / peak * 100)) : 3;
            const label = new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
            const accessibleDate = new Date(date + "T00:00:00").toLocaleDateString();
            return `<div class="studio-chart-day" role="listitem" aria-label="${accessibleDate}: ${value} tracked views">
                <strong>${value || ""}</strong>
                <div class="studio-chart-track"><span style="height:${height}%"></span></div>
                <small>${label}</small>
            </div>`;
        }).join("")}</div>`;
        set("studioAnalyticsTotal", total.toLocaleString() + " views");
        const average = (total / 14).toFixed(1);
        const busiest = Math.max(...values);
        set("studioAnalyticsSummary", total
            ? "Daily average: " + average + " · Best day: " + busiest + " tracked views"
            : "No signed-in views have been recorded for your content in the last 14 days.");
    } catch (error) {
        console.warn("Creator analytics:", error.message);
        chart.textContent = "View trend data is temporarily unavailable.";
        set("studioAnalyticsTotal", "—");
        set("studioAnalyticsSummary", "Your overall view totals are still shown above.");
    }
}


/* ---------- 27 WATCH HISTORY AND VIEWS ---------- */

const getHistoryKey = () => "gocat_watch_history_" + (currentUser ? currentUser.id : "guest");

function getWatchHistory() {
    const saved = safeJSON(getHistoryKey(), []);
    return Array.isArray(saved) ? saved : [];
}

function saveWatchHistory(history) {
    try { localStorage.setItem(getHistoryKey(), JSON.stringify(history.slice(0, 300))); } catch {}
}

function addToWatchHistory(videoId) {
    if (!settings.history) return;

    const watchedAt = new Date().toISOString();
    const history = getWatchHistory().filter(i => String(i.id) !== String(videoId));
    history.unshift({ id: String(videoId), watched_at: watchedAt });
    saveWatchHistory(history);

    if (currentUser && db) {
        db.from("watch_history").upsert({
            user_id: String(currentUser.id),
            video_id: String(videoId),
            watched_at: watchedAt
        }, { onConflict: "user_id,video_id" }).then(({ error }) => {
            if (error) console.warn("Cloud watch history could not sync:", error.message);
        }).catch(error => console.warn("Cloud watch history sync:", error.message));
    }
}

function renderHistory() {
    const items = getWatchHistory()
        .map(entry => {
            const video = videos.find(v => String(v.id) === String(entry.id));
            return video ? { video, watched_at: entry.watched_at } : null;
        })
        .filter(Boolean);

    $("historyEmpty")?.classList.toggle("hidden", items.length > 0);

    const container = $("historyFeed");
    if (!container) return;

    container.innerHTML = items.map(({ video, watched_at }) => `
        <article class="history-item">
            <div class="history-thumb">
                <video src="${esc(getVideoURL(video.storage_path))}#t=0.1" muted preload="metadata"></video>
            </div>
            <div class="history-details">
                <h3>${esc(video.title)}</h3>
                <p>${esc(getUsername(video.owner_id))}</p>
                <p>${formatDate(watched_at)}, ${isReel(video) ? "Reel" : "Video"}</p>
            </div>
            <button class="icon-btn" data-remove-history="${esc(video.id)}" aria-label="Remove">${icon("close")}</button>
        </article>`).join("");
}

function removeHistoryItem(videoId) {
    saveWatchHistory(getWatchHistory().filter(i => String(i.id) !== String(videoId)));
    if (currentUser && db) {
        db.from("watch_history").delete()
            .eq("user_id", String(currentUser.id))
            .eq("video_id", String(videoId))
            .then(({ error }) => { if (error) console.warn("Cloud history removal:", error.message); });
    }
    renderHistory();
}

async function clearHistory() {
    if (!confirm("Clear all watch history for this account on every device?")) return;
    saveWatchHistory([]);
    renderHistory();
    if (currentUser && db) {
        const { error } = await db.from("watch_history").delete().eq("user_id", String(currentUser.id));
        if (error) {
            console.warn("Cloud history clear:", error.message);
            showToast("This device was cleared, but cloud history could not be cleared: " + error.message);
            return;
        }
    }
    showToast("Watch history cleared on your account");
}

listen("clearHistoryBtn", "click", clearHistory);
listen("settingsClearHistory", "click", clearHistory);

async function registerVideoView(videoId) {
    if (!currentUser || !videoId) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = "gocat_viewed_daily_" + currentUser.id;
    const viewed = safeJSON(key, {});
    if (viewed[String(videoId)] === today) return;
    const result = await db.from("video_views").insert({ video_id: String(videoId), user_id: String(currentUser.id) });
    if (result.error) {
        if (result.error.code === "23505") {
            viewed[String(videoId)] = today;
            try { localStorage.setItem(key, JSON.stringify(viewed)); } catch {}
        } else {
            console.warn("View tracking:", result.error.message);
        }
        return;
    }
    viewed[String(videoId)] = today;
    try { localStorage.setItem(key, JSON.stringify(viewed)); } catch {}
    const video = videos.find(v => String(v.id) === String(videoId));
    if (video) video.views = Number(video.views || 0) + 1;
    renderStudio();
    document.querySelectorAll("[data-play-video='" + CSS.escape(String(videoId)) + "']").forEach(el => {
        const card = el.closest(".video-card");
        const viewLabel = card?.querySelector(".video-sub span");
        if (viewLabel) viewLabel.textContent = compact(video?.views || 0) + " views";
    });
}

document.addEventListener("play", function (event) {
    const element = event.target;
    if (!(element instanceof HTMLVideoElement)) return;

    const videoId = element.dataset.playVideo;
    if (!videoId) return;

    activePlaybackVideoId = String(videoId);
    addToWatchHistory(videoId);
    if (currentUser) registerVideoView(videoId);
}, true);

document.addEventListener("ended", function (event) {
    const element = event.target;
    if (!(element instanceof HTMLVideoElement)) return;
    const videoId = element.dataset.playVideo;
    if (!videoId || String(videoId) !== activePlaybackVideoId) return;

    activePlaybackVideoId = null;
    if (liveRenderPending) queueLiveRefresh(0);
}, true);


/* ---------- 28 MESSAGES ---------- */

function getMutualFriends() {
    if (!currentUser) return [];
    const me = String(currentUser.id);
    const following = follows.filter(f => String(f.follower_id) === me).map(f => String(f.following_id));
    const followers = follows.filter(f => String(f.following_id) === me).map(f => String(f.follower_id));

    return users.filter(u => !isOwnContent(u.id) && following.includes(String(u.id)) && followers.includes(String(u.id)));
}

function renderChatFriends() {
    const container = $("chatFriends");
    if (!container) return;

    const count = $("chatThreadCount");
    if (!currentUser) {
        if (count) count.textContent = "0";
        container.innerHTML = `
            <div class="chat-list-empty">
                <span class="chat-list-empty-icon">✉</span>
                <strong>Your inbox is waiting</strong>
                <p>Sign in to message creators who follow you back.</p>
                <button class="soft-btn" type="button" data-login-trigger>Sign in</button>
            </div>`;
        return;
    }

    const search = $("chatSearch")?.value.trim().toLowerCase() || "";
    const friends = getMutualFriends().filter(user =>
        String(user.username || "").toLowerCase().includes(search)
    );

    if (count) count.textContent = String(friends.length);

    container.innerHTML = friends.length
        ? friends.map(user => `
            <button class="chat-friend ${String(currentChatUserId) === String(user.id) ? "active" : ""}"
                data-chat-user="${esc(user.id)}" aria-label="Open chat with ${esc(user.username)}">
                <span class="chat-friend-avatar" style="${avatarBg(user.username)}">
                    ${user.avatar_path
                        ? `<img src="${esc(storageURL("profile-avatars", user.avatar_path))}" alt="" loading="lazy">`
                        : esc(initial(user.username))}
                </span>
                <span class="chat-friend-copy">
                    <strong>${esc(user.username)}</strong>
                    <small>Mutual connection</small>
                </span>
                <span class="chat-friend-arrow" aria-hidden="true">›</span>
            </button>`).join("")
        : `
            <div class="chat-list-empty">
                <span class="chat-list-empty-icon">◎</span>
                <strong>No conversations found</strong>
                <p>Chat opens when you and another creator follow each other.</p>
            </div>`;
}

async function openChat(userId) {
    if (!requireAuth("chat")) return;
    if (!getMutualFriends().some(u => String(u.id) === String(userId))) {
        return showToast("Chat is available to mutual followers.");
    }

    currentChatUserId = userId;
    if (chatRealtimeChannel) db.removeChannel(chatRealtimeChannel);
    const channelName = "gocat-chat-" + [String(currentUser.id), String(userId)].sort().join("-");
    chatRealtimeChannel = db.channel(channelName, { config: { presence: { key: String(currentUser.id) } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, payload => {
            const row = payload.new || payload.old || {};
            if ([String(row.sender_id), String(row.recipient_id)].includes(String(currentUser.id)) &&
                [String(row.sender_id), String(row.recipient_id)].includes(String(currentChatUserId))) loadMessages();
        })
        .on("presence", { event: "sync" }, () => {
            const state = chatRealtimeChannel.presenceState();
            const online = !!state[String(userId)]?.length;
            if ($("chatPresence")) $("chatPresence").textContent = online ? "Online" : "Offline";
        })
        .on("broadcast", { event: "typing" }, event => {
            const info = event.payload || {};
            if (String(info.userId) === String(currentUser.id)) return;
            if ($("chatTypingStatus")) $("chatTypingStatus").textContent = info.typing ? (getUsername(userId) + " is typing…") : "";
            clearTimeout(chatTypingTimer);
            if (info.typing) chatTypingTimer = setTimeout(() => {
                if ($("chatTypingStatus")) $("chatTypingStatus").textContent = "";
            }, 2200);
        })
        .subscribe(async status => {
            if (status === "SUBSCRIBED") {
                await chatRealtimeChannel.track({
                    userId: String(currentUser.id),
                    username: currentProfile?.username || "Creator",
                    online_at: new Date().toISOString()
                });
            }
        });

    const chatUser = users.find(user => String(user.id) === String(userId));
    if ($("chatTitle")) $("chatTitle").textContent = getUsername(userId);
    if ($("chatHeaderAvatar")) {
        $("chatHeaderAvatar").innerHTML = chatUser?.avatar_path
            ? `<img src="${esc(storageURL("profile-avatars", chatUser.avatar_path))}" alt="">`
            : esc(initial(chatUser?.username || getUsername(userId)));
    }
    if ($("chatPresence")) $("chatPresence").textContent = "Connecting…";
    if ($("chatTypingStatus")) $("chatTypingStatus").textContent = "";
    if ($("messageInput")) $("messageInput").disabled = false;
    if ($("sendMessageBtn")) $("sendMessageBtn").disabled = false;
    renderChatFriends();
    await loadMessages();
}

async function loadMessages() {
    if (!currentUser || !currentChatUserId) return;
    const container = $("chatMessages");
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 90;
    const filter =
        "and(sender_id.eq." + currentUser.id + ",recipient_id.eq." + currentChatUserId + ")," +
        "and(sender_id.eq." + currentChatUserId + ",recipient_id.eq." + currentUser.id + ")";
    const result = await db.from("messages").select("*").or(filter).order("created_at", { ascending: true }).limit(200);
    if (result.error) {
        console.error(result.error);
        container.innerHTML = `
            <div class="chat-empty-state">
                <span class="chat-empty-icon">!</span>
                <strong>Messages could not load</strong>
                <p>Check the messages table and its access policies, then try again.</p>
            </div>`;
        return;
    }
    const messages = result.data || [];
    container.innerHTML = messages.length ? messages.map(m => {
        const mine = String(m.sender_id) === String(currentUser.id);
        const body = esc(m.content ?? m.text ?? "").replace(/\n/g, "<br>");
        return '<div class="chat-bubble ' + (mine ? "mine" : "") + '">' +
            body + '<time>' + formatDate(m.created_at) + " " + (mine ? (m.is_read ? "· Seen" : "· Sent") : "") + '</time></div>';
    }).join("") : `
        <div class="chat-empty-state">
            <span class="chat-empty-icon">✦</span>
            <strong>Start the conversation</strong>
            <p>Send a message to say hello. Only you and this creator can see this chat.</p>
        </div>`;
    if (nearBottom) container.scrollTop = container.scrollHeight;

    const unread = messages.filter(m => String(m.recipient_id) === String(currentUser.id) && !m.is_read).map(m => m.id);
    if (unread.length) {
        const readResult = await db.from("messages").update({ is_read: true, read_at: new Date().toISOString() })
            .in("id", unread).eq("recipient_id", currentUser.id);
        if (readResult.error) console.warn("Read receipts:", readResult.error.message);
    }
}

listen("chatSearch", "input", renderChatFriends);
listen("messageInput", "input", function () {
    if (!chatRealtimeChannel || !currentChatUserId || !currentUser) return;
    chatRealtimeChannel.send({ type: "broadcast", event: "typing", payload: { userId: String(currentUser.id), typing: !!this.value.trim() } });
});
listen("messageInput", "keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        $("chatForm")?.requestSubmit();
    }
});
document.querySelectorAll("[data-chat-emoji]").forEach(button => {
    button.addEventListener("click", () => {
        if (!requireAuth("chat")) return;
        const input = $("messageInput");
        if (!input) return;
        input.value += button.dataset.chatEmoji || "";
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
});

listen("chatForm", "submit", async function (event) {
    event.preventDefault();
    if (!requireAuth("send messages")) return;

    const text = $("messageInput")?.value.trim() || "";
    if (!text || !currentChatUserId) return;

    const button = $("sendMessageBtn");
    if (button) button.disabled = true;

    try {
        const result = await insertWithTextFallback(
            "messages",
            { sender_id: currentUser.id, recipient_id: currentChatUserId },
            text, "text", "content"
        );
        if (result.error) throw result.error;

        $("messageInput").value = "";
        await loadMessages();
        if (chatRealtimeChannel) chatRealtimeChannel.send({
            type: "broadcast", event: "typing",
            payload: { userId: String(currentUser.id), typing: false }
        });

    } catch (error) {
        showToast("Message failed: " + error.message);

    } finally {
        if (button) button.disabled = false;
    }
});


/* ---------- 29 NOTIFICATIONS ---------- */

async function loadAccountPersistence() {
    if (!currentUser || !db) return;

    const userId = String(currentUser.id);
    const [historyResult, notificationResult] = await Promise.all([
        db.from("watch_history").select("video_id,watched_at")
            .eq("user_id", userId).order("watched_at", { ascending: false }).limit(300),
        db.from("gocat_notifications").select("id,icon,message,created_at,is_read")
            .eq("user_id", userId).order("created_at", { ascending: false }).limit(100)
    ]);

    if (historyResult.error) console.warn("Cloud history load:", historyResult.error.message);
    if (notificationResult.error) console.warn("Cloud notifications load:", notificationResult.error.message);

    if (!historyResult.error) {
        const cloudRows = historyResult.data || [];
        const known = new Map(cloudRows.map(row => [String(row.video_id), row]));
        const localRows = getWatchHistory().filter(row =>
            row && row.id && videos.some(video => String(video.id) === String(row.id))
        );

        for (const row of localRows) {
            const key = String(row.id);
            const cloud = known.get(key);
            if (!cloud || new Date(row.watched_at || 0).getTime() > new Date(cloud.watched_at || 0).getTime()) {
                const merged = { user_id: userId, video_id: key, watched_at: row.watched_at || new Date().toISOString() };
                known.set(key, merged);
                const { error } = await db.from("watch_history").upsert(merged, { onConflict: "user_id,video_id" });
                if (error) console.warn("Legacy watch history migration:", error.message);
            }
        }

        const mergedHistory = Array.from(known.values())
            .sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at))
            .slice(0, 300)
            .map(row => ({ id: String(row.video_id), watched_at: row.watched_at }));
        saveWatchHistory(mergedHistory);
    }

    if (notificationResult.error) {
        notifications = safeJSON("gocat_notifications_" + userId, []);
    } else {
        const cloudRows = notificationResult.data || [];
        const known = new Set(cloudRows.map(row => String(row.id)));
        const localRows = safeJSON("gocat_notifications_" + userId, []);
        for (const item of localRows.slice(0, 100)) {
            if (!item?.id || known.has(String(item.id))) continue;
            const { error } = await db.from("gocat_notifications").insert({
                id: item.id,
                user_id: userId,
                icon: item.icon || "bell",
                message: item.text || "",
                created_at: item.created_at || new Date().toISOString(),
                is_read: !!item.is_read
            });
            if (error && error.code !== "23505") console.warn("Legacy notification migration:", error.message);
        }

        const byId = new Map();
        cloudRows.forEach(item => byId.set(String(item.id), {
            id: String(item.id), icon: item.icon || "bell",
            text: item.message || "", created_at: item.created_at, is_read: !!item.is_read
        }));
        localRows.forEach(item => {
            if (item?.id && !byId.has(String(item.id))) byId.set(String(item.id), item);
        });
        notifications = Array.from(byId.values())
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, 100);
        try { localStorage.setItem("gocat_notifications_" + userId, JSON.stringify(notifications)); } catch {}
    }
}

function addLocalNotification(iconName, text) {
    if (!currentUser) return;

    const item = {
        id: crypto.randomUUID(),
        icon: iconName,
        text,
        created_at: new Date().toISOString(),
        is_read: false
    };
    notifications.unshift(item);
    notifications = notifications.slice(0, 100);
    try { localStorage.setItem("gocat_notifications_" + currentUser.id, JSON.stringify(notifications)); } catch {}

    if (db) {
        db.from("gocat_notifications").insert({
            id: item.id,
            user_id: String(currentUser.id),
            icon: iconName,
            message: text,
            created_at: item.created_at,
            is_read: false
        }).then(({ error }) => {
            if (error) console.warn("Cloud notification could not sync:", error.message);
        }).catch(error => console.warn("Cloud notification sync:", error.message));
    }
}

function renderNotifications() {
    const container = $("notificationList");
    if (!container) return;

    container.innerHTML = notifications.length
        ? notifications.map(item => `
            <div class="notification-item">
                <div class="notification-icon">${icon(item.icon)}</div>
                <div>
                    <p>${esc(item.text)}</p>
                    <small>${formatDate(item.created_at)}</small>
                </div>
            </div>`).join("")
        : "<div class='empty-card'><h3>Nothing new</h3><p>Your activity will show up here.</p></div>";
}

listen("clearNotificationsBtn", "click", async function () {
    if (!currentUser) return;
    notifications = [];
    try { localStorage.setItem("gocat_notifications_" + currentUser.id, "[]"); } catch {}
    renderNotifications();
    const { error } = await db.from("gocat_notifications").delete().eq("user_id", String(currentUser.id));
    if (error) showToast("Notifications cleared here, but cloud sync failed: " + error.message);
});



/* ---------- OWNER ADMIN PANEL ---------- */
async function renderAdminPanel() {
    if (!currentUser || !isGoCatAdmin) {
        showToast("This page is only available to the GoCat owner.");
        return openPage("home");
    }
    const userCount = $("adminUserCount");
    const videoCount = $("adminVideoCount");
    const postCount = $("adminPostCount");
    if (userCount) userCount.textContent = users.length;
    if (videoCount) videoCount.textContent = videos.length;
    if (postCount) postCount.textContent = posts.length;
    const search = ($("adminUserSearch")?.value || "").trim().toLowerCase();
    const list = $("adminUserList");
    if (!list) return;
    const shown = users.filter(u => (u.username || "").toLowerCase().includes(search));
    list.innerHTML = shown.map(u => {
        const banned = !!u.is_banned;
        return '<div class="admin-user-row"><div><strong>' + esc(u.username || "Creator") + '</strong><small>' + (banned ? 'Suspended' : 'Active') + '</small></div><div class="admin-user-actions">' +
          '<button class="soft-btn" data-admin-edit-user="' + esc(u.id) + '">Edit profile</button>' +
          (String(u.id) === String(currentUser.id) ? '' : '<button class="' + (banned ? 'soft-btn' : 'danger-outline-btn') + '" data-admin-ban-user="' + esc(u.id) + '" data-ban-state="' + (banned ? 'true' : 'false') + '">' + (banned ? 'Unban' : 'Ban') + '</button>') +
          '</div></div>';
    }).join("") || '<p class="muted-text">No creators match that search.</p>';
}
listen("adminRefreshBtn", "click", async () => {
    if (!isGoCatAdmin) return;
    try { await loadAllData(); renderAdminPanel(); showToast("Admin data refreshed"); }
    catch (error) { showToast("Refresh failed: " + error.message); }
});
listen("adminUserSearch", "input", renderAdminPanel);
document.addEventListener("click", async event => {
    const edit = event.target.closest("[data-admin-edit-user]");
    const ban = event.target.closest("[data-admin-ban-user]");
    if (!edit && !ban) return;
    if (!isGoCatAdmin) return showToast("Admin access required.");
    if (edit) {
        const user = users.find(u => String(u.id) === String(edit.dataset.adminEditUser));
        if (!user) return;
        const username = prompt("Edit creator username:", user.username || "");
        if (username === null) return;
        const bio = prompt("Edit creator bio:", user.bio || "");
        if (bio === null) return;
        try {
            const result = await db.from("users").update({ username: username.trim(), bio: bio.trim() }).eq("id", user.id);
            if (result.error) throw result.error;
            await loadUsers(); renderEverything(); renderAdminPanel();
            showToast("Creator profile updated.");
        } catch (error) { showToast("Profile update failed: " + error.message); }
    }
    if (ban) {
        const user = users.find(u => String(u.id) === String(ban.dataset.adminBanUser));
        if (!user) return;
        const shouldBan = ban.dataset.banState !== "true";
        const reason = shouldBan ? prompt("Reason for suspending " + user.username + " (optional):", "Community guidelines") : null;
        if (shouldBan && reason === null) return;
        if (!confirm((shouldBan ? "Suspend " : "Restore ") + user.username + "?")) return;
        try {
            const result = await db.rpc("gocat_admin_set_ban", { target_user_id: String(user.id), should_ban: shouldBan, reason });
            if (result.error) throw result.error;
            await loadUsers(); renderAdminPanel();
            showToast(shouldBan ? "Creator suspended." : "Creator restored.");
        } catch (error) { showToast("Moderation failed: " + error.message); }
    }
});

/* ---------- 30 RENDERING AND NAVIGATION ---------- */

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

const allowedPages = ["home", "reels", "explore", "following", "history", "posts", "chats", "notifications", "studio", "profile", "settings", "admin"];

function closeSidebar() {
    $("sidebar")?.classList.remove("open");
    $("sidebarScrim")?.classList.remove("show");
    $("mobileMenuBtn")?.setAttribute("aria-expanded", "false");
}

function openPage(page) {
    if (!allowedPages.includes(page)) return;
    const privatePages = ["following", "chats", "notifications", "studio"];
    if (privatePages.includes(page) && !requireAuth("open " + page)) return;
    if (page === "profile" && !currentProfileUserId) {
        if (!currentUser) return requireAuth("open your channel");
        currentProfileUserId = currentUser.id;
    }

    const previousPage = currentPage;
    const hadPendingLiveRefresh = liveRenderPending;

    if (previousPage !== page) {
        // Stop hidden-page playback and release any refresh that was deferred for it.
        document.getElementById("page-" + previousPage)?.querySelectorAll("video").forEach(video => video.pause());
        activePlaybackVideoId = null;
        liveRenderPending = false;
    } else if (activePlaybackVideoId) {
        // Clicking the already-open navigation item must not restart the current video.
        closeSidebar();
        return;
    }

    currentPage = page;

    document.querySelectorAll(".page-section").forEach(s => s.classList.toggle("hidden", s.id !== "page-" + page));
    document.querySelectorAll("[data-page]").forEach(b => {
        if (b.classList.contains("nav-link") || b.classList.contains("mobile-nav-btn")) {
            b.classList.toggle("active", b.dataset.page === page);
        }
    });

    closeSidebar();
    renderCurrentPage();
    if (previousPage !== page && hadPendingLiveRefresh) queueLiveRefresh(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCurrentPage() {
    const map = {
        home: renderHomeFeed, reels: renderReels, explore: renderExplore, following: renderFollowing,
        history: renderHistory, posts: renderPosts, chats: renderChatFriends,
        notifications: renderNotifications, studio: renderStudio, profile: renderProfile, settings: renderSettings
    };
    map[currentPage]?.();
    if (currentPage === "admin") renderAdminPanel();
}

document.addEventListener("click", function (event) {
    const nav = event.target.closest("[data-page]");
    if (!nav) return;
    event.preventDefault();
    if (nav.dataset.page === "profile" && currentUser && !currentProfileUserId) {
        currentProfileUserId = currentUser.id;
        profileMode = "home";
    }
    openPage(nav.dataset.page);
});

listen("topProfileBtn", "click", function () {
    if (!currentUser) return openLoginScreen();
    currentProfileUserId = currentUser.id;
    profileMode = "home";
    openPage("profile");
});

listen("mobileMenuBtn", "click", () => {
    const isOpen = $("sidebar")?.classList.toggle("open") || false;
    $("sidebarScrim")?.classList.toggle("show", isOpen);
    $("mobileMenuBtn")?.setAttribute("aria-expanded", String(isOpen));
});
listen("sidebarScrim", "click", closeSidebar);


/* ---------- 31 SEARCH, THEME, SETTINGS, REFRESH ---------- */

listen("searchInput", "input", function () {
    $("clearSearch")?.classList.toggle("hidden", !this.value.trim());

    homeVisibleCycles = 1;
    exploreVisible = 6;

    if (currentPage === "home") renderHomeFeed();
    if (currentPage === "explore") renderExplore();
});

listen("clearSearch", "click", function () {
    if ($("searchInput")) $("searchInput").value = "";
    this.classList.add("hidden");

    homeVisibleCycles = 1;
    exploreVisible = 6;

    renderHomeFeed();
    renderExplore();
});

listen("themeBtn", "click", function () {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    saveSettings();
    applyTheme();
});

function renderSettings() {
    applyTheme();
    if ($("settingAutoplay")) $("settingAutoplay").checked = settings.autoplay;
    if ($("settingMuted")) $("settingMuted").checked = settings.muted;
    if ($("settingHistory")) $("settingHistory").checked = settings.history;
    if ($("settingsUsername")) $("settingsUsername").textContent = currentProfile?.username || "Creator";
    if ($("settingsEmail")) $("settingsEmail").textContent = currentUser?.email || "";
    paintAvatar("settingsAvatar", currentProfile?.username, currentProfile?.avatar_path || "");
    if ($("settingAutoplay")) $("settingAutoplay").checked = settings.autoplay;
    if ($("settingMuted")) $("settingMuted").checked = settings.muted;
    if ($("settingHistory")) $("settingHistory").checked = settings.history;
}

listen("settingTheme", "change", function () { settings.theme = this.value; saveSettings(); applyTheme(); });
listen("settingAutoplay", "change", function () { settings.autoplay = this.checked; saveSettings(); renderReels(); });
listen("settingMuted", "change", function () { settings.muted = this.checked; saveSettings(); renderReels(); });
listen("settingHistory", "change", function () {
    settings.history = this.checked;
    saveSettings();
    showToast(settings.history ? "Watch history on" : "Watch history paused");
});

listen("resetSettingsBtn", "click", function () {
    settings = { theme: systemTheme(), autoplay: true, muted: true, history: true };
    saveSettings();
    applySettings();
    renderSettings();
    renderReels();
    showToast("Preferences reset");
});

listen("refreshFeedBtn", "click", async function () {
    this.disabled = true;

    try {
        await loadAllData();
        homeVisibleCycles = 1;
        renderEverything();
        showToast("Feed refreshed");
    } catch (error) {
        console.error(error);
        showToast("Refresh failed: " + error.message);
    } finally {
        this.disabled = false;
    }
});


/* ---------- 32 MODALS AND GLOBAL ACTIONS ---------- */

document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", function () {
        if (this.dataset.close === "editorModal") closeEditor();
        else hideModal(this.dataset.close);
    });
});

document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    ["commentsModal", "editProfileModal", "uploadModal"].forEach(hideModal);
    closeAuthModal();
    closeSidebar();
});

document.addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button) return;
    const d = button.dataset;

    if (d.followUser) return toggleFollow(d.followUser);
    if (d.likeVideo) return toggleVideoLike(d.likeVideo);
    if (d.commentsVideo) return openComments(d.commentsVideo);
    if (d.shareVideo) return shareVideo(d.shareVideo);
    if (d.deleteVideo) { if (requireAuth("manage videos")) deleteVideo(d.deleteVideo); return; }
    if (d.profileUser) return openOtherProfile(d.profileUser);
    if (d.chatUser) return openChat(d.chatUser);
    if (d.likePost) return togglePostLike(d.likePost);
    if (d.commentsPost) return openPostComments(d.commentsPost);
    if (d.replyComment) { if (requireAuth("reply to comments")) beginCommentReply(d.replyComment); return; }
    if (d.deleteComment) { if (requireAuth("delete comments")) deleteComment(d.deleteComment); return; }
    if (d.editPost) { if (requireAuth("edit posts")) editPost(d.editPost); return; }
    if (d.deletePost) { if (requireAuth("delete posts")) deletePost(d.deletePost); return; }
    if (d.openReelId) return openSpecificReel(d.openReelId);
    if (button.hasAttribute("data-create-short")) return openUpload("short");
    if (d.removeHistory) return removeHistoryItem(d.removeHistory);
    if (d.goPage) {
        if (d.goPage === "profile" && currentUser) { currentProfileUserId = currentUser.id; profileMode = "home"; }
        return openPage(d.goPage);
    }
    if (d.studioWatch) {
        if (!requireAuth("open Creator Studio")) return;
        const video = videos.find(v => String(v.id) === String(d.studioWatch));
        if (video && isReel(video)) openSpecificReel(video.id);
        else { openPage("home"); scrollToVideo(d.studioWatch); }
    }
});


/* ---------- 33 SIGN OUT AND SESSION ---------- */

async function signOutGoCat() {
    if (!db) return;

    try {
        const result = await db.auth.signOut();
        if (result.error) throw result.error;

        currentUser = currentProfile = currentProfileUserId = currentChatUserId = currentCommentVideoId = currentCommentPostId = null;
        isGoCatAdmin = false;
        users = []; videos = []; posts = []; follows = []; notifications = [];
        if (chatRealtimeChannel) db.removeChannel(chatRealtimeChannel);
        chatRealtimeChannel = null;
        await startGuestGoCat();
        showToast("Signed out. You are browsing as a guest.");

    } catch (error) {
        showToast("Sign out failed: " + error.message);
    }
}

listen("logoutBtn", "click", signOutGoCat);
listen("settingsLogout", "click", signOutGoCat);

if (db) {
    db.auth.onAuthStateChange(event => {
        if (event === "SIGNED_OUT" && currentUser) {
            currentUser = currentProfile = currentProfileUserId = currentChatUserId = null;
            isGoCatAdmin = false;
            startGuestGoCat();
        }
    });
}


/* ---------- 34 INITIALIZE ---------- */

const withTimeout = (promise, ms, message) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
]);

async function initializeGoCat() {
    const loader = $("loader");

    try {
        if (!db) throw new Error("The Supabase library failed to load. Check your internet connection.");

        const sessionResult = await withTimeout(db.auth.getSession(), 15000, "Supabase connection timed out.");
        if (sessionResult.error) throw sessionResult.error;

        const session = sessionResult.data.session;

        if (session?.user) {
            currentUser = session.user;
            await withTimeout(startGoCat(), 25000, "Loading timed out. Check your Supabase permissions.");
        } else {
            await startGuestGoCat();
        }

    } catch (error) {
        console.error("GOCAT STARTUP ERROR:", error);
        updateUserInterface();
        openApp();
        // The Supabase SDK or session request may fail; still show the Home shell.
        try {
            openPage("home");
        } catch (pageError) {
            console.warn("Could not render Home during fallback startup:", pageError);
            currentPage = "home";
            document.getElementById("page-home")?.classList.remove("hidden");
        }
        showToast("GoCat opened in guest mode. Some content may be unavailable: " + (error.message || error));

    } finally {
        loader?.classList.add("hide");
    }
}

// Paste an image directly into the post composer with Ctrl+V.
document.addEventListener("paste", function (event) {
    if (currentPage !== "posts") return;
    if (!currentUser) {
        if (Array.from(event.clipboardData?.items || []).some(item => item.type.startsWith("image/"))) requireAuth("create posts");
        return;
    }
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    const extension = file.type.split("/")[1] || "png";
    const pasted = new File([file], "gocat-pasted-image." + extension, { type: file.type });
    const transfer = new DataTransfer();
    transfer.items.add(pasted);
    if ($("postImage")) $("postImage").files = transfer.files;
    if ($("postImageName")) $("postImageName").textContent = "Pasted image ready";
    showToast("Image pasted into your post");
});

// Keyboard shortcuts: / or Ctrl+K search, M mute Reels, J/L seek, K/Space play-pause.
document.addEventListener("keydown", function (event) {
    const tag = event.target?.tagName;
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable;
    if (typing) return;
    if ((event.key === "/" || (event.ctrlKey && event.key.toLowerCase() === "k")) && !event.altKey) {
        event.preventDefault(); $("searchInput")?.focus(); return;
    }
    if (event.key.toLowerCase() === "m") {
        settings.muted = !settings.muted; saveSettings();
        document.querySelectorAll(".reel-video").forEach(applyReelAudioPreference);
        updateReelSoundButtons();
        showToast(settings.muted ? "Reels muted" : "Reels sound on"); return;
    }
    const video = event.target.closest?.("video") || document.querySelector(".reel-item video") || document.querySelector(".video-player");
    if (!video) return;
    if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault(); if (video.paused) video.play().catch(()=>{}); else video.pause();
    } else if (event.key.toLowerCase() === "j") {
        video.currentTime = Math.max(0, video.currentTime - 10);
    } else if (event.key.toLowerCase() === "l") {
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault(); video.volume = Math.min(1, Math.max(0, video.volume + (event.key === "ArrowUp" ? 0.05 : -0.05)));
    }
});

window.addEventListener("beforeunload", function () {
    if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
    if (editorMusicObjectURL) URL.revokeObjectURL(editorMusicObjectURL);
});

initializeGoCat();
