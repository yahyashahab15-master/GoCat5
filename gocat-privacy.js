/* GoCat privacy and account settings. Loaded after randomgo.js so it can use the
   existing app state and Supabase client without introducing another framework. */
"use strict";

const PRIVATE_VIDEO_BUCKET = "gocat-private-videos";
let followRequests = [];
const privateMediaUrls = new Map();

function privacyCompact(value) {
    let number = Number(value || 0);
    if (!Number.isFinite(number)) return "0";
    if (Math.abs(number) < 1000) return String(Math.round(number));
    const units = ["", "K", "M", "B", "T"];
    let unit = 0;
    number = Math.abs(number);
    while (number >= 1000 && unit < units.length - 1) {
        number /= 1000;
        unit++;
    }
    const digits = number >= 100 ? 0 : 1;
    return number.toFixed(digits).replace(/\.0$/, "") + units[unit];
}

const PRIVACY_COLUMNS = [
    "id", "is_private", "show_followers", "show_following",
    "allow_messages_from", "allow_comments_from", "show_activity_status",
    "send_read_receipts", "account_discoverable", "default_video_visibility"
].join(",");

async function loadPrivacyFieldsForUsers() {
    if (!users.length) return;
    const result = await db.from("users").select(PRIVACY_COLUMNS)
        .in("id", users.map(user => String(user.id)));
    if (result.error) throw result.error;
    const fields = new Map((result.data || []).map(row => [String(row.id), row]));
    users = users.map(user => ({ ...user, ...(fields.get(String(user.id)) || {}) }));
    if (currentProfile) {
        currentProfile = { ...currentProfile, ...(fields.get(String(currentProfile.id)) || {}) };
    }
}

const originalLoadUsersForPrivacy = loadUsers;
loadUsers = async function () {
    await originalLoadUsersForPrivacy();
    await loadPrivacyFieldsForUsers();
};

const originalEnsureProfileForPrivacy = ensureProfile;
ensureProfile = async function () {
    await originalEnsureProfileForPrivacy();
    const result = await db.from("users").select(PRIVACY_COLUMNS)
        .eq("id", String(currentUser.id)).maybeSingle();
    if (result.error) throw result.error;
    if (result.data) currentProfile = { ...currentProfile, ...result.data };
};

async function loadFollowRequests() {
    if (!currentUser) {
        followRequests = [];
        return;
    }
    const result = await db.from("gocat_follow_requests")
        .select("id,requester_id,target_id,status,created_at")
        .order("created_at", { ascending: false });
    if (result.error) throw result.error;
    followRequests = result.data || [];
}

function getPrivacyFollowRequest(userId) {
    if (!currentUser) return null;
    return followRequests.find(row =>
        String(row.requester_id) === String(currentUser.id) &&
        String(row.target_id) === String(userId)
    ) || null;
}

function getPrivacyFollowLabel(userId) {
    if (isFollowing(userId)) return "Following";
    if (getPrivacyFollowRequest(userId)?.status === "pending") return "Requested";
    return getUser(userId)?.is_private === true ? "Request to follow" : "Follow";
}

async function signPrivateGoCatMedia() {
    privateMediaUrls.clear();
    if (!currentUser || !videos.length) return;
    const paths = [];
    videos.forEach(video => {
        if (video.visibility === "private" || video.visibility === "followers") {
            [video.storage_path, video.thumbnail_path].forEach(path => {
                if (path && !window.GoCatMedia?.isRemoteUrl(path)) paths.push(String(path));
            });
        }
    });
    await Promise.all([...new Set(paths)].map(async path => {
        try {
            const result = await db.storage.from(PRIVATE_VIDEO_BUCKET).createSignedUrl(path, 3600);
            if (!result.error && result.data?.signedUrl) privateMediaUrls.set(path, result.data.signedUrl);
        } catch (error) {
            console.warn("Private GoCat media URL:", error?.message || error);
        }
    }));
}

const originalStorageUrlForPrivacy = storageURL;
storageURL = function (bucket, path) {
    if (bucket === VIDEO_BUCKET && privateMediaUrls.has(String(path || ""))) {
        return privateMediaUrls.get(String(path || ""));
    }
    return originalStorageUrlForPrivacy(bucket, path);
};

