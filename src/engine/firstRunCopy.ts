import { CandleState } from '../types/wick';

export const WELCOME_TITLE = 'Keep your wick lit';

export const WELCOME_LINES = [
  'Walk, and the candle stays bright.',
  'Sit too long, and it fades.',
  'A finished day becomes wax.',
] as const;

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
    default:
      return 'Candle';
  }
}

export function tabsShouldHide(activeTab: string, hasOpenedAnotherTab: boolean): boolean {
  return activeTab === 'flame' && hasOpenedAnotherTab;
}

export function shouldShowLighter(state: CandleState, hasLitByWalking: boolean): boolean {
  return hasLitByWalking && (state === 'UNLIT_MORNING' || state === 'NIGHT_SLEEP');
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

export function flameCoachLine(state: CandleState, hasLitByWalking = false): string {
  if (state === 'UNLIT_MORNING' || state === 'NIGHT_SLEEP') {
    return hasLitByWalking ? 'Tap the lighter, or take 5 steps.' : 'Take 5 steps.';
  }
  return 'Walk to keep it bright. Hold the candle for night, rest, or a share.';
}
