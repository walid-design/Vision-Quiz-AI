import { Platform } from 'react-native';

export interface LocalOcrResult {
  available: boolean;
  text: string;
  fingerprint: string;
  error?: string;
}

type TextRecognitionModule = typeof import('@infinitered/react-native-mlkit-text-recognition');

let modulePromise: Promise<TextRecognitionModule> | null = null;
let permanentlyUnavailable = Platform.OS === 'web';

function loadTextRecognition(): Promise<TextRecognitionModule> {
  if (!modulePromise) {
    modulePromise = import('@infinitered/react-native-mlkit-text-recognition');
  }
  return modulePromise;
}

/**
 * Remove camera/OCR noise while retaining question numbers, values and answer
 * choices. The result is used only for change detection; the original image is
 * still sent to the answer model when a new question is found.
 */
export function createQuestionFingerprint(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\btime\s*(?:left|remaining)?\s*:?\s*\d{1,2}(?::\d{2}){1,2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUsefulQuestionText(fingerprint: string): boolean {
  if (fingerprint.length < 28) return false;
  const meaningfulTokens = fingerprint.split(' ').filter((token) => token.length > 1);
  return meaningfulTokens.length >= 6;
}

function makeNgrams(value: string, size: number): Set<string> {
  const compact = value.replace(/\s+/g, ' ');
  if (compact.length <= size) return new Set(compact ? [compact] : []);
  const grams = new Set<string>();
  for (let index = 0; index <= compact.length - size; index += 1) {
    grams.add(compact.slice(index, index + size));
  }
  return grams;
}

/** Dice similarity is resilient to a few unstable OCR characters. */
export function compareQuestionFingerprints(first: string, second: string): number {
  if (!first || !second) return 0;
  if (first === second) return 1;
  const firstGrams = makeNgrams(first, 3);
  const secondGrams = makeNgrams(second, 3);
  if (!firstGrams.size || !secondGrams.size) return 0;

  let matches = 0;
  for (const gram of firstGrams) {
    if (secondGrams.has(gram)) matches += 1;
  }
  return (2 * matches) / (firstGrams.size + secondGrams.size);
}

/**
 * Run Google ML Kit entirely on the device. Dynamic loading keeps Expo Go and
 * web usable: they fall back to visual change detection instead of crashing
 * because the custom native module is absent.
 */
export async function recognizeQuestionText(imageUri: string): Promise<LocalOcrResult> {
  if (permanentlyUnavailable) {
    return { available: false, text: '', fingerprint: '' };
  }

  let module: TextRecognitionModule;
  try {
    module = await loadTextRecognition();
  } catch (error: unknown) {
    permanentlyUnavailable = true;
    return {
      available: false,
      text: '',
      fingerprint: '',
      error: error instanceof Error ? error.message : 'Local OCR is unavailable',
    };
  }

  try {
    const result = await module.recognizeText(imageUri);
    const text = result.text?.trim() ?? '';
    return {
      available: true,
      text,
      fingerprint: createQuestionFingerprint(text),
    };
  } catch (error: unknown) {
    return {
      available: true,
      text: '',
      fingerprint: '',
      error: error instanceof Error ? error.message : 'Local OCR could not read this frame',
    };
  }
}