const originalLoadVideosForPrivacy = loadVideos;
loadVideos = async function () {
    await originalLoadVideosForPrivacy();
    await signPrivateGoCatMedia();
};

const originalLoadAllDataForPrivacy = loadAllData;
loadAllData = async function () {
    const failures = await originalLoadAllDataForPrivacy();
    try { await loadFollowRequests(); }
    catch (error) { console.warn("GoCat follow requests:", error.message || error); }
    await signPrivateGoCatMedia();
    return failures;
};

function populatePrivacySettings() {
    const profile = currentProfile || {};
    const checkboxValues = {
        settingPrivateAccount: profile.is_private === true,
        settingShowFollowers: profile.show_followers !== false,
        settingShowFollowing: profile.show_following !== false,
        settingShowActivity: profile.show_activity_status !== false,
        settingReadReceipts: profile.send_read_receipts !== false,
        settingDiscoverable: profile.account_discoverable !== false
    };
    Object.entries(checkboxValues).forEach(([id, value]) => {
        const control = document.getElementById(id);
        if (control) control.checked = value;
    });
    const selectValues = {
        settingMessagesAudience: profile.allow_messages_from || "mutuals",
        settingCommentsAudience: profile.allow_comments_from || "everyone",
        settingDefaultVisibility: profile.default_video_visibility || "public"
    };
    Object.entries(selectValues).forEach(([id, value]) => {
        const control = document.getElementById(id);
        if (control) control.value = value;
    });
}

async function savePrivacySettings() {
    if (!requireAuth("save privacy settings")) return;
    const values = {
        is_private: document.getElementById("settingPrivateAccount")?.checked === true,
        show_followers: document.getElementById("settingShowFollowers")?.checked !== false,
        show_following: document.getElementById("settingShowFollowing")?.checked !== false,
        allow_messages_from: document.getElementById("settingMessagesAudience")?.value || "mutuals",
        allow_comments_from: document.getElementById("settingCommentsAudience")?.value || "everyone",
        show_activity_status: document.getElementById("settingShowActivity")?.checked !== false,
        send_read_receipts: document.getElementById("settingReadReceipts")?.checked !== false,
        account_discoverable: document.getElementById("settingDiscoverable")?.checked !== false,
        default_video_visibility: document.getElementById("settingDefaultVisibility")?.value || "public"
    };
    try {
        const result = await db.from("users").update(values).eq("id", String(currentUser.id))
            .select("id,username,bio,avatar_path,created_at,channel_theme," + PRIVACY_COLUMNS.split(",").slice(1).join(","))
            .single();
        if (result.error) throw result.error;
        currentProfile = { ...currentProfile, ...result.data };
        users = users.map(user => String(user.id) === String(currentUser.id)
            ? { ...user, ...result.data }
            : user);
        await Promise.all([loadFollows(), loadFollowRequests()]);
        renderEverything();
        populatePrivacySettings();
        renderPendingFollowRequests();
        showToast("Privacy settings saved");
    } catch (error) {
        console.error("GoCat privacy settings:", error);
        showToast("Could not save privacy settings: " + error.message);
        populatePrivacySettings();
    }
}

let privacySaveTimer = null;
[
    "settingPrivateAccount", "settingShowFollowers", "settingShowFollowing",
    "settingMessagesAudience", "settingCommentsAudience", "settingShowActivity",
    "settingReadReceipts", "settingDiscoverable", "settingDefaultVisibility"
].forEach(id => {
    const control = document.getElementById(id);
    if (control) control.addEventListener("change", () => {
        clearTimeout(privacySaveTimer);
        privacySaveTimer = setTimeout(savePrivacySettings, 220);
    });
});

