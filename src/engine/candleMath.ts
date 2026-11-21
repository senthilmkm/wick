import { CandleMood, CandleState, WaxLayer } from '../types/wick';

export const CANDLE_MOOD_COLORS: Record<CandleMood, string> = {
  Calm: '#7FA99B',
  Grateful: '#F4B942',
  Energized: '#FF7A33',
  Proud: '#D97762',
  Tired: '#8E8BA8',
  Heavy: '#6D597A',
};

export function getMoodWaxColorHex(mood: CandleMood): string {
  return CANDLE_MOOD_COLORS[mood];
}

/**
 * Formats a Date into a local YYYY-MM-DD string without UTC timezone drift.
 */
export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local midnight that ends `date`'s candle day. Smoking grace lasts until this instant. */
export function endOfLocalDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0).getTime();
}

/**
 * Computes the ISO week key (YYYY-Www) in local time for weekly quota tracking.
 */
export function getLocalWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Clamps a numeric value between min and max inclusive.
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Cubic Hermite smoothstep: 3t^2 - 2t^3 for t in [0, 1].
 */
export function smoothStep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Computes normalized active-day progress [0, 1] given wake/sleep hours & minutes.
 * Handles both same-day sleep (e.g. 07:00 -> 23:00) and post-midnight sleep (e.g. 07:00 -> 01:00).
 */
export function computeDayProgress(
  now: Date,
  wakeHour: number,
  wakeMinute: number,
  sleepHour: number,
  sleepMinute: number
): number {
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const wakeTotal = wakeHour * 60 + wakeMinute;
  const sleepTotal = sleepHour * 60 + sleepMinute;

  // Handle overnight active window (e.g. wake 07:00, sleep 01:00 next day)
  if (sleepTotal === wakeTotal) {
    return 1;
  }
  if (sleepTotal < wakeTotal) {
    const windowDuration = 1440 - wakeTotal + sleepTotal;
    if (nowMinutes >= wakeTotal) {
      return clamp((nowMinutes - wakeTotal) / windowDuration, 0, 1);
    }
    if (nowMinutes <= sleepTotal) {
      return clamp((1440 - wakeTotal + nowMinutes) / windowDuration, 0, 1);
    }
    return 0;
  }

  const windowDuration = sleepTotal - wakeTotal;
  if (nowMinutes <= wakeTotal) {
    return 0;
  }
  if (nowMinutes >= sleepTotal) {
    return 1;
  }
  return clamp((nowMinutes - wakeTotal) / windowDuration, 0, 1);
}

/**
 * Expected steps at normalized day progress tNorm:
 * 85% smooth S-curve + 15% linear baseline so morning runs give a buffer
 * while still encouraging periodic afternoon movement.
 */
export function computeExpectedSteps(dailyStepGoal: number, tNorm: number): number {
  const safeGoal = Number.isFinite(dailyStepGoal) ? Math.max(500, Math.round(dailyStepGoal)) : 8000;
  const t = clamp(tNorm, 0, 1);
  const curve = 0.85 * smoothStep(t) + 0.15 * t;
  // Minimum floor of 50 steps once awake so division by expectedSteps is always stable
  return Math.max(50, Math.round(safeGoal * curve));
}

/**
 * Computes pace ratio (actual / expected). Returns 1.0 when goal is met early.
 */
export function computePaceRatio(
  stepsToday: number,
  expectedStepsNow: number,
  dailyStepGoal: number
): number {
  const safeSteps = Number.isFinite(stepsToday) ? Math.max(0, stepsToday) : 0;
  const safeGoal = Number.isFinite(dailyStepGoal) ? Math.max(500, dailyStepGoal) : 8000;
  const safeExpected = Number.isFinite(expectedStepsNow) ? Math.max(50, expectedStepsNow) : 50;
  if (safeSteps >= safeGoal) {
    return Math.max(1.2, safeSteps / safeGoal);
  }
  return safeSteps / safeExpected;
}

