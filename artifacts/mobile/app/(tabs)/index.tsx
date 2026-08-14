import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnswerCard } from '@/components/AnswerCard';
import { AppIcon } from '@/components/AppIcon';
import { StatusIndicator } from '@/components/StatusIndicator';
import { useApp } from '@/context/AppContext';
import {
  ApiRequestError,
  analyzeQuestion,
  computeChangeScore,
  createVisualSignature,
  getQuizReadiness,
  toQuizAnswer,
  type VisualSignature,
} from '@/services/api';
import {
  compareQuestionFingerprints,
  isUsefulQuestionText,
  recognizeQuestionText,
} from '@/services/localOcr';
import { type AppStatus } from '@/types';

const INITIAL_SCAN_DELAY_MS = 500;
const REQUIRED_STABLE_SAMPLES = 1;
const VISUAL_CHANGE_CONFIRM_SAMPLES = 2;
const INITIAL_ANALYSIS_DEADLINE_MS = 1_600;
const CHANGE_SETTLE_DEADLINE_MS = 3_000;
const NO_QUESTION_RETRY_MS = 6_000;
const TRANSIENT_ERROR_RETRY_MS = 4_000;
const MAX_ERROR_RETRY_MS = 60_000;
const MIN_REANALYSIS_GAP_MS = 3_500;
const FALLBACK_RECHECK_MS = 45_000;
const OCR_STABLE_SIMILARITY = 0.82;
const OCR_CHANGE_SIMILARITY = 0.72;
const REQUIRED_OCR_STABLE_SAMPLES = 2;

type ServiceState = 'checking' | 'ready' | 'setup-required' | 'unreachable';