function renderPendingFollowRequests() {
    const container = document.getElementById("followRequestsList");
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = "<p class='muted-text'>Sign in to manage follow requests.</p>";
        return;
    }
    const incoming = followRequests.filter(row =>
        String(row.target_id) === String(currentUser.id) && row.status === "pending"
    );
    if (!incoming.length) {
        container.innerHTML = "<p class='muted-text'>No pending follow requests.</p>";
        return;
    }
    container.innerHTML = incoming.map(row => {
        const person = getUser(row.requester_id);
        const name = person?.username || getUsername(row.requester_id);
        return `<div class="gocat-follow-request-row">
            <span class="gocat-follow-request-person">
                ${avatar(name, "md", person?.avatar_path || "")}
                <span><strong>${esc(name)}</strong><small>Wants to follow your private account</small></span>
            </span>
            <span class="gocat-follow-request-actions">
                <button type="button" class="primary-btn" data-follow-request-accept="${esc(row.id)}">Accept</button>
                <button type="button" class="soft-btn" data-follow-request-decline="${esc(row.id)}">Decline</button>
            </span>
        </div>`;
    }).join("");
}

async function respondToPrivacyFollowRequest(requestId, accepted) {
    if (!requireAuth("manage follow requests")) return;
    const result = await db.rpc("gocat_respond_follow_request", {
        p_request_id: requestId,
        p_accept: accepted === true
    });
    if (result.error) {
        showToast("Could not update request: " + result.error.message);
        return;
    }
    await Promise.all([loadFollows(), loadFollowRequests()]);
    renderEverything();
    renderPendingFollowRequests();
    showToast(accepted ? "Follow request accepted" : "Follow request declined");
}

document.addEventListener("click", event => {
    const accept = event.target.closest("[data-follow-request-accept]");
    const decline = event.target.closest("[data-follow-request-decline]");
    if (accept) respondToPrivacyFollowRequest(accept.dataset.followRequestAccept, true);
    if (decline) respondToPrivacyFollowRequest(decline.dataset.followRequestDecline, false);
    if (event.target.closest('[data-page="settings"]')) {
        setTimeout(() => { populatePrivacySettings(); renderPendingFollowRequests(); }, 0);
    }
});

const originalToggleFollowForPrivacy = toggleFollow;
toggleFollow = async function (userId) {
    if (!requireAuth("follow creators")) return;
    const targetId = String(userId || "");
    const target = getUser(targetId);
    if (!target || String(targetId) === String(currentUser.id)) return;
    if (isFollowing(targetId)) return originalToggleFollowForPrivacy(targetId);

    const oldRequest = getPrivacyFollowRequest(targetId);
    if (oldRequest?.status === "pending") {
        const cancelled = await db.from("gocat_follow_requests").delete().eq("id", oldRequest.id);
        if (cancelled.error) return showToast("Could not cancel request: " + cancelled.error.message);
        followRequests = followRequests.filter(row => String(row.id) !== String(oldRequest.id));
        renderEverything();
        return showToast("Follow request cancelled");
    }
    if (target.is_private === true) {
        if (oldRequest) {
            const removed = await db.from("gocat_follow_requests").delete().eq("id", oldRequest.id);
            if (removed.error) return showToast("Could not retry request: " + removed.error.message);
        }
        const created = await db.from("gocat_follow_requests").insert({
            requester_id: String(currentUser.id), target_id: targetId, status: "pending"
        }).select("id,requester_id,target_id,status,created_at").single();
        if (created.error) return showToast("Could not send follow request: " + created.error.message);
        followRequests = [created.data, ...followRequests];
        renderEverything();
        showToast("Follow request sent");
        return;
    }
    return originalToggleFollowForPrivacy(targetId);
};

const originalRenderProfileForPrivacy = renderProfile;
renderProfile = function () {
    originalRenderProfileForPrivacy();
    const profileId = currentProfileUserId || currentUser?.id;
    const profile = getUser(profileId) || currentProfile;
    if (!profile) return;
    const own = !!currentUser && String(profileId) === String(currentUser.id);
    const followersButton = document.getElementById("profileFollowersOpen");
    const followingButton = document.getElementById("profileFollowingOpen");
    const followerCount = document.getElementById("profileFollowerCount");
    const followingCount = document.getElementById("profileFollowingCount");
    if (followerCount) followerCount.textContent = !own && profile.show_followers === false
        ? "Hidden" : privacyCompact(getDisplayedFollowerCount(profileId));
    if (followingCount) followingCount.textContent = !own && profile.show_following === false
        ? "Hidden" : privacyCompact(follows.filter(row => String(row.follower_id) === String(profileId)).length);
    if (followersButton) {
        followersButton.disabled = !own && profile.show_followers === false;
        followersButton.title = followersButton.disabled ? "This creator hides their followers" : "View followers";
    }
    if (followingButton) {
        followingButton.disabled = !own && profile.show_following === false;
        followingButton.title = followingButton.disabled ? "This creator hides who they follow" : "View following";
    }
    const action = document.getElementById("profileActionBtn");
    if (action && !own) action.textContent = getPrivacyFollowLabel(profileId);
};

