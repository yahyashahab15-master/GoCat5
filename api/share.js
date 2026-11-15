"use strict";

const SUPABASE_URL = "https://rfwgvsijxweyzwvuqslt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0";
const SITE_URL = "https://gocat.vercel.app";

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

function publicStorageUrl(bucket, path) {
  if (!path) return "";
  const value = String(path);
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return "";
  const encodedPath = value.split("/").map(encodeURIComponent).join("/");
  return SUPABASE_URL + "/storage/v1/object/public/" + bucket + "/" + encodedPath;
}

module.exports = async function sharePage(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send("Method not allowed.");
  }

  const type = String(req.query.type || "video");
  const id = String(req.query.id || "").trim();
  if (type !== "video" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).send("Invalid GoCat share link.");
  }

  try {
    const endpoint = SUPABASE_URL + "/rest/v1/videos?id=eq." +
      encodeURIComponent(id) + "&select=*&limit=1";
    const response = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return res.status(502).send("GoCat could not load this video right now.");
    }

    const rows = await response.json();
    const video = Array.isArray(rows) ? rows[0] : null;
    if (!video) return res.status(404).send("This GoCat video could not be found.");

    const title = String(video.title || "Watch this video on GoCat").slice(0, 180);
    const description = String(video.description || "Discover videos and creators on GoCat.").slice(0, 300);
    const imageCandidate = video.thumbnail_path || video.thumbnail_url || video.thumbnail || video.poster_url ||
      video.cover_url || "";
    const image = publicStorageUrl("videos", imageCandidate) || (SITE_URL + "/gocat-logo.svg");
    const mediaUrl = publicStorageUrl("videos", video.storage_path);
    const canonical = SITE_URL + "/share/video/" + encodeURIComponent(id);
    const appUrl = SITE_URL + "/?video=" + encodeURIComponent(id);

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | GoCat</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="GoCat">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:alt" content="GoCat video preview">
${mediaUrl ? `<meta property="og:video" content="${escapeHtml(mediaUrl)}">
<meta property="og:video:secure_url" content="${escapeHtml(mediaUrl)}">
<meta property="og:video:type" content="video/mp4">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="1;url=${escapeHtml(appUrl)}">
</head>
<body>
<p>Opening <a href="${escapeHtml(appUrl)}">${escapeHtml(title)}</a> on GoCat…</p>
<script>window.location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Robots-Tag", "index, follow");
    return res.status(200).send(req.method === "HEAD" ? "" : html);
  } catch (error) {
    console.error("GoCat share preview:", error);
    return res.status(500).send("GoCat share preview is temporarily unavailable.");
  }
};
