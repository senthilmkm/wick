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
  sanctuary: 'Look, reminders, and sleep live here.',
} as const;

export type HintTab = keyof typeof TAB_HINTS;

export function flameCoachLine(state: CandleState): string {
  if (state === 'UNLIT_MORNING' || state === 'NIGHT_SLEEP') {
    return 'Tap the lighter, or take 5 steps.';
  }
  return 'Walk to keep it bright. Tap the candle for your pace. Hold it for night and rest.';
}
