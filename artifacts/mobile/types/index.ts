export type AppStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'SETUP_REQUIRED'
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
  autoStart: boolean;
  hapticAlerts: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  subject: 'General Knowledge',
  customSubject: '',
  confidenceThreshold: 0.85,
  frameCompareIntervalMs: 1000,
  changeSensitivity: 0.12,
  stabilizationDelayMs: 1500,
  debugMode: false,
  autoStart: true,
  hapticAlerts: true,
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
