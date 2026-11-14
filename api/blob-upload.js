const SUPABASE_URL = "https://rfwgvsijxweyzwvuqslt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0";

const PURPOSE_TYPES = {
  video: ["video/mp4", "video/webm", "video/quicktime"],
  reel: ["video/mp4", "video/webm", "video/quicktime"],
  post: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  story: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"],
  community: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]
};

function jsonBody(body) {
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return null; }
  }
  return body && typeof body === "object" ? body : null;
}

async function verifyUser(accessToken) {
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    method: "GET",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + accessToken
    }
  });

  if (!response.ok) return null;
  const user = await response.json();
  return user && user.id ? user : null;
}

module.exports = async function blobUpload(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "GET") {
    return res.status(200).json({
      provider: "Vercel Blob",
      configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      store: "gocat-media",
      region: "dxb1"
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ code: "METHOD_NOT_ALLOWED", error: "Use GET or POST." });
  }

  try {
    const { handleUpload } = await import("@vercel/blob/client");
    const body = jsonBody(req.body);
    if (!body) {
      return res.status(400).json({ code: "INVALID_BODY", error: "Upload request was not valid JSON." });
    }

    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const authorization = req.headers.authorization || "";
        const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
        if (!accessToken) {
          const error = new Error("Sign in to upload media.");
          error.status = 401;
          throw error;
        }

        const user = await verifyUser(accessToken);
        if (!user) {
          const error = new Error("Your GoCat session expired. Sign in again.");
          error.status = 401;
          throw error;
        }

        // Keep GoCat's existing ban check in the upload authorization flow.
        try {
          const bannedResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/is_gocat_banned", {
            method: "POST",
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              Authorization: "Bearer " + accessToken,
              "Content-Type": "application/json"
            },
            body: "{}"
          });
          if (bannedResponse.ok && (await bannedResponse.json()) === true) {
            const error = new Error("This account cannot upload media.");
            error.status = 403;
            throw error;
          }
        } catch (error) {
          if (error.status === 403) throw error;
          console.warn("GoCat ban check was unavailable:", error.message);
        }

        let payload = {};
        try { payload = JSON.parse(clientPayload || "{}"); } catch {}
        const purpose = String(payload.purpose || "");
        const allowedContentTypes = PURPOSE_TYPES[purpose];
        if (!allowedContentTypes) {
          const error = new Error("This type of GoCat upload is not allowed.");
          error.status = 400;
          throw error;
        }

        const prefix = "gocat/" + user.id + "/" + purpose + "/";
        if (typeof pathname !== "string" || !pathname.startsWith(prefix)) {
          const error = new Error("The upload path does not belong to your GoCat account.");
          error.status = 403;
          throw error;
        }

        const filename = pathname.slice(prefix.length);
        if (!filename || filename.includes("/") || filename === "." || filename === ".." || filename.length > 200) {
          const error = new Error("The upload filename is not valid.");
          error.status = 400;
          throw error;
        }

        return {
          allowedContentTypes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, purpose })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload = {};
        try { payload = JSON.parse(tokenPayload || "{}"); } catch {}
        console.info("GoCat Blob upload completed:", {
          userId: payload.userId || null,
          purpose: payload.purpose || null,
          pathname: blob.pathname
        });
      }
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("GoCat Blob upload endpoint:", error);
    const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 400;
    return res.status(status).json({
      code: status === 401 ? "AUTH_REQUIRED" : status === 403 ? "UPLOAD_FORBIDDEN" : "BLOB_UPLOAD_ERROR",
      error: error.message || "Could not prepare the Vercel Blob upload."
    });
  }
};
