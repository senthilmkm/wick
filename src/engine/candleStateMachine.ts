import { CandleSnapshot, CandleState, UserSettings, WaxLayer } from '../types/wick';
import {
  clamp,
  computeDayProgress,
  computeExpectedSteps,
  computeFlameIntensity,
  computePaceRatio,
  deriveWaxLayerSpec,
  getFlameColorHex,
  getLocalDateKey,
  getMoodWaxColorHex,
} from './candleMath';

export const FIRST_STEP_IGNITION_THRESHOLD = 5;
export const SMOKING_GRACE_DURATION_MS = 60 * 60 * 1000; // 60 minutes
export const RESUSCITATION_STEPS_REQUIRED = 350;
export const GLASS_DOME_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const GLASS_DOME_WAX_COST = 300;

export interface StepEvaluationInput {
  snapshot: CandleSnapshot;
  stepsToday: number;
  settings: UserSettings;
  now: Date;
  isSleepFocusActive?: boolean;
}

export interface StepEvaluationResult {
  snapshot: CandleSnapshot;
  completedDayLayer: WaxLayer | null;
}

/**
 * Creates a fresh morning snapshot for a given date.
 */
export function createMorningSnapshot(
  dateKey: string,
  nowMs: number,
  streakDays: number,
  waxGrams: number,
  glassDomesOwned: number,
  glassDomeActiveUntil: number | null = null
): CandleSnapshot {
  const domeActive = glassDomeActiveUntil !== null && glassDomeActiveUntil > nowMs;
  const state: CandleState = domeActive ? 'GLASS_DOME' : 'UNLIT_MORNING';
  return {
    dateKey,
    state,
    stepsToday: 0,
    expectedStepsNow: 50,
    paceRatio: 0,
    flameIntensity: domeActive ? 0.5 : 0,
    flameColorHex: getFlameColorHex(state),
    meltProgress: 0,
    streakDays,
    waxGrams,
    glassDomesOwned,
    glassDomeActiveUntil: domeActive ? glassDomeActiveUntil : null,
    smokingGraceExpiresAt: null,
    smokingStartSteps: null,
    ignitedAt: null,
    updatedAt: nowMs,
  };
}

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * Pure, deterministic evaluation of the candle state given updated step count & current time.
 */
