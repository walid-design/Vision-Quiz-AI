import { Router } from "express";
import { analyzeQuestionImage } from "../services/openaiService.js";

const router = Router();

router.post("/analyze-question", async (req, res) => {
  const { imageBase64, subject, sessionId } = req.body as {
    imageBase64?: unknown;
    subject?: unknown;
    sessionId?: unknown;
  };

  if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "imageBase64 is required and must be a non-empty string" });
    return;
  }

  if (!subject || typeof subject !== "string" || subject.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "subject is required" });
    return;
  }

  // Guard against oversized payloads (~3.5MB base64 ≈ 2.6MB image)
  if (imageBase64.length > 5_000_000) {
    res.status(400).json({ error: "BAD_REQUEST", message: "Image too large. Max size is ~3.5MB." });
    return;
  }

  if (!process.env["OPENAI_API_KEY"]) {
    res.status(500).json({
      error: "CONFIG_ERROR",
      message: "OPENAI_API_KEY is not configured on the server. Add it to Replit Secrets.",
    });
    return;
  }

  try {
    const result = await analyzeQuestionImage(imageBase64, subject.trim());
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err, sessionId }, "Failed to analyze question");
    const message = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: "ANALYSIS_ERROR", message });
  }
});

export default router;
