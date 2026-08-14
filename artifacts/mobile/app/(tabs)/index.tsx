import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { StatusIndicator } from '@/components/StatusIndicator';
import { AnswerCard } from '@/components/AnswerCard';
import { CropOverlay } from '@/components/CropOverlay';
import { AppStatus, CropRegion } from '@/types';
import { analyzeQuestion, computeChangeScore, toQuizAnswer } from '@/services/api';
import { useApp } from '@/context/AppContext';

const DEFAULT_CROP: CropRegion = { x: 40, y: 120, width: 280, height: 200 };

export default function CameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, addToHistory, updateFeedback } = useApp();

  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<AppStatus>('IDLE');
  const [cropRegion, setCropRegion] = useState<CropRegion>(DEFAULT_CROP);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [currentResult, setCurrentResult] = useState<ReturnType<typeof toQuizAnswer> | null>(null);
  const [currentAnswerId, setCurrentAnswerId] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const statusRef = useRef<AppStatus>('IDLE');
  const prevFrameRef = useRef<string | null>(null);
  const monitoringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQuestionHashRef = useRef<string | null>(null);
  const stabilizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  statusRef.current = status;

  const stopMonitoring = useCallback(() => {
    if (monitoringRef.current) { clearInterval(monitoringRef.current); monitoringRef.current = null; }
    if (stabilizeTimerRef.current) { clearTimeout(stabilizeTimerRef.current); stabilizeTimerRef.current = null; }
    prevFrameRef.current = null;
    setStatus('IDLE');
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (!cameraRef.current) { setStatus('WATCHING'); return; }
    try {
      setStatus('CAPTURING');
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92, base64: true });
      if (!photo.base64 || !photo.uri) { setStatus('WATCHING'); return; }

      // Crop to detection region (scale from preview to photo dims)
      const scaleX = photo.width / cameraLayout.width;
      const scaleY = photo.height / cameraLayout.height;
      const cropX = Math.max(0, Math.round(cropRegion.x * scaleX));
      const cropY = Math.max(0, Math.round(cropRegion.y * scaleY));
      const cropW = Math.min(photo.width - cropX, Math.round(cropRegion.width * scaleX));
      const cropH = Math.min(photo.height - cropY, Math.round(cropRegion.height * scaleY));

      let imageBase64 = photo.base64;
      if (cropW > 10 && cropH > 10) {
        const cropped = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
          { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (cropped.base64) imageBase64 = cropped.base64;
        if (settings.debugMode) setDebugInfo(`Photo: ${photo.width}x${photo.height} | Crop: ${cropW}x${cropH}`);
      }

      // Duplicate check
      const newHash = imageBase64.slice(0, 100);
      if (newHash === lastQuestionHashRef.current) {
        setStatus('WATCHING');
        return;
      }
      lastQuestionHashRef.current = newHash;

      setStatus('ANALYZING');
      const activeSubject = settings.subject === 'Custom' ? settings.customSubject || 'General Knowledge' : settings.subject;
      const result = await analyzeQuestion(imageBase64, activeSubject);
      if (settings.debugMode) setDebugInfo((prev) => `${prev}\nConf: ${result.confidence} | Time: ${result.processingTimeMs}ms`);

      const quizAnswer = toQuizAnswer(result, activeSubject);
      addToHistory(quizAnswer);
      setCurrentResult(quizAnswer);
      setCurrentAnswerId(quizAnswer.id);
      setStatus('ANSWER_READY');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
      setStatus('WATCHING');
    }
  }, [cameraLayout, cropRegion, settings, addToHistory]);

  const startMonitoring = useCallback(() => {
    setError(null);
    setStatus('WATCHING');
    prevFrameRef.current = null;

    monitoringRef.current = setInterval(async () => {
      const s = statusRef.current;
      if (s !== 'WATCHING' && s !== 'ANSWER_READY') return;
      if (!cameraRef.current) return;

      try {
        const frame = await cameraRef.current.takePictureAsync({ quality: 0.05, base64: true });
        const frameBase64 = frame.base64 ?? '';
        const prev = prevFrameRef.current;
        prevFrameRef.current = frameBase64;

        if (!prev) return;
        const score = computeChangeScore(prev, frameBase64);
        if (settings.debugMode) setDebugInfo(`Change score: ${(score * 100).toFixed(1)}%`);

        if (score > settings.changeSensitivity && s === 'WATCHING') {
          setStatus('CHANGE_DETECTED');
          stabilizeTimerRef.current = setTimeout(() => {
            setStatus('STABILIZING');
            stabilizeTimerRef.current = setTimeout(captureAndAnalyze, settings.stabilizationDelayMs);
          }, 200);
        }
      } catch (_) {}
    }, settings.frameCompareIntervalMs);
  }, [settings, captureAndAnalyze]);

  const handleCaptureTest = useCallback(async () => {
    if (statusRef.current === 'ANALYZING' || statusRef.current === 'VERIFYING') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const wasWatching = statusRef.current === 'WATCHING';
    if (wasWatching && monitoringRef.current) {
      clearInterval(monitoringRef.current);
      monitoringRef.current = null;
    }
    await captureAndAnalyze();
    if (wasWatching) startMonitoring();
  }, [captureAndAnalyze, startMonitoring]);

  useEffect(() => () => stopMonitoring(), [stopMonitoring]);

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Checking camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={56} color={colors.mutedForeground} />
        <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera Access Required</Text>
        <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
          VisionQuiz AI needs your camera to monitor and capture questions.
        </Text>
        {permission.canAskAgain ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Grant Camera Access</Text>
          </TouchableOpacity>
        ) : (
          Platform.OS !== 'web' && (
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              Please enable camera access in your device Settings.
            </Text>
          )
        )}
      </View>
    );
  }

  const isMonitoring = status !== 'IDLE';

  return (
    <View style={[styles.root, { backgroundColor: '#000' }]}>
      {/* Camera preview */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onLayout={(e) =>
          setCameraLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
        }
      />

      {/* Crop overlay */}
      {cameraLayout.width > 0 && (
        <CropOverlay
          region={cropRegion}
          onRegionChange={setCropRegion}
          containerWidth={cameraLayout.width}
          containerHeight={cameraLayout.height}
        />
      )}

      {/* Top header bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.appTitle}>VisionQuiz AI</Text>
        <StatusIndicator status={status} />
      </View>

      {/* Error banner */}
      {!!error && (
        <View style={[styles.errorBanner, { top: insets.top + 60 }]}>
          <Ionicons name="warning-outline" size={14} color="#fff" />
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Debug panel */}
      {settings.debugMode && !!debugInfo && (
        <View style={[styles.debugPanel, { top: insets.top + 62 }]}>
          <Text style={styles.debugText}>{debugInfo}</Text>
        </View>
      )}

      {/* Bottom panel */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 8 }]}>
        {/* Answer card */}
        {currentResult && status === 'ANSWER_READY' && (
          <ScrollView style={styles.answerScroll} showsVerticalScrollIndicator={false}>
            <AnswerCard
              result={currentResult}
              onDismiss={() => {
                setStatus(isMonitoring ? 'WATCHING' : 'IDLE');
                setCurrentResult(null);
              }}
              onMarkCorrect={() => currentAnswerId && updateFeedback(currentAnswerId, 'correct')}
              onMarkIncorrect={() => currentAnswerId && updateFeedback(currentAnswerId, 'incorrect')}
              userFeedback={currentResult.userFeedback}
              showFeedback
            />
          </ScrollView>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {/* Capture Test button */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
            onPress={handleCaptureTest}
            disabled={status === 'ANALYZING' || status === 'VERIFYING' || status === 'CAPTURING'}
          >
            <Ionicons name="camera" size={24} color="#fff" />
          </TouchableOpacity>

          {/* Start / Stop monitoring */}
          <TouchableOpacity
            style={[
              styles.mainBtn,
              { backgroundColor: isMonitoring ? colors.destructive : colors.primary },
            ]}
            onPress={() => {
              if (isMonitoring) {
                stopMonitoring();
                setCurrentResult(null);
              } else {
                startMonitoring();
              }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
          >
            <Ionicons name={isMonitoring ? 'stop' : 'play'} size={26} color="#fff" />
            <Text style={styles.mainBtnText}>{isMonitoring ? 'Stop' : 'Start Monitoring'}</Text>
          </TouchableOpacity>

          {/* Reset crop */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
            onPress={() => setCropRegion(DEFAULT_CROP)}
          >
            <Ionicons name="crop-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  permTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  bodyText: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  primaryBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  primaryBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  appTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },

  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(220,38,38,0.9)',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { flex: 1, color: '#fff', fontSize: 13, fontFamily: 'Inter_400Regular' },

  debugPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    padding: 8,
  },
  debugText: { color: '#0ea5e9', fontSize: 11, fontFamily: 'Inter_400Regular' },

  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  answerScroll: { maxHeight: 280 },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  iconBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 28,
    gap: 10,
  },
  mainBtnText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
});