export function evaluateCandleState(input: StepEvaluationInput): StepEvaluationResult {
  const { settings, now, isSleepFocusActive = false } = input;
  const nowMs = now.getTime();
  const currentDateKey = getLocalDateKey(now);
  const safeSteps = Math.max(0, Math.round(input.stepsToday));

  let current = input.snapshot;
  let completedDayLayer: WaxLayer | null = null;

  // 1. Handle midnight / new-day rollover
  if (current.dateKey !== currentDateKey) {
    const survived =
      current.state !== 'EXTINGUISHED' &&
      current.state !== 'SMOKING_GRACE' &&
      (current.ignitedAt !== null || current.state === 'GLASS_DOME');

    const waxSpec = deriveWaxLayerSpec(current.stepsToday, settings.dailyStepGoal);
    if (survived) {
      completedDayLayer = {
        id: `wax_${current.dateKey}`,
        date: current.dateKey,
        colorHex: current.mood ? getMoodWaxColorHex(current.mood) : waxSpec.colorHex,
        thicknessMm: waxSpec.thicknessMm,
        stepsAchieved: current.stepsToday,
        stepGoal: settings.dailyStepGoal,
        peakIntensity: current.flameIntensity,
        ...(current.mood ? { mood: current.mood } : {}),
      };
    }

    const missedIntermediateDay = daysBetweenDateKeys(current.dateKey, currentDateKey) > 1;
    const nextStreak = survived && !missedIntermediateDay ? current.streakDays + 1 : 0;
    const nextWaxGrams = survived ? current.waxGrams + waxSpec.waxGramsEarned : current.waxGrams;
    current = createMorningSnapshot(
      currentDateKey,
      nowMs,
      nextStreak,
      nextWaxGrams,
      current.glassDomesOwned,
      current.glassDomeActiveUntil
    );
  }

  // 2. Check Glass Dome freeze (24h pause)
  if (current.glassDomeActiveUntil !== null && current.glassDomeActiveUntil > nowMs) {
    return {
      completedDayLayer,
      snapshot: {
        ...current,
        state: 'GLASS_DOME',
        stepsToday: safeSteps,
        flameIntensity: computeFlameIntensity('GLASS_DOME', current.paceRatio),
        flameColorHex: getFlameColorHex('GLASS_DOME'),
        updatedAt: nowMs,
      },
    };
  }

  // If Glass Dome just expired, clear expiry and transition to UNLIT_MORNING if not yet ignited
  if (current.state === 'GLASS_DOME') {
    current = {
      ...current,
      state: current.ignitedAt !== null ? 'STEADY' : 'UNLIT_MORNING',
      glassDomeActiveUntil: null,
    };
  }

  // 3. If already permanently extinguished today, stay extinguished until Spark Rescue
  if (current.state === 'EXTINGUISHED') {
    return {
      completedDayLayer,
      snapshot: {
        ...current,
        stepsToday: safeSteps,
        flameIntensity: 0,
        flameColorHex: getFlameColorHex('EXTINGUISHED'),
        updatedAt: nowMs,
      },
    };
  }

  // 4. Check Sleep Focus freeze (Night Mode)
  if (
    (isSleepFocusActive && settings.sleepFocusSyncEnabled) ||
    current.state === 'NIGHT_SLEEP'
  ) {
    return {
      completedDayLayer,
      snapshot: {
        ...current,
        state: 'NIGHT_SLEEP',
        stepsToday: safeSteps,
        flameIntensity: computeFlameIntensity('NIGHT_SLEEP', current.paceRatio),
        flameColorHex: getFlameColorHex('NIGHT_SLEEP'),
        updatedAt: nowMs,
      },
    };
  }

  const tNorm = computeDayProgress(
    now,
    settings.wakeHour,
    settings.wakeMinute,
    settings.sleepHour,
    settings.sleepMinute
  );
  const expectedStepsNow = computeExpectedSteps(settings.dailyStepGoal, tNorm);
  const paceRatio = computePaceRatio(safeSteps, expectedStepsNow, settings.dailyStepGoal);

  // 5. Morning Ignition check
  if (current.state === 'UNLIT_MORNING') {
    if (safeSteps >= FIRST_STEP_IGNITION_THRESHOLD) {
      const ignitedState: CandleState = paceRatio >= 1 ? 'BLAZING' : 'IGNITING';
      return {
        completedDayLayer,
        snapshot: {
          ...current,
          state: ignitedState,
          stepsToday: safeSteps,
          expectedStepsNow,
          paceRatio,
          flameIntensity: computeFlameIntensity(ignitedState, paceRatio),
          flameColorHex: getFlameColorHex(ignitedState),
          meltProgress: clamp(tNorm * 0.9, 0, 1),
          ignitedAt: nowMs,
          updatedAt: nowMs,
        },
      };
    }

    return {
      completedDayLayer,
      snapshot: {
        ...current,
        stepsToday: safeSteps,
        expectedStepsNow,
        paceRatio,
        updatedAt: nowMs,
      },
    };
  }

  // 6. Smoking Grace Period (stays active until bedtime/midnight so evening walks can save the streak)
  if (current.state === 'SMOKING_GRACE') {
    const startSteps = current.smokingStartSteps ?? safeSteps;
    const burstSteps = Math.max(0, safeSteps - startSteps);
    if (burstSteps >= RESUSCITATION_STEPS_REQUIRED) {
      return {
        completedDayLayer,
        snapshot: {
          ...current,
          state: 'BLAZING',
          stepsToday: safeSteps,
          expectedStepsNow,
          paceRatio,
          flameIntensity: computeFlameIntensity('BLAZING', Math.max(1.05, paceRatio)),
          flameColorHex: getFlameColorHex('BLAZING'),
          meltProgress: clamp(tNorm * 0.9, 0, 1),
          smokingGraceExpiresAt: null,
          smokingStartSteps: null,
          updatedAt: nowMs,
        },
      };
    }

    return {
      completedDayLayer,
      snapshot: {
        ...current,
        stepsToday: safeSteps,
        expectedStepsNow,
        paceRatio,
        updatedAt: nowMs,
      },
    };
  }

  // 7. Normal Daytime Pacing Evaluation
  let nextState: CandleState;
  let smokingGraceExpiresAt: number | null = null;
  let smokingStartSteps: number | null = null;

  if (paceRatio >= 1.0) {
    nextState = 'BLAZING';
  } else if (paceRatio >= 0.8 || tNorm === 0) {
    nextState = 'STEADY';
  } else if (paceRatio >= 0.5) {
    nextState = 'FLICKERING';
  } else if (paceRatio >= 0.25 || tNorm < 0.2) {
    nextState = 'DYING_EMBER';
  } else {
    nextState = 'SMOKING_GRACE';
    smokingGraceExpiresAt = nowMs + SMOKING_GRACE_DURATION_MS;
    smokingStartSteps = safeSteps;
  }

  return {
    completedDayLayer,
    snapshot: {
      ...current,
      state: nextState,
      stepsToday: safeSteps,
      expectedStepsNow,
      paceRatio,
      flameIntensity: computeFlameIntensity(nextState, paceRatio),
      flameColorHex: getFlameColorHex(nextState),
      meltProgress: clamp(tNorm * 0.9, 0, 1),
      smokingGraceExpiresAt,
      smokingStartSteps,
      updatedAt: nowMs,
    },
  };
}

