import {
  clamp,
  computeDayProgress,
  computeExpectedSteps,
  computeFlameIntensity,
  computePaceRatio,
  deriveWaxLayerSpec,
  getFlameColorHex,
  getLocalDateKey,
  getLocalWeekKey,
  smoothStep,
} from '../src/engine/candleMath';
import { CandleState } from '../src/types/wick';

describe('candleMath', () => {
  it('formats local date keys without UTC drift', () => {
    const d = new Date(2026, 10, 5, 23, 55, 0); // Nov 5, 2026 23:55 local
    expect(getLocalDateKey(d)).toBe('2026-11-05');
  });

  it('computes ISO week keys accurately including Sunday edge case', () => {
    const sunday = new Date(2026, 0, 4); // Jan 4, 2026 (Sunday) -> Week 1
    expect(getLocalWeekKey(sunday)).toBe('2026-W01');
    const midYear = new Date(2026, 10, 18);
    expect(getLocalWeekKey(midYear)).toMatch(/^2026-W\d{2}$/);
  });

  it('clamps numbers and handles NaN safely', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
  });

  it('computes smoothStep across [0, 1]', () => {
    expect(smoothStep(0)).toBe(0);
    expect(smoothStep(0.5)).toBe(0.5);
    expect(smoothStep(1)).toBe(1);
  });

  it('computes day progress for standard and overnight schedules', () => {
    // Standard 07:00 -> 23:00
    expect(computeDayProgress(new Date(2026, 10, 18, 6, 30), 7, 0, 23, 0)).toBe(0);
    expect(computeDayProgress(new Date(2026, 10, 18, 15, 0), 7, 0, 23, 0)).toBeCloseTo(0.5, 4);
    expect(computeDayProgress(new Date(2026, 10, 18, 23, 30), 7, 0, 23, 0)).toBe(1);

    // Overnight 07:00 -> 01:00
    expect(computeDayProgress(new Date(2026, 10, 18, 22, 0), 7, 0, 1, 0)).toBeGreaterThan(0.8);
    expect(computeDayProgress(new Date(2026, 10, 18, 0, 30), 7, 0, 1, 0)).toBeGreaterThan(0.9);
    expect(computeDayProgress(new Date(2026, 10, 18, 4, 0), 7, 0, 1, 0)).toBe(0);

    // Degenerate zero-duration window (wake == sleep)
    expect(computeDayProgress(new Date(2026, 10, 18, 12, 0), 7, 0, 7, 0)).toBe(1);
  });

  it('computes expected steps and pace ratio with safe floors', () => {
    expect(computeExpectedSteps(8000, 0)).toBe(50);
    expect(computeExpectedSteps(8000, 1)).toBe(8000);
    expect(computePaceRatio(8000, 4000, 8000)).toBe(1.2);
    expect(computePaceRatio(12000, 4000, 8000)).toBe(1.5);
    expect(computePaceRatio(2000, 4000, 8000)).toBe(0.5);
  });

  it('maps every CandleState to flame intensity and hex color', () => {
    const states: CandleState[] = [
      'UNLIT_MORNING',
      'IGNITING',
      'BLAZING',
      'STEADY',
      'FLICKERING',
      'DYING_EMBER',
      'SMOKING_GRACE',
      'NIGHT_SLEEP',
      'GLASS_DOME',
      'EXTINGUISHED',
    ];
    for (const s of states) {
      const intensity = computeFlameIntensity(s, 0.85);
      expect(intensity).toBeGreaterThanOrEqual(0);
      expect(intensity).toBeLessThanOrEqual(1);
      expect(getFlameColorHex(s)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('derives wax layer specs across all performance tiers', () => {
    expect(deriveWaxLayerSpec(9500, 8000).waxGramsEarned).toBe(120);
    expect(deriveWaxLayerSpec(7200, 8000).waxGramsEarned).toBe(100);
    expect(deriveWaxLayerSpec(5000, 8000).waxGramsEarned).toBe(70);
    expect(deriveWaxLayerSpec(2000, 8000).waxGramsEarned).toBe(35);
  });
});
