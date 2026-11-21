const mockMakeOffscreen = jest.fn();
const mockEncodeToBase64 = jest.fn();
const mockRNShareOpen = jest.fn();
const mockRNShareText = jest.fn();
const drawnTexts: string[] = [];

jest.mock('@shopify/react-native-skia', () => ({
  ImageFormat: { PNG: 0 },
  matchFont: jest.fn(() => ({ id: 'mock-font' })),
  Skia: {
    Surface: {
      MakeOffscreen: (...args: unknown[]) => mockMakeOffscreen(...args),
    },
    Paint: jest.fn(() => ({
      setColor: jest.fn(),
      setAntiAlias: jest.fn(),
      setStyle: jest.fn(),
      setStrokeWidth: jest.fn(),
      setAlphaf: jest.fn(),
    })),
    Color: jest.fn((c: string) => c),
    XYWHRect: jest.fn((x: number, y: number, w: number, h: number) => ({ x, y, w, h })),
    RRectXY: jest.fn((rect: unknown, rx: number, ry: number) => ({ rect, rx, ry })),
  },
}));

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {
    open: (...args: unknown[]) => mockRNShareOpen(...args),
  },
}));

jest.mock('react-native', () => ({
  Share: {
    share: (...args: unknown[]) => mockRNShareText(...args),
    dismissedAction: 'dismissedAction',
    sharedAction: 'sharedAction',
  },
}));

import { getThemeById } from '../src/constants/themes';
import { WeeklyRecapSummary } from '../src/engine/candleMath';
import {
  createDefaultShareCardDriver,
  DAILY_SHARE_BUTTON_TITLE,
  formatCardDate,
  formatDailyShareMessage,
  formatWeeklyShareMessage,
  FREE_CARD_USED_TITLE,
  renderDailyCardDataUri,
  renderWeeklyCardDataUri,
  SHARE_CARD_GUIDE_BODY,
  SHARE_WEEK_CARD_BUTTON_TITLE,
  ShareCardService,
  WEEK_CARD_BUTTON_TITLE,
} from '../src/services/shareCardService';

function makeMockSurface(base64 = 'AQID') {
  mockEncodeToBase64.mockReturnValue(base64);
  return {
    getCanvas: jest.fn(() => ({
      drawRect: jest.fn(),
      drawRRect: jest.fn(),
      drawCircle: jest.fn(),
      drawOval: jest.fn(),
      drawText: jest.fn((text: string) => {
        drawnTexts.push(String(text));
      }),
    })),
    flush: jest.fn(),
    makeImageSnapshot: jest.fn(() => ({
      encodeToBase64: mockEncodeToBase64,
    })),
  };
}

