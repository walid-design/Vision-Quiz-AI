import { type QuizAnswer } from '@/types';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';

export interface AnalysisResult {
  questionDetected: boolean;
  captureGuidance: string;
  question: string;
  options: Record<string, string>;
  answer: string;
  answerText: string;
  confidence: number;
  explanation: string;
  needsVerification: boolean;
  verified?: boolean;
  verifierAnswer?: string;
  firstPassAnswer?: string;
  processingTimeMs: number;
}

export interface AnalysisError {
  error: string;
  message: string;
}

export async function analyzeQuestion(
  imageBase64: string,
  subject: string,
  confidenceThreshold = 0.85,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) throw new Error('EXPO_PUBLIC_DOMAIN not configured');

  const url = `https://${domain}/api/analyze-question`;

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), 35_000);
  const abortFromCaller = () => timeoutController.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, subject, confidenceThreshold }),
      signal: timeoutController.signal,
    });
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new Error(signal?.aborted ? 'Analysis cancelled' : 'Analysis timed out. Please check your connection.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  if (!response.ok) {
    let errorBody: AnalysisError | null = null;
    try { errorBody = await response.json(); } catch (_) {}
    throw new Error(errorBody?.message ?? `Server error ${response.status}`);
  }

  return response.json();
}

export interface VisualSignature {
  pixels: number[];
  sharpness: number;
}

/** Decode a tiny monitoring JPEG into a normalized 16x16 luminance signature. */
export function createVisualSignature(imageBase64: string): VisualSignature {
  const decoded = jpeg.decode(toByteArray(imageBase64), {
    useTArray: true,
    formatAsRGBA: true,
  });
  const grid = 16;
  const pixels: number[] = [];

  for (let row = 0; row < grid; row++) {
    const y = Math.min(decoded.height - 1, Math.floor(((row + 0.5) / grid) * decoded.height));
    for (let col = 0; col < grid; col++) {
      const x = Math.min(decoded.width - 1, Math.floor(((col + 0.5) / grid) * decoded.width));
      const offset = (y * decoded.width + x) * 4;
      const r = decoded.data[offset] ?? 0;
      const g = decoded.data[offset + 1] ?? 0;
      const b = decoded.data[offset + 2] ?? 0;
      pixels.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
    }
  }

  let edgeEnergy = 0;
  let edgeCount = 0;
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const index = row * grid + col;
      if (col + 1 < grid) {
        edgeEnergy += Math.abs(pixels[index] - pixels[index + 1]);
        edgeCount++;
      }
      if (row + 1 < grid) {
        edgeEnergy += Math.abs(pixels[index] - pixels[index + grid]);
        edgeCount++;
      }
    }
  }

  return { pixels, sharpness: edgeCount ? edgeEnergy / edgeCount / 255 : 0 };
}

/** Compare visual content while discounting global exposure changes. */
export function computeChangeScore(prev: number[], curr: number[]): number {
  const len = Math.min(prev.length, curr.length);
  if (!len) return 0;
  const prevMean = prev.slice(0, len).reduce((sum, value) => sum + value, 0) / len;
  const currMean = curr.slice(0, len).reduce((sum, value) => sum + value, 0) / len;
  let difference = 0;
  for (let index = 0; index < len; index++) {
    difference += Math.abs((prev[index] - prevMean) - (curr[index] - currMean));
  }
  return difference / len / 255;
}

/** Generate a unique ID without the uuid package */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/** Convert an AnalysisResult into a QuizAnswer for history storage */
export function toQuizAnswer(result: AnalysisResult, subject: string): QuizAnswer {
  return {
    id: generateId(),
    timestamp: Date.now(),
    question: result.question,
    questionDetected: result.questionDetected,
    captureGuidance: result.captureGuidance,
    options: result.options,
    answer: result.answer,
    answerText: result.answerText,
    confidence: result.confidence,
    explanation: result.explanation,
    needsVerification: result.needsVerification,
    verified: result.verified,
    verifierAnswer: result.verifierAnswer,
    firstPassAnswer: result.firstPassAnswer,
    processingTimeMs: result.processingTimeMs,
    subject,
  };
}
