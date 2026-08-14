import { Router } from "express";
import { analyzeQuestionImage, getAIReadiness } from "../services/openaiService.js";

const router = Router();

router.get("/quiz-readiness", (_req, res) => {
  res.json(getAIReadiness());
});

router.post("/analyze-question", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { imageBase64, subject, sessionId, confidenceThreshold } = body as {
    imageBase64?: unknown;
    subject?: unknown;
    sessionId?: unknown;
    confidenceThreshold?: unknown;
  };

  if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "imageBase64 is required and must be a non-empty string" });
    return;
  }

  if (!subject || typeof subject !== "string" || subject.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "subject is required" });
    return;
  }

  if (subject.trim().length > 120) {
    res.status(400).json({ error: "BAD_REQUEST", message: "subject must be 120 characters or fewer" });
    return;
  }

  const threshold = confidenceThreshold === undefined ? 0.85 : Number(confidenceThreshold);
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 0.99) {
    res.status(400).json({ error: "BAD_REQUEST", message: "confidenceThreshold must be between 0.5 and 0.99" });
    return;
  }

  // Guard against oversized payloads (~3.5MB base64 ≈ 2.6MB image)
  if (imageBase64.length > 5_000_000) {
    res.status(400).json({ error: "BAD_REQUEST", message: "Image too large. Max size is ~3.5MB." });
    return;
  }

  const readiness = getAIReadiness();
  if (!readiness.ready) {
    res.status(503).json({
      error: "CONFIG_ERROR",
      message: readiness.message,
    });
    return;
  }

  try {
    const result = await analyzeQuestionImage(imageBase64, subject.trim(), threshold);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err, sessionId }, "Failed to analyze question");
    const providerStatus =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: unknown }).status)
        : 0;
    if (providerStatus === 401 || providerStatus === 403) {
      res.status(503).json({
        error: "CONFIG_ERROR",
        message: "The OpenAI connection was rejected. Reconnect the Replit integration or replace the server key.",
      });
      return;
    }
    res.status(500).json({
      error: "ANALYSIS_ERROR",
      message: "The question could not be analyzed right now. Please try again.",
    });
  }
});

export default router;