describe('shareCardService', () => {
  const theme = getThemeById('obsidian_night');
  const baseRecap: WeeklyRecapSummary = {
    dateRangeLabel: 'Nov 14 – Nov 20',
    totalSteps: 42500,
    daysLit: 6,
    topMood: 'Calm',
    bands: [
      { dateKey: '2026-11-14', colorHex: '#FF9F43', lit: true, steps: 4200 },
      { dateKey: '2026-11-15', colorHex: '#27272A', lit: false, steps: 0 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    drawnTexts.length = 0;
  });

  it('formats daily and weekly messages with and without candleName / topMood', () => {
    expect(
      formatDailyShareMessage({
        candleName: 'Senthil',
        streakDays: 5,
        stepsToday: 6400,
        dailyStepGoal: 8000,
        state: 'SMOKING_GRACE',
        flameIntensity: 0.2,
        flameColorHex: '#FF9F43',
        waxGrams: 120,
        theme,
      })
    ).toContain('Senthil • Day 5 • My wick is smoking grace');

    expect(
      formatDailyShareMessage({
        streakDays: 1,
        stepsToday: 0,
        dailyStepGoal: 8000,
        state: 'UNLIT_MORNING',
        flameIntensity: 0,
        flameColorHex: '#A1A1AA',
        waxGrams: 100,
        theme,
      })
    ).toContain('Day 1 • My wick is unlit morning');

    expect(
      formatDailyShareMessage({
        candleName: 'Senthil',
        streakDays: 5,
        stepsToday: 6400,
        dailyStepGoal: 8000,
        state: 'SMOKING_GRACE',
        flameIntensity: 0.2,
        flameColorHex: '#FF9F43',
        waxGrams: 120,
        theme,
        dateKey: '2026-11-20',
        mood: 'Calm',
      })
    ).toContain('Senthil • Nov 20, 2026 • Day 5 • My wick is smoking grace (6,400 / 8,000 steps today) • Mood: Calm');
    expect(formatCardDate('2026-11-20')).toBe('Nov 20, 2026');
    expect(formatCardDate('not-a-date')).toBe('not-a-date');
    expect(formatCardDate('2026-13-01')).toBe('2026-13-01');
    expect(DAILY_SHARE_BUTTON_TITLE).toBe('Share Card');
    expect(WEEK_CARD_BUTTON_TITLE).toBe('Week Card');
    expect(SHARE_WEEK_CARD_BUTTON_TITLE).toBe('Share Week Card');
    expect(FREE_CARD_USED_TITLE).toBe('Your Free Card Is Used');
    expect(SHARE_CARD_GUIDE_BODY).toContain('PNG card');
    expect(SHARE_CARD_GUIDE_BODY).toContain('One is free per week');

    expect(
      formatWeeklyShareMessage({
        candleName: 'Maya',
        recap: baseRecap,
        theme,
      })
    ).toContain('MAYA (Nov 14 – Nov 20): 42,500 steps • 6/7 days lit • Top mood: Calm');

    expect(
      formatWeeklyShareMessage({
        recap: { ...baseRecap, topMood: null },
        theme,
      })
    ).toContain('WICK (Nov 14 – Nov 20): 42,500 steps • 6/7 days lit — Keep your wick lit!');
  });

  it('renders daily and weekly Skia PNG data URIs and handles missing/failing surface', () => {
    mockMakeOffscreen.mockReturnValue(null);
    expect(
      renderDailyCardDataUri({
        streakDays: 3,
        stepsToday: 5000,
        dailyStepGoal: 8000,
        state: 'BLAZING',
        flameIntensity: 0.9,
        flameColorHex: '#FFF6D6',
        waxGrams: 110,
        theme,
      })
    ).toBeNull();
    expect(renderWeeklyCardDataUri({ recap: baseRecap, theme })).toBeNull();

    // Lit daily card + weekly with mood
    mockMakeOffscreen.mockReturnValue(makeMockSurface('DAILY_B64'));
    expect(
      renderDailyCardDataUri({
        candleName: 'Senthil',
        streakDays: 7,
        stepsToday: 9000,
        dailyStepGoal: 8000,
        state: 'BLAZING',
        flameIntensity: 1,
        flameColorHex: '#FFF6D6',
        waxGrams: 200,
        theme,
        dateKey: '2026-11-20',
        mood: 'Grateful',
      })
    ).toBe('data:image/png;base64,DAILY_B64');
    expect(
      renderDailyCardDataUri({
        streakDays: 2,
        stepsToday: 1000,
        dailyStepGoal: 8000,
        state: 'STEADY',
        flameIntensity: 0.7,
        flameColorHex: '#FF9E2C',
        waxGrams: 40,
        theme,
        dateKey: '2026-11-19',
      })
    ).toBe('data:image/png;base64,DAILY_B64');
    expect(drawnTexts).toEqual(
      expect.arrayContaining(['Nov 20, 2026  •  Mood  Grateful', 'DAY 7 STREAK'])
    );

    // Unlit daily card + empty base64
    mockMakeOffscreen.mockReturnValue(makeMockSurface(''));
    expect(
      renderDailyCardDataUri({
        streakDays: 1,
        stepsToday: 0,
        dailyStepGoal: 8000,
        state: 'EXTINGUISHED',
        flameIntensity: 0,
        flameColorHex: '#71717A',
        waxGrams: 90,
        theme,
      })
    ).toBeNull();

    // Weekly card with and without mood + empty base64 + exception branch
    mockMakeOffscreen.mockReturnValue(makeMockSurface('WEEK_B64'));
    drawnTexts.length = 0;
    expect(
      renderWeeklyCardDataUri({
        candleName: 'Maya',
        recap: baseRecap,
        theme,
      })
    ).toBe('data:image/png;base64,WEEK_B64');
    expect(drawnTexts).toEqual(
      expect.arrayContaining([
        '2026-11-14   •   Lit   •   4,200 steps',
        '2026-11-15   •   Unlit   •   0 steps',
      ])
    );

    expect(
      renderWeeklyCardDataUri({
        recap: { ...baseRecap, topMood: null },
        theme,
      })
    ).toBe('data:image/png;base64,WEEK_B64');

    mockMakeOffscreen.mockReturnValue(makeMockSurface(''));
    expect(renderWeeklyCardDataUri({ recap: baseRecap, theme })).toBeNull();

    mockMakeOffscreen.mockImplementation(() => {
      throw new Error('skia unavailable');
    });
    expect(
      renderDailyCardDataUri({
        streakDays: 1,
        stepsToday: 0,
        dailyStepGoal: 8000,
        state: 'BLAZING',
        flameIntensity: 0.9,
        flameColorHex: '#FFF6D6',
        waxGrams: 100,
        theme,
      })
    ).toBeNull();
    expect(renderWeeklyCardDataUri({ recap: baseRecap, theme })).toBeNull();
  });

  it('exercises default driver image share, cancel handling, and text share', async () => {
    const driver = createDefaultShareCardDriver();

    mockRNShareOpen.mockResolvedValueOnce({ success: true, dismissedAction: false });
    expect(
      await driver.openImageShare({
        title: 't',
        message: 'm',
        dataUri: 'data:image/png;base64,AA==',
        filename: 'wick.png',
      })
    ).toBe('shared');

    mockRNShareOpen.mockResolvedValueOnce({ success: false, dismissedAction: true });
    expect(
      await driver.openImageShare({
        title: 't',
        message: 'm',
        dataUri: 'data:image/png;base64,AA==',
        filename: 'wick.png',
      })
    ).toBe('dismissed');

    mockRNShareOpen.mockRejectedValueOnce(new Error('User did not share'));
    expect(
      await driver.openImageShare({
        title: 't',
        message: 'm',
        dataUri: 'data:image/png;base64,AA==',
        filename: 'wick.png',
      })
    ).toBe('dismissed');

    mockRNShareOpen.mockRejectedValueOnce('User cancelled');
    expect(
      await driver.openImageShare({
        title: 't',
        message: 'm',
        dataUri: 'data:image/png;base64,AA==',
        filename: 'wick.png',
      })
    ).toBe('dismissed');

    mockRNShareOpen.mockRejectedValueOnce(new Error('sheet crash'));
    await expect(
      driver.openImageShare({
        title: 't',
        message: 'm',
        dataUri: 'data:image/png;base64,AA==',
        filename: 'wick.png',
      })
    ).rejects.toThrow('sheet crash');

    mockRNShareText.mockResolvedValueOnce({ action: 'sharedAction' });
    expect(await driver.openTextShare('t', 'm')).toBe('shared');

    mockRNShareText.mockResolvedValueOnce({ action: 'dismissedAction' });
    expect(await driver.openTextShare('t', 'm')).toBe('dismissed');
  });

  it('ShareCardService falls back cleanly to text share if image render or image sheet fails', async () => {
    const openImageShare = jest.fn();
    const openTextShare = jest.fn().mockResolvedValue('shared');
    const renderDailyPngDataUri = jest.fn();
    const renderWeeklyPngDataUri = jest.fn();

    const svc = new ShareCardService({
      renderDailyPngDataUri,
      renderWeeklyPngDataUri,
      openImageShare,
      openTextShare,
    });

    // Daily: image succeeds
    renderDailyPngDataUri.mockReturnValueOnce('data:image/png;base64,OK');
    openImageShare.mockResolvedValueOnce('shared');
    expect(
      await svc.shareDailyCard({
        candleName: 'Senthil',
        streakDays: 4,
        stepsToday: 7000,
        dailyStepGoal: 8000,
        state: 'BLAZING',
        flameIntensity: 0.9,
        flameColorHex: '#FFF6D6',
        waxGrams: 130,
        theme,
      })
    ).toBe('shared');

    // Daily: image sheet throws -> fallback to text
    renderDailyPngDataUri.mockReturnValueOnce('data:image/png;base64,OK');
    openImageShare.mockRejectedValueOnce(new Error('sheet failed'));
    expect(
      await svc.shareDailyCard({
        streakDays: 4,
        stepsToday: 7000,
        dailyStepGoal: 8000,
        state: 'BLAZING',
        flameIntensity: 0.9,
        flameColorHex: '#FFF6D6',
        waxGrams: 130,
        theme,
      })
    ).toBe('shared');
    expect(openTextShare).toHaveBeenCalledTimes(1);

    // Weekly: null dataUri -> fallback to text
    renderWeeklyPngDataUri.mockReturnValueOnce(null);
    expect(await svc.shareWeeklyCard({ recap: baseRecap, theme })).toBe('shared');
    expect(openTextShare).toHaveBeenCalledTimes(2);

    // Weekly: image sheet throws -> fallback to text, and image succeeds
    renderWeeklyPngDataUri.mockReturnValueOnce('data:image/png;base64,WK');
    openImageShare.mockRejectedValueOnce(new Error('sheet failed'));
    expect(await svc.shareWeeklyCard({ candleName: 'Maya', recap: baseRecap, theme })).toBe('shared');

    renderWeeklyPngDataUri.mockReturnValueOnce('data:image/png;base64,WK');
    openImageShare.mockResolvedValueOnce('dismissed');
    expect(await svc.shareWeeklyCard({ candleName: 'Maya', recap: baseRecap, theme })).toBe('dismissed');
  });
});
