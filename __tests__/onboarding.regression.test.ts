import { createMorningSnapshot } from '../src/engine/candleStateMachine';
import {
  candleStateLabel,
  CIRCLE_EMPTY_BODY,
  CIRCLE_INVITE_SENT_BODY,
  flameCoachLine,
  friendIsInRain,
  friendRainLine,
  rainClearedByWalk,
  rainStaysUntilWalk,
  shortWalkLine,
  shortWalkSteps,
  shouldShowLighter,
  stateForFriends,
  celebrationLine,
  GOAL_FULL_LINE,
  nextStreakBandLine,
  RAIN_STILL_MS,
  rainNudgeOn,
  savedDayLine,
  STEPS_OFF_LINE,
  streakBandLine,
  WICK_LIT_LINE,
  TAB_HINTS,
  tabsShouldHide,
  walkLitTheCandle,
  WELCOME_LINES,
  WELCOME_TITLE,
} from '../src/engine/firstRunCopy';
import {
  adjustDailyGoal,
  buildOnboardingSettings,
  canAdvanceFromName,
  eveningNudgeClock,
  finishOnboardingSnapshot,
  GOAL_PRESETS,
  goalPresetSelection,
  goalSelectionLabel,
  matchingNamePreset,
  moveOnboardingStep,
  NAME_PRESETS,
  nameSelectionLabel,
  normalizeCandleName,
  ONBOARDING_STEP_META,
  ONBOARDING_STEPS,
  OnboardingStep,
  permissionOutcomeLabel,
  resolveThemeId,
  resolvedCandleName,
  runOnboardingPermissions,
} from '../src/engine/onboardingFlow';
import { DEFAULT_SETTINGS } from '../src/services/storageService';

