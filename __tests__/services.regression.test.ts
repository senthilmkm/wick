jest.mock('@shopify/react-native-skia', () => ({
  ImageFormat: { PNG: 0 },
  matchFont: jest.fn(() => ({})),
  Skia: { Surface: { MakeOffscreen: jest.fn(() => null) }, Paint: jest.fn(), Color: jest.fn(), XYWHRect: jest.fn(), RRectXY: jest.fn() },
}));
jest.mock('react-native-share', () => ({ __esModule: true, default: { open: jest.fn() } }));
jest.mock('react-native', () => ({ Share: { share: jest.fn(), dismissedAction: 'dismissedAction' } }));

import { getThemeById, THEME_LIST } from '../src/constants/themes';
import { createMorningSnapshot } from '../src/engine/candleStateMachine';
import {
  AudioBlowDetector,
  BLOW_DECIBEL_THRESHOLD,
  BREEZE_MIN_DECIBEL,
  computeWindShakeIntensity,
} from '../src/services/audioBlowService';
import { CloudKitCircleService } from '../src/services/cloudKitService';
import { buildWaxLedgerPdfHtml, ExportService } from '../src/services/exportService';
import { MotionCoordinator } from '../src/services/motionService';
import { ShareCardService } from '../src/services/shareCardService';
import {
  DEFAULT_SETTINGS,
  KEY_SETTINGS,
  KEY_SNAPSHOT,
  KEY_WAX_LAYERS,
  LocalStorageService,
  WIDGET_RELOAD_DEBOUNCE_MS,
} from '../src/services/storageService';

function createMemoryStorage() {
  const kvMap = new Map<string, string>();
  const secureMap = new Map<string, string>();
  const widgetWrites: string[] = [];
  let widgetReloads = 0;

  const service = new LocalStorageService(
    {
      getString: (k) => kvMap.get(k),
      set: (k, v) => kvMap.set(k, v),
    },
    {
      getItemAsync: async (k) => secureMap.get(k) ?? null,
      setItemAsync: async (k, v) => {
        secureMap.set(k, v);
      },
    },
    {
      writeAppGroupSnapshot: (p) => widgetWrites.push(p),
      reloadAllTimelines: () => {
        widgetReloads += 1;
      },
    }
  );

  return { kvMap, secureMap, widgetWrites, getReloads: () => widgetReloads, service };
}

