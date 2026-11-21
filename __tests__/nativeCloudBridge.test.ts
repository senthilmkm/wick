const mockRequireOptionalNativeModule = jest.fn();

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: (...args: unknown[]) => mockRequireOptionalNativeModule(...args),
}));

import {
  acceptNativeFriendShareUrl,
  acceptNativeShareUrlWithKind,
  checkNativePendingSparkRescues,
  completeNativeSparkShare,
  createNativeCloudKitDriver,
  createNativeSparkShareUrl,
  deleteNativeCompletedSparks,
  deleteNativeNudges,
  fetchNativeNudges,
  fetchNativeSharedPendingSparks,
  reloadNativeWidgets,
  sendNativeNudge,
  fetchNativeSleepFocus,
  fetchNativeTrialAnchor,
  markNativeTrialAnchorExpired,
  peekNativeShareUrlKind,
  publishNativeVisitorCandle,
  writeNativeFriendWidgetSnapshot,
  writeNativeWidgetSnapshot,
} from '../src/services/nativeCloudBridge';

describe('nativeCloudBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles missing or throwing native module gracefully', async () => {
    mockRequireOptionalNativeModule.mockReturnValue(null);
    writeNativeWidgetSnapshot('{}');
    reloadNativeWidgets();
    const driver = createNativeCloudKitDriver();
    expect(await driver.isICloudSignedIn()).toBe(false);
    await driver.upsertOwnCandleRecord({
      displayName: 'Alex',
      state: 'BLAZING',
      flameIntensity: 1,
      streakDays: 3,
      updatedAt: 1000,
    });
    expect(await driver.createFriendShareUrl({
      displayName: 'Alex',
      state: 'BLAZING',
      flameIntensity: 1,
      streakDays: 3,
    })).toBe('');
    expect(await driver.fetchSharedFriendCandles()).toEqual([]);
    expect(await acceptNativeFriendShareUrl('https://www.icloud.com/share/abc')).toBe(false);
    expect(await createNativeSparkShareUrl('s1', 'Alex', 500, 9999)).toBeNull();
    expect(await acceptNativeShareUrlWithKind('https://www.icloud.com/share/s1')).toEqual({
      accepted: false,
      kind: 'unknown',
    });
    expect(await completeNativeSparkShare('s1', 500)).toBe(false);
    expect(await checkNativePendingSparkRescues()).toEqual([]);
    expect(await deleteNativeCompletedSparks([])).toBe(false);
    expect(await deleteNativeCompletedSparks(['s1'])).toBe(false);
    expect(
      await sendNativeNudge({
        ownerName: 'owner',
        nudgeId: 'n1',
        fromName: 'Alex',
        message: 'walk',
        createdAt: 1,
      })
    ).toBe(false);
    expect(await fetchNativeNudges()).toEqual([]);
    expect(await fetchNativeSharedPendingSparks()).toEqual([]);
    expect(await deleteNativeNudges([])).toBe(false);
    expect(await deleteNativeNudges(['n1'])).toBe(false);
    expect(await peekNativeShareUrlKind('https://www.icloud.com/share/x')).toEqual({
      accepted: false,
      kind: 'unknown',
    });
    expect(await fetchNativeTrialAnchor()).toBeNull();
    await markNativeTrialAnchorExpired();
    expect(await fetchNativeSleepFocus()).toBe(false);
    expect(
      await publishNativeVisitorCandle({
        visitorId: 'maya',
        displayName: 'Maya',
        state: 'BLAZING',
        flameIntensity: 1,
        streakDays: 3,
        updatedAt: 10,
      })
    ).toBe(false);
    expect(
      await publishNativeVisitorCandle({
        visitorId: '   ',
        displayName: 'Maya',
        state: 'BLAZING',
        flameIntensity: 1,
        streakDays: 3,
        updatedAt: 10,
      })
    ).toBe(false);
    writeNativeFriendWidgetSnapshot('');

    mockRequireOptionalNativeModule.mockImplementation(() => {
      throw new Error('no native');
    });
    writeNativeWidgetSnapshot('{}');
    reloadNativeWidgets();
    expect(await driver.isICloudSignedIn()).toBe(false);
  });

  it('forwards calls to WickNative when available', async () => {
    const mod = {
      writeWidgetSnapshot: jest.fn(),
      reloadWidgets: jest.fn(),
      isICloudSignedIn: jest.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('err')),
      upsertOwnCandleRecord: jest.fn().mockResolvedValue(true),
      createFriendShareUrl: jest.fn().mockResolvedValue('https://www.icloud.com/share/abc'),
      acceptFriendShareUrl: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('accept err')),
      fetchSharedFriendCandles: jest.fn().mockResolvedValue([
        { id: 'f1', displayName: 'Maya', state: 'BLAZING', flameIntensity: 0.9, streakDays: 5, updatedAt: 100 },
      ]),
    };
    mockRequireOptionalNativeModule.mockReturnValue(mod);

    writeNativeWidgetSnapshot('{"state":"BLAZING"}');
    expect(mod.writeWidgetSnapshot).toHaveBeenCalledWith('{"state":"BLAZING"}');
    reloadNativeWidgets();
    expect(mod.reloadWidgets).toHaveBeenCalledTimes(1);

    const driver = createNativeCloudKitDriver();
    expect(await driver.isICloudSignedIn()).toBe(true);
    expect(await driver.isICloudSignedIn()).toBe(false);
    await driver.upsertOwnCandleRecord({
      displayName: 'Alex',
      state: 'BLAZING',
      flameIntensity: 1,
      streakDays: 3,
      updatedAt: 1000,
    });
    expect(mod.upsertOwnCandleRecord).toHaveBeenCalledWith('Alex', 'BLAZING', 1, 3, 1000);
    expect(await driver.createFriendShareUrl({
      displayName: 'Alex',
      state: 'BLAZING',
      flameIntensity: 1,
      streakDays: 3,
    })).toBe('https://www.icloud.com/share/abc');
    expect(mod.createFriendShareUrl).toHaveBeenCalledWith('Alex', 'BLAZING', 1, 3);
    expect(await driver.fetchSharedFriendCandles()).toHaveLength(1);
    expect(await acceptNativeFriendShareUrl('https://www.icloud.com/share/abc')).toBe(true);
    expect(await acceptNativeFriendShareUrl('https://www.icloud.com/share/abc')).toBe(false);
    expect(await createNativeSparkShareUrl('s1', 'Alex', 500, 9999)).toBeNull();
    mod.acceptFriendShareUrl.mockResolvedValueOnce(false);
    expect(await acceptNativeShareUrlWithKind('https://www.icloud.com/share/s1')).toEqual({
      accepted: false,
      kind: 'unknown',
    });
    expect(await completeNativeSparkShare('s1', 500)).toBe(false);
    expect(await checkNativePendingSparkRescues()).toEqual([]);

    // Fallback when acceptShareUrlWithKind is absent on older native builds
    mod.acceptFriendShareUrl.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await acceptNativeShareUrlWithKind('https://www.icloud.com/share/f1')).toEqual({
      accepted: true,
      kind: 'friend',
    });
    expect(await acceptNativeShareUrlWithKind('https://www.icloud.com/share/f2')).toEqual({
      accepted: false,
      kind: 'unknown',
    });

    const fullMod = {
      ...mod,
      createSparkShareRecord: jest
        .fn()
        .mockResolvedValueOnce('https://www.icloud.com/share/spark1')
        .mockResolvedValueOnce({ delivery: 'circle' })
        .mockResolvedValueOnce('')
        .mockRejectedValueOnce(new Error('ck spark err')),
      acceptShareUrlWithKind: jest
        .fn()
        .mockResolvedValueOnce({ accepted: true, kind: 'spark', sparkId: 's1', senderName: 'Alex' })
        .mockRejectedValueOnce(new Error('accept kind err')),
      completeSparkShareRecord: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('complete err')),
      checkPendingSparkRescues: jest
        .fn()
        .mockResolvedValueOnce([{ sparkId: 's1', stepsWalked: 512 }])
        .mockRejectedValueOnce(new Error('check err')),
    };
    mockRequireOptionalNativeModule.mockReturnValue(fullMod);

    expect(await createNativeSparkShareUrl('s1', 'Alex', 500, 9999)).toEqual({
      delivery: 'link',
      shareUrl: 'https://www.icloud.com/share/spark1',
    });
    expect(await createNativeSparkShareUrl('s1', 'Alex', 500, 9999)).toEqual({
      delivery: 'circle',
      shareUrl: null,
    });
    expect(await createNativeSparkShareUrl('s1', 'Alex', 500, 9999)).toBeNull();
    expect(await createNativeSparkShareUrl('s1', 'Alex', 500, 9999)).toBeNull();

    expect(await acceptNativeShareUrlWithKind('https://www.icloud.com/share/spark1')).toEqual({
      accepted: true,
      kind: 'spark',
      sparkId: 's1',
      senderName: 'Alex',
    });
    expect(await acceptNativeShareUrlWithKind('https://www.icloud.com/share/spark1')).toEqual({
      accepted: false,
      kind: 'unknown',
    });

    expect(await completeNativeSparkShare('s1', 500)).toBe(true);
    expect(await completeNativeSparkShare('s1', 500)).toBe(false);

    expect(await checkNativePendingSparkRescues()).toEqual([{ sparkId: 's1', stepsWalked: 512 }]);
    expect(await checkNativePendingSparkRescues()).toEqual([]);

    const nudgeMod = {
      ...fullMod,
      deleteCompletedSparkRecords: jest.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('del')),
      sendNudge: jest.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('nudge')),
      fetchNudges: jest
        .fn()
        .mockResolvedValueOnce([{ nudgeId: 'n1', fromName: 'Maya', message: 'Walk', createdAt: 5 }])
        .mockRejectedValueOnce(new Error('fetch')),
      writeFriendWidgetSnapshot: jest.fn(),
      fetchSharedPendingSparks: jest
        .fn()
        .mockResolvedValueOnce([
          { sparkId: 's2', senderName: 'Maya', stepsRequired: 500, expiresAt: 9 },
          { sparkId: '', senderName: 'Skip', stepsRequired: 500, expiresAt: 9 },
        ])
        .mockResolvedValueOnce('nope')
        .mockRejectedValueOnce(new Error('pending')),
      deleteNudgeRecords: jest.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('nudge del')),
      publishVisitorCandle: jest.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('visitor')),
    };
    mockRequireOptionalNativeModule.mockReturnValue(nudgeMod);
    expect(await deleteNativeCompletedSparks(['s1'])).toBe(true);
    expect(await deleteNativeCompletedSparks(['s1'])).toBe(false);
    expect(await sendNativeNudge({
      ownerName: 'abc',
      nudgeId: 'n1',
      fromName: 'Alex',
      message: 'Walk',
      createdAt: 5,
    })).toBe(true);
    expect(await sendNativeNudge({
      ownerName: 'abc',
      nudgeId: 'n1',
      fromName: 'Alex',
      message: 'Walk',
      createdAt: 5,
    })).toBe(false);
    expect(await fetchNativeNudges()).toEqual([
      { nudgeId: 'n1', fromName: 'Maya', message: 'Walk', createdAt: 5 },
    ]);
    expect(await fetchNativeNudges()).toEqual([]);
    nudgeMod.fetchNudges.mockResolvedValueOnce({ nudgeId: 'not-a-list' });
    expect(await fetchNativeNudges()).toEqual([]);
    writeNativeFriendWidgetSnapshot('{"displayName":"Maya"}');
    expect(nudgeMod.writeFriendWidgetSnapshot).toHaveBeenCalledWith('{"displayName":"Maya"}');
    expect(await fetchNativeSharedPendingSparks()).toEqual([
      { sparkId: 's2', senderName: 'Maya', stepsRequired: 500, expiresAt: 9 },
    ]);
    expect(await fetchNativeSharedPendingSparks()).toEqual([]);
    expect(await fetchNativeSharedPendingSparks()).toEqual([]);
    expect(await deleteNativeNudges(['n1'])).toBe(true);
    expect(await deleteNativeNudges(['n1'])).toBe(false);
    expect(
      await publishNativeVisitorCandle({
        visitorId: 'maya',
        displayName: 'Maya',
        state: 'BLAZING',
        flameIntensity: 1,
        streakDays: 4,
        updatedAt: 20,
      })
    ).toBe(true);
    expect(nudgeMod.publishVisitorCandle).toHaveBeenCalledWith('maya', 'Maya', 'BLAZING', 1, 4, 20);
    expect(
      await publishNativeVisitorCandle({
        visitorId: 'maya',
        displayName: 'Maya',
        state: 'BLAZING',
        flameIntensity: 1,
        streakDays: 4,
        updatedAt: 20,
      })
    ).toBe(false);
  });

  it('reads the trial anchor, share kind, and Sleep Focus, and ignores native failures', async () => {
    const mod = {
      peekShareUrlKind: jest
        .fn()
        .mockResolvedValueOnce({ accepted: true, kind: 'friend' })
        .mockRejectedValueOnce(new Error('peek')),
      fetchOrCreateTrialAnchor: jest
        .fn()
        .mockResolvedValueOnce({ createdAtMs: 50, serverNowMs: 80, expired: false })
        .mockResolvedValueOnce({ createdAtMs: 50, serverNowMs: 0, expired: 1 })
        .mockResolvedValueOnce({ createdAtMs: 0, serverNowMs: 80 })
        .mockRejectedValueOnce(new Error('anchor')),
      markTrialAnchorExpired: jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('mark')),
      isSleepFocusActive: jest.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('focus')),
    };
    mockRequireOptionalNativeModule.mockReturnValue(mod);

    expect(await peekNativeShareUrlKind('https://www.icloud.com/share/friend')).toEqual({
      accepted: true,
      kind: 'friend',
    });
    expect(await peekNativeShareUrlKind('https://www.icloud.com/share/friend')).toEqual({
      accepted: false,
      kind: 'unknown',
    });
    expect(await fetchNativeTrialAnchor()).toEqual({
      createdAtMs: 50,
      serverNowMs: 80,
      expired: false,
    });
    expect(await fetchNativeTrialAnchor()).toEqual({
      createdAtMs: 50,
      serverNowMs: 50,
      expired: true,
    });
    expect(await fetchNativeTrialAnchor()).toBeNull();
    expect(await fetchNativeTrialAnchor()).toBeNull();
    await markNativeTrialAnchorExpired();
    await markNativeTrialAnchorExpired();
    expect(mod.markTrialAnchorExpired).toHaveBeenCalledTimes(2);
    expect(await fetchNativeSleepFocus()).toBe(true);
    expect(await fetchNativeSleepFocus()).toBe(false);
  });
});