/**
 * Ignites an unlit morning (or sleeping) candle immediately when the user strikes
 * the pocket lighter button (zero-friction manual ignition alongside 5-step auto-ignition).
 */
export function igniteWithLighter(snapshot: CandleSnapshot, nowMs: number): CandleSnapshot {
  if (snapshot.state !== 'UNLIT_MORNING' && snapshot.state !== 'NIGHT_SLEEP') {
    return snapshot;
  }
  return {
    ...snapshot,
    state: 'IGNITING',
    flameIntensity: computeFlameIntensity('IGNITING', snapshot.paceRatio),
    flameColorHex: getFlameColorHex('IGNITING'),
    ignitedAt: nowMs,
    updatedAt: nowMs,
  };
}

/**
 * Transitions the candle into Night Mode (from Mic Blow-Out or manual bedtime).
 */
export function triggerNightBlowOut(snapshot: CandleSnapshot, nowMs: number): CandleSnapshot {
  return {
    ...snapshot,
    state: 'NIGHT_SLEEP',
    flameIntensity: computeFlameIntensity('NIGHT_SLEEP', snapshot.paceRatio),
    flameColorHex: getFlameColorHex('NIGHT_SLEEP'),
    smokingGraceExpiresAt: null,
    smokingStartSteps: null,
    updatedAt: nowMs,
  };
}

/**
 * Activates a 24-hour Glass Dome using an owned dome or 300g earned wax.
 */
export function activateGlassDome(
  snapshot: CandleSnapshot,
  nowMs: number
): { snapshot: CandleSnapshot; activated: boolean; reason?: string } {
  if (snapshot.glassDomeActiveUntil !== null && snapshot.glassDomeActiveUntil > nowMs) {
    return { snapshot, activated: false, reason: 'Glass Dome is already active.' };
  }

  if (snapshot.glassDomesOwned > 0) {
    return {
      activated: true,
      snapshot: {
        ...snapshot,
        state: 'GLASS_DOME',
        glassDomesOwned: snapshot.glassDomesOwned - 1,
        glassDomeActiveUntil: nowMs + GLASS_DOME_DURATION_MS,
        smokingGraceExpiresAt: null,
        smokingStartSteps: null,
        flameIntensity: computeFlameIntensity('GLASS_DOME', snapshot.paceRatio),
        flameColorHex: getFlameColorHex('GLASS_DOME'),
        updatedAt: nowMs,
      },
    };
  }

  if (snapshot.waxGrams >= GLASS_DOME_WAX_COST) {
    return {
      activated: true,
      snapshot: {
        ...snapshot,
        state: 'GLASS_DOME',
        waxGrams: snapshot.waxGrams - GLASS_DOME_WAX_COST,
        glassDomeActiveUntil: nowMs + GLASS_DOME_DURATION_MS,
        smokingGraceExpiresAt: null,
        smokingStartSteps: null,
        flameIntensity: computeFlameIntensity('GLASS_DOME', snapshot.paceRatio),
        flameColorHex: getFlameColorHex('GLASS_DOME'),
        updatedAt: nowMs,
      },
    };
  }

  return {
    snapshot,
    activated: false,
    reason: `Need ${GLASS_DOME_WAX_COST}g wax or an owned Glass Dome.`,
  };
}

/**
 * Manually lifts an active Glass Dome early so the candle resumes normal pacing.
 */
export function removeGlassDome(snapshot: CandleSnapshot, nowMs: number): CandleSnapshot {
  if (snapshot.state !== 'GLASS_DOME') {
    return snapshot;
  }
  const resumedState: CandleState = snapshot.ignitedAt !== null ? 'STEADY' : 'UNLIT_MORNING';
  return {
    ...snapshot,
    state: resumedState,
    glassDomeActiveUntil: null,
    flameIntensity: computeFlameIntensity(resumedState, snapshot.paceRatio),
    flameColorHex: getFlameColorHex(resumedState),
    updatedAt: nowMs,
  };
}

/**
 * Reignites a dying, smoking, or extinguished candle via a friend's 500-step Spark Rescue.
 */
export function reigniteFromSpark(snapshot: CandleSnapshot, nowMs: number): CandleSnapshot {
  return {
    ...snapshot,
    state: 'BLAZING',
    flameIntensity: 1.0,
    flameColorHex: getFlameColorHex('BLAZING'),
    smokingGraceExpiresAt: null,
    smokingStartSteps: null,
    ignitedAt: snapshot.ignitedAt ?? nowMs,
    updatedAt: nowMs,
  };
}