const originalOpenFollowListForPrivacy = openFollowList;
openFollowList = function (kind) {
    const profileId = currentProfileUserId || currentUser?.id;
    const profile = getUser(profileId);
    const own = !!currentUser && String(profileId) === String(currentUser.id);
    if (!own && ((kind === "followers" && profile?.show_followers === false) ||
        (kind === "following" && profile?.show_following === false))) {
        return showToast("This creator keeps that list private.");
    }
    return originalOpenFollowListForPrivacy(kind);
};

const originalRenderStudioForPrivacy = renderStudio;
renderStudio = async function () {
    await originalRenderStudioForPrivacy();
    const followerCount = document.getElementById("studioFollowers");
    if (followerCount && currentUser) {
        followerCount.textContent = privacyCompact(follows.filter(row =>
            String(row.following_id) === String(currentUser.id)
        ).length);
    }
};

function privacyCanMessage(user) {
    if (!currentUser || !user || String(user.id) === String(currentUser.id)) return false;
    const audience = user.allow_messages_from || "mutuals";
    const followsTarget = isFollowing(user.id);
    const targetFollows = follows.some(row =>
        String(row.follower_id) === String(user.id) &&
        String(row.following_id) === String(currentUser.id)
    );
    if (audience === "everyone") return true;
    if (audience === "followers") return followsTarget;
    if (audience === "mutuals") return followsTarget && targetFollows;
    return false;
}
getMutualFriends = function () {
    if (!currentUser) return [];
    return users.filter(privacyCanMessage);
};

const originalOpenChatForPrivacy = openChat;
openChat = async function (userId) {
    const result = await originalOpenChatForPrivacy(userId);
    const target = getUser(userId);
    if (currentProfile?.show_activity_status === false && chatRealtimeChannel) {
        try { await chatRealtimeChannel.untrack(); } catch {}
    }
    const presence = document.getElementById("chatPresence");
    if (presence && target?.show_activity_status === false) {
        presence.textContent = "Activity status hidden";
    }
    const caption = document.querySelector(".chat-list-caption");
    if (caption) caption.textContent = "PEOPLE YOU CAN MESSAGE";
    return result;
};

const originalRenderChatFriendsForPrivacy = renderChatFriends;
renderChatFriends = function () {
    originalRenderChatFriendsForPrivacy();
    const caption = document.querySelector(".chat-list-caption");
    if (caption) caption.textContent = "PEOPLE YOU CAN MESSAGE";
};

const originalApplySettingsForPrivacy = applySettings;
applySettings = function () {
    originalApplySettingsForPrivacy();
    const saved = safeJSON("gocat_settings_v2", {});
    settings.reduceMotion = saved.reduceMotion === true;
    settings.dataSaver = saved.dataSaver === true;
    settings.personalizeFeed = saved.personalizeFeed !== false;
    const motion = document.getElementById("settingReduceMotion");
    const saver = document.getElementById("settingDataSaver");
    const personalize = document.getElementById("settingPersonalizeFeed");
    if (motion) motion.checked = settings.reduceMotion;
    if (saver) saver.checked = settings.dataSaver;
    if (personalize) personalize.checked = settings.personalizeFeed;
    document.body.classList.toggle("gocat-reduce-motion", settings.reduceMotion);
};
applySettings();

