import {
  activateGlassDome,
  createMorningSnapshot,
  evaluateCandleState,
  GLASS_DOME_WAX_COST,
  igniteWithLighter,
  reigniteFromSpark,
  removeGlassDome,
  RESUSCITATION_STEPS_REQUIRED,
  SMOKING_GRACE_DURATION_MS,
  triggerNightBlowOut,
} from '../src/engine/candleStateMachine';
import { endOfLocalDayMs } from '../src/engine/candleMath';
import { DEFAULT_SETTINGS } from '../src/services/storageService';

describe('candleStateMachine & regression lifecycle', () => {
  const settings = { ...DEFAULT_SETTINGS, dailyStepGoal: 8000 };

  it('ignites on first 5+ steps in the morning and stays unlit below 5 steps', () => {
    const t0 = new Date(2026, 10, 18, 7, 10);
    const morning = createMorningSnapshot('2026-11-18', t0.getTime(), 3, 100, 1);

    const stillUnlit = evaluateCandleState({
      snapshot: morning,
      stepsToday: 3,
      settings,
      now: t0,
    });
    expect(stillUnlit.snapshot.state).toBe('UNLIT_MORNING');

    const ignited = evaluateCandleState({
      snapshot: stillUnlit.snapshot,
      stepsToday: 12,
      settings,
      now: t0,
    });
    expect(ignited.snapshot.state).toBe('IGNITING');
    expect(ignited.snapshot.ignitedAt).toBe(t0.getTime());

    // Manual lighter strike ignites UNLIT_MORNING and NIGHT_SLEEP, no-op if already lit
    const lighterLit = igniteWithLighter(morning, t0.getTime());
    expect(lighterLit.state).toBe('IGNITING');
    expect(lighterLit.ignitedAt).toBe(t0.getTime());
    expect(igniteWithLighter(lighterLit, t0.getTime() + 500)).toBe(lighterLit);
    const wakeFromNight = igniteWithLighter(
      { ...lighterLit, state: 'NIGHT_SLEEP' },
      t0.getTime() + 1000
    );
    expect(wakeFromNight.state).toBe('IGNITING');

    // High steps on ignition go straight to BLAZING
    const blazingIgnite = evaluateCandleState({
      snapshot: morning,
      stepsToday: 500,
      settings,
      now: t0,
    });
    expect(blazingIgnite.snapshot.state).toBe('BLAZING');
  });

  it('transitions through STEADY, FLICKERING, DYING_EMBER, SMOKING_GRACE, and EXTINGUISHED', () => {
    const midday = new Date(2026, 10, 18, 15, 0); // expected = 4000
    let snap = createMorningSnapshot('2026-11-18', midday.getTime(), 5, 200, 0);
    snap = { ...snap, state: 'BLAZING', ignitedAt: midday.getTime() - 1000 };

    const steady = evaluateCandleState({ snapshot: snap, stepsToday: 3400, settings, now: midday });
    expect(steady.snapshot.state).toBe('STEADY');

    const backToBlazing = evaluateCandleState({
      snapshot: steady.snapshot,
      stepsToday: 4500,
      settings,
      now: midday,
    });
    expect(backToBlazing.snapshot.state).toBe('BLAZING');

    const flickering = evaluateCandleState({ snapshot: steady.snapshot, stepsToday: 2400, settings, now: midday });
    expect(flickering.snapshot.state).toBe('FLICKERING');

    const dying = evaluateCandleState({ snapshot: flickering.snapshot, stepsToday: 1200, settings, now: midday });
    expect(dying.snapshot.state).toBe('DYING_EMBER');

    const smoking = evaluateCandleState({ snapshot: dying.snapshot, stepsToday: 200, settings, now: midday });
    expect(smoking.snapshot.state).toBe('SMOKING_GRACE');
    expect(smoking.snapshot.smokingGraceExpiresAt).toBe(endOfLocalDayMs(midday));

    // Still smoking before 60 min without enough steps
    const stillSmoking = evaluateCandleState({
      snapshot: smoking.snapshot,
      stepsToday: 250,
      settings,
      now: new Date(midday.getTime() + 10 * 60 * 1000),
    });
    expect(stillSmoking.snapshot.state).toBe('SMOKING_GRACE');

    // Resuscitate with 350 burst steps
    const rescued = evaluateCandleState({
      snapshot: smoking.snapshot,
      stepsToday: 200 + RESUSCITATION_STEPS_REQUIRED,
      settings,
      now: new Date(midday.getTime() + 15 * 60 * 1000),
    });
    expect(rescued.snapshot.state).toBe('BLAZING');

    // Stays in SMOKING_GRACE past 60 min (gentler grace until midnight)
    const staysSmoking = evaluateCandleState({
      snapshot: smoking.snapshot,
      stepsToday: 220,
      settings,
      now: new Date(midday.getTime() + SMOKING_GRACE_DURATION_MS + 1000),
    });
    expect(staysSmoking.snapshot.state).toBe('SMOKING_GRACE');

    // Extinguished candle stays EXTINGUISHED on further steps
    const alreadyExtinguished = { ...staysSmoking.snapshot, state: 'EXTINGUISHED' as const };
    const staysOut = evaluateCandleState({
      snapshot: alreadyExtinguished,
      stepsToday: 3000,
      settings,
      now: new Date(midday.getTime() + SMOKING_GRACE_DURATION_MS + 5000),
    });
    expect(staysOut.snapshot.state).toBe('EXTINGUISHED');

    // Spark Rescue reignites an extinguished candle
    const sparkRescued = reigniteFromSpark(staysOut.snapshot, midday.getTime() + 9999);
    expect(sparkRescued.state).toBe('BLAZING');
    expect(sparkRescued.flameIntensity).toBe(1);
  });

  it('freezes on Night Mode (Sleep Focus or Blow Out) and handles midnight rollover', () => {
    const night = new Date(2026, 10, 18, 22, 45);
    let snap = createMorningSnapshot('2026-11-18', night.getTime(), 2, 100, 0);
    snap = { ...snap, state: 'BLAZING', stepsToday: 8200, ignitedAt: night.getTime() - 3600000 };

    const blownOut = triggerNightBlowOut(snap, night.getTime());
    expect(blownOut.state).toBe('NIGHT_SLEEP');

    const sleepFocusRes = evaluateCandleState({
      snapshot: snap,
      stepsToday: 8200,
      settings,
      now: night,
      isSleepFocusActive: true,
    });
    expect(sleepFocusRes.snapshot.state).toBe('NIGHT_SLEEP');

    // Midnight rollover -> hardens wax layer & increments streak
    const nextMorning = new Date(2026, 10, 19, 7, 5);
    const rollover = evaluateCandleState({
      snapshot: blownOut,
      stepsToday: 0,
      settings,
      now: nextMorning,
    });
    expect(rollover.completedDayLayer).not.toBeNull();
    expect(rollover.snapshot.streakDays).toBe(3);
    expect(rollover.snapshot.dateKey).toBe('2026-11-19');

    // Extinguished day rollover -> resets streak to 0 and emits no wax layer
    const extinguishedYesterday = { ...snap, state: 'EXTINGUISHED' as const };
    const resetRollover = evaluateCandleState({
      snapshot: extinguishedYesterday,
      stepsToday: 0,
      settings,
      now: nextMorning,
    });
    expect(resetRollover.completedDayLayer).toBeNull();
    expect(resetRollover.snapshot.streakDays).toBe(0);

    // Unlit morning rollover (ignitedAt === null) -> emits no wax layer
    const unlitYesterday = createMorningSnapshot('2026-11-18', night.getTime(), 2, 0, 0);
    const unlitRollover = evaluateCandleState({
      snapshot: unlitYesterday,
      stepsToday: 0,
      settings,
      now: nextMorning,
    });
    expect(unlitRollover.completedDayLayer).toBeNull();
    expect(unlitRollover.snapshot.streakDays).toBe(0);

    // A backward date does not mint a streak day.
    const backward = evaluateCandleState({
      snapshot: blownOut,
      stepsToday: 9000,
      settings,
      now: new Date(2026, 10, 17, 12, 0),
    });
    expect(backward.completedDayLayer).toBeNull();
    expect(backward.snapshot.dateKey).toBe('2026-11-18');
    expect(backward.snapshot.streakDays).toBe(2);

    // Lighting the wick with zero steps does not earn a streak day.
    const lighterOnly = igniteWithLighter(
      createMorningSnapshot('2026-11-18', night.getTime(), 4, 20, 0),
      night.getTime()
    );
    const zeroStepRollover = evaluateCandleState({
      snapshot: lighterOnly,
      stepsToday: 0,
      settings,
      now: nextMorning,
    });
    expect(zeroStepRollover.completedDayLayer).toBeNull();
    expect(zeroStepRollover.snapshot.streakDays).toBe(4);

    // SMOKING_GRACE with null smokingStartSteps fallback
    const smokingNullStart = {
      ...snap,
      state: 'SMOKING_GRACE' as const,
      smokingStartSteps: null,
      smokingGraceExpiresAt: night.getTime() + 60000,
    };
    const smokingFallback = evaluateCandleState({
      snapshot: smokingNullStart,
      stepsToday: 100,
      settings,
      now: night,
    });
    expect(smokingFallback.snapshot.state).toBe('SMOKING_GRACE');
  });

  it('manages Glass Dome activation via owned dome, wax cost, and active freeze', () => {
    const now = new Date(2026, 10, 18, 12, 0);
    const withDome = createMorningSnapshot('2026-11-18', now.getTime(), 4, 50, 1);
    const act1 = activateGlassDome(withDome, now.getTime());
    expect(act1.activated).toBe(true);
    expect(act1.snapshot.glassDomesOwned).toBe(0);

    // Already active cannot be re-activated
    const actDup = activateGlassDome(act1.snapshot, now.getTime() + 1000);
    expect(actDup.activated).toBe(false);

    // Evaluate while dome is active stays GLASS_DOME
    const evalDome = evaluateCandleState({
      snapshot: act1.snapshot,
      stepsToday: 100,
      settings,
      now: new Date(now.getTime() + 3600000),
    });
    expect(evalDome.snapshot.state).toBe('GLASS_DOME');

    // When Glass Dome expires same-day with ignitedAt === null, transitions to UNLIT_MORNING
    const sameDayExpiredSnap = {
      ...act1.snapshot,
      glassDomeActiveUntil: now.getTime() + 1000,
    };
    const expiredDomeUnlit = evaluateCandleState({
      snapshot: sameDayExpiredSnap,
      stepsToday: 0,
      settings,
      now: new Date(now.getTime() + 2000),
    });
    expect(expiredDomeUnlit.snapshot.state).toBe('UNLIT_MORNING');
    expect(expiredDomeUnlit.snapshot.glassDomeActiveUntil).toBeNull();

    // When Glass Dome expires same-day with ignitedAt !== null, resumes daytime evaluation
    const ignitedDome = { ...sameDayExpiredSnap, ignitedAt: now.getTime() - 1000 };
    const expiredDomeIgnited = evaluateCandleState({
      snapshot: ignitedDome,
      stepsToday: 100,
      settings,
      now: new Date(now.getTime() + 2000),
    });
    expect(expiredDomeIgnited.snapshot.glassDomeActiveUntil).toBeNull();

    // Pre-wake steps (05:00 AM, tNorm === 0) stay STEADY rather than DYING_EMBER
    const preWake = new Date(2026, 10, 18, 5, 0);
    const preWakeSnap = {
      ...createMorningSnapshot('2026-11-18', preWake.getTime(), 1, 0, 0),
      state: 'IGNITING' as const,
      ignitedAt: preWake.getTime() - 1000,
    };
    const preWakeEval = evaluateCandleState({
      snapshot: preWakeSnap,
      stepsToday: 10,
      settings,
      now: preWake,
    });
    expect(preWakeEval.snapshot.state).toBe('STEADY');

    // Activate via 300g wax
    const withWax = createMorningSnapshot('2026-11-18', now.getTime(), 4, GLASS_DOME_WAX_COST, 0);
    const actWax = activateGlassDome(withWax, now.getTime());
    expect(actWax.activated).toBe(true);
    expect(actWax.snapshot.waxGrams).toBe(0);

    // Insufficient wax & no owned dome
    const broke = createMorningSnapshot('2026-11-18', now.getTime(), 0, 10, 0);
    const actFail = activateGlassDome(broke, now.getTime());
    expect(actFail.activated).toBe(false);

    // Manual lift of Glass Dome (both unlit and ignited) plus no-op when not under dome
    const liftedUnlit = removeGlassDome(act1.snapshot, now.getTime() + 5000);
    expect(liftedUnlit.state).toBe('UNLIT_MORNING');
    expect(liftedUnlit.glassDomeActiveUntil).toBeNull();
    expect(removeGlassDome(liftedUnlit, now.getTime() + 6000)).toBe(liftedUnlit);

    const liftedIgnited = removeGlassDome(
      { ...act1.snapshot, ignitedAt: now.getTime() - 1000 },
      now.getTime() + 5000
    );
    expect(liftedIgnited.state).toBe('STEADY');

    // Morning snapshot with active dome carries into next day
    const nextDay = createMorningSnapshot('2026-11-19', now.getTime(), 5, 0, 0, now.getTime() + 50000);
    expect(nextDay.state).toBe('GLASS_DOME');
  });

  it('handles spark reignition when ignitedAt was null and early-morning low pace', () => {
    const snap = createMorningSnapshot('2026-11-18', 1000, 0, 0, 0);
    const res = reigniteFromSpark(snap, 2000);
    expect(res.ignitedAt).toBe(2000);

    // Early morning (07:30 -> tNorm < 0.2) stays DYING_EMBER rather than SMOKING_GRACE
    const earlyMorning = new Date(2026, 10, 18, 7, 30);
    const earlyDying = evaluateCandleState({
      snapshot: { ...snap, state: 'IGNITING', ignitedAt: 1000 },
      stepsToday: 10,
      settings,
      now: earlyMorning,
    });
    expect(earlyDying.snapshot.state).toBe('DYING_EMBER');
  });

  it('tints completed wax layer with nightly mood and clears mood on next day', () => {
    const night = new Date(2026, 10, 18, 22, 45);
    const snap = {
      ...createMorningSnapshot('2026-11-18', night.getTime(), 2, 100, 0),
      state: 'NIGHT_SLEEP' as const,
      stepsToday: 8000,
      ignitedAt: night.getTime() - 3600000,
      mood: 'Grateful' as const,
    };
    const nextMorning = new Date(2026, 10, 19, 7, 5);
    const rollover = evaluateCandleState({
      snapshot: snap,
      stepsToday: 0,
      settings,
      now: nextMorning,
    });
    expect(rollover.completedDayLayer?.mood).toBe('Grateful');
    expect(rollover.completedDayLayer?.colorHex).toBe('#F4B942');
    expect(rollover.snapshot.mood).toBeUndefined();
  });
});
