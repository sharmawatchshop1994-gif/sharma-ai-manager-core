const { put, issueSignedToken, presignUrl } = await import("@vercel/blob");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "POST required"
    });
  }

  try {
    const origin = req.headers.origin;

    if (
      origin &&
      origin !== "https://sharmaaimanagerbackendv3.vercel.app"
    ) {
      return res.status(403).json({
        ok: false,
        error: "Origin not allowed"
      });
    }

    const {
      imageBase64,
      mimeType,
      filename,
      caption
    } = req.body || {};

    if (!imageBase64 || !caption) {
      return res.status(400).json({
        ok: false,
        error: "Photo and caption are required"
      });
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif"
    ];

    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({
        ok: false,
        error: "Only JPG, PNG and GIF are allowed"
      });
    }

    const cleanBase64 = imageBase64.replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      ""
    );

    const imageBuffer = Buffer.from(cleanBase64, "base64");

    if (
      imageBuffer.length === 0 ||
      imageBuffer.length > 4 * 1024 * 1024
    ) {
      return res.status(400).json({
        ok: false,
        error: "Image must be under 4 MB"
      });
    }

    const extension =
      mimeType === "image/png" ? "png" :
      mimeType === "image/gif" ? "gif" : "jpg";

    const safeName =
      String(filename || `watch.${extension}`)
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-80);

    const blob = await put(
      `facebook/${Date.now()}-${safeName}`,
      imageBuffer,
      {
        access: "private",
        contentType: mimeType,
        addRandomSuffix: true
      }
    );

    const validUntil = Date.now() + 15 * 60 * 1000;

    const signedToken = await issueSignedToken({
      pathname: blob.pathname,
      operations: ["get"],
      validUntil
    });

    const signed = await presignUrl(signedToken, {
      pathname: blob.pathname,
      operation: "get",
      validUntil
    });

    const apiKey = process.env.WINDSOR_API_KEY;
    const account = process.env.WINDSOR_ACCOUNT_ID;

    if (!apiKey || !account) {
      throw new Error("Windsor environment variables missing");
    }

    const response = await fetch(
      `https://connectors.windsor.ai/facebook_organic/actions?api_key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          account,
          action: "create_photo_post",
          params: {
            image_url: signed.presignedUrl,
            caption
          }
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "Facebook publishing failed",
        details: result
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Windsor accepted the publishing request",
      result
    });

  } catch (error) {
    console.error("Facebook publish error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Server error"
    });
  }
};