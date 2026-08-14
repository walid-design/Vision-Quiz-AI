import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, DEFAULT_SETTINGS, QuizAnswer } from '@/types';

const HISTORY_KEY = '@visionquiz_history';
const SETTINGS_KEY = '@visionquiz_settings';

interface AppContextType {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  history: QuizAnswer[];
  addToHistory: (answer: QuizAnswer) => void;
  clearHistory: () => void;
  updateFeedback: (id: string, feedback: 'correct' | 'incorrect') => void;
  isLoaded: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<QuizAnswer[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted data on mount
  useEffect(() => {
    async function load() {
      try {
        const [storedSettings, storedHistory] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
        ]);
        if (storedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
        }
        if (storedHistory) {
          setHistory(JSON.parse(storedHistory));
        }
      } catch (_) {
        // use defaults on error
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const addToHistory = useCallback((answer: QuizAnswer) => {
    setHistory((prev) => {
      const next = [answer, ...prev].slice(0, 200); // keep last 200
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
  }, []);

  const updateFeedback = useCallback((id: string, feedback: 'correct' | 'incorrect') => {
    setHistory((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, userFeedback: feedback } : item));
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return (
    <AppContext.Provider value={{ settings, updateSettings, history, addToHistory, clearHistory, updateFeedback, isLoaded }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
