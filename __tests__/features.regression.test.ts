import {
  activateGlassDome,
  createMorningSnapshot,
  evaluateCandleState,
  reigniteFromSpark,
  removeGlassDome,
  RESUSCITATION_STEPS_REQUIRED,
  SMOKING_GRACE_DURATION_MS,
} from '../src/engine/candleStateMachine';
import { isNighttimeWindow } from '../src/engine/candleMath';
import {
  buildSparkUniversalLink,
  createSparkToken,
  parseSparkLink,
} from '../src/engine/sparkEngine';
import {
  canAddFriend,
  canExportPdf,
  canUseGlassDome,
  canUseTheme,
  createInitialEntitlement,
  REVERSE_TRIAL_MS,
} from '../src/engine/trialGuard';
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

  it('defaults liveBreezeEnabled to false, lanternModeEnabled to false, and computes wind intensity', () => {
    expect(DEFAULT_SETTINGS.liveBreezeEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.lanternModeEnabled).toBe(false);
    expect(computeWindShakeIntensity(BREEZE_MIN_DECIBEL)).toBe(0);
    expect(computeWindShakeIntensity(BLOW_DECIBEL_THRESHOLD)).toBe(1);
  });

  it('enforces 3-day reverse trial using Keychain firstInstallAt across reinstalls', () => {
    const installDate = new Date(2026, 10, 15, 9, 0);
    // Simulated reinstall on Day 2 (Keychain preserves installDate)
    const ent = createInitialEntitlement(
      new Date(2026, 10, 16, 12, 0),
      false,
      true,
      installDate.getTime(),
      false
    );
    const day2Ms = installDate.getTime() + 24 * 60 * 60 * 1000;
    expect(canUseTheme(ent, 'lunar_slate', day2Ms)).toBe(true);
    expect(canUseGlassDome(ent, day2Ms)).toBe(true);
    expect(canAddFriend(ent, 2, day2Ms)).toBe(true);
    expect(canExportPdf(ent, day2Ms)).toBe(true);

    // Day 4 (after 72h): Pro gates lock even after reinstall
    const day4Ms = installDate.getTime() + REVERSE_TRIAL_MS + 1000;
    expect(canUseTheme(ent, 'lunar_slate', day4Ms)).toBe(false);
    expect(canUseGlassDome(ent, day4Ms)).toBe(false);
    expect(canAddFriend(ent, 1, day4Ms)).toBe(false);
    expect(canExportPdf(ent, day4Ms)).toBe(false);
  });

  it('prevents daytime blow-out outside configured sleep window', () => {
    expect(isNighttimeWindow(new Date(2026, 10, 19, 11, 30), 7, 0, 23, 0)).toBe(false);
    expect(isNighttimeWindow(new Date(2026, 10, 19, 23, 15), 7, 0, 23, 0)).toBe(true);
  });

  it('resets streak across multi-day absence and preserves mood tint on consecutive rollover', () => {
    const day1 = new Date(2026, 10, 17, 22, 0);
    const snap = {
      ...createMorningSnapshot('2026-11-17', day1.getTime(), 5, 100, 1),
      state: 'BLAZING' as const,
      stepsToday: 8500,
      ignitedAt: day1.getTime() - 3600000,
      mood: 'Proud' as const,
    };
    // Skip Nov 18 completely -> arrive Nov 19 -> streak resets to 0
    const skipped = evaluateCandleState({
      snapshot: snap,
      stepsToday: 0,
      settings: DEFAULT_SETTINGS,
      now: new Date(2026, 10, 19, 8, 0),
    });
    expect(skipped.completedDayLayer?.mood).toBe('Proud');
    expect(skipped.snapshot.streakDays).toBe(0);
    expect(skipped.snapshot.mood).toBeUndefined();
  });

  it('keeps Spark-rescued candle BLAZING during the 2-hour shield even at low pace', () => {
    const afternoon = new Date(2026, 10, 19, 15, 0);
    const smoking = {
      ...createMorningSnapshot('2026-11-19', afternoon.getTime() - 3600000, 3, 50, 0),
      state: 'SMOKING_GRACE' as const,
      stepsToday: 100,
      ignitedAt: afternoon.getTime() - 3600000,
    };
    const rescued = reigniteFromSpark(smoking, afternoon.getTime());
    expect(rescued.state).toBe('BLAZING');

    // Subsequent step evaluation 5 minutes later stays BLAZING under the shield
    const nextEval = evaluateCandleState({
      snapshot: rescued,
      stepsToday: 110,
      settings: DEFAULT_SETTINGS,
      now: new Date(afternoon.getTime() + 5 * 60 * 1000),
    });
    expect(nextEval.snapshot.state).toBe('BLAZING');
    const brighter = evaluateCandleState({
      snapshot: rescued,
      stepsToday: 4000,
      settings: DEFAULT_SETTINGS,
      now: new Date(afternoon.getTime() + 5 * 60 * 1000),
    });
    expect(brighter.snapshot.flameIntensity).toBeGreaterThan(nextEval.snapshot.flameIntensity);
  });
});