function savePrivacyLocalSettings() {
    if (document.getElementById("settingReduceMotion")) {
        settings.reduceMotion = document.getElementById("settingReduceMotion").checked;
    }
    if (document.getElementById("settingDataSaver")) {
        settings.dataSaver = document.getElementById("settingDataSaver").checked;
    }
    if (document.getElementById("settingPersonalizeFeed")) {
        settings.personalizeFeed = document.getElementById("settingPersonalizeFeed").checked;
    }
    if (settings.dataSaver) settings.autoplay = false;
    saveSettings();
    applySettings();
    renderReels();
}
["settingReduceMotion","settingDataSaver","settingPersonalizeFeed"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", savePrivacyLocalSettings);
});
document.getElementById("resetSettingsBtn")?.addEventListener("click", () => {
    settings.reduceMotion = false;
    settings.dataSaver = false;
    settings.personalizeFeed = true;
    saveSettings();
    setTimeout(applySettings, 0);
});

const originalGetHomeFeedDataForPrivacy = getHomeFeedData;
getHomeFeedData = function () {
    const data = originalGetHomeFeedDataForPrivacy();
    if (settings.personalizeFeed !== false) return data;
    return {
        regularVideos: data.regularVideos.slice().sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)),
        shorts: data.shorts.slice().sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)),
        communityPosts: data.communityPosts.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    };
};

const originalOpenUploadForPrivacy = openUpload;
openUpload = function (mode = "video") {
    originalOpenUploadForPrivacy(mode);
    const selector = document.getElementById("videoVisibility");
    if (selector) selector.value = currentProfile?.default_video_visibility || "public";
};

const originalUploadVideoFileForPrivacy = uploadVideoFile;
uploadVideoFile = async function (file, path, progress) {
    const visibility = document.getElementById("videoVisibility")?.value || "public";
    const bucket = visibility === "public" ? VIDEO_BUCKET : PRIVATE_VIDEO_BUCKET;
    window.gocatLastVideoUploadBucket = bucket;
    if (bucket === VIDEO_BUCKET) return originalUploadVideoFileForPrivacy(file, path, progress);

    const sessionResult = await db.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    const session = sessionResult.data.session;
    if (!session?.access_token) throw new Error("Your session expired. Sign in again.");
    const projectId = new URL(SUPABASE_URL).hostname.split(".")[0];
    const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
    progress(0);
    try {
        await loadTusLibrary();
        await new Promise((resolve, reject) => {
            const upload = new window.tus.Upload(file, {
                endpoint,
                retryDelays: [0, 3000, 5000, 10000],
                headers: { authorization: "Bearer " + session.access_token, apikey: SUPABASE_KEY },
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true,
                chunkSize: 6 * 1024 * 1024,
                metadata: {
                    bucketName: PRIVATE_VIDEO_BUCKET,
                    objectName: path,
                    contentType: file.type || "video/mp4",
                    cacheControl: "31536000"
                },
                onError: reject,
                onProgress: (done, total) => progress(Math.max(0, Math.min(99, Math.round(done / total * 100)))),
                onSuccess: resolve
            });
            upload.start();
        });
        progress(100);
        return { provider: "supabase", path };
    } catch (tusError) {
        console.warn("Private video resumable upload unavailable; trying direct upload:", tusError);
        const uploaded = await db.storage.from(PRIVATE_VIDEO_BUCKET).upload(path, file, {
            cacheControl: "31536000", upsert: false, contentType: file.type || "video/mp4"
        });
        if (uploaded.error) throw uploaded.error;
        progress(100);
        return { provider: "supabase", path: uploaded.data?.path || path };
    }
};

const originalGenerateVideoThumbnailForPrivacy = generateVideoThumbnail;
generateVideoThumbnail = async function (file) {
    const visibility = document.getElementById("videoVisibility")?.value || "public";
    if (visibility !== "public") return null;
    return originalGenerateVideoThumbnailForPrivacy(file);
};

const originalInsertVideoRecordForPrivacy = insertVideoRecord;
insertVideoRecord = function (record) {
    const visibility = document.getElementById("videoVisibility")?.value || "public";
    return originalInsertVideoRecordForPrivacy({ ...record, visibility });
};