/**
 * Maps a CandleState + paceRatio to flame intensity in [0, 1].
 */
export function flameFromSteps(stepsToday: number, dailyStepGoal: number): number {
  const goal = Number.isFinite(dailyStepGoal) && dailyStepGoal > 0 ? dailyStepGoal : 1;
  const steps = Number.isFinite(stepsToday) ? Math.max(0, stepsToday) : 0;
  return clamp(0.2 + (steps / goal) * 0.8, 0.2, 1);
}

export function computeFlameIntensity(state: CandleState, paceRatio: number): number {
  switch (state) {
    case 'UNLIT_MORNING':
    case 'SMOKING_GRACE':
    case 'EXTINGUISHED':
      return 0;
    case 'NIGHT_SLEEP':
      return 0.25;
    case 'IGNITING':
      return 0.85;
    case 'GLASS_DOME':
      return clamp(0.45 + paceRatio * 0.35, 0.45, 0.9);
    case 'BLAZING':
      return clamp(0.75 + (paceRatio - 1) * 0.5, 0.75, 1);
    case 'STEADY':
      return clamp(0.55 + (paceRatio - 0.8) * 1.0, 0.55, 0.75);
    case 'FLICKERING':
      return clamp(0.3 + (paceRatio - 0.5) * 0.8, 0.3, 0.55);
    case 'DYING_EMBER':
      return clamp(0.1 + paceRatio * 0.4, 0.1, 0.3);
  }
}

/**
 * Maps CandleState to the primary emissive flame hex color.
 */
export function getFlameColorHex(state: CandleState): string {
  switch (state) {
    case 'BLAZING':
    case 'IGNITING':
      return '#FFF6D6';
    case 'STEADY':
      return '#FF9E2C';
    case 'FLICKERING':
      return '#E85D04';
    case 'DYING_EMBER':
      return '#9D0208';
    case 'NIGHT_SLEEP':
      return '#7CC6FE';
    case 'GLASS_DOME':
      return '#FFB347';
    case 'SMOKING_GRACE':
    case 'UNLIT_MORNING':
    case 'EXTINGUISHED':
      return '#52525B';
  }
}

/**
 * Derives hardened wax layer color and thickness (mm) from daily burn performance.
 */
export function deriveWaxLayerSpec(
  stepsAchieved: number,
  stepGoal: number
): { colorHex: string; thicknessMm: number; waxGramsEarned: number } {
  const safeSteps = Number.isFinite(stepsAchieved) ? Math.max(0, stepsAchieved) : 0;
  const safeGoal = Number.isFinite(stepGoal) ? Math.max(500, stepGoal) : 8000;
  const ratio = safeSteps / safeGoal;
  if (ratio >= 1.1) {
    return { colorHex: '#FFB703', thicknessMm: 4.5, waxGramsEarned: 120 };
  }
  if (ratio >= 0.85) {
    return { colorHex: '#FB8500', thicknessMm: 3.5, waxGramsEarned: 100 };
  }
  if (ratio >= 0.6) {
    return { colorHex: '#E07A5F', thicknessMm: 2.5, waxGramsEarned: 70 };
  }
  return { colorHex: '#8D99AE', thicknessMm: 1.5, waxGramsEarned: 35 };
}

/**
 * Computes the concise Option-1 sub-line label showing hours & minutes left
 * until sleepHour:sleepMinute, or contextual status when sleeping/paused/goal met.
 */
