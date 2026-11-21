import { CandleState } from '../types/wick';

export const WELCOME_TITLE = 'Keep your wick lit';

export const WELCOME_LINES = [
  'Walk, and the candle stays bright.',
  'Sit too long, and it fades.',
  'A finished day becomes wax.',
] as const;

export const CIRCLE_EMPTY_BODY = 'When they accept, you both show up here.';
export const CIRCLE_INVITE_SENT_BODY = 'Invite sent. They show up here when they open Wick.';

export const TAB_HINTS = {
  ledger: 'Past days, saved as wax.',
  circle: 'One friend. Send one invite.',
  sanctuary: 'Look, name, goal, and sleep.',
} as const;

export const PRO_ADDS =
  'Wick Pro adds every look, more friends, full wax history, a PDF, and more rest days.';

export const FREE_STAYS =
  'The candle, one friend, seven days of wax, the first rest day, and one share card a week stay free.';

export type HintTab = keyof typeof TAB_HINTS;

export function candleStateLabel(state: string): string {
  switch (state) {
    case 'BLAZING':
      return 'Blazing';
    case 'STEADY':
      return 'Steady';
    case 'FLICKERING':
      return 'Flickering';
    case 'DYING_EMBER':
      return 'Dying ember';
    case 'SMOKING_GRACE':
    case 'EXTINGUISHED':
      return 'Out';
    case 'NIGHT_SLEEP':
      return 'Night';
    case 'GLASS_DOME':
      return 'Rest day';
    case 'UNLIT_MORNING':
      return 'Unlit';
    case 'IGNITING':
      return 'Lighting';
    case 'RAIN':
      return 'In the rain';
    default:
      return 'Candle';
  }
}

export function tabsShouldHide(activeTab: string, hasOpenedAnotherTab: boolean): boolean {
  return activeTab === 'flame' && hasOpenedAnotherTab;
}

export const STEPS_OFF_LINE = 'Steps are off. Turn them on in Settings, or tap the lighter.';
export const RAIN_STILL_MS = 60 * 60 * 1000;
const STEPS_PER_WALK_MINUTE = 100;
const SHORT_WALK_CAP_MINUTES = 10;

const QUIET_FLAME_STATES = new Set([
  'NIGHT_SLEEP',
  'GLASS_DOME',
  'SMOKING_GRACE',
  'EXTINGUISHED',
  'UNLIT_MORNING',
]);

function shortWalkMinutes(stepsRemaining: number): number {
  const steps = Number.isFinite(stepsRemaining) ? Math.max(0, stepsRemaining) : 0;
  return Math.min(SHORT_WALK_CAP_MINUTES, Math.max(1, Math.round(steps / STEPS_PER_WALK_MINUTE)));
}

export function shortWalkSteps(stepsRemaining: number): number {
  return shortWalkMinutes(stepsRemaining) * STEPS_PER_WALK_MINUTE;
}

export function shortWalkLine(stepsRemaining: number): string {
  const minutes = shortWalkMinutes(stepsRemaining);
  const unit = minutes === 1 ? 'minute' : 'minutes';
  return `${minutes} ${unit} makes the flame brighter.`;
}

export function rainClearedByWalk(stepsGained: number, stepsNeeded: number): boolean {
  if (!Number.isFinite(stepsGained) || stepsGained < 0) return false;
  if (!Number.isFinite(stepsNeeded) || stepsNeeded <= 0) return false;
  return stepsGained >= stepsNeeded;
}

export function rainStaysUntilWalk(input: {
  goalMet: boolean;
  ignitedAt: number | null;
  state: string;
  stepsGained: number;
  stepsNeeded: number;
}): boolean {
  if (input.goalMet) return false;
  if (input.ignitedAt == null || !Number.isFinite(input.ignitedAt)) return false;
  if (QUIET_FLAME_STATES.has(input.state)) return false;
  return !rainClearedByWalk(input.stepsGained, input.stepsNeeded);
}
export const RAIN_FRIEND_STATE = 'RAIN';

