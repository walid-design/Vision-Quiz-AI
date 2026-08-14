import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AnalysisResult } from '@/services/api';

interface Props {
  result: AnalysisResult;
  onDismiss?: () => void;
  onMarkCorrect?: () => void;
  onMarkIncorrect?: () => void;
  userFeedback?: 'correct' | 'incorrect';
  showFeedback?: boolean;
}

export function AnswerCard({ result, onDismiss, onMarkCorrect, onMarkIncorrect, userFeedback, showFeedback }: Props) {
  const colors = useColors();
  const confidencePct = Math.round(result.confidence * 100);
  const confidenceColor = result.confidence >= 0.9 ? colors.success : result.confidence >= 0.75 ? colors.warning : colors.destructive;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header row */}
      <View style={styles.header}>
        <Text style={[styles.headerLabel, { color: colors.mutedForeground }]}>ANSWER</Text>
        {onDismiss && (
          <TouchableOpacity
            onPress={onDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss answer"
          >
            <Ionicons name="close" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Big answer letter */}
      <View style={styles.answerRow}>
        <View style={[styles.answerBadge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.answerLetter, { color: colors.primaryForeground }]}>{result.answer}</Text>
        </View>
        <View style={styles.answerTextBox}>
          <Text style={[styles.answerText, { color: colors.foreground }]} numberOfLines={3}>
            {result.answerText}
          </Text>
        </View>
      </View>

      {/* Confidence + verification */}
      <View style={styles.metaRow}>
        <View style={[styles.confBadge, { backgroundColor: `${confidenceColor}22` }]}>
          <Ionicons name="stats-chart" size={12} color={confidenceColor} />
          <Text style={[styles.confText, { color: confidenceColor }]}>{confidencePct}% Confidence</Text>
        </View>

        {result.needsVerification && (
          <View style={[styles.verifiedBadge, { backgroundColor: result.verified ? `${colors.success}22` : `${colors.warning}22` }]}>
            <Ionicons
              name={result.verified ? 'checkmark-circle' : 'alert-circle'}
              size={12}
              color={result.verified ? colors.success : colors.warning}
            />
            <Text style={[styles.confText, { color: result.verified ? colors.success : colors.warning }]}>
              {result.verified ? 'Verified' : 'Unconfirmed'}
            </Text>
          </View>
        )}

        {result.processingTimeMs > 0 && (
          <View style={[styles.confBadge, { backgroundColor: `${colors.mutedForeground}22` }]}>
            <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
            <Text style={[styles.confText, { color: colors.mutedForeground }]}>
              {(result.processingTimeMs / 1000).toFixed(1)}s
            </Text>
          </View>
        )}
      </View>

      {/* Explanation */}
      {!!result.explanation && (
        <Text style={[styles.explanation, { color: colors.mutedForeground }]}>{result.explanation}</Text>
      )}

      {/* Feedback buttons */}
      {showFeedback && (
        <View style={[styles.feedbackRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.feedbackLabel, { color: colors.mutedForeground }]}>Was this correct?</Text>
          <View style={styles.feedbackBtns}>
            <TouchableOpacity
              onPress={onMarkCorrect}
              accessibilityRole="button"
              accessibilityLabel="Mark answer as correct"
              style={[
                styles.feedbackBtn,
                {
                  backgroundColor: userFeedback === 'correct' ? colors.success : `${colors.success}22`,
                  borderColor: colors.success,
                },
              ]}
            >
              <Ionicons name="checkmark" size={16} color={userFeedback === 'correct' ? '#fff' : colors.success} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onMarkIncorrect}
              accessibilityRole="button"
              accessibilityLabel="Mark answer as incorrect"
              style={[
                styles.feedbackBtn,
                {
                  backgroundColor: userFeedback === 'incorrect' ? colors.destructive : `${colors.destructive}22`,
                  borderColor: colors.destructive,
                },
              ]}
            >
              <Ionicons name="close" size={16} color={userFeedback === 'incorrect' ? '#fff' : colors.destructive} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  answerBadge: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  answerLetter: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
  },
  answerTextBox: {
    flex: 1,
  },
  answerText: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  confBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  confText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  explanation: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  feedbackLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  feedbackBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  feedbackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