describe('onboarding flow regression', () => {
  const now = new Date(2026, 10, 20, 8, 0);
  const morning = () => createMorningSnapshot('2026-11-20', now.getTime(), 0, 0, 1);

  it('walks every step forward and back without leaving the flow', () => {
    expect(ONBOARDING_STEPS).toEqual(['welcome', 'goal', 'permissions']);
    expect(ONBOARDING_STEP_META.welcome.title).toBe(WELCOME_TITLE);
    expect(WELCOME_LINES).toEqual([
      'Walk, and the candle stays bright.',
      'Sit too long, and it fades.',
      'A finished day becomes wax.',
    ]);
    expect(ONBOARDING_STEP_META.permissions.continueLabel).toBe('Light My Candle');
    let step: OnboardingStep = ONBOARDING_STEPS[0];
    expect(moveOnboardingStep(step, -1)).toBe('welcome');
    for (const expected of ONBOARDING_STEPS.slice(1)) {
      step = moveOnboardingStep(step, 1);
      expect(step).toBe(expected);
    }
    expect(moveOnboardingStep('permissions', 1)).toBe('permissions');
    expect(moveOnboardingStep('permissions', -1)).toBe('goal');
    expect(flameCoachLine('UNLIT_MORNING')).toBe('Take 5 steps.');
    expect(flameCoachLine('UNLIT_MORNING', false, true)).toBe(STEPS_OFF_LINE);
    expect(flameCoachLine('BLAZING', false, true)).toBe(
      'Walk to keep it bright. Hold the candle for night, rest, or a share.'
    );
    expect(flameCoachLine('NIGHT_SLEEP', true)).toBe('Tap the lighter, or take 5 steps.');
    expect(flameCoachLine('BLAZING')).toBe(
      'Walk to keep it bright. Hold the candle for night, rest, or a share.'
    );
    expect(tabsShouldHide('flame', false)).toBe(false);
    expect(tabsShouldHide('flame', true)).toBe(true);
    expect(tabsShouldHide('circle', true)).toBe(false);
    expect(candleStateLabel('BLAZING')).toBe('Blazing');
    expect(candleStateLabel('STEADY')).toBe('Steady');
    expect(candleStateLabel('FLICKERING')).toBe('Flickering');
    expect(candleStateLabel('DYING_EMBER')).toBe('Dying ember');
    expect(candleStateLabel('GLASS_DOME')).toBe('Rest day');
    expect(candleStateLabel('SMOKING_GRACE')).toBe('Out');
    expect(candleStateLabel('EXTINGUISHED')).toBe('Out');
    expect(candleStateLabel('NIGHT_SLEEP')).toBe('Night');
    expect(candleStateLabel('UNLIT_MORNING')).toBe('Unlit');
    expect(candleStateLabel('IGNITING')).toBe('Lighting');
    expect(candleStateLabel('OTHER')).toBe('Candle');
    expect(candleStateLabel('RAIN')).toBe('In the rain');
    expect(shortWalkLine(8000)).toBe('10 minutes makes the flame brighter.');
    expect(shortWalkLine(1000)).toBe('10 minutes makes the flame brighter.');
    expect(shortWalkLine(840)).toBe('8 minutes makes the flame brighter.');
    expect(shortWalkLine(50)).toBe('1 minute makes the flame brighter.');
    expect(shortWalkLine(0)).toBe('1 minute makes the flame brighter.');
    expect(shortWalkLine(Number.NaN)).toBe('1 minute makes the flame brighter.');
    expect(shortWalkLine(-20)).toBe('1 minute makes the flame brighter.');
    expect(shortWalkSteps(8000)).toBe(1000);
    expect(shortWalkSteps(840)).toBe(800);
    expect(shortWalkSteps(50)).toBe(100);
    expect(shortWalkSteps(0)).toBe(100);
    expect(shortWalkSteps(Number.NaN)).toBe(100);
    expect(shortWalkSteps(-20)).toBe(100);
    expect(rainClearedByWalk(1, 1000)).toBe(false);
    expect(rainClearedByWalk(999, 1000)).toBe(false);
    expect(rainClearedByWalk(1000, 1000)).toBe(true);
    expect(rainClearedByWalk(1001, 1000)).toBe(true);
    expect(rainClearedByWalk(Number.NaN, 1000)).toBe(false);
    expect(rainClearedByWalk(-1, 1000)).toBe(false);
    expect(rainClearedByWalk(1000, Number.NaN)).toBe(false);
    expect(rainClearedByWalk(1000, 0)).toBe(false);
    const held = {
      goalMet: false,
      ignitedAt: 1,
      state: 'BLAZING',
      stepsGained: 1,
      stepsNeeded: 1000,
    };
    expect(rainStaysUntilWalk(held)).toBe(true);
    expect(rainStaysUntilWalk({ ...held, stepsGained: 1000 })).toBe(false);
    expect(rainStaysUntilWalk({ ...held, goalMet: true })).toBe(false);
    expect(rainStaysUntilWalk({ ...held, ignitedAt: null })).toBe(false);
    expect(rainStaysUntilWalk({ ...held, ignitedAt: Number.NaN })).toBe(false);
    expect(rainStaysUntilWalk({ ...held, state: 'NIGHT_SLEEP' })).toBe(false);
    expect(stateForFriends('BLAZING', false)).toBe('BLAZING');
    expect(stateForFriends('BLAZING', true)).toBe('RAIN');
    expect(friendIsInRain('RAIN')).toBe(true);
    expect(friendIsInRain('BLAZING')).toBe(false);
    expect(friendRainLine('Alex')).toBe('Alex is in the rain.');
    expect(friendRainLine('  ')).toBe('A friend is in the rain.');
    expect(CIRCLE_EMPTY_BODY).toBe('When they accept, you both show up here.');
    expect(CIRCLE_INVITE_SENT_BODY).toBe('Invite sent. They show up here when they open Wick.');
    expect(WICK_LIT_LINE).toBe('Your wick is lit.');
    expect(GOAL_FULL_LINE).toBe('Goal. The wick is full.');
    expect(savedDayLine('Nov 20, 2026', 8200)).toBe('Nov 20, 2026 is saved. 8,200 steps.');
    expect(savedDayLine('Nov 20, 2026', Number.NaN)).toBe('Nov 20, 2026 is saved. 0 steps.');
    expect(streakBandLine(6, 7)).toBe('7 days. Bronze.');
    expect(streakBandLine(13, 14)).toBe('14 days. Silver.');
    expect(streakBandLine(29, 30)).toBe('30 days. Gold.');
    expect(streakBandLine(6, 30)).toBe('30 days. Gold.');
    expect(streakBandLine(99, 100)).toBe('100 days. Diamond.');
    expect(streakBandLine(7, 8)).toBeNull();
    expect(streakBandLine(7, 7)).toBeNull();
    expect(streakBandLine(Number.NaN, 7)).toBeNull();
    expect(streakBandLine(6, Number.NaN)).toBeNull();
    expect(nextStreakBandLine(0)).toBe('Next: Bronze at 7 days.');
    expect(nextStreakBandLine(7)).toBe('Next: Silver at 14 days.');
    expect(nextStreakBandLine(14)).toBe('Next: Gold at 30 days.');
    expect(nextStreakBandLine(30)).toBe('Next: Diamond at 100 days.');
    expect(nextStreakBandLine(100)).toBeNull();
    expect(nextStreakBandLine(-1)).toBeNull();
    expect(nextStreakBandLine(Number.NaN)).toBeNull();
    expect(
      celebrationLine({ band: '7 days. Bronze.', lit: true, goal: true, saved: 'saved' })
    ).toBe('7 days. Bronze.');
    expect(celebrationLine({ band: null, lit: true, goal: true, saved: 'saved' })).toBe(WICK_LIT_LINE);
    expect(celebrationLine({ band: null, lit: false, goal: true, saved: 'saved' })).toBe(GOAL_FULL_LINE);
    expect(celebrationLine({ band: null, lit: false, goal: false, saved: 'saved' })).toBe('saved');
    expect(celebrationLine({ band: null, lit: false, goal: false, saved: null })).toBeNull();
    const raining = {
      goalMet: false,
      ignitedAt: 1,
      state: 'BLAZING',
      stillForMs: RAIN_STILL_MS,
    };
    expect(rainNudgeOn(raining)).toBe(true);
    expect(rainNudgeOn({ ...raining, stillForMs: RAIN_STILL_MS + 1 })).toBe(true);
    expect(rainNudgeOn({ ...raining, state: 'FLICKERING' })).toBe(true);
    expect(rainNudgeOn({ ...raining, goalMet: true })).toBe(false);
    expect(rainNudgeOn({ ...raining, ignitedAt: null })).toBe(false);
    expect(rainNudgeOn({ ...raining, ignitedAt: Number.NaN })).toBe(false);
    expect(rainNudgeOn({ ...raining, stillForMs: RAIN_STILL_MS - 1 })).toBe(false);
    expect(rainNudgeOn({ ...raining, stillForMs: Number.NaN })).toBe(false);
    for (const state of ['NIGHT_SLEEP', 'GLASS_DOME', 'SMOKING_GRACE', 'EXTINGUISHED', 'UNLIT_MORNING']) {
      expect(rainNudgeOn({ ...raining, state })).toBe(false);
    }
    expect(shouldShowLighter('UNLIT_MORNING', false)).toBe(false);
    expect(shouldShowLighter('UNLIT_MORNING', false, true)).toBe(true);
    expect(shouldShowLighter('BLAZING', false, true)).toBe(false);
    expect(shouldShowLighter('UNLIT_MORNING', true)).toBe(true);
    expect(shouldShowLighter('NIGHT_SLEEP', true)).toBe(true);
    expect(shouldShowLighter('BLAZING', true)).toBe(false);
    expect(
      walkLitTheCandle(
        { state: 'UNLIT_MORNING', ignitedAt: null },
        { ignitedAt: 10, stepsToday: 5 }
      )
    ).toBe(true);
    expect(
      walkLitTheCandle(
        { state: 'UNLIT_MORNING', ignitedAt: null },
        { ignitedAt: 10, stepsToday: 4 }
      )
    ).toBe(false);
    expect(TAB_HINTS).toEqual({
      ledger: 'Past days, saved as wax.',
      circle: 'One friend. Send one invite.',
      sanctuary: 'Look, name, goal, and sleep.',
    });
  });

  it('keeps a goal selected inside the allowed range, including custom values', () => {
    expect(adjustDailyGoal(Number.NaN, 0)).toBe(8000);
    expect(adjustDailyGoal(1000, 0)).toBe(2000);
    expect(adjustDailyGoal(30000, 0)).toBe(25000);
    expect(adjustDailyGoal(8400.4, 0)).toBe(8400);
    expect(adjustDailyGoal(2000, -1000)).toBe(2000);
    expect(adjustDailyGoal(25000, 1000)).toBe(25000);
    expect(adjustDailyGoal(8000, 1000)).toBe(9000);
    expect(goalPresetSelection(8000)).toBe(8000);
    expect(goalPresetSelection(9000)).toBe('custom');
    expect(goalPresetSelection(Number.NaN)).toBe(8000);
    expect(goalSelectionLabel(8000)).toBe('Selected: 8k');
    expect(goalSelectionLabel(9000)).toBe('Selected: 9,000 steps');
    expect(GOAL_PRESETS).toEqual([5000, 8000, 10000]);
  });

  it('requires a name and highlights a preset regardless of case or surrounding spaces', () => {
    expect(normalizeCandleName('   ')).toBe('');
    expect(normalizeCandleName('  Dawn  ')).toBe('Dawn');
    expect(normalizeCandleName('123456789012345')).toBe('123456789012');
    expect(matchingNamePreset('   ')).toBeNull();
    expect(matchingNamePreset('  dawn ')).toBe('Dawn');
    expect(matchingNamePreset('Wick')).toBeNull();
    expect(resolvedCandleName('  ember ')).toBe('Ember');
    expect(resolvedCandleName('  My Wick  ')).toBe('My Wick');
    expect(canAdvanceFromName('   ')).toBe(false);
    expect(canAdvanceFromName('A')).toBe(true);
    expect(nameSelectionLabel('   ')).toBe('Enter a name to continue');
    expect(nameSelectionLabel(' hearth ')).toBe('Selected: Hearth');
    expect(NAME_PRESETS).toContain('Solace');
  });

  it('saves the chosen theme, clamped goal, resolved name, and wake schedule', () => {
    expect(resolveThemeId(undefined)).toBe('obsidian_night');
    expect(resolveThemeId('')).toBe('obsidian_night');
    expect(resolveThemeId('not_a_theme')).toBe('obsidian_night');
    expect(resolveThemeId('deep_forest')).toBe('deep_forest');
    expect(eveningNudgeClock(23, 0)).toEqual({ hour: 21, minute: 30 });
    expect(eveningNudgeClock(0, 30)).toEqual({ hour: 23, minute: 0 });
    expect(eveningNudgeClock(Number.NaN, Number.NaN)).toEqual({ hour: 21, minute: 30 });

    expect(
      buildOnboardingSettings({
        themeId: 'not_a_theme' as 'obsidian_night',
        dailyStepGoal: 50,
        candleName: '  dawn ',
        wakeHour: Number.NaN,
        wakeMinute: 75,
        sleepHour: 30,
        sleepMinute: Number.NaN,
        healthSteps: 12,
      })
    ).toEqual({
      themeId: 'obsidian_night',
      dailyStepGoal: 2000,
      candleName: 'Dawn',
      wakeHour: 7,
      wakeMinute: 59,
      sleepHour: 23,
      sleepMinute: 0,
    });
  });

  it('leaves the first candle unlit until 5 steps, then keeps Health steps', () => {
    const unlit = morning();
    const manual = finishOnboardingSnapshot(unlit, DEFAULT_SETTINGS, now, null);
    expect(manual.state).toBe('UNLIT_MORNING');
    expect(manual.ignitedAt).toBeNull();

    const few = finishOnboardingSnapshot(unlit, DEFAULT_SETTINGS, now, 3.2);
    expect(few.state).toBe('UNLIT_MORNING');
    expect(few.stepsToday).toBe(3);
    expect(few.ignitedAt).toBeNull();

    const zero = finishOnboardingSnapshot(unlit, DEFAULT_SETTINGS, now, 0);
    expect(zero.state).toBe('UNLIT_MORNING');
    expect(zero.stepsToday).toBe(0);

    const none = finishOnboardingSnapshot(unlit, DEFAULT_SETTINGS, now, Number.NaN);
    expect(none.state).toBe('UNLIT_MORNING');

    const negative = finishOnboardingSnapshot(unlit, DEFAULT_SETTINGS, now, -2);
    expect(negative.state).toBe('UNLIT_MORNING');
    expect(negative.stepsToday).toBe(0);

    const walked = finishOnboardingSnapshot(unlit, DEFAULT_SETTINGS, now, 5);
    expect(walked.state).not.toBe('UNLIT_MORNING');
    expect(walked.stepsToday).toBe(5);
    expect(walked.ignitedAt).toBe(now.getTime());

    const alreadyLit = { ...unlit, state: 'BLAZING' as const, ignitedAt: now.getTime() };
    expect(finishOnboardingSnapshot(alreadyLit, DEFAULT_SETTINGS, now, null).state).toBe('BLAZING');

    const sleeping = { ...unlit, state: 'NIGHT_SLEEP' as const };
    const woken = finishOnboardingSnapshot(sleeping, DEFAULT_SETTINGS, now, 2);
    expect(woken.state).toBe('IGNITING');
    expect(woken.stepsToday).toBe(2);
  });

  it('asks for Health, then Motion, then notifications, and records each answer', async () => {
    let releaseHealth: (value: number) => void = () => {};
    const healthGate = new Promise<number>((resolve) => {
      releaseHealth = resolve;
    });
    const order: string[] = [];
    let motionCalled = false;
    const pending = runOnboardingPermissions(
      {
        health: () => healthGate,
        motion: async () => {
          motionCalled = true;
          return true;
        },
        notifications: async () => false,
      },
      (kind) => order.push(kind)
    );
    expect(motionCalled).toBe(false);
    releaseHealth(4.6);
    await expect(pending).resolves.toEqual({
      health: 'granted',
      motion: 'granted',
      notifications: 'denied',
      healthSteps: 5,
    });
    expect(motionCalled).toBe(true);
    expect(order).toEqual(['health', 'motion', 'notifications']);

    await expect(
      runOnboardingPermissions({
        health: async () => {
          throw new Error('health blocked');
        },
        motion: async () => false,
        notifications: async () => {
          throw new Error('notify blocked');
        },
      })
    ).resolves.toEqual({
      health: 'denied',
      motion: 'denied',
      notifications: 'denied',
      healthSteps: null,
    });

    const progress: string[] = [];
    await expect(
      runOnboardingPermissions(
        {
          health: async () => null,
          motion: async () => {
            throw new Error('motion blocked');
          },
          notifications: async () => true,
        },
        (kind) => progress.push(kind)
      )
    ).resolves.toEqual({
      health: 'unavailable',
      motion: 'denied',
      notifications: 'granted',
      healthSteps: null,
    });
    expect(progress).toEqual(['health', 'motion', 'notifications']);

    await expect(
      runOnboardingPermissions({
        health: async () => Number.NaN,
        motion: async () => true,
        notifications: async () => false,
      })
    ).resolves.toMatchObject({ health: 'unavailable', healthSteps: null });

    expect(permissionOutcomeLabel('health', 'granted', null)).toBe('Health · 0 steps today');
    expect(permissionOutcomeLabel('health', 'granted', 1200)).toBe('Health · 1,200 steps today');
    expect(permissionOutcomeLabel('health', 'denied', null)).toBe('Health · not allowed');
    expect(permissionOutcomeLabel('health', 'unavailable', null)).toBe('Health · unavailable');
    expect(permissionOutcomeLabel('motion', 'granted', null)).toBe('Motion · allowed');
    expect(permissionOutcomeLabel('motion', 'denied', null)).toBe('Motion · not allowed');
    expect(permissionOutcomeLabel('motion', 'unavailable', null)).toBe('Motion · not allowed');
    expect(permissionOutcomeLabel('notifications', 'granted', null)).toBe('Notifications · allowed');
    expect(permissionOutcomeLabel('notifications', 'denied', null)).toBe('Notifications · not allowed');
  });
});
