# GoCat project map

Last reviewed: 2026-11-28  
Repository: `yahyashahab15-master/GoCat5`  
Production project: `gocat`  
Production domain: https://gocat.vercel.app  
Default branch: `main`

This document is a working architecture map for future GoCat changes. It is based on the files currently loaded by `index.html`, the linked feature modules and stylesheets, the Vercel API routes referenced by source, and the privacy migrations inspected on 2026-11-28. Always check current source before editing: this map is a navigation aid, not a replacement for code review.

## 1. Application shape

- GoCat is a static, browser-based single-page social/video application built with vanilla HTML, CSS and JavaScript (not React).
- `index.html` defines the app shell, guest-first sign-in/register dialog, sidebar/topbar, page sections, chat layout, creator tools, upload dialogs, privacy/settings panels, story composer/viewer, and call/voice-note controls.
- Supabase JS v2 is loaded from jsDelivr. Supabase is used for Auth, Postgres/REST, Realtime and Storage.
- Vercel hosts the site and serverless endpoints. `package.json` currently declares `@vercel/blob`.
- The Supabase browser configuration uses a publishable key; never put a Supabase service-role key or Vercel Blob write token in browser code.
- `vercel.json` supplies security/cache headers and rewrites share URLs to `/api/share`.

## 2. Main pages

The page sections in `index.html` are:
- `home`, `reels`, `explore`, `following`, `history`
- `posts`, `communities`, `chats`, `notifications`
- `studio`, `profile`, `admin`, `settings`

The interface is guest-first for browsing; authenticated actions use the sign-in modal and `requireAuth()`.

## 3. Browser scripts and responsibilities

Scripts are loaded from `index.html` in this order (after Supabase JS):

| File | Responsibility |
| --- | --- |
| `gocat-media.js` | Vercel Blob browser uploader, image optimization, upload status, fallback helper |
| `randomgo.js` | Main app state and core logic: auth, guest mode, profiles, feed, videos, Reels, posts, comments, likes, follows, follow requests, settings/privacy, admin, notifications, history, direct messages |
| `gocat-communities.js` | Community directory/detail, create/join/leave, community posts and media |
| `gocat-stories.js` | 24-hour Stories, composer/viewer, signed private media URLs |
| `gocat-enhancements.js` | Feed ordering/ranking, creator metrics, view signals, external video sharing, chat link previews |
| `gocat-commercial-polish.js` | Loader logo fallback and small UI polish |
| `gocat-creator-launchpad.js` | Creator launchpad, channel sharing, milestones and starter ideas |
| `gocat-batch-upload.js` | Multi-file upload queue and progress |
| `gocat-thumbnail-repair.js` | Repair missing video thumbnails |
| `gocat-advanced.js` | Video cover picker, chat search, Ctrl+V image paste |
| `gocat-group-chat.js` | Group conversations, members, group messages/reactions |
| `gocat-voice-notes.js` | Browser microphone recording, audio attachment upload and playback |
| `gocat-voice-calls.js` | One-to-one WebRTC calls, invitation/signal rows, ringtone, call overlay and polling fallback |
| `gocat-pwa.js` | PWA install prompt, online/offline notice and service-worker update registration |

## 4. Styling layers

- `random go.css`: original core theme/layout, auth, navigation, cards, feed, chat, profile, settings and responsive baseline.
- `gocat-growth.css`: creator growth, leaderboard, home feed mode and community discovery controls.
- `gocat-chat-admin.css`: attachments, chat bubbles, admin controls, group tools and link previews.
- `gocat-followers.css`: follower/following list modal.
- `gocat-privacy.css`: privacy settings, follow requests and private-account notices.
- `gocat-upgrades.css`: install/offline PWA UI.
- `gocat-mobile-polish.css`: mobile layout overrides.
- `gocat-commercial-polish.css`: loader, hero, editor and visual polish.
- `gocat-creator-launchpad.css`, `gocat-batch-upload.css`, `gocat-thumbnail-repair.css`: creator/upload tools.
- `gocat-advanced.css`, `gocat-communities.css`, `gocat-stories.css`, `gocat-group-chat.css`, `gocat-voice-notes.css`, `gocat-voice-calls.css`: feature-specific styles.

Keep the stylesheet load order intact unless there is a deliberate cascade review; many files are additive overrides.

## 5. Main data model observed in browser code

Core tables queried by `randomgo.js` include:
- `users`, `videos`, `likes`, `comments`, `follows`
- `gocat_follower_overrides`, `gocat_follow_requests`, `gocat_featured_creators`
- `posts`, `post_likes`, `post_comments`, `video_views`, `watch_history`
- `messages`, `message_reactions`, `gocat_notifications`

Feature modules additionally use:
- Communities: `communities`, `community_members`, `community_posts`
- Stories: `stories`
- Group messaging: `conversations`, `conversation_members`, plus `messages` and `message_reactions`
- Voice calls: `gocat_voice_call_invites`, `gocat_voice_call_signals`

Important observed RPC families include admin/follower controls, follow-request responses, message/call privacy preflights, voice privacy getters, community creation and group-conversation creation. Database RLS is the authoritative protection layer; do not weaken it to work around a browser issue.

## 6. Media and storage

