import {
  activateGlassDome,
  createMorningSnapshot,
  evaluateCandleState,
  removeGlassDome,
  RESUSCITATION_STEPS_REQUIRED,
  SMOKING_GRACE_DURATION_MS,
} from '../src/engine/candleStateMachine';
import {
  buildSparkUniversalLink,
  createSparkToken,
  parseSparkLink,
} from '../src/engine/sparkEngine';
import {
  BLOW_DECIBEL_THRESHOLD,
  BREEZE_MIN_DECIBEL,
  computeWindShakeIntensity,
} from '../src/services/audioBlowService';
import { DEFAULT_SETTINGS } from '../src/services/storageService';

describe('Wick enhancements & bug-fix regression suite', () => {
  it('simulates 3,000-step goal with 200 morning steps through evening Smoking Grace comeback', () => {
    const settings = { ...DEFAULT_SETTINGS, dailyStepGoal: 3000 };
    const t0 = new Date(2026, 10, 19, 7, 30);
    let snap = createMorningSnapshot('2026-11-19', t0.getTime(), 4, 100, 1);

    // 200 steps at 7:30 AM -> BLAZING
    snap = evaluateCandleState({ snapshot: snap, stepsToday: 200, settings, now: t0 }).snapshot;
    expect(snap.state).toBe('BLAZING');

    // Afternoon 14:30 with still only 200 steps -> SMOKING_GRACE
    const afternoon = new Date(2026, 10, 19, 14, 30);
    snap = evaluateCandleState({ snapshot: snap, stepsToday: 200, settings, now: afternoon }).snapshot;
    expect(snap.state).toBe('SMOKING_GRACE');

    // Evening 20:00 (well past 60m) stays SMOKING_GRACE until user walks 350 steps
    const evening = new Date(2026, 10, 19, 20, 0);
    snap = evaluateCandleState({
      snapshot: snap,
      stepsToday: 250,
      settings,
      now: new Date(afternoon.getTime() + SMOKING_GRACE_DURATION_MS * 5),
    }).snapshot;
    expect(snap.state).toBe('SMOKING_GRACE');

    // Evening comeback walk of 350 steps -> BLAZING
    snap = evaluateCandleState({
      snapshot: snap,
      stepsToday: 200 + RESUSCITATION_STEPS_REQUIRED,
      settings,
      now: evening,
    }).snapshot;
    expect(snap.state).toBe('BLAZING');

    // Unrescued SMOKING_GRACE at midnight rollover resets streak
    const smokingAtNight = { ...snap, state: 'SMOKING_GRACE' as const };
    const nextDay = evaluateCandleState({
      snapshot: smokingAtNight,
      stepsToday: 0,
      settings,
      now: new Date(2026, 10, 20, 7, 0),
    });
    expect(nextDay.completedDayLayer).toBeNull();
    expect(nextDay.snapshot.streakDays).toBe(0);
  });

  it('supports lifting Glass Dome early and shields wind when active', () => {
    const now = new Date(2026, 10, 19, 11, 0);
    const snap = {
      ...createMorningSnapshot('2026-11-19', now.getTime(), 3, 0, 1),
      state: 'BLAZING' as const,
      ignitedAt: now.getTime() - 1000,
    };
    const domed = activateGlassDome(snap, now.getTime());
    expect(domed.activated).toBe(true);
    expect(domed.snapshot.state).toBe('GLASS_DOME');

    const lifted = removeGlassDome(domed.snapshot, now.getTime() + 60000);
    expect(lifted.state).toBe('STEADY');
    expect(lifted.glassDomeActiveUntil).toBeNull();
  });

  it('uses live GitHub Pages URLs (no 401 wick.app) for Spark & deep links', () => {
    const token = createSparkToken('spk-reg', 'Senthil', 'dev-1', 'sec', 1_700_000_000_000);
    const url = buildSparkUniversalLink(token);
    expect(url.startsWith('https://senthilmkm.github.io/wick/spark.html?t=')).toBe(true);
    expect(url).not.toContain('wick.app');
    expect(parseSparkLink(url)).toEqual(token);
  });

  it('defaults liveBreezeEnabled to true and computes smooth wind shake intensity', () => {
    expect(DEFAULT_SETTINGS.liveBreezeEnabled).toBe(true);
    expect(computeWindShakeIntensity(BREEZE_MIN_DECIBEL)).toBe(0);
    expect(computeWindShakeIntensity(BLOW_DECIBEL_THRESHOLD)).toBe(1);
  });
});
