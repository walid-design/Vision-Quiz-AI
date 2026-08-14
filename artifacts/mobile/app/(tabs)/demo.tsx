import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AnswerCard } from '@/components/AnswerCard';
import { analyzeQuestion, toQuizAnswer } from '@/services/api';
import { useApp } from '@/context/AppContext';

export default function DemoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, addToHistory, updateFeedback } = useApp();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof toQuizAnswer> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('Photo library access is required to pick images.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]) return;
    await processPickedImage(picked.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setError('Camera access is required to take a photo.');
      return;
    }
    const photo = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 1 });
    if (photo.canceled || !photo.assets[0]) return;
    await processPickedImage(photo.assets[0].uri);
  };

  const processPickedImage = async (uri: string) => {
    setResult(null);
    setError(null);
    try {
      const processed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      setImageUri(processed.uri);
      setImageBase64(processed.base64 ?? null);
    } catch (_) {
      setImageUri(uri);
      setImageBase64(null);
    }
  };

  const handleAnalyze = async () => {
    if (!imageBase64) { setError('Please select an image first.'); return; }
    setError(null);
    setIsAnalyzing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const activeSubject = settings.subject === 'Custom'
        ? settings.customSubject || 'General Knowledge'
        : settings.subject;
      const res = await analyzeQuestion(imageBase64, activeSubject, settings.confidenceThreshold);
      if (!res.questionDetected) {
        setError(res.captureGuidance || 'Make sure the full question and all answer choices are visible.');
        return;
      }
      const quizAnswer = toQuizAnswer(res, activeSubject);
      addToHistory(quizAnswer);
      setResult(quizAnswer);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topInset + 16, paddingBottom: insets.bottom + 110 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text style={[styles.title, { color: colors.foreground }]}>Demo Mode</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Pick a screenshot or take a photo of a question to test AI analysis.
      </Text>

      {/* Image picker area */}
      <View style={styles.pickerRow}>
        <TouchableOpacity
          style={[styles.pickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={pickImage}
        >
          <Ionicons name="image-outline" size={28} color={colors.primary} />
          <Text style={[styles.pickerBtnText, { color: colors.foreground }]}>Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={takePhoto}
        >
          <Ionicons name="camera-outline" size={28} color={colors.primary} />
          <Text style={[styles.pickerBtnText, { color: colors.foreground }]}>Camera</Text>
        </TouchableOpacity>
      </View>

      {/* Image preview */}
      {imageUri && (
        <View style={[styles.imageContainer, { borderColor: colors.border }]}>
          <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
          <TouchableOpacity
            style={[styles.clearImage, { backgroundColor: colors.destructive }]}
            onPress={() => { setImageUri(null); setImageBase64(null); setResult(null); }}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Error */}
      {!!error && (
        <View style={[styles.errorBox, { backgroundColor: `${colors.destructive}18`, borderColor: `${colors.destructive}40` }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      )}

      {/* Analyze button */}
      {imageUri && !result && (
        <TouchableOpacity
          style={[styles.analyzeBtn, { backgroundColor: isAnalyzing ? colors.muted : colors.primary }]}
          onPress={handleAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.analyzeBtnText}>Analyzing…</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={styles.analyzeBtnText}>Analyze Question</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Result */}
      {result && (
        <View style={styles.resultSection}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AI RESULT</Text>
          <AnswerCard
            result={result}
            onDismiss={() => { setResult(null); setImageUri(null); setImageBase64(null); }}
            onMarkCorrect={() => updateFeedback(result.id, 'correct')}
            onMarkIncorrect={() => updateFeedback(result.id, 'incorrect')}
            userFeedback={result.userFeedback}
            showFeedback
          />
          <TouchableOpacity
            style={[styles.tryAnotherBtn, { borderColor: colors.border }]}
            onPress={() => { setResult(null); setImageUri(null); setImageBase64(null); }}
          >
            <Text style={[styles.tryAnotherText, { color: colors.primary }]}>Try Another Image</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty state */}
      {!imageUri && !result && (
        <View style={styles.emptyState}>
          <Ionicons name="image-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No image selected</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Pick a screenshot of a multiple-choice question to see the AI in action.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },

  pickerRow: { flexDirection: 'row', gap: 12 },
  pickerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  pickerBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  imageContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    aspectRatio: 16 / 9,
  },
  previewImage: { width: '100%', height: '100%' },
  clearImage: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },

  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 28,
  },
  analyzeBtnText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  resultSection: { gap: 12 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },

  tryAnotherBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  tryAnotherText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
});
