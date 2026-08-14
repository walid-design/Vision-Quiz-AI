import { type QuizAnswer } from '@/types';

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

export interface QuizReadiness {
  ready: boolean;
  provider: 'openai' | 'replit-openai' | 'unconfigured';
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function getApiUrl(path: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!domain) throw new ApiRequestError('The API domain is not configured.', 'CONFIG_ERROR', 0);
  const origin = /^https?:\/\//i.test(domain) ? domain.replace(/\/$/, '') : `https://${domain}`;
  return `${origin}/api/${path}`;
}

async function readError(response: Response): Promise<AnalysisError | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function getQuizReadiness(signal?: AbortSignal): Promise<QuizReadiness> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), 8_000);
  const abortFromCaller = () => timeoutController.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(getApiUrl('quiz-readiness'), {
      signal: timeoutController.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await readError(response);
      throw new ApiRequestError(
        errorBody?.message ?? `Server error ${response.status}`,
        errorBody?.error ?? 'SERVER_ERROR',
        response.status,
      );
    }
    return response.json();
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (timeoutController.signal.aborted) {
      throw new ApiRequestError(
        signal?.aborted ? 'Readiness check cancelled' : 'The AI service did not respond. Restart the project and try again.',
        signal?.aborted ? 'CANCELLED' : 'SERVICE_UNREACHABLE',
        0,
      );
    }
    throw new ApiRequestError(
      error instanceof Error ? error.message : 'The AI service is unreachable.',
      'SERVICE_UNREACHABLE',
      0,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function analyzeQuestion(
  imageBase64: string,
  subject: string,
  confidenceThreshold = 0.85,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), 35_000);
  const abortFromCaller = () => timeoutController.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(getApiUrl('analyze-question'), {
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
    const errorBody = await readError(response);
    throw new ApiRequestError(
      errorBody?.message ?? `Server error ${response.status}`,
      errorBody?.error ?? 'ANALYSIS_ERROR',
      response.status,
    );
  }

  return response.json();
}

export interface VisualSignature {
  pixels: number[];
  sharpness: number;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode camera base64 without relying on Node buffers or an extra native/web
 * package. Expo supplies standard, unwrapped base64, so this small decoder is
 * sufficient for the monitoring thumbnails.
 */
function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const output = new Uint8Array(Math.max(0, Math.floor(clean.length * 3 / 4) - padding));
  let outputIndex = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(clean[index] ?? '');
    const b = BASE64_ALPHABET.indexOf(clean[index + 1] ?? '');
    const c = BASE64_ALPHABET.indexOf(clean[index + 2] ?? '');
    const d = BASE64_ALPHABET.indexOf(clean[index + 3] ?? '');
    if (a < 0 || b < 0) break;

    const packed = (a << 18) | (b << 12) | (Math.max(c, 0) << 6) | Math.max(d, 0);
    if (outputIndex < output.length) output[outputIndex++] = (packed >> 16) & 0xff;
    if (outputIndex < output.length) output[outputIndex++] = (packed >> 8) & 0xff;
    if (outputIndex < output.length) output[outputIndex++] = packed & 0xff;
  }

  return output;
}

/** Find the compressed scan data, which follows screen content in row order. */
function findJpegScanOffset(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 0;
  let offset = 2;

  while (offset + 3 < bytes.length) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;

    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (marker === 0xda) return offset + segmentLength;
    offset += segmentLength;
  }

  return 0;
}

/**
 * Build a dependency-free visual fingerprint from a tiny JPEG. Dividing the
 * ordered scan data into regions preserves coarse layout changes, while byte
 * histograms remain stable across harmless camera noise and exposure shifts.
 */
export function createVisualSignature(imageBase64: string): VisualSignature {
  const bytes = decodeBase64(imageBase64);
  const scanOffset = findJpegScanOffset(bytes);
  const endOffset = bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
    ? bytes.length - 2
    : bytes.length;
  const dataStart = Math.min(scanOffset, endOffset);
  const dataLength = Math.max(0, endOffset - dataStart);
  const regions = 16;
  const buckets = 16;
  const pixels: number[] = [];

  for (let region = 0; region < regions; region++) {
    const start = dataStart + Math.floor(dataLength * region / regions);
    const end = dataStart + Math.floor(dataLength * (region + 1) / regions);
    const histogram = new Array<number>(buckets).fill(0);

    for (let index = start; index < end; index++) {
      histogram[(bytes[index] ?? 0) >>> 4] += 1;
    }

    const regionLength = Math.max(1, end - start);
    for (const count of histogram) {
      pixels.push(Math.round(count / regionLength * 255));
    }
  }

  return { pixels, sharpness: Math.min(1, dataLength / 6_000) };
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
