const crypto = require("crypto");

const SUPABASE_URL = "https://rfwgvsijxweyzwvuqslt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LWIaOaxbzp19lV765vbbQg_kF5apL0";

module.exports = async function imageKitAuth(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

  if (req.method === "GET") {
    return res.status(200).json({
      provider: "ImageKit",
      configured: Boolean(publicKey && privateKey)
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ code: "METHOD_NOT_ALLOWED", error: "Use POST." });
  }

  if (!publicKey || !privateKey) {
    return res.status(503).json({
      code: "IMAGEKIT_NOT_CONFIGURED",
      error: "ImageKit is not connected yet. Add IMAGEKIT_PUBLIC_KEY and IMAGEKIT_PRIVATE_KEY in Vercel."
    });
  }

  const authorization = req.headers.authorization || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!accessToken) {
    return res.status(401).json({ code: "AUTH_REQUIRED", error: "Sign in to upload media." });
  }

  try {
    const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + accessToken
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ code: "SESSION_INVALID", error: "Your GoCat session expired. Sign in again." });
    }

    const user = await userResponse.json();
    if (!user || !user.id) {
      return res.status(401).json({ code: "SESSION_INVALID", error: "Could not verify your GoCat account." });
    }

    const bannedResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/is_gocat_banned", {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: "{}"
    });

    if (bannedResponse.ok) {
      const banned = await bannedResponse.json();
      if (banned === true) {
        return res.status(403).json({ code: "ACCOUNT_RESTRICTED", error: "This account cannot upload media." });
      }
    }

    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 60;
    const signature = crypto.createHmac("sha1", privateKey).update(token + expire).digest("hex");

    return res.status(200).json({ token, expire, signature, publicKey });
  } catch (error) {
    console.error("ImageKit auth endpoint:", error);
    return res.status(500).json({ code: "AUTH_ENDPOINT_ERROR", error: "Could not prepare a secure media upload." });
  }
};
