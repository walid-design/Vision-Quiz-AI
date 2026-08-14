import { QuizAnswer } from '@/types';

export interface AnalysisResult {
  question: string;
  options: Record<string, string>;
  answer: string;
  answerText: string;
  confidence: number;
  explanation: string;
  needsVerification: boolean;
  verified?: boolean;
  verifierAnswer?: string;
  processingTimeMs: number;
}

export interface AnalysisError {
  error: string;
  message: string;
}

export async function analyzeQuestion(
  imageBase64: string,
  subject: string,
  sessionId?: string,
): Promise<AnalysisResult> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) throw new Error('EXPO_PUBLIC_DOMAIN not configured');

  const url = `https://${domain}/api/analyze-question`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, subject, sessionId }),
  });

  if (!response.ok) {
    let errorBody: AnalysisError | null = null;
    try { errorBody = await response.json(); } catch (_) {}
    throw new Error(errorBody?.message ?? `Server error ${response.status}`);
  }

  return response.json();
}

/** Generate a simple fingerprint for frame-change detection by sampling the base64 string */
export function computeChangeScore(prev: string, curr: string): number {
  const len = Math.min(prev.length, curr.length);
  if (len < 100) return 0;

  const samples = 300;
  const step = Math.floor(len / samples);
  let diffs = 0;

  for (let i = 0; i < samples; i++) {
    const idx = i * step;
    if (prev[idx] !== curr[idx]) diffs++;
  }

  return diffs / samples;
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
    options: result.options,
    answer: result.answer,
    answerText: result.answerText,
    confidence: result.confidence,
    explanation: result.explanation,
    needsVerification: result.needsVerification,
    verified: result.verified,
    verifierAnswer: result.verifierAnswer,
    processingTimeMs: result.processingTimeMs,
    subject,
  };
}