export function formatTimeLeftLabel(
  now: Date,
  sleepHour: number,
  sleepMinute: number,
  stepsToday: number,
  dailyStepGoal: number,
  state: CandleState
): string {
  if (state === 'NIGHT_SLEEP') {
    return 'Resting until morning';
  }
  if (state === 'GLASS_DOME') {
    return 'Rest day';
  }
  if (stepsToday >= dailyStepGoal) {
    return 'Goal reached';
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sleepTotal = sleepHour * 60 + sleepMinute;

  let remaining: number;
  if (nowMinutes < sleepTotal) {
    remaining = sleepTotal - nowMinutes;
  } else if (sleepHour < 12 && nowMinutes > sleepTotal) {
    remaining = 1440 - nowMinutes + sleepTotal;
  } else {
    remaining = 0;
  }

  if (remaining <= 0) {
    return 'Bedtime reached';
  }
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;
  if (hours === 0) {
    return `${mins}m left today`;
  }
  return `${hours}h ${mins}m left today`;
}

/**
 * Returns true when `now` is within the user's nighttime window
 * (from 30 minutes before sleepHour:sleepMinute up to wakeHour:wakeMinute).
 */
export function isNighttimeWindow(
  now: Date,
  wakeHour: number,
  wakeMinute: number,
  sleepHour: number,
  sleepMinute: number
): boolean {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const wakeTotal = wakeHour * 60 + wakeMinute;
  const bedStart = (sleepHour * 60 + sleepMinute - 30 + 1440) % 1440;

  if (bedStart > wakeTotal) {
    return nowMin >= bedStart || nowMin < wakeTotal;
  }
  return nowMin >= bedStart && nowMin < wakeTotal;
}

export interface WeeklyRecapBand {
  dateKey: string;
  colorHex: string;
  lit: boolean;
  steps: number;
}

export interface WeeklyRecapSummary {
  dateRangeLabel: string;
  totalSteps: number;
  daysLit: number;
  topMood: CandleMood | null;
  bands: WeeklyRecapBand[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buildWeeklyRecapSummary(
  layers: WaxLayer[],
  todaySteps: number,
  dailyStepGoal: number,
  todayDateKey: string,
  todayMood?: CandleMood
): WeeklyRecapSummary {
  const [y, m, d] = todayDateKey.split('-').map(Number);
  const endUtc = Date.UTC(y, m - 1, d);
  const layerMap = new Map<string, WaxLayer>();
  for (const l of layers) {
    layerMap.set(l.date, l);
  }

  const bands: WeeklyRecapBand[] = [];
  const moodCounts = new Map<CandleMood, number>();
  let totalSteps = 0;
  let daysLit = 0;

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dt = new Date(endUtc - offset * 86_400_000);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
      dt.getUTCDate()
    ).padStart(2, '0')}`;
    if (key === todayDateKey) {
      const todaySpec = deriveWaxLayerSpec(todaySteps, dailyStepGoal);
      const colorHex = todayMood ? getMoodWaxColorHex(todayMood) : todaySpec.colorHex;
      const lit = todaySteps > 0;
      if (lit) {
        daysLit += 1;
      }
      totalSteps += Math.max(0, todaySteps);
      if (todayMood) {
        moodCounts.set(todayMood, (moodCounts.get(todayMood) ?? 0) + 1);
      }
      bands.push({ dateKey: key, colorHex, lit, steps: Math.max(0, todaySteps) });
    } else {
      const layer = layerMap.get(key);
      if (layer) {
        daysLit += 1;
        totalSteps += layer.stepsAchieved;
        if (layer.mood) {
          moodCounts.set(layer.mood, (moodCounts.get(layer.mood) ?? 0) + 1);
        }
        bands.push({ dateKey: key, colorHex: layer.colorHex, lit: true, steps: layer.stepsAchieved });
      } else {
        bands.push({ dateKey: key, colorHex: '#27272A', lit: false, steps: 0 });
      }
    }
  }

  let topMood: CandleMood | null = null;
  let topCount = 0;
  for (const [mood, count] of moodCounts.entries()) {
    if (count > topCount) {
      topMood = mood;
      topCount = count;
    }
  }

  const startDt = new Date(endUtc - 6 * 86_400_000);
  const endDt = new Date(endUtc);
  const dateRangeLabel = `${MONTH_NAMES[startDt.getUTCMonth()]} ${startDt.getUTCDate()} – ${
    MONTH_NAMES[endDt.getUTCMonth()]
  } ${endDt.getUTCDate()}`;

  return { dateRangeLabel, totalSteps, daysLit, topMood, bands };
}
