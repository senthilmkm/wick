import { MAX_DAILY_STEP_GOAL, MIN_DAILY_STEP_GOAL } from '../constants/limits';
import { WICK_THEMES } from '../constants/themes';
import { CandleSnapshot, ThemeId, UserSettings } from '../types/wick';
import {
  evaluateCandleState,
  FIRST_STEP_IGNITION_THRESHOLD,
  igniteWithLighter,
} from './candleStateMachine';

export const ONBOARDING_STEPS = ['welcome', 'goal', 'permissions'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const GOAL_PRESETS = [5000, 8000, 10000] as const;

export const NAME_PRESETS = ['Solace', 'Hearth', 'Ember', 'Dawn'] as const;

export const ONBOARDING_STEP_META: Record<OnboardingStep, { title: string; continueLabel: string }> = {
  welcome: { title: 'Keep your wick lit', continueLabel: 'Continue' },
  goal: { title: 'Daily step goal', continueLabel: 'Continue' },
  permissions: { title: 'Allow steps', continueLabel: 'Light My Candle' },
};

export type PermissionKind = 'health' | 'motion' | 'notifications';

export const PERMISSION_SEQUENCE: readonly PermissionKind[] = ['health', 'motion', 'notifications'];

export type PermissionOutcome = 'granted' | 'denied' | 'unavailable';

export interface PermissionStepResult {
  health: PermissionOutcome;
  motion: PermissionOutcome;
  notifications: PermissionOutcome;
  healthSteps: number | null;
}

export interface PermissionAskers {
  health: () => Promise<number | null>;
  motion: () => Promise<boolean>;
  notifications: () => Promise<boolean>;
}

export interface OnboardingCompletion {
  themeId: ThemeId;
  dailyStepGoal: number;
  candleName: string;
  wakeHour: number;
  wakeMinute: number;
  sleepHour: number;
  sleepMinute: number;
  healthSteps: number | null;
}

export interface OnboardingSettingsPatch {
  themeId: ThemeId;
  dailyStepGoal: number;
  candleName: string;
  wakeHour: number;
  wakeMinute: number;
  sleepHour: number;
  sleepMinute: number;
}

function clampHour(hour: number, fallback: number): number {
  if (!Number.isFinite(hour)) {
    return fallback;
  }
  return Math.min(23, Math.max(0, Math.round(hour)));
}

function clampMinute(minute: number, fallback: number): number {
  if (!Number.isFinite(minute)) {
    return fallback;
  }
  return Math.min(59, Math.max(0, Math.round(minute)));
}

export function clampDailyGoal(goal: number): number {
  if (!Number.isFinite(goal)) {
    return 8000;
  }
  return Math.min(MAX_DAILY_STEP_GOAL, Math.max(MIN_DAILY_STEP_GOAL, Math.round(goal)));
}

export function adjustDailyGoal(goal: number, delta: number): number {
  return clampDailyGoal(clampDailyGoal(goal) + delta);
}

export function goalPresetSelection(goal: number): number | 'custom' {
  const clamped = clampDailyGoal(goal);
  return (GOAL_PRESETS as readonly number[]).includes(clamped) ? clamped : 'custom';
}

export function goalSelectionLabel(goal: number): string {
  const clamped = clampDailyGoal(goal);
  const preset = goalPresetSelection(clamped);
  if (preset === 'custom') {
    return `Selected: ${clamped.toLocaleString('en-US')} steps`;
  }
  return `Selected: ${preset / 1000}k`;
}

export function normalizeCandleName(raw: string): string {
  return raw.trim().slice(0, 12);
}

export function matchingNamePreset(raw: string): (typeof NAME_PRESETS)[number] | null {
  const normalized = normalizeCandleName(raw).toLowerCase();
  if (!normalized) {
    return null;
  }
  return NAME_PRESETS.find((preset) => preset.toLowerCase() === normalized) ?? null;
}

export function resolvedCandleName(raw: string): string {
  return matchingNamePreset(raw) ?? normalizeCandleName(raw);
}

export function canAdvanceFromName(raw: string): boolean {
  return resolvedCandleName(raw).length > 0;
}

export function nameSelectionLabel(raw: string): string {
  const resolved = resolvedCandleName(raw);
  return resolved ? `Selected: ${resolved}` : 'Enter a name to continue';
}

export function moveOnboardingStep(step: OnboardingStep, direction: 1 | -1): OnboardingStep {
  const next = ONBOARDING_STEPS.indexOf(step) + direction;
  if (next < 0 || next >= ONBOARDING_STEPS.length) {
    return step;
  }
  return ONBOARDING_STEPS[next];
}

export function resolveThemeId(id: string | undefined): ThemeId {
  if (id && Object.prototype.hasOwnProperty.call(WICK_THEMES, id)) {
    return id as ThemeId;
  }
  return 'obsidian_night';
}

export function eveningNudgeClock(sleepHour: number, sleepMinute: number): { hour: number; minute: number } {
  const hour = clampHour(sleepHour, 23);
  const minute = clampMinute(sleepMinute, 0);
  const total = (hour * 60 + minute - 90 + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export function buildOnboardingSettings(draft: OnboardingCompletion): OnboardingSettingsPatch {
  return {
    themeId: resolveThemeId(draft.themeId),
    dailyStepGoal: clampDailyGoal(draft.dailyStepGoal),
    candleName: resolvedCandleName(draft.candleName),
    wakeHour: clampHour(draft.wakeHour, 7),
    wakeMinute: clampMinute(draft.wakeMinute, 0),
    sleepHour: clampHour(draft.sleepHour, 23),
    sleepMinute: clampMinute(draft.sleepMinute, 0),
  };
}

export function finishOnboardingSnapshot(
  snapshot: CandleSnapshot,
  settings: UserSettings,
  now: Date,
  healthSteps: number | null
): CandleSnapshot {
  const steps =
    healthSteps != null && Number.isFinite(healthSteps) ? Math.max(0, Math.round(healthSteps)) : null;
  if (steps != null && steps >= FIRST_STEP_IGNITION_THRESHOLD) {
    return evaluateCandleState({
      snapshot,
      stepsToday: steps,
      settings,
      now,
    }).snapshot;
  }
  if (snapshot.state === 'UNLIT_MORNING') {
    if (steps != null && steps > 0) {
      return { ...snapshot, stepsToday: steps, updatedAt: now.getTime() };
    }
    return snapshot;
  }
  const lit = igniteWithLighter(snapshot, now.getTime());
  if (steps != null && steps > 0) {
    return { ...lit, stepsToday: steps };
  }
  return lit;
}

export function permissionOutcomeLabel(
  kind: PermissionKind,
  outcome: PermissionOutcome,
  healthSteps: number | null
): string {
  if (kind === 'health') {
    if (outcome === 'granted') {
      return `Health · ${(healthSteps ?? 0).toLocaleString('en-US')} steps today`;
    }
    if (outcome === 'denied') {
      return 'Health · not allowed';
    }
    return 'Health · unavailable';
  }
  if (kind === 'motion') {
    return outcome === 'granted' ? 'Motion · allowed' : 'Motion · not allowed';
  }
  return outcome === 'granted' ? 'Notifications · allowed' : 'Notifications · not allowed';
}

export async function runOnboardingPermissions(
  askers: PermissionAskers,
  onProgress?: (kind: PermissionKind) => void
): Promise<PermissionStepResult> {
  let health: PermissionOutcome = 'unavailable';
  let healthSteps: number | null = null;
  if (onProgress) {
    onProgress('health');
  }
  try {
    const value = await askers.health();
    if (typeof value === 'number' && Number.isFinite(value)) {
      healthSteps = Math.max(0, Math.round(value));
      health = 'granted';
    }
  } catch {
    health = 'denied';
    healthSteps = null;
  }

  let motion: PermissionOutcome = 'denied';
  if (onProgress) {
    onProgress('motion');
  }
  try {
    motion = (await askers.motion()) ? 'granted' : 'denied';
  } catch {
    motion = 'denied';
  }

  let notifications: PermissionOutcome = 'denied';
  if (onProgress) {
    onProgress('notifications');
  }
  try {
    notifications = (await askers.notifications()) ? 'granted' : 'denied';
  } catch {
    notifications = 'denied';
  }

  return { health, motion, notifications, healthSteps };
}
