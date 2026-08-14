import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { type AppStatus } from '@/types';

interface Props {
  status: AppStatus;
}

const STATUS_CONFIG: Record<AppStatus, { label: string; colorKey: 'success' | 'primary' | 'warning' | 'accent' | 'mutedForeground' | 'destructive' }> = {
  IDLE: { label: 'Paused', colorKey: 'mutedForeground' },
  WATCHING: { label: 'Live', colorKey: 'success' },
  CHANGE_DETECTED: { label: 'New question', colorKey: 'warning' },
  STABILIZING: { label: 'Hold steady', colorKey: 'warning' },
  CAPTURING: { label: 'Reading', colorKey: 'primary' },
  ANALYZING: { label: 'Solving', colorKey: 'accent' },
  VERIFYING: { label: 'Verifying', colorKey: 'accent' },
  ANSWER_READY: { label: 'Answer ready', colorKey: 'success' },
};

export function StatusIndicator({ status }: Props) {
  const colors = useColors();
  const config = STATUS_CONFIG[status];
  const dotColor = colors[config.colorKey] as string;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.label}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(7,10,23,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: '#fff', fontSize: 13, fontFamily: 'Inter_500Medium', letterSpacing: 0.2 },
});