Buckets referenced in source:
- `videos` for videos/Reels and thumbnail repair
- `post-media` for post/community media
- `chat-media` for direct/group chat attachments and audio notes
- `profile-avatars` for profile pictures
- `story-media` for Stories

`gocat-media.js` uploads main-purpose content through `/api/blob-upload` to Vercel Blob when configured. It checks the authenticated Supabase session, optimizes some JPEG/PNG images in the browser, and requests a scoped upload token from the server. The server endpoint verifies the Supabase user, checks the account's ban state when the check is available, restricts allowed purpose/content types, and enforces that the upload path belongs to that user.

The Stories module deliberately keeps Story files in the private Supabase `story-media` bucket and uses expiring signed URLs; it does not use the public Blob path. Chat attachments have a 50 MB per-file client limit. The share-target service worker accepts one file up to 50 MB per share operation.

Do not promise unlimited/free storage. Provider quotas, bandwidth, plan limits and prices must be checked against the current provider account before making storage claims.

## 7. Voice notes and voice calls — important flow

### Voice notes
- `gocat-voice-notes.js` uses `navigator.mediaDevices.getUserMedia()` and `MediaRecorder`.
- It records in the browser, attaches the audio file to the current direct/group chat, and inserts an audio message. The actual message insert remains protected by database RLS and the `gocat_can_send_voice_message` preflight is advisory only.
- Audio messages are stored with the chat attachment flow; the caller must have microphone permission and the browser must be in a secure context (HTTPS).

### One-to-one voice calls
- The call button is wired to `startOutgoingCall()`. It is enabled only for a signed-in user in a direct one-to-one chat. Group voice calls are not implemented.
- `directPeerId()` deliberately returns no peer while a group conversation ID is active.
- Outgoing flow: call-privacy preflight -> get microphone -> insert a `preparing` invite -> subscribe to invite/signaling -> create a peer connection -> change invite to `ringing`.
- Incoming flow: realtime inbox plus a 2.5-second database polling fallback -> accept -> get microphone -> accept invite -> send `ready` signaling -> negotiate offer/answer and ICE candidates.
- Invite/status and SDP/ICE signaling are stored in RLS-protected `gocat_voice_call_invites` and `gocat_voice_call_signals` rows. Audio itself is peer-to-peer; it is not streamed through Supabase.
- The current build has multiple STUN servers but no TURN relay. Some carrier, school, corporate or otherwise restrictive networks may fail to connect even after the invitation is delivered. Treat that as a network/relay limitation, not as a privacy denial.

### Critical microphone-policy fix (2026-11-28)
The previous `vercel.json` Permissions-Policy was:
`camera=(), microphone=(), geolocation=()`

That explicitly denied microphone access to GoCat. Both call participants need `getUserMedia()` before the call invite can be created/accepted, so the browser could stop the process before Postgres received a call row. This explains why successful RLS tests did not prove that a real call could start.

The policy was changed to:
`camera=(), microphone=(self), geolocation=()`

This allows microphone access on GoCat's own origin while keeping camera and geolocation disabled. The change was committed as `7007e35a08e9761d23769ef13cfe43d175448b8b` and Vercel reported the production deployment `READY`, with `gocat.vercel.app` assigned as an alias. A real two-device call still needs user-side verification; production-ready does not mean that a real audio call was tested.

### Call debugging order
1. Confirm the page was reloaded from the current production deployment and the browser grants microphone access.
2. Confirm `getUserMedia()` resolves on both devices. The old policy blocked this stage.
3. Check whether an invite row is inserted and transitions from `preparing` to `ringing`.
4. Check whether the recipient sees the incoming invite and can accept it.
5. Check whether `ready`, `offer`, `answer` and `ice` signaling rows are exchanged.
6. Check WebRTC `connectionState`; if it reaches `failed`, the source currently warns that TURN relay may be required.
7. Preserve RLS and bilateral privacy rules throughout. Never solve this by making calls public or allowing everyone.

## 8. PWA and deploy notes

- `manifest.webmanifest` configures GoCat as an installable standalone app and declares a Web Share Target.
- `sw.js` currently uses cache shell `gocat-shell-v26`, includes the app's local scripts/styles and handles share-target posts in IndexedDB.
- `gocat-pwa.js` registers the service worker with `updateViaCache: "none"`, requests an update after load and reloads once when a new worker takes control.
- `vercel.json` applies security headers, disables camera/geolocation, permits same-origin microphone, sets no-cache for `sw.js`, and rewrites video/post share URLs to `/api/share`.
- `api/blob-upload.js` is the Blob upload-token endpoint; `api/share.js` generates crawler-friendly video/post previews and redirects to the app.

## 9. Validation and working rules

- `.github/workflows/validate.yml` runs `node --check` on the main browser JavaScript modules, parses `vercel.json` and `manifest.webmanifest`, and parses `sitemap.xml`.
- Before modifying a feature, inspect its source plus any wrapper/overridden functions in `randomgo.js` and its CSS. Several modules wrap earlier functions and depend on script order.
- Preserve the working UI and features; prefer small, targeted edits.
- Never claim a call, upload, or feature is fixed solely because a file was committed or a deployment reached READY. Verify the actual user flow.
- Keep fixes free where possible, explain service/provider limits honestly, and do not add a paid relay/storage service without explicitly reviewing its cost first.
