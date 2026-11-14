/* GoCat external media uploads.
 * ImageKit keys stay on the server. The browser receives short-lived
 * upload signatures only after its GoCat session has been verified.
 */
(function () {
  "use strict";

  const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
  const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

  function mediaError(message, code, status) {
    const error = new Error(message);
    error.code = code || "IMAGEKIT_UPLOAD_ERROR";
    error.status = status || 0;
    return error;
  }

  async function getUploadAuth() {
    if (typeof db === "undefined" || !db) {
      throw mediaError("GoCat sign-in is unavailable.", "AUTH_REQUIRED");
    }

    const sessionResult = await db.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    const accessToken = sessionResult.data.session?.access_token;
    if (!accessToken) throw mediaError("Sign in again before uploading.", "AUTH_REQUIRED");

    const response = await fetch("/api/imagekit-auth", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken }
    });

    let payload = {};
    try { payload = await response.json(); } catch {}

    if (!response.ok) {
      throw mediaError(
        payload.error || "The media storage service could not authorize this upload.",
        payload.code || (response.status === 404 ? "IMAGEKIT_ENDPOINT_MISSING" : "IMAGEKIT_AUTH_FAILED"),
        response.status
      );
    }

    if (!payload.token || !payload.signature || !payload.expire || !payload.publicKey) {
      throw mediaError("The media storage service returned incomplete upload credentials.", "IMAGEKIT_AUTH_INVALID");
    }
    return payload;
  }

  function sendUpload(file, auth, options) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      const safeName = String(file.name || "gocat-media")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-140) || "gocat-media";

      form.append("file", file);
      form.append("fileName", safeName);
      form.append("publicKey", auth.publicKey);
      form.append("token", auth.token);
      form.append("expire", String(auth.expire));
      form.append("signature", auth.signature);
      form.append("useUniqueFileName", "true");
      form.append("folder", options.folder || "/gocat/uploads");
      form.append("isPrivateFile", options.isPrivateFile ? "true" : "false");

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://upload.imagekit.io/api/v1/files/upload");
      xhr.responseType = "json";

      xhr.upload.onprogress = event => {
        if (event.lengthComputable && typeof options.onProgress === "function") {
          options.onProgress(Math.max(0, Math.min(99, Math.round(event.loaded / event.total * 100))));
        }
      };

      xhr.onerror = () => reject(mediaError("Network error while uploading to ImageKit.", "IMAGEKIT_NETWORK_ERROR"));
      xhr.onabort = () => reject(mediaError("Upload was cancelled.", "IMAGEKIT_ABORTED"));
      xhr.onload = () => {
        const body = xhr.response || {};
        if (xhr.status < 200 || xhr.status >= 300 || !body.url) {
          reject(mediaError(body.message || body.help || "ImageKit rejected this file.", "IMAGEKIT_UPLOAD_REJECTED", xhr.status));
          return;
        }
        if (typeof options.onProgress === "function") options.onProgress(100);
        resolve({
          provider: "imagekit",
          url: body.url,
          fileId: body.fileId || null,
          filePath: body.filePath || null,
          name: body.name || safeName,
          size: body.size || file.size,
          fileType: body.fileType || file.type
        });
      };
      xhr.send(form);
    });
  }

  async function upload(file, options = {}) {
    if (!(file instanceof Blob) || !file.size) {
      throw mediaError("Choose a valid file before uploading.", "INVALID_FILE");
    }

    // Fetch auth before checking provider-specific size caps. That allows
    // the app to keep its old upload route until ImageKit is configured.
    const auth = await getUploadAuth();
    const isVideo = String(file.type || "").startsWith("video/");
    const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size > maxBytes) {
      throw mediaError(
        isVideo
          ? "ImageKit's free plan accepts videos up to 100 MB each."
          : "ImageKit's free plan accepts images and other files up to 25 MB each.",
        "IMAGEKIT_FILE_TOO_LARGE"
      );
    }

    return sendUpload(file, auth, options);
  }

  async function uploadOrFallback(file, options = {}, fallback) {
    try {
      return await upload(file, options);
    } catch (error) {
      if (error.code !== "IMAGEKIT_NOT_CONFIGURED") throw error;
      if (typeof fallback !== "function") {
        throw mediaError(
          "ImageKit is not connected yet. Add its two keys in Vercel to enable the extra storage.",
          "IMAGEKIT_NOT_CONFIGURED",
          503
        );
      }
      return await fallback(error);
    }
  }

  function isRemoteUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  window.GoCatMedia = { upload, uploadOrFallback, isRemoteUrl };
})();