export function stateForFriends(state: string, inRain: boolean): string {
  return inRain ? RAIN_FRIEND_STATE : state;
}

export function friendIsInRain(state: string): boolean {
  return state === RAIN_FRIEND_STATE;
}

export function friendRainLine(name: string): string {
  const who = name.trim() || 'A friend';
  return `${who} is in the rain.`;
}

export function rainNudgeOn(input: {
  goalMet: boolean;
  ignitedAt: number | null;
  state: string;
  stillForMs: number;
}): boolean {
  if (input.goalMet) return false;
  if (input.ignitedAt == null || !Number.isFinite(input.ignitedAt)) return false;
  if (QUIET_FLAME_STATES.has(input.state)) return false;
  if (!Number.isFinite(input.stillForMs) || input.stillForMs < RAIN_STILL_MS) return false;
  return true;
}
export const WICK_LIT_LINE = 'Your wick is lit.';
export const GOAL_FULL_LINE = 'Goal. The wick is full.';

export const STREAK_BANDS = [
  { days: 7, name: 'Bronze' },
  { days: 14, name: 'Silver' },
  { days: 30, name: 'Gold' },
  { days: 100, name: 'Diamond' },
] as const;

export function streakBandLine(previousDays: number, nextDays: number): string | null {
  if (!Number.isFinite(previousDays) || !Number.isFinite(nextDays) || nextDays <= previousDays) {
    return null;
  }
  const earned = [...STREAK_BANDS].reverse().find((band) => previousDays < band.days && nextDays >= band.days);
  return earned ? `${earned.days} days. ${earned.name}.` : null;
}

export function nextStreakBandLine(days: number): string | null {
  if (!Number.isFinite(days) || days < 0) return null;
  const next = STREAK_BANDS.find((band) => days < band.days);
  return next ? `Next: ${next.name} at ${next.days} days.` : null;
}

export function celebrationLine(input: {
  band: string | null;
  lit: boolean;
  goal: boolean;
  saved: string | null;
}): string | null {
  if (input.band) return input.band;
  if (input.lit) return WICK_LIT_LINE;
  if (input.goal) return GOAL_FULL_LINE;
  return input.saved;
}

export function candleVoiceName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : 'Wick';
}

export function cameBackLine(name: string | null | undefined): string {
  return `${candleVoiceName(name)} waited. You came back.`;
}

export function savedDayLine(name: string | null | undefined, steps: number): string {
  const count = Number.isFinite(steps) ? Math.max(0, Math.round(steps)) : 0;
  return `${candleVoiceName(name)} kept yesterday. ${count.toLocaleString('en-US')} steps.`;
}

export function shouldShowLighter(
  state: CandleState,
  hasLitByWalking: boolean,
  stepsOff = false
): boolean {
  return (hasLitByWalking || stepsOff) && (state === 'UNLIT_MORNING' || state === 'NIGHT_SLEEP');
}

export function walkLitTheCandle(
  previous: { state: CandleState; ignitedAt: number | null },
  next: { ignitedAt: number | null; stepsToday: number }
): boolean {
  return (
    previous.state === 'UNLIT_MORNING' &&
    previous.ignitedAt == null &&
    next.ignitedAt != null &&
    next.stepsToday >= 5
  );
}

export function flameCoachLine(state: CandleState, hasLitByWalking = false, stepsOff = false): string {
  if ((state === 'UNLIT_MORNING' || state === 'NIGHT_SLEEP') && stepsOff) {
    return STEPS_OFF_LINE;
  }
  if (state === 'UNLIT_MORNING' || state === 'NIGHT_SLEEP') {
    return hasLitByWalking ? 'Tap the lighter, or take 5 steps.' : 'Take 5 steps.';
  }
  return 'Walk to keep it bright. Hold the candle for night, rest, or a share.';
}
