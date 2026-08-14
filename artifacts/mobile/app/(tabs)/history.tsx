import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { QuizAnswer } from '@/types';

function HistoryItem({
  item,
  onFeedback,
}: {
  item: QuizAnswer;
  onFeedback: (id: string, f: 'correct' | 'incorrect') => void;
}) {
  const colors = useColors();
  const confColor =
    item.confidence >= 0.9 ? colors.success : item.confidence >= 0.75 ? colors.warning : colors.destructive;
  const date = new Date(item.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Top row */}
      <View style={styles.cardHeader}>
        <View style={[styles.answerPill, { backgroundColor: colors.primary }]}>
          <Text style={[styles.answerPillText, { color: colors.primaryForeground }]}>{item.answer}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.subjectTag, { color: colors.mutedForeground }]}>{item.subject}</Text>
          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{dateStr} · {timeStr}</Text>
        </View>
        {/* Feedback icons */}
        <View style={styles.feedbackRow}>
          <TouchableOpacity
            onPress={() => { onFeedback(item.id, 'correct'); Haptics.selectionAsync(); }}
            style={[
              styles.fbBtn,
              {
                backgroundColor: item.userFeedback === 'correct' ? colors.success : `${colors.success}22`,
                borderColor: colors.success,
              },
            ]}
          >
            <Ionicons name="checkmark" size={13} color={item.userFeedback === 'correct' ? '#fff' : colors.success} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { onFeedback(item.id, 'incorrect'); Haptics.selectionAsync(); }}
            style={[
              styles.fbBtn,
              {
                backgroundColor: item.userFeedback === 'incorrect' ? colors.destructive : `${colors.destructive}22`,
                borderColor: colors.destructive,
              },
            ]}
          >
            <Ionicons name="close" size={13} color={item.userFeedback === 'incorrect' ? '#fff' : colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Question snippet */}
      <Text style={[styles.question, { color: colors.foreground }]} numberOfLines={2}>
        {item.question || '(No question text detected)'}
      </Text>

      {/* Answer text */}
      <Text style={[styles.answerText, { color: colors.primary }]} numberOfLines={1}>
        {item.answerText}
      </Text>

      {/* Meta chips */}
      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: `${confColor}22` }]}>
          <Text style={[styles.chipText, { color: confColor }]}>{Math.round(item.confidence * 100)}%</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: `${colors.mutedForeground}18` }]}>
          <Text style={[styles.chipText, { color: colors.mutedForeground }]}>
            {(item.processingTimeMs / 1000).toFixed(1)}s
          </Text>
        </View>
        {item.needsVerification && (
          <View style={[styles.chip, { backgroundColor: `${item.verified ? colors.success : colors.warning}22` }]}>
            <Text style={[styles.chipText, { color: item.verified ? colors.success : colors.warning }]}>
              {item.verified ? 'Verified' : 'Unconfirmed'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { history, clearHistory, updateFeedback } = useApp();

  const stats = useMemo(() => {
    if (!history.length) return null;
    const reviewed = history.filter((h) => h.userFeedback);
    const correct = reviewed.filter((h) => h.userFeedback === 'correct').length;
    const avgConf = history.reduce((s, h) => s + h.confidence, 0) / history.length;
    const avgTime = history.reduce((s, h) => s + h.processingTimeMs, 0) / history.length;
    const verified = history.filter((h) => h.needsVerification).length;
    return {
      total: history.length,
      verified,
      avgConf: Math.round(avgConf * 100),
      avgTime: (avgTime / 1000).toFixed(1),
      accuracy: reviewed.length ? Math.round((correct / reviewed.length) * 100) : null,
      reviewed: reviewed.length,
    };
  }, [history]);

  const handleClear = () => {
    Alert.alert('Clear History', 'Delete all session history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearHistory();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingTop: topInset + 16, paddingBottom: insets.bottom + 80 },
        ]}
        scrollEnabled={history.length > 0}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.foreground }]}>History</Text>
              {history.length > 0 && (
                <TouchableOpacity onPress={handleClear}>
                  <Text style={[styles.clearBtn, { color: colors.destructive }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Stats panel */}
            {stats && (
              <View style={[styles.statsPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <StatCell label="Total" value={String(stats.total)} colors={colors} />
                <StatCell label="Verified" value={String(stats.verified)} colors={colors} />
                <StatCell label="Avg Conf" value={`${stats.avgConf}%`} colors={colors} />
                <StatCell label="Avg Time" value={`${stats.avgTime}s`} colors={colors} />
                {stats.accuracy !== null && (
                  <StatCell label={`Accuracy\n(${stats.reviewed} rated)`} value={`${stats.accuracy}%`} colors={colors} />
                )}
              </View>
            )}

            {history.length > 0 && (
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {history.length} QUESTION{history.length !== 1 ? 'S' : ''}
              </Text>
            )}
          </>
        }
        renderItem={({ item }) => <HistoryItem item={item} onFeedback={updateFeedback} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No history yet</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Questions analyzed will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function StatCell({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 16, gap: 0 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  clearBtn: { fontSize: 15, fontFamily: 'Inter_500Medium' },

  statsPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  statCell: { alignItems: 'center', minWidth: 60 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 2 },

  sectionLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 8 },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  answerPill: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  answerPillText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  subjectTag: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 0.3 },
  timeText: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  feedbackRow: { flexDirection: 'row', gap: 6 },
  fbBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  question: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  answerText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  chipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', color: '#888' },
});