describe('themes, storage, motion, audio, export & CloudKit regression tests', () => {
  it('resolves all 6 curated background themes', () => {
    expect(THEME_LIST).toHaveLength(6);
    expect(getThemeById('obsidian_night').isPro).toBe(false);
    expect(getThemeById('plum_dusk').ambientGlow).toBe('#FF9E64');
  });

  it('handles storage defaults, corrupt JSON recovery, widget debouncing & Keychain persistence', async () => {
    const { kvMap, getReloads, service } = createMemoryStorage();
    expect(service.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(service.loadSnapshot()).toBeNull();
    expect(service.loadWaxLayers()).toEqual([]);

    // Corrupt JSON resilience
    kvMap.set(KEY_SETTINGS, '{bad-json');
    kvMap.set(KEY_SNAPSHOT, '{bad-json');
    kvMap.set(KEY_WAX_LAYERS, '{"not":"array"}');
    expect(service.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(service.loadSnapshot()).toBeNull();
    expect(service.loadWaxLayers()).toEqual([]);
    kvMap.set(KEY_WAX_LAYERS, '{bad-json');
    expect(service.loadWaxLayers()).toEqual([]);

    service.saveSettings({ ...DEFAULT_SETTINGS, dailyStepGoal: 10000 });
    expect(service.loadSettings().dailyStepGoal).toBe(10000);

    const snap = createMorningSnapshot('2026-11-18', 1000, 1, 0, 0);
    expect(service.saveSnapshot(snap, 1000)).toBe(true);
    expect(service.loadSnapshot()?.dateKey).toBe('2026-11-18');
    // Same state within 15 min does not trigger WidgetKit reload
    expect(service.saveSnapshot(snap, 2000)).toBe(false);
    // After 15 min triggers reload
    expect(service.saveSnapshot(snap, 1000 + WIDGET_RELOAD_DEBOUNCE_MS)).toBe(true);
    expect(getReloads()).toBe(2);

    // Wax layers deduplicate by date
    service.appendWaxLayer({
      id: 'w1',
      date: '2026-11-17',
      colorHex: '#FFB703',
      thicknessMm: 4,
      stepsAchieved: 9000,
      stepGoal: 8000,
      peakIntensity: 1,
    });
    const updatedLayers = service.appendWaxLayer({
      id: 'w1b',
      date: '2026-11-17',
      colorHex: '#FB8500',
      thicknessMm: 3.5,
      stepsAchieved: 8000,
      stepGoal: 8000,
      peakIntensity: 0.9,
    });
    expect(updatedLayers).toHaveLength(1);

    // Keychain first-install & secret persistence
    const t1 = await service.ensureFirstInstallRecorded(5000);
    const t2 = await service.ensureFirstInstallRecorded(9999);
    expect(t1).toBe(5000);
    expect(t2).toBe(5000);
    expect(await service.isStarterDomeClaimed()).toBe(false);
    await service.markStarterDomeClaimed();
    expect(await service.isStarterDomeClaimed()).toBe(true);

    const sec1 = await service.getOrCreateSparkSecret(() => 'sec-abc');
    const sec2 = await service.getOrCreateSparkSecret(() => 'sec-xyz');
    expect(sec1).toBe('sec-abc');
    expect(sec2).toBe('sec-abc');

    // Keychain weekly video export quota persistence (survives reinstall)
    const { secureMap } = createMemoryStorage();
    expect(await service.loadVideoExportQuota('2026-W47')).toEqual({ weekKey: '2026-W47', count: 0 });
    await service.saveVideoExportQuota('2026-W47', 1);
    expect(await service.loadVideoExportQuota('2026-W47')).toEqual({ weekKey: '2026-W47', count: 1 });
    // New week resets quota
    expect(await service.loadVideoExportQuota('2026-W48')).toEqual({ weekKey: '2026-W48', count: 0 });
    expect(secureMap.size).toBe(0);
  });

  it('recovers from corrupt Keychain video quota JSON', async () => {
    const { secureMap, service } = createMemoryStorage();
    secureMap.set('wick_weekly_video_quota', '{corrupt-json');
    expect(await service.loadVideoExportQuota('2026-W47')).toEqual({ weekKey: '2026-W47', count: 0 });
  });

  it('serializes concurrent HealthKit + CMPedometer updates without race conditions', async () => {
    const { service } = createMemoryStorage();
    let hkSteps = 500;
    const coordinator = new MotionCoordinator(service, {
      queryHealthKitStepsToday: async () => hkSteps,
      isSleepFocusActive: async () => false,
    });

    const morning = createMorningSnapshot('2026-11-18', 1000, 0, 0, 0);
    const now = new Date(2026, 10, 18, 10, 0);

    // Sync from HealthKit before any snapshot is saved uses fallback currentSnapshot
    const initialHk = await coordinator.syncFromHealthKit(morning, DEFAULT_SETTINGS, now);
    expect(initialHk.stepsToday).toBe(500);

    // Pedometer delta on a fresh storage instance (no saved snapshot) uses fallback
    const fresh = createMemoryStorage();
    const freshCoordinator = new MotionCoordinator(fresh.service, {
      queryHealthKitStepsToday: async () => 0,
      isSleepFocusActive: async () => false,
    });
    const initialPedometer = await freshCoordinator.applyForegroundPedometerDelta(
      morning,
      20,
      DEFAULT_SETTINGS,
      now
    );
    expect(initialPedometer.stepsToday).toBe(20);

    // Fire concurrent HealthKit + Pedometer updates
    const p1 = coordinator.syncFromHealthKit(morning, DEFAULT_SETTINGS, now);
    const p2 = coordinator.applyForegroundPedometerDelta(morning, 250, DEFAULT_SETTINGS, now);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.stepsToday).toBe(500);
    expect(r2.stepsToday).toBe(750);

    // Rollover via MotionCoordinator persists completed wax layer
    hkSteps = 8200;
    const nextDay = new Date(2026, 10, 19, 8, 0);
    await coordinator.syncFromHealthKit(r2, DEFAULT_SETTINGS, nextDay);
    expect(service.loadWaxLayers()).toHaveLength(1);

    const nextDayPedometer = await coordinator.applyForegroundPedometerDelta(
      r2,
      50,
      DEFAULT_SETTINGS,
      new Date(2026, 10, 20, 8, 0)
    );
    expect(nextDayPedometer.dateKey).toBe('2026-11-20');

    // Error recovery: HealthKit rejection does not poison the serial queue
    const faultyCoordinator = new MotionCoordinator(service, {
      queryHealthKitStepsToday: async () => {
        throw new Error('HealthKit unavailable');
      },
      isSleepFocusActive: async () => false,
    });
    await expect(
      faultyCoordinator.syncFromHealthKit(nextDayPedometer, DEFAULT_SETTINGS, nextDay)
    ).rejects.toThrow('HealthKit unavailable');
    const recovered = await faultyCoordinator.applyForegroundPedometerDelta(
      nextDayPedometer,
      10,
      DEFAULT_SETTINGS,
      nextDay
    );
    // A timestamp behind the candle day does not roll the date backward.
    expect(recovered.dateKey).toBe('2026-11-20');
  });

  it('detects sustained mic blow-out safely and respects permission denial', async () => {
    let micActive = false;
    let allowMic = false;
    const detector = new AudioBlowDetector({
      setAmbientMixMode: async () => {
        micActive = false;
      },
      activateMicSession: async () => {
        micActive = allowMic;
        return allowMic;
      },
      deactivateMicSession: async () => {
        micActive = false;
      },
    });

    expect(await detector.startBlowModal()).toBe(false);
    expect(detector.processMeteringSample(-5)).toBe(false);

    allowMic = true;
    expect(await detector.startBlowModal()).toBe(true);
    expect(micActive).toBe(true);
    expect(detector.processMeteringSample(Number.NaN)).toBe(false);
    expect(detector.processMeteringSample(BLOW_DECIBEL_THRESHOLD)).toBe(false);
    expect(detector.processMeteringSample(BLOW_DECIBEL_THRESHOLD + 2)).toBe(false);
    expect(detector.processMeteringSample(-30)).toBe(false); // reset streak
    expect(detector.processMeteringSample(-8)).toBe(false);
    expect(detector.processMeteringSample(-7)).toBe(false);
    expect(detector.processMeteringSample(-6)).toBe(true); // 3 consecutive hits
    await detector.stopBlowModal();
    expect(micActive).toBe(false);

    // Stopping while startBlowModal is awaiting activation aborts cleanly
    let resolveMic!: (v: boolean) => void;
    const racingDetector = new AudioBlowDetector({
      setAmbientMixMode: async () => {
        micActive = false;
      },
      activateMicSession: () =>
        new Promise<boolean>((r) => {
          resolveMic = r;
        }),
      deactivateMicSession: async () => {
        micActive = false;
      },
    });
    const pendingStart = racingDetector.startBlowModal();
    await racingDetector.stopBlowModal();
    resolveMic(true);
    expect(await pendingStart).toBe(false);

    // Non-numeric widget reload timestamp recovers without NaN poisoning
    const { service: s2, kvMap: kv2 } = createMemoryStorage();
    kv2.set('wick.widget.last_reload_at', 'corrupt');
    const snap = createMorningSnapshot('2026-11-19', 1000, 0, 0, 1);
    s2.saveSnapshot(snap, 2000);
    expect(kv2.get('wick.widget.last_reload_at')).toBe('2000');

    // Wind shake intensity mapping
    expect(computeWindShakeIntensity(Number.NaN)).toBe(0);
    expect(computeWindShakeIntensity(BREEZE_MIN_DECIBEL - 5)).toBe(0);
    expect(computeWindShakeIntensity(BLOW_DECIBEL_THRESHOLD + 2)).toBe(1);
    expect(computeWindShakeIntensity(-20)).toBeCloseTo(0.5, 4);
  });

  it('exports escaped HTML-to-PDF Wax Ledger and 3-sec MP4 Share Sheet', async () => {
    const shared: string[] = [];
    const exporter = new ExportService({
      printToPdfFile: async () => 'file:///tmp/ledger.pdf',
      renderCandleLoopMp4: async () => 'file:///tmp/wick.mp4',
      openNativeShareSheet: async (uri) => {
        shared.push(uri);
      },
    });

    const html = buildWaxLedgerPdfHtml(
      [
        {
          id: '1',
          date: '2026-11-18<script>',
          colorHex: '#FFB703',
          thicknessMm: 4.5,
          stepsAchieved: 9000,
          stepGoal: 8000,
          peakIntensity: 1,
          mood: 'Calm',
        },
        {
          id: '2',
          date: '2026-11-17',
          colorHex: '#FF9E2C',
          thicknessMm: 3.0,
          stepsAchieved: 7000,
          stepGoal: 8000,
          peakIntensity: 0.8,
        },
      ],
      14,
      '2026-11-18'
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Calm');
    expect(html).toContain('7,000 / 8,000');

    const htmlWithToday = buildWaxLedgerPdfHtml([], 1, '2026-11-20', {
      candleName: 'Senthil',
      waxGrams: 120,
      todaySteps: 4000,
      dailyStepGoal: 8000,
      todayMood: 'Grateful',
    });
    expect(htmlWithToday).toContain('Senthil — Wax Ledger Report');
    expect(htmlWithToday).toContain('2026-11-20 (Today)');
    expect(htmlWithToday).toContain('Grateful');
    expect(htmlWithToday).toContain('120 g');

    const htmlGoalMetToday = buildWaxLedgerPdfHtml([], 1, '2026-11-20', {
      todaySteps: 9000,
      dailyStepGoal: 8000,
    });
    expect(htmlGoalMetToday).toContain('9,000 / 8,000 (100%)');

    const snap = createMorningSnapshot('2026-11-18', 1000, 14, 0, 0);
    expect(await exporter.shareCandleVideo(snap)).toBe('file:///tmp/wick.mp4');
    expect(await exporter.shareWaxLedgerPdf([], 14, '2026-11-18')).toBe('file:///tmp/ledger.pdf');
    expect(shared).toHaveLength(2);
  });

  it('syncs CloudKit Shared DB friend candles with 15-min debounce and iCloud check', async () => {
    let signedIn = false;
    let upserts = 0;
    const ck = new CloudKitCircleService({
      isICloudSignedIn: async () => signedIn,
      upsertOwnCandleRecord: async () => {
        upserts += 1;
      },
      createFriendShareUrl: async () => 'https://icloud.com/share/wick-1',
      fetchSharedFriendCandles: async () => [
        { id: 'f1', displayName: 'Maya', state: 'BLAZING', flameIntensity: 0.9, streakDays: 10, updatedAt: 1000 },
      ],
    });

    const snap = createMorningSnapshot('2026-11-18', 1000, 5, 0, 0);
    expect(await ck.syncOwnCandleIfNeeded('Alex', snap, 1000)).toBe(false);
    expect(await ck.inviteFriendToLockScreen()).toBeNull();
    expect(await ck.refreshFriendCandles()).toEqual([]);

    signedIn = true;
    expect(await ck.syncOwnCandleIfNeeded('Alex', snap, 1000)).toBe(true);
    expect(await ck.syncOwnCandleIfNeeded('Alex', snap, 2000)).toBe(false);
    expect(await ck.syncOwnCandleIfNeeded('Alex', snap, 2500, true)).toBe(true);
    expect(await ck.syncOwnCandleIfNeeded('Alex', snap, 2500 + 15 * 60 * 1000)).toBe(true);
    expect(upserts).toBe(3);
    expect(await ck.inviteFriendToLockScreen()).toBe('https://icloud.com/share/wick-1');
    expect(await ck.refreshFriendCandles()).toHaveLength(1);
  });

  it('shares rendered PNG cards for daily Flame and weekly Ledger with text fallback', async () => {
    const openImageShare = jest.fn().mockResolvedValue('shared');
    const openTextShare = jest.fn().mockResolvedValue('shared');
    const cardService = new ShareCardService({
      renderDailyPngDataUri: () => 'data:image/png;base64,DAILY',
      renderWeeklyPngDataUri: () => null,
      openImageShare,
      openTextShare,
    });
    const theme = getThemeById('obsidian_night');

    expect(
      await cardService.shareDailyCard({
        candleName: 'Senthil',
        streakDays: 9,
        stepsToday: 8100,
        dailyStepGoal: 8000,
        state: 'BLAZING',
        flameIntensity: 1,
        flameColorHex: '#FFF6D6',
        waxGrams: 180,
        theme,
      })
    ).toBe('shared');
    expect(openImageShare).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'wick-today.png', dataUri: 'data:image/png;base64,DAILY' })
    );

    expect(
      await cardService.shareWeeklyCard({
        candleName: 'Senthil',
        recap: {
          dateRangeLabel: 'Nov 14 – Nov 20',
          totalSteps: 48000,
          daysLit: 7,
          topMood: 'Calm',
          bands: [{ dateKey: '2026-11-20', colorHex: '#FF9F43', lit: true, steps: 8100 }],
        },
        theme,
      })
    ).toBe('shared');
    expect(openTextShare).toHaveBeenCalledTimes(1);
  });
});
