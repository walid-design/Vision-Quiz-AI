import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppStatus } from '@/types';
import { useColors } from '@/hooks/useColors';

interface Props {
  status: AppStatus;
}

const STATUS_CONFIG: Record<AppStatus, { label: string; colorKey: 'success' | 'primary' | 'warning' | 'accent' | 'mutedForeground' | 'destructive' }> = {
  IDLE: { label: 'Ready', colorKey: 'mutedForeground' },
  WATCHING: { label: 'Watching', colorKey: 'success' },
  CHANGE_DETECTED: { label: 'Change Detected', colorKey: 'warning' },
  STABILIZING: { label: 'Stabilizing…', colorKey: 'warning' },
  CAPTURING: { label: 'Capturing', colorKey: 'primary' },
  ANALYZING: { label: 'Analyzing', colorKey: 'accent' },
  VERIFYING: { label: 'Verifying', colorKey: 'accent' },
  ANSWER_READY: { label: 'Answer Ready', colorKey: 'success' },
};

export function StatusIndicator({ status }: Props) {
  const colors = useColors();
  const config = STATUS_CONFIG[status];
  const dotColor = colors[config.colorKey] as string;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: colors.foreground }]}>{config.label}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.2,
  },
});
