export type AppStatus =
  | 'IDLE'
  | 'WATCHING'
  | 'CHANGE_DETECTED'
  | 'STABILIZING'
  | 'CAPTURING'
  | 'ANALYZING'
  | 'VERIFYING'
  | 'ANSWER_READY';

export interface CropRegion {
  x: number;      // pixels from left of camera preview
  y: number;      // pixels from top of camera preview
  width: number;  // pixels
  height: number; // pixels
}

export interface QuizAnswer {
  id: string;
  timestamp: number;
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
  subject: string;
  userFeedback?: 'correct' | 'incorrect';
}

export interface AppSettings {
  subject: string;
  customSubject: string;
  confidenceThreshold: number;
  frameCompareIntervalMs: number;
  changeSensitivity: number;
  stabilizationDelayMs: number;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  subject: 'General Knowledge',
  customSubject: '',
  confidenceThreshold: 0.85,
  frameCompareIntervalMs: 2000,
  changeSensitivity: 0.12,
  stabilizationDelayMs: 1500,
  debugMode: false,
};

export const SUBJECTS = [
  'General Knowledge',
  'Computer Science',
  'Artificial Intelligence',
  'Networking',
  'Cybersecurity',
  'AWS',
  'Microsoft Azure',
  'Google Cloud',
  'Cisco',
  'CompTIA',
  'Scrum',
  'Product Owner',
  'Project Management',
  'Software Engineering',
  'Database',
  'Custom',
] as const;

export type Subject = typeof SUBJECTS[number];
