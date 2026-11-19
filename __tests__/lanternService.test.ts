const mockGetBrightnessAsync = jest.fn();
const mockSetBrightnessAsync = jest.fn();

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: (...args: unknown[]) => mockGetBrightnessAsync(...args),
  setBrightnessAsync: (...args: unknown[]) => mockSetBrightnessAsync(...args),
}));

import {
  enableLanternBrightness,
  restoreLanternBrightness,
} from '../src/services/lanternService';

describe('lanternService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves previous brightness, sets 1.0, and restores cleanly', async () => {
    mockGetBrightnessAsync.mockResolvedValueOnce(0.45);
    mockSetBrightnessAsync.mockResolvedValue(undefined);
    const prev = await enableLanternBrightness();
    expect(prev).toBe(0.45);
    expect(mockSetBrightnessAsync).toHaveBeenCalledWith(1.0);

    await restoreLanternBrightness(prev);
    expect(mockSetBrightnessAsync).toHaveBeenLastCalledWith(0.45);

    // Null previous is a no-op
    await restoreLanternBrightness(null);
    expect(mockSetBrightnessAsync).toHaveBeenCalledTimes(2);
  });

  it('handles brightness API errors gracefully', async () => {
    mockGetBrightnessAsync.mockRejectedValueOnce(new Error('unavailable'));
    expect(await enableLanternBrightness()).toBeNull();

    mockSetBrightnessAsync.mockRejectedValueOnce(new Error('restore fail'));
    await restoreLanternBrightness(0.5);
  });
});
