import { Pedometer } from 'expo-sensors';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WELCOME_LINES } from '../engine/firstRunCopy';
import {
  GOAL_PRESETS,
  ONBOARDING_STEP_META,
  ONBOARDING_STEPS,
  OnboardingCompletion,
  OnboardingStep,
  PermissionKind,
  PermissionStepResult,
  adjustDailyGoal,
  goalPresetSelection,
  goalSelectionLabel,
  moveOnboardingStep,
  permissionOutcomeLabel,
  resolveThemeId,
  resolvedCandleName,
  runOnboardingPermissions,
} from '../engine/onboardingFlow';
import { fetchTodayHealthKitSteps } from '../services/nativeHealthKit';
import { requestNotificationPermission } from '../services/notificationService';
import { ThemeId } from '../types/wick';

interface OnboardingScreenProps {
  initialGoal: number;
  initialCandleName?: string;
  initialThemeId: ThemeId;
  initialWakeHour: number;
  initialWakeMinute: number;
  initialSleepHour: number;
  initialSleepMinute: number;
  onComplete: (completion: OnboardingCompletion) => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  initialGoal,
  initialCandleName = '',
  initialThemeId,
  initialWakeHour,
  initialWakeMinute,
  initialSleepHour,
  initialSleepMinute,
  onComplete,
}) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [goal, setGoal] = useState(() => adjustDailyGoal(initialGoal, 0));
  const [asking, setAsking] = useState<PermissionKind | null>(null);
  const [permissionResult, setPermissionResult] = useState<PermissionStepResult | null>(null);
  const permissionStarted = useRef(false);
  const finishing = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (step !== 'permissions' || permissionStarted.current) {
      return;
    }
    permissionStarted.current = true;
    void runOnboardingPermissions(
      {
        health: () => fetchTodayHealthKitSteps(),
        motion: async () => (await Pedometer.requestPermissionsAsync()).granted,
        notifications: () => requestNotificationPermission(),
      },
      (kind) => {
        if (alive.current) {
          setAsking(kind);
        }
      }
    ).then((result) => {
      if (alive.current) {
        setPermissionResult(result);
        setAsking(null);
      }
    });
  }, [step]);

  const stepNumber = ONBOARDING_STEPS.indexOf(step) + 1;
  const meta = ONBOARDING_STEP_META[step];
  const canContinue = step === 'permissions' ? permissionResult !== null && asking === null : true;
  const selectedGoal = goalPresetSelection(goal);

  const finish = () => {
    if (!permissionResult || finishing.current) {
      return;
    }
    finishing.current = true;
    onComplete({
      themeId: resolveThemeId(initialThemeId),
      dailyStepGoal: goal,
      candleName: resolvedCandleName(initialCandleName) || 'Wick',
      wakeHour: initialWakeHour,
      wakeMinute: initialWakeMinute,
      sleepHour: initialSleepHour,
      sleepMinute: initialSleepMinute,
      healthSteps: permissionResult.healthSteps,
    });
  };

  const goForward = () => {
    if (!canContinue) {
      return;
    }
    if (step === 'permissions') {
      finish();
      return;
    }
    setStep((current) => moveOnboardingStep(current, 1));
  };

  const goBack = () => {
    if (asking) {
      return;
    }
    setStep((current) => moveOnboardingStep(current, -1));
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        style={[
          styles.column,
          {
            paddingTop: Math.max(20, insets.top + 12),
            paddingBottom: Math.max(16, insets.bottom + 12),
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, compact && { gap: 12 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.brand}>wick</Text>
          <Text style={styles.progress}>
            Step {stepNumber} of {ONBOARDING_STEPS.length}
          </Text>
          <Text style={styles.headline}>{meta.title}</Text>
          {step === 'welcome' && (
            <>
              {WELCOME_LINES.map((line) => (
                <Text key={line} style={styles.body}>
                  {line}
                </Text>
              ))}
            </>
          )}
          {step === 'goal' && (
            <>
              <Text style={styles.body}>Your candle follows this daily step goal.</Text>
              <View style={styles.presetRow}>
                {GOAL_PRESETS.map((preset) => {
                  const selected = selectedGoal === preset;
                  return (
                    <Pressable
                      key={preset}
                      style={[styles.presetBtn, selected && styles.choiceActive]}
                      onPress={() => setGoal(preset)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${preset / 1000} thousand steps`}
                    >
                      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{preset / 1000}k</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.goalPicker}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => setGoal((current) => adjustDailyGoal(current, -1000))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease daily step goal"
                >
                  <Text style={styles.stepBtnText}>-</Text>
                </Pressable>
                <Text style={styles.goalNum}>{goal.toLocaleString('en-US')} steps / day</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => setGoal((current) => adjustDailyGoal(current, 1000))}
                  accessibilityRole="button"
                  accessibilityLabel="Increase daily step goal"
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.selectedLabel}>{goalSelectionLabel(goal)}</Text>
            </>
          )}
          {step === 'permissions' && (
            <>
              <Text style={styles.body}>
                Wick needs your steps. Reminders are optional. You can still light the candle if you say no.
              </Text>
              {(['health', 'motion', 'notifications'] as const).map((kind) => (
                <Text key={kind} style={styles.permissionLine}>
                  {permissionResult
                    ? permissionOutcomeLabel(
                        kind,
                        permissionResult[kind],
                        permissionResult.healthSteps
                      )
                    : asking === kind
                      ? `${kind === 'health' ? 'Health' : kind === 'motion' ? 'Motion' : 'Notifications'} · asking…`
                      : `${kind === 'health' ? 'Health' : kind === 'motion' ? 'Motion' : 'Notifications'} · waiting`}
                </Text>
              ))}
            </>
          )}
        </ScrollView>
        <View style={styles.footer}>
          {step !== 'welcome' && (
            <Pressable
              style={styles.backBtn}
              onPress={goBack}
              disabled={asking !== null}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.primaryBtn, !canContinue && styles.primaryDisabled]}
            onPress={goForward}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityLabel={meta.continueLabel}
          >
            <Text style={styles.primaryText}>{meta.continueLabel}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0C' },
  column: { flex: 1, paddingHorizontal: 24 },
  scrollContent: { flexGrow: 1, gap: 16, paddingBottom: 12 },
  brand: { color: '#FF9F43', fontSize: 20, fontWeight: '700', letterSpacing: 1.5 },
  progress: { color: '#A1A1AA', fontSize: 13, fontWeight: '600' },
  headline: { color: '#F5F5F7', fontSize: 32, fontWeight: '700' },
  body: { color: '#A1A1AA', fontSize: 16, lineHeight: 24 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeChip: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  presetBtn: {
    flexGrow: 1,
    minWidth: 72,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  choiceActive: { backgroundColor: 'rgba(255,159,67,0.2)', borderColor: '#FF9F43' },
  choiceText: { color: '#A1A1AA', fontSize: 14, fontWeight: '700' },
  choiceTextActive: { color: '#FF9F43' },
  goalPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#F5F5F7', fontSize: 20, fontWeight: '700' },
  goalNum: { color: '#FF9F43', fontSize: 18, fontWeight: '700' },
  clockReadout: { alignItems: 'center', gap: 2 },
  clockLabel: { color: '#A1A1AA', fontSize: 12, fontWeight: '600' },
  selectedLabel: { color: '#F5F5F7', fontSize: 14, fontWeight: '600' },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  permissionLine: { color: '#F5F5F7', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 8 },
  backBtn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: '#F5F5F7', fontSize: 16, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#FF9F43',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: '#0A0A0C', fontSize: 16, fontWeight: '700' },
});