export default function LiveAssistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, addToHistory, updateFeedback } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<AppStatus>('IDLE');
  const [currentResult, setCurrentResult] = useState<ReturnType<typeof toQuizAnswer> | null>(null);
  const [guidance, setGuidance] = useState('Point the camera at a complete multiple-choice question.');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [serviceState, setServiceState] = useState<ServiceState>('checking');
  const [serviceMessage, setServiceMessage] = useState('Checking the AI service…');

  const cameraRef = useRef<CameraView>(null);
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const activeRef = useRef(false);
  const runIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readinessAbortRef = useRef<AbortController | null>(null);
  const previousSignatureRef = useRef<VisualSignature | null>(null);
  const submittedSignatureRef = useRef<VisualSignature | null>(null);
  const pendingChangeRef = useRef(false);
  const stableSamplesRef = useRef(0);
  const hasSubmittedFrameRef = useRef(false);
  const stabilizationStartedAtRef = useRef(Date.now());
  const nextAnalysisAllowedAtRef = useRef(0);
  const autoRecheckAtRef = useRef(0);
  const visualChangeSamplesRef = useRef(0);
  const latestOcrFingerprintRef = useRef('');
  const ocrCandidateRef = useRef('');
  const submittedOcrFingerprintRef = useRef('');
  const ocrStableSamplesRef = useRef(0);
  const consecutiveAnalysisErrorsRef = useRef(0);
  const forceAnalyzeRef = useRef(false);
  const cycleInFlightRef = useRef(false);
  const analysisInFlightRef = useRef(false);
  const serviceReadyRef = useRef(false);
  const lastQuestionKeyRef = useRef<string | null>(null);
  const currentResultRef = useRef(currentResult);

  currentResultRef.current = currentResult;

  const clearScheduledWork = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const stopMonitoring = useCallback((updateUi = true) => {
    activeRef.current = false;
    runIdRef.current += 1;
    clearScheduledWork();
    previousSignatureRef.current = null;
    pendingChangeRef.current = false;
    stableSamplesRef.current = 0;
    visualChangeSamplesRef.current = 0;
    latestOcrFingerprintRef.current = '';
    ocrCandidateRef.current = '';
    submittedOcrFingerprintRef.current = '';
    ocrStableSamplesRef.current = 0;
    forceAnalyzeRef.current = false;
    if (updateUi && mountedRef.current) {
      setRunning(false);
      setStatus('IDLE');
      setGuidance('Live Assist paused');
    }
  }, [clearScheduledWork]);

  const checkServiceReadiness = useCallback(async () => {
    readinessAbortRef.current?.abort();
    const controller = new AbortController();
    readinessAbortRef.current = controller;
    setServiceState('checking');
    setServiceMessage('Checking the AI service…');
    setStatus('CONNECTING');
    setGuidance('Connecting Live Assist…');

    try {
      const readiness = await getQuizReadiness(controller.signal);
      if (controller.signal.aborted || !mountedRef.current) return;

      serviceReadyRef.current = readiness.ready;
      setServiceMessage(readiness.message);
      if (readiness.ready) {
        setServiceState('ready');
        setError(null);
        setStatus(currentResultRef.current ? 'ANSWER_READY' : 'WATCHING');
        setGuidance(
          currentResultRef.current
            ? 'Answer ready · Watching for the next question'
            : 'AI connected · Looking for a complete question…',
        );
      } else {
        stopMonitoring(false);
        setRunning(false);
        setServiceState('setup-required');
        setStatus('SETUP_REQUIRED');
        setGuidance('Connect the AI service to receive answers.');
      }
    } catch (caught: unknown) {
      if (controller.signal.aborted || !mountedRef.current) return;
      const message = caught instanceof Error ? caught.message : 'The AI service is unreachable.';
      stopMonitoring(false);
      serviceReadyRef.current = false;
      setRunning(false);
      setServiceState('unreachable');
      setServiceMessage(message);
      setStatus('SETUP_REQUIRED');
      setGuidance('The AI service is currently unreachable.');
    } finally {
      if (readinessAbortRef.current === controller) readinessAbortRef.current = null;
    }
  }, [stopMonitoring]);

  const captureAndAnalyze = useCallback(async (
    runId: number,
    signature: VisualSignature,
    ocrFingerprint = latestOcrFingerprintRef.current,
  ) => {
    if (
      !cameraRef.current ||
      !activeRef.current ||
      runId !== runIdRef.current ||
      analysisInFlightRef.current
    ) return;

    analysisInFlightRef.current = true;
    submittedSignatureRef.current = signature;

    try {
      setStatus('CAPTURING');
      setGuidance('Reading the question…');
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.82 });
      if (!photo.uri || !activeRef.current || runId !== runIdRef.current) return;

      const actions: ImageManipulator.Action[] = photo.width > 1600 ? [{ resize: { width: 1600 } }] : [];
      const prepared = await ImageManipulator.manipulateAsync(
        photo.uri,
        actions,
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!prepared.base64 || !activeRef.current || runId !== runIdRef.current) return;

      setStatus('ANALYZING');
      setGuidance('Finding the best answer…');
      const activeSubject = settings.subject === 'Custom'
        ? settings.customSubject.trim() || 'General Knowledge'
        : settings.subject;
      const controller = new AbortController();
      abortRef.current = controller;
      const result = await analyzeQuestion(
        prepared.base64,
        activeSubject,
        settings.confidenceThreshold,
        controller.signal,
      );
      abortRef.current = null;
      if (!activeRef.current || runId !== runIdRef.current) return;

      pendingChangeRef.current = false;
      stableSamplesRef.current = 0;
      previousSignatureRef.current = null;
      stabilizationStartedAtRef.current = Date.now();

      if (!result.questionDetected) {
        hasSubmittedFrameRef.current = false;
        submittedOcrFingerprintRef.current = '';
        nextAnalysisAllowedAtRef.current = Date.now() + NO_QUESTION_RETRY_MS;
        autoRecheckAtRef.current = 0;
        setStatus('WATCHING');
        setGuidance(result.captureGuidance || 'Move closer and include every answer choice.');
        return;
      }

      hasSubmittedFrameRef.current = true;
      submittedOcrFingerprintRef.current = ocrFingerprint;
      consecutiveAnalysisErrorsRef.current = 0;
      const completedAt = Date.now();
      nextAnalysisAllowedAtRef.current = completedAt + MIN_REANALYSIS_GAP_MS;
      const questionKey = `${result.question}|${Object.values(result.options).join('|')}`
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      const isNewQuestion = questionKey !== lastQuestionKeyRef.current;
      if (isNewQuestion) {
        const quizAnswer = toQuizAnswer(result, activeSubject);
        lastQuestionKeyRef.current = questionKey;
        addToHistory(quizAnswer);
        setCurrentResult(quizAnswer);
        if (settings.hapticAlerts) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }

      autoRecheckAtRef.current = completedAt + FALLBACK_RECHECK_MS;

      setError(null);
      setStatus('ANSWER_READY');
      setGuidance('Answer ready · Watching for the next question');
      if (settings.debugMode) {
        setDebugInfo(`AI ${result.processingTimeMs}ms · confidence ${Math.round(result.confidence * 100)}%`);
      }
    } catch (caught: unknown) {
      abortRef.current = null;
      if (!activeRef.current || runId !== runIdRef.current) return;
      const message = caught instanceof Error ? caught.message : 'Analysis failed. Please try again.';
      if (message === 'Analysis cancelled') return;

      if (caught instanceof ApiRequestError && caught.code === 'CONFIG_ERROR') {
        serviceReadyRef.current = false;
        activeRef.current = false;
        setRunning(false);
        setServiceState('setup-required');
        setServiceMessage(message);
        setStatus('SETUP_REQUIRED');
        setGuidance('Connect the AI service to receive answers.');
        return;
      }

      setError(message);
      setGuidance('Live Assist will retry automatically…');
      pendingChangeRef.current = hasSubmittedFrameRef.current;
      stableSamplesRef.current = 0;
      visualChangeSamplesRef.current = 0;
      stabilizationStartedAtRef.current = Date.now();
      consecutiveAnalysisErrorsRef.current += 1;
      const retryDelay = Math.min(
        MAX_ERROR_RETRY_MS,
        TRANSIENT_ERROR_RETRY_MS * 2 ** Math.max(0, consecutiveAnalysisErrorsRef.current - 1),
      );
      nextAnalysisAllowedAtRef.current = Date.now() + retryDelay;
      autoRecheckAtRef.current = nextAnalysisAllowedAtRef.current + FALLBACK_RECHECK_MS;
      setStatus('WATCHING');
    } finally {
      analysisInFlightRef.current = false;
    }
  }, [addToHistory, settings]);

  const runMonitoringCycle = useCallback(async function cycle(runId: number): Promise<void> {
    if (!activeRef.current || runId !== runIdRef.current) return;
    if (cycleInFlightRef.current) {
      timerRef.current = setTimeout(() => void cycle(runId), 250);
      return;
    }
    cycleInFlightRef.current = true;

    try {
      if (!cameraRef.current || !cameraReadyRef.current) return;
      const frame = await cameraRef.current.takePictureAsync({ quality: 0.32 });
      if (!frame.uri || !activeRef.current || runId !== runIdRef.current) return;

      // Crop to the scan guide before OCR so browser chrome, timers and the
      // taskbar do not make an unchanged question look different.
      const cropOriginX = Math.max(0, Math.floor(frame.width * 0.02));
      const cropOriginY = Math.max(0, Math.floor(frame.height * 0.18));
      const cropWidth = Math.max(1, Math.min(frame.width - cropOriginX, Math.floor(frame.width * 0.96)));
      const cropHeight = Math.max(1, Math.min(frame.height - cropOriginY, Math.floor(frame.height * 0.5)));
      const monitorActions: ImageManipulator.Action[] = [{
        crop: {
          originX: cropOriginX,
          originY: cropOriginY,
          width: cropWidth,
          height: cropHeight,
        },
      }];
      if (cropWidth > 1100) monitorActions.push({ resize: { width: 1100 } });

      const monitorFrame = await ImageManipulator.manipulateAsync(
        frame.uri,
        monitorActions,
        { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!monitorFrame.base64 || !activeRef.current || runId !== runIdRef.current) return;

      const signature = createVisualSignature(monitorFrame.base64);
      const previous = previousSignatureRef.current;
      previousSignatureRef.current = signature;

      const localOcr = await recognizeQuestionText(monitorFrame.uri);
      const ocrUseful = localOcr.available && isUsefulQuestionText(localOcr.fingerprint);
      const ocrFingerprint = ocrUseful ? localOcr.fingerprint : '';
      if (ocrUseful) {
        latestOcrFingerprintRef.current = ocrFingerprint;
        const candidateSimilarity = compareQuestionFingerprints(ocrCandidateRef.current, ocrFingerprint);
        if (ocrCandidateRef.current && candidateSimilarity >= OCR_STABLE_SIMILARITY) {
          ocrStableSamplesRef.current += 1;
        } else {
          ocrCandidateRef.current = ocrFingerprint;
          ocrStableSamplesRef.current = 1;
        }
        if (hasSubmittedFrameRef.current && !submittedOcrFingerprintRef.current) {
          submittedOcrFingerprintRef.current = ocrFingerprint;
        }
      } else {
        latestOcrFingerprintRef.current = '';
        ocrStableSamplesRef.current = 0;
      }

      const now = Date.now();
      const canAnalyze = now >= nextAnalysisAllowedAtRef.current;
      const submittedOcrSimilarity = submittedOcrFingerprintRef.current && ocrFingerprint
        ? compareQuestionFingerprints(submittedOcrFingerprintRef.current, ocrFingerprint)
        : 1;
      const ocrCandidateChanged =
        hasSubmittedFrameRef.current &&
        ocrUseful &&
        Boolean(submittedOcrFingerprintRef.current) &&
        submittedOcrSimilarity < OCR_CHANGE_SIMILARITY;
      const ocrChangeConfirmed =
        ocrCandidateChanged && ocrStableSamplesRef.current >= REQUIRED_OCR_STABLE_SAMPLES;

      if (forceAnalyzeRef.current && canAnalyze) {
        forceAnalyzeRef.current = false;
        await captureAndAnalyze(runId, signature, ocrFingerprint);
        return;
      }

      if (ocrCandidateChanged && !ocrChangeConfirmed) {
        setStatus('CHANGE_DETECTED');
        setGuidance('New question detected - hold steady');
      }
      if (ocrChangeConfirmed && canAnalyze) {
        setGuidance('New question detected - reading it now');
        await captureAndAnalyze(runId, signature, ocrFingerprint);
        return;
      }

      // ML Kit text is the primary trigger. Visual comparison and one slow
      // safety check remain available when native OCR cannot read the frame.
      const elapsedStabilizing = now - stabilizationStartedAtRef.current;
      const localTextReady = ocrUseful && ocrStableSamplesRef.current >= REQUIRED_OCR_STABLE_SAMPLES;
      const initialAnalysisDue =
        !hasSubmittedFrameRef.current &&
        canAnalyze &&
        (localTextReady || elapsedStabilizing >= CHANGE_SETTLE_DEADLINE_MS);
      const automaticRecheckDue =
        hasSubmittedFrameRef.current &&
        canAnalyze &&
        !ocrUseful &&
        autoRecheckAtRef.current > 0 &&
        now >= autoRecheckAtRef.current;

      if (initialAnalysisDue || automaticRecheckDue) {
        setGuidance(initialAnalysisDue ? 'Reading the visible question…' : 'Checking for the next question…');
        await captureAndAnalyze(runId, signature, ocrFingerprint);
        return;
      }

      if (!previous) {
        stableSamplesRef.current = 0;
        if (currentResultRef.current) {
          setStatus('ANSWER_READY');
          setGuidance('Watching for the next question');
        } else if (now >= nextAnalysisAllowedAtRef.current) {
          setStatus('STABILIZING');
          setGuidance('Hold steady for a moment…');
        }
      } else {
        const score = computeChangeScore(previous.pixels, signature.pixels);
        const referenceScore = submittedSignatureRef.current
          ? computeChangeScore(submittedSignatureRef.current.pixels, signature.pixels)
          : 0;
        // The setting is expressed as sensitivity: a higher value lowers the
        // visual-difference threshold and reacts to smaller screen changes.
        const changeThreshold = Math.max(0.018, 0.033 - settings.changeSensitivity * 0.06);
        // Camera noise and monitor refresh patterns can exceed very small
        // thresholds even when the phone is still, so allow a practical floor.
        const stableThreshold = Math.max(0.011, Math.min(0.015, changeThreshold * 0.55));
        const isStable = score <= stableThreshold;

        if (settings.debugMode && !localOcr.available) {
          setDebugInfo(
            `Frame ${(score * 100).toFixed(1)}% · question ${(referenceScore * 100).toFixed(1)}% · detail ${(signature.sharpness * 100).toFixed(1)}%`,
          );
        }
        if (settings.debugMode && localOcr.available) {
          const match = submittedOcrFingerprintRef.current && ocrFingerprint
            ? ` - match ${Math.round(submittedOcrSimilarity * 100)}%`
            : '';
          setDebugInfo(`Local OCR ${ocrUseful ? `${localOcr.text.length} chars` : 'searching'}${match}`);
        }

        visualChangeSamplesRef.current = !ocrUseful && referenceScore >= changeThreshold
          ? visualChangeSamplesRef.current + 1
          : 0;

        if (
          hasSubmittedFrameRef.current &&
          !ocrUseful &&
          !pendingChangeRef.current &&
          visualChangeSamplesRef.current >= VISUAL_CHANGE_CONFIRM_SAMPLES
        ) {
          pendingChangeRef.current = true;
          stableSamplesRef.current = 0;
          visualChangeSamplesRef.current = 0;
          stabilizationStartedAtRef.current = now;
          setStatus('CHANGE_DETECTED');
          setGuidance('New content detected · Hold steady');
        }

        if (!hasSubmittedFrameRef.current && !ocrUseful) {
          stableSamplesRef.current = isStable ? stableSamplesRef.current + 1 : 0;
          const deadlineReached = now - stabilizationStartedAtRef.current >= INITIAL_ANALYSIS_DEADLINE_MS;
          if (canAnalyze && stableSamplesRef.current > 0) {
            setStatus('STABILIZING');
            setGuidance('Question detected · Hold steady');
          }
          if (canAnalyze && (stableSamplesRef.current >= REQUIRED_STABLE_SAMPLES || deadlineReached)) {
            await captureAndAnalyze(runId, signature, ocrFingerprint);
          }
        } else if (!hasSubmittedFrameRef.current) {
          setStatus('STABILIZING');
          setGuidance('Question text detected - hold steady');
        } else if (!ocrUseful && pendingChangeRef.current) {
          stableSamplesRef.current = isStable ? stableSamplesRef.current + 1 : 0;
          const deadlineReached = now - stabilizationStartedAtRef.current >= CHANGE_SETTLE_DEADLINE_MS;
          if (stableSamplesRef.current > 0) {
            setStatus('STABILIZING');
            setGuidance('New question detected · Finishing capture');
          }
          if (canAnalyze && (stableSamplesRef.current >= REQUIRED_STABLE_SAMPLES || deadlineReached)) {
            await captureAndAnalyze(runId, signature, ocrFingerprint);
          }
        } else if (currentResultRef.current) {
          setStatus('ANSWER_READY');
        } else {
          setStatus('WATCHING');
        }
      }
    } catch (caught: unknown) {
      if (activeRef.current && runId === runIdRef.current) {
        const message = caught instanceof Error ? caught.message : 'Camera frame unavailable';
        setError(message);
        setStatus('WATCHING');
      }
    } finally {
      cycleInFlightRef.current = false;
      if (activeRef.current && runId === runIdRef.current) {
        timerRef.current = setTimeout(
          () => void cycle(runId),
          Math.max(750, settings.frameCompareIntervalMs),
        );
      }
    }
  }, [captureAndAnalyze, settings]);

  const startMonitoring = useCallback(() => {
    if (!serviceReadyRef.current || !cameraReadyRef.current || !permission?.granted || activeRef.current) return;
    clearScheduledWork();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    activeRef.current = true;
    previousSignatureRef.current = null;
    submittedSignatureRef.current = null;
    hasSubmittedFrameRef.current = false;
    pendingChangeRef.current = false;
    stableSamplesRef.current = 0;
    visualChangeSamplesRef.current = 0;
    autoRecheckAtRef.current = 0;
    latestOcrFingerprintRef.current = '';
    ocrCandidateRef.current = '';
    submittedOcrFingerprintRef.current = '';
    ocrStableSamplesRef.current = 0;
    consecutiveAnalysisErrorsRef.current = 0;
    stabilizationStartedAtRef.current = Date.now();
    nextAnalysisAllowedAtRef.current = 0;
    setRunning(true);
    setError(null);
    setStatus('WATCHING');
    setGuidance('Looking for a complete question…');
    timerRef.current = setTimeout(() => void runMonitoringCycle(runId), INITIAL_SCAN_DELAY_MS);
  }, [clearScheduledWork, permission?.granted, runMonitoringCycle]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      void checkServiceReadiness();
      return () => {
        focusedRef.current = false;
        readinessAbortRef.current?.abort();
        readinessAbortRef.current = null;
        stopMonitoring(false);
      };
    }, [checkServiceReadiness, stopMonitoring]),
  );

  useEffect(() => {
    cameraReadyRef.current = cameraReady;
    if (cameraReady && serviceState === 'ready' && focusedRef.current && settings.autoStart) startMonitoring();
  }, [cameraReady, serviceState, settings.autoStart, startMonitoring]);

  useEffect(() => {
    if (serviceState === 'ready' && cameraReadyRef.current && focusedRef.current && settings.autoStart) {
      startMonitoring();
    }
  }, [serviceState, settings.autoStart, startMonitoring]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        stopMonitoring(false);
      } else if (focusedRef.current) {
        if (serviceReadyRef.current && cameraReadyRef.current && settings.autoStart) startMonitoring();
        else void checkServiceReadiness();
      }
    });
    return () => subscription.remove();
  }, [checkServiceReadiness, settings.autoStart, startMonitoring, stopMonitoring]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readinessAbortRef.current?.abort();
      stopMonitoring(false);
    };
  }, [stopMonitoring]);

  const handleCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
    setCameraReady(true);
  }, []);

  const requestImmediateAnalysis = useCallback(() => {
    if (!serviceReadyRef.current) {
      void checkServiceReadiness();
      return;
    }

    if (!activeRef.current) startMonitoring();
    forceAnalyzeRef.current = true;
    nextAnalysisAllowedAtRef.current = 0;
    stabilizationStartedAtRef.current = 0;
    setError(null);
    setStatus('CAPTURING');
    setGuidance('Preparing a clear frame…');

    if (!cycleInFlightRef.current && activeRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      const runId = runIdRef.current;
      timerRef.current = setTimeout(() => void runMonitoringCycle(runId), 0);
    }
  }, [checkServiceReadiness, runMonitoringCycle, startMonitoring]);

  if (!permission) {
    return <LoadingScreen label="Preparing Live Assist…" />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionRoot}>
        <LinearGradient colors={['#080812', '#10152a']} style={StyleSheet.absoluteFill} />
        <View style={styles.permissionIcon}>
          <AppIcon name="scan" size={34} color="#38bdf8" />
        </View>
        <Text style={styles.permissionTitle}>Turn on Live Assist</Text>
        <Text style={styles.permissionBody}>
          Camera access lets VisionQuiz automatically read questions and show answers—without taking photos manually.
        </Text>
        {permission.canAskAgain ? (
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Allow camera access"
          >
            <AppIcon name="camera" size={20} color="#fff" />
            <Text style={styles.permissionButtonText}>Allow Camera Access</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.permissionHint}>Enable camera access from your device settings.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        animateShutter={false}
        onCameraReady={handleCameraReady}
        onMountError={(event) => setError(event.message)}
      />

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(3,6,18,0.82)', 'rgba(3,6,18,0.04)', 'rgba(3,6,18,0.08)', 'rgba(3,6,18,0.94)']}
        locations={[0, 0.22, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View pointerEvents="none" style={styles.scanGuide}>
        <View style={[styles.corner, styles.cornerTopLeft]} />
        <View style={[styles.corner, styles.cornerTopRight]} />
        <View style={[styles.corner, styles.cornerBottomLeft]} />
        <View style={[styles.corner, styles.cornerBottomRight]} />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.eyebrow}>VISIONQUIZ AI</Text>
          <Text style={styles.title}>Live Assist</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/history')}
            accessibilityRole="button"
            accessibilityLabel="Open answer history"
          >
            <AppIcon name="clock" size={21} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/settings')}
            accessibilityRole="button"
            accessibilityLabel="Open Live Assist settings"
          >
            <AppIcon name="settings" size={21} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.statusArea, { top: insets.top + 78 }]} pointerEvents="none">
        <StatusIndicator status={status} />
        <Text style={styles.guidance} numberOfLines={2}>{guidance}</Text>
      </View>

      {!!error && (
        <View style={[styles.errorBanner, { top: insets.top + 146 }]}>
          <AppIcon name="warning" size={16} color="#fecaca" />
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)} hitSlop={8}>
            <AppIcon name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {settings.debugMode && !!debugInfo && (
        <View style={[styles.debugPanel, { top: insets.top + (error ? 204 : 146) }]} pointerEvents="none">
          <Text style={styles.debugText}>{debugInfo}</Text>
        </View>
      )}

      <View style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        {currentResult && (
          <ScrollView style={styles.answerWrap} showsVerticalScrollIndicator={false}>
            <AnswerCard
              result={currentResult}
              onDismiss={() => setCurrentResult(null)}
              onMarkCorrect={() => {
                updateFeedback(currentResult.id, 'correct');
                setCurrentResult((value) => value ? { ...value, userFeedback: 'correct' } : value);
              }}
              onMarkIncorrect={() => {
                updateFeedback(currentResult.id, 'incorrect');
                setCurrentResult((value) => value ? { ...value, userFeedback: 'incorrect' } : value);
              }}
              userFeedback={currentResult.userFeedback}
              showFeedback
            />
          </ScrollView>
        )}

        {serviceState !== 'ready' ? (
          <View style={styles.setupCard}>
            <View style={styles.setupIcon}>
              {serviceState === 'checking' ? (
                <ActivityIndicator color="#38bdf8" size="small" />
              ) : (
                <AppIcon name="sparkles" size={21} color="#38bdf8" />
              )}
            </View>
            <View style={styles.setupText}>
              <Text style={styles.setupTitle}>
                {serviceState === 'checking' ? 'Connecting AI' : 'Connect AI to begin'}
              </Text>
              <Text style={styles.setupMessage}>{serviceMessage}</Text>
            </View>
            {serviceState !== 'checking' && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => void checkServiceReadiness()}
                accessibilityRole="button"
                accessibilityLabel="Check AI connection again"
              >
                <AppIcon name="refresh" size={18} color="#fff" />
                <Text style={styles.retryText}>Check</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {running && (
              <TouchableOpacity
                style={styles.analyzeNowButton}
                onPress={requestImmediateAnalysis}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Check the visible question now"
              >
                <AppIcon name="scan" size={17} color="#bae6fd" />
                <Text style={styles.analyzeNowText}>Check now</Text>
              </TouchableOpacity>
            )}
            <View style={styles.controlBar}>
              <View style={styles.controlText}>
                <View style={[styles.liveDot, !running && styles.pausedDot]} />
                <View style={styles.controlCopy}>
                  <Text style={styles.controlTitle}>{running ? 'Live monitoring' : 'Monitoring paused'}</Text>
                  <Text style={styles.controlSubtitle} numberOfLines={1}>
                    {running ? 'Answers appear automatically' : 'Tap Resume to continue'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.pauseButton, !running && styles.resumeButton]}
                onPress={() => {
                  if (running) stopMonitoring(); else startMonitoring();
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={running ? 'Pause Live Assist' : 'Resume Live Assist'}
              >
                <AppIcon name={running ? 'pause' : 'play'} size={19} color="#fff" />
                <Text style={styles.pauseText}>{running ? 'Pause' : 'Resume'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <View style={styles.loadingRoot}>
      <ActivityIndicator color="#38bdf8" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030612' },
  loadingRoot: { flex: 1, backgroundColor: '#070710', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#9aa8cc', fontSize: 14, fontFamily: 'Inter_500Medium' },
  permissionRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, gap: 16 },
  permissionIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(56,189,248,0.12)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)', marginBottom: 4 },
  permissionTitle: { color: '#f8fafc', fontSize: 28, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  permissionBody: { color: '#9aa8cc', fontSize: 15, lineHeight: 23, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 420 },
  permissionButton: { marginTop: 8, height: 54, borderRadius: 27, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0ea5e9' },
  permissionButtonText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  permissionHint: { color: '#f59e0b', fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 18, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#38bdf8', fontSize: 9, letterSpacing: 1.8, fontFamily: 'Inter_700Bold' },
  title: { color: '#fff', fontSize: 23, lineHeight: 28, fontFamily: 'Inter_700Bold' },
  headerActions: { flexDirection: 'row', gap: 9 },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,12,28,0.64)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statusArea: { position: 'absolute', left: 18, right: 18, alignItems: 'center', gap: 8 },
  guidance: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18, fontFamily: 'Inter_500Medium', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 5 },
  scanGuide: { position: 'absolute', top: '23%', left: 25, right: 25, height: '34%' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: 'rgba(56,189,248,0.78)' },
  cornerTopLeft: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2, borderTopLeftRadius: 10 },
  cornerTopRight: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2, borderTopRightRadius: 10 },
  cornerBottomLeft: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: 10 },
  cornerBottomRight: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2, borderBottomRightRadius: 10 },
  errorBanner: { position: 'absolute', left: 18, right: 18, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(153,27,27,0.92)', borderWidth: 1, borderColor: 'rgba(254,202,202,0.24)', flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorText: { flex: 1, color: '#fff', fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  debugPanel: { position: 'absolute', left: 18, right: 18, borderRadius: 10, padding: 9, backgroundColor: 'rgba(3,6,18,0.8)' },
  debugText: { color: '#7dd3fc', fontSize: 10, fontFamily: 'Inter_500Medium' },
  bottomArea: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, gap: 10 },
  answerWrap: { maxHeight: Platform.OS === 'web' ? 360 : 330 },
  setupCard: { minHeight: 92, padding: 14, borderRadius: 22, backgroundColor: 'rgba(7,10,23,0.94)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  setupIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(56,189,248,0.12)', alignItems: 'center', justifyContent: 'center' },
  setupText: { flex: 1, minWidth: 0 },
  setupTitle: { color: '#f8fafc', fontSize: 14, fontFamily: 'Inter_700Bold' },
  setupMessage: { color: '#9aa8cc', fontSize: 11, lineHeight: 16, marginTop: 4, fontFamily: 'Inter_400Regular' },
  retryButton: { minWidth: 62, height: 40, paddingHorizontal: 10, borderRadius: 20, backgroundColor: '#0ea5e9', flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  analyzeNowButton: { alignSelf: 'flex-end', height: 38, borderRadius: 19, paddingHorizontal: 13, backgroundColor: 'rgba(7,10,23,0.82)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.45)', flexDirection: 'row', alignItems: 'center', gap: 7 },
  analyzeNowText: { color: '#bae6fd', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  controlBar: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: 'rgba(7,10,23,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  controlText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  controlCopy: { flex: 1, minWidth: 0 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#10b981', shadowColor: '#10b981', shadowOpacity: 0.8, shadowRadius: 6 },
  pausedDot: { backgroundColor: '#64748b', shadowOpacity: 0 },
  controlTitle: { color: '#f8fafc', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  controlSubtitle: { color: '#7c8aaa', fontSize: 10, marginTop: 2, fontFamily: 'Inter_400Regular' },
  pauseButton: { height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.18)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.36)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  resumeButton: { backgroundColor: '#0ea5e9', borderColor: '#38bdf8' },
  pauseText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