document.getElementById("changePasswordBtn")?.addEventListener("click", async () => {
    if (!requireAuth("change your password")) return;
    const password = document.getElementById("settingsNewPassword")?.value || "";
    if (password.length < 8) return showToast("Use at least 8 characters for your new password.");
    const result = await db.auth.updateUser({ password });
    if (result.error) return showToast("Password update failed: " + result.error.message);
    document.getElementById("settingsNewPassword").value = "";
    showToast("Password updated");
});

const originalUpdateUserInterfaceForPrivacy = updateUserInterface;
updateUserInterface = function () {
    originalUpdateUserInterfaceForPrivacy();
    populatePrivacySettings();
    renderPendingFollowRequests();
};

// Load the optional privacy data after initial account startup and keep it current.
if (currentUser) {
    Promise.all([loadPrivacyFieldsForUsers(), loadFollowRequests()])
        .then(() => { populatePrivacySettings(); renderPendingFollowRequests(); })
        .catch(error => console.warn("GoCat privacy settings startup:", error.message || error));
}


// Final presentation pass: keep compact counts and request labels consistent across every view.
const originalRenderEverythingPrivacy = renderEverything;
renderEverything = function () {
    originalRenderEverythingPrivacy();
    document.querySelectorAll("[data-follow-user]").forEach(button => {
        button.textContent = getPrivacyFollowLabel(button.dataset.followUser);
    });
    renderPendingFollowRequests();
};

const originalRenderSuggestedCreatorsPrivacy = renderSuggestedCreators;
renderSuggestedCreators = function () {
    originalRenderSuggestedCreatorsPrivacy();
    document.querySelectorAll(".creator-card").forEach(card => {
        const trigger = card.querySelector("[data-profile-user], [data-follow-user]");
        const user = trigger ? getUser(trigger.dataset.profileUser || trigger.dataset.followUser) : null;
        if (user?.account_discoverable === false && !isFollowing(user.id)) card.remove();
    });
};

const originalRenderExplorePrivacy = renderExplore;
renderExplore = function () {
    originalRenderExplorePrivacy();
    document.querySelectorAll(".person-card").forEach(card => {
        const trigger = card.querySelector("[data-profile-user]");
        const user = trigger ? getUser(trigger.dataset.profileUser) : null;
        if (user?.account_discoverable === false && !isFollowing(user.id)) card.remove();
    });
};

const originalRenderProfilePrivacyState = renderProfile;
renderProfile = function () {
    originalRenderProfilePrivacyState();
    const profileId = currentProfileUserId || currentUser?.id;
    const profile = getUser(profileId) || currentProfile;
    if (!profile) return;
    const own = !!currentUser && String(profileId) === String(currentUser.id);
    const privateToViewer = profile.is_private === true && !own && !isFollowing(profileId);
    if (privateToViewer) {
        const text = "<div class='gocat-private-profile'><strong>This account is private</strong><p>Follow this creator and wait for approval to see their videos, Reels and posts.</p></div>";
        ["profileHome","profileReels","profileVideos","profilePosts"].forEach(id => {
            const target = document.getElementById(id);
            if (target) target.innerHTML = text;
        });
    }
};

const originalGetHomeFeedForRecommendations = getHomeFeedData;
getHomeFeedData = function () {
    const result = originalGetHomeFeedForRecommendations();
    if (settings.personalizeFeed !== false) return result;
    const byDate = (a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    return {
        regularVideos: result.regularVideos.slice().sort(byDate),
        shorts: result.shorts.slice().sort(byDate),
        communityPosts: result.communityPosts.slice().sort(byDate)
    };
};


document.addEventListener("click", event => {
    if (event.target.closest("[data-profile-user]")) {
        setTimeout(() => {
            const profileId = currentProfileUserId;
            const profile = getUser(profileId);
            const own = !!currentUser && String(profileId) === String(currentUser.id);
            if (profile?.is_private === true && !own && !isFollowing(profileId)) {
                document.querySelectorAll("#profileHome,#profileReels,#profileVideos,#profilePosts").forEach(panel => {
                    if (!panel.querySelector(".gocat-private-profile")) {
                        panel.innerHTML = "<div class='gocat-private-profile'><strong>This account is private</strong><p>Request to follow this creator to see their content after approval.</p></div>";
                    }
                });
            }
        }, 120);
    }
});
