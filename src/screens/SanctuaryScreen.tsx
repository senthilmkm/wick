import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { THEME_LIST } from '../constants/themes';
import { canUseTheme } from '../engine/trialGuard';
import { EntitlementState, ThemeId, UserSettings, WickTheme } from '../types/wick';

interface SanctuaryScreenProps {
  settings: UserSettings;
  theme: WickTheme;
  entitlement: EntitlementState;
  glassDomesOwned: number;
  onSelectTheme: (themeId: ThemeId) => void;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onRestorePurchases: () => void;
  onUpgradePro: () => void;
  onDebugInjectSteps?: (delta: number) => void;
}

export const SanctuaryScreen: React.FC<SanctuaryScreenProps> = ({
  settings,
  theme,
  entitlement,
  glassDomesOwned,
  onSelectTheme,
  onUpdateSettings,
  onRestorePurchases,
  onUpgradePro,
  onDebugInjectSteps,
}) => {
  const [devTapCount, setDevTapCount] = useState(0);
  const showDebugger = typeof __DEV__ !== 'undefined' && __DEV__ && devTapCount >= 3;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.primaryText }]}>Sanctuary</Text>

      {/* Background Themes */}
      <Text style={styles.sectionLabel}>Background Theme</Text>
      <View style={styles.themeGrid}>
        {THEME_LIST.map((item) => {
          const unlocked = canUseTheme(entitlement, item.id);
          const selected = settings.themeId === item.id;
          return (
            <Pressable
              key={item.id}
              style={[
                styles.themeChip,
                { backgroundColor: item.canvasTop },
                selected && { borderColor: item.accent, borderWidth: 2 },
              ]}
              onPress={() => (unlocked ? onSelectTheme(item.id) : onUpgradePro())}
            >
              <View style={[styles.glowDot, { backgroundColor: item.ambientGlow }]} />
              <Text style={[styles.themeName, { color: item.primaryText }]}>
                {item.name} {!unlocked ? '• Pro' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Step Goal & Toggles */}
      <Text style={styles.sectionLabel}>Daily Goal & Rituals</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.primaryText }]}>Daily Step Goal</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={styles.stepBtn}
              onPress={() =>
                onUpdateSettings({
                  dailyStepGoal: Math.max(2000, settings.dailyStepGoal - 1000),
                })
              }
            >
              <Text style={styles.stepBtnText}>-</Text>
            </Pressable>
            <Text style={[styles.goalVal, { color: theme.primaryText }]}>
              {settings.dailyStepGoal.toLocaleString('en-US')}
            </Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() =>
                onUpdateSettings({
                  dailyStepGoal: Math.min(25000, settings.dailyStepGoal + 1000),
                })
              }
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.primaryText }]}>Wake Hour</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={styles.stepBtn}
              onPress={() =>
                onUpdateSettings({ wakeHour: (settings.wakeHour + 23) % 24 })
              }
            >
              <Text style={styles.stepBtnText}>-</Text>
            </Pressable>
            <Text style={[styles.goalVal, { color: theme.primaryText }]}>
              {String(settings.wakeHour).padStart(2, '0')}:00
            </Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() =>
                onUpdateSettings({ wakeHour: (settings.wakeHour + 1) % 24 })
              }
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.primaryText }]}>Sleep Hour</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={styles.stepBtn}
              onPress={() =>
                onUpdateSettings({ sleepHour: (settings.sleepHour + 23) % 24 })
              }
            >
              <Text style={styles.stepBtnText}>-</Text>
            </Pressable>
            <Text style={[styles.goalVal, { color: theme.primaryText }]}>
              {String(settings.sleepHour).padStart(2, '0')}:00
            </Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() =>
                onUpdateSettings({ sleepHour: (settings.sleepHour + 1) % 24 })
              }
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.primaryText }]}>
            Live Breeze Shake (Mic)
          </Text>
          <Switch
            value={settings.liveBreezeEnabled}
            onValueChange={(val) => onUpdateSettings({ liveBreezeEnabled: val })}
          />
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.primaryText }]}>
            Mic Blow-Out at Bedtime
          </Text>
          <Switch
            value={settings.micBlowOutEnabled}
            onValueChange={(val) => onUpdateSettings({ micBlowOutEnabled: val })}
          />
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.primaryText }]}>
            iOS Sleep Focus Sync
          </Text>
          <Switch
            value={settings.sleepFocusSyncEnabled}
            onValueChange={(val) => onUpdateSettings({ sleepFocusSyncEnabled: val })}
          />
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.primaryText }]}>Glass Domes Owned</Text>
          <Text style={[styles.goalVal, { color: theme.accent }]}>{glassDomesOwned}</Text>
        </View>
      </View>

      {/* Wick Pro & Restore */}
      <View style={styles.card}>
        {!entitlement.isPro && (
          <Pressable
            style={[styles.proBtn, { backgroundColor: theme.accent }]}
            onPress={onUpgradePro}
          >
            <Text style={styles.proBtnText}>
              {entitlement.isEligibleForIntroTrial
                ? 'Start 7-Day Free Trial'
                : 'Upgrade to Wick Pro ($14.99/yr)'}
            </Text>
          </Pressable>
        )}
        <Pressable style={styles.restoreBtn} onPress={onRestorePurchases}>
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </Pressable>
      </View>

      {/* Version & Hidden Simulator Debugger */}
      <Pressable onPress={() => setDevTapCount((c) => c + 1)}>
        <Text style={styles.version}>Wick v1.0.0 • Local-First</Text>
      </Pressable>

      {showDebugger && onDebugInjectSteps && (
        <View style={styles.debugCard}>
          <Text style={styles.debugTitle}>Simulator Candle Debugger</Text>
          <View style={styles.debugRow}>
            <Pressable style={styles.debugBtn} onPress={() => onDebugInjectSteps(50)}>
              <Text style={styles.debugBtnText}>+50 steps</Text>
            </Pressable>
            <Pressable style={styles.debugBtn} onPress={() => onDebugInjectSteps(500)}>
              <Text style={styles.debugBtnText}>+500 steps</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 120, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  sectionLabel: { color: '#A1A1AA', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeChip: {
    width: '48%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glowDot: { width: 12, height: 12, borderRadius: 6 },
  themeName: { fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#F5F5F7', fontSize: 16, fontWeight: '700' },
  goalVal: { fontSize: 15, fontWeight: '700' },
  proBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  proBtnText: { color: '#0A0A0C', fontWeight: '700', fontSize: 15 },
  restoreBtn: { alignItems: 'center', paddingVertical: 6 },
  restoreText: { color: '#A1A1AA', fontSize: 13 },
  version: { color: '#71717A', textAlign: 'center', fontSize: 12, marginTop: 8 },
  debugCard: { backgroundColor: '#18181B', borderRadius: 14, padding: 14, gap: 10 },
  debugTitle: { color: '#FF9F43', fontWeight: '700', fontSize: 13 },
  debugRow: { flexDirection: 'row', gap: 10 },
  debugBtn: { backgroundColor: '#27272A', padding: 10, borderRadius: 10 },
  debugBtnText: { color: '#F5F5F7', fontSize: 13 },
});
