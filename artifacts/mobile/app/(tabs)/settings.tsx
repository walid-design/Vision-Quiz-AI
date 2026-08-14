import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { SUBJECTS } from '@/types';

/** Simple +/− stepper for numeric settings */
function StepperRow({
  label,
  description,
  value,
  display,
  onDecrement,
  onIncrement,
  colors,
}: {
  label: string;
  description: string;
  value: number;
  display: string;
  onDecrement: () => void;
  onIncrement: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.stepperRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>{description}</Text>
      </View>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={onDecrement}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <AppIcon name="minus" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.stepValue, { color: colors.primary }]}>{display}</Text>
        <TouchableOpacity
          style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={onIncrement}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <AppIcon name="plus" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useApp();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topInset + 16, paddingBottom: insets.bottom + 110 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>

      <Section title="Live Assist" colors={colors}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Start Automatically</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>Begin watching as soon as Live Assist opens</Text>
          </View>
          <Switch
            value={settings.autoStart}
            onValueChange={(value) => updateSettings({ autoStart: value })}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={settings.autoStart ? colors.primaryForeground : colors.mutedForeground}
          />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Answer Alerts</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>Vibrate gently when a new answer is ready</Text>
          </View>
          <Switch
            value={settings.hapticAlerts}
            onValueChange={(value) => updateSettings({ hapticAlerts: value })}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={settings.hapticAlerts ? colors.primaryForeground : colors.mutedForeground}
          />
        </View>
      </Section>

      {/* Subject Section */}
      <Section title="Subject / Certification" colors={colors}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
          {SUBJECTS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.subjectChip,
                {
                  backgroundColor: settings.subject === s ? colors.primary : colors.secondary,
                  borderColor: settings.subject === s ? colors.primary : colors.border,
                },
              ]}
              onPress={() => updateSettings({ subject: s })}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.subject === s }}
            >
              <Text
                style={[
                  styles.subjectChipText,
                  { color: settings.subject === s ? colors.primaryForeground : colors.secondaryForeground },
                ]}
              >
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {settings.subject === 'Custom' && (
          <TextInput
            style={[
              styles.textInput,
              { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
            ]}
            value={settings.customSubject}
            onChangeText={(v) => updateSettings({ customSubject: v })}
            placeholder="e.g. AWS Solutions Architect Associate"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
          />
        )}
      </Section>

      {/* Detection Settings */}
      <Section title="Detection" colors={colors}>
        <StepperRow
          label="Confidence Threshold"
          description="Double-check answers below this confidence level"
          value={settings.confidenceThreshold}
          display={`${Math.round(settings.confidenceThreshold * 100)}%`}
          onDecrement={() => updateSettings({ confidenceThreshold: clamp(settings.confidenceThreshold - 0.05, 0.5, 0.99) })}
          onIncrement={() => updateSettings({ confidenceThreshold: clamp(settings.confidenceThreshold + 0.05, 0.5, 0.99) })}
          colors={colors}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <StepperRow
          label="Change Sensitivity"
          description="Higher values detect smaller question changes"
          value={settings.changeSensitivity}
          display={`${Math.round(settings.changeSensitivity * 100)}%`}
          onDecrement={() => updateSettings({ changeSensitivity: clamp(settings.changeSensitivity - 0.03, 0.03, 0.4) })}
          onIncrement={() => updateSettings({ changeSensitivity: clamp(settings.changeSensitivity + 0.03, 0.03, 0.4) })}
          colors={colors}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <StepperRow
          label="Frame Compare Interval"
          description="How often Live Assist checks for a new question"
          value={settings.frameCompareIntervalMs}
          display={`${settings.frameCompareIntervalMs / 1000}s`}
          onDecrement={() => updateSettings({ frameCompareIntervalMs: clamp(settings.frameCompareIntervalMs - 250, 750, 5000) })}
          onIncrement={() => updateSettings({ frameCompareIntervalMs: clamp(settings.frameCompareIntervalMs + 250, 750, 5000) })}
          colors={colors}
        />
      </Section>

      {/* Developer */}
      <Section title="Developer" colors={colors}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Debug Mode</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
              Show change scores, capture dimensions, and timing on camera screen
            </Text>
          </View>
          <Switch
            value={settings.debugMode}
            onValueChange={(v) => updateSettings({ debugMode: v })}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={settings.debugMode ? colors.primaryForeground : colors.mutedForeground}
          />
        </View>
      </Section>

      {/* Reset */}
      <TouchableOpacity
        style={[styles.resetBtn, { borderColor: colors.border }]}
        onPress={() =>
          updateSettings({
            confidenceThreshold: 0.85,
            changeSensitivity: 0.12,
            frameCompareIntervalMs: 1000,
            stabilizationDelayMs: 1500,
            debugMode: false,
            autoStart: true,
            hapticAlerts: true,
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Reset settings to defaults"
      >
        <AppIcon name="refresh" size={18} color={colors.mutedForeground} />
        <Text style={[styles.resetText, { color: colors.mutedForeground }]}>Reset to Defaults</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 24 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },

  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, paddingLeft: 4 },
  sectionCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', padding: 16, gap: 12 },

  subjectRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  subjectChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  subjectChipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 15, fontFamily: 'Inter_700Bold', minWidth: 46, textAlign: 'center' },

  rowLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  rowDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  divider: { height: 1, marginHorizontal: -16 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  resetText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
});
