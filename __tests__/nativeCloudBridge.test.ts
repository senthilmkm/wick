const mockRequireOptionalNativeModule = jest.fn();

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: (...args: unknown[]) => mockRequireOptionalNativeModule(...args),
}));

import {
  acceptNativeFriendShareUrl,
  createNativeCloudKitDriver,
  reloadNativeWidgets,
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
    expect(await driver.createFriendShareUrl()).toBe('');
    expect(await driver.fetchSharedFriendCandles()).toEqual([]);
    expect(await acceptNativeFriendShareUrl('https://www.icloud.com/share/abc')).toBe(false);

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
    expect(await driver.createFriendShareUrl()).toBe('https://www.icloud.com/share/abc');
    expect(await driver.fetchSharedFriendCandles()).toHaveLength(1);
    expect(await acceptNativeFriendShareUrl('https://www.icloud.com/share/abc')).toBe(true);
    expect(await acceptNativeFriendShareUrl('https://www.icloud.com/share/abc')).toBe(false);
  });
});
