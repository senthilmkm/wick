const mockSetAudioMode = jest.fn();
const mockCreateAsync = jest.fn();

jest.mock('../assets/match-strike.wav', () => 1, { virtual: true });

jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: (...args: unknown[]) => mockSetAudioMode(...args),
    Sound: {
      createAsync: (...args: unknown[]) => mockCreateAsync(...args),
    },
  },
}));

import { playMatchStrikeSound } from '../src/services/soundService';

describe('soundService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips playback when soundEffectsEnabled is false', async () => {
    expect(await playMatchStrikeSound(false)).toBe(false);
    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it('plays match-strike respecting Silent switch and unloads on finish', async () => {
    const mockUnload = jest.fn().mockResolvedValue(undefined);
    let statusCb: ((s: { isLoaded: boolean; didJustFinish?: boolean }) => void) | null = null;
    mockSetAudioMode.mockResolvedValue(undefined);
    mockCreateAsync.mockResolvedValueOnce({
      sound: {
        setOnPlaybackStatusUpdate: (cb: typeof statusCb) => {
          statusCb = cb;
        },
        unloadAsync: mockUnload,
      },
    });

    expect(await playMatchStrikeSound(true)).toBe(true);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      playsInSilentModeIOS: false,
      allowsRecordingIOS: false,
    });
    statusCb!({ isLoaded: true, didJustFinish: false });
    expect(mockUnload).not.toHaveBeenCalled();
    statusCb!({ isLoaded: false });
    expect(mockUnload).toHaveBeenCalledTimes(1);
    mockUnload.mockRejectedValueOnce(new Error('unload err'));
    statusCb!({ isLoaded: true, didJustFinish: true });
    expect(mockUnload).toHaveBeenCalledTimes(2);
  });

  it('preserves recording session and speaker routing when liveBreezeEnabled is active', async () => {
    const mockUnload = jest.fn().mockResolvedValue(undefined);
    mockSetAudioMode.mockResolvedValue(undefined);
    mockCreateAsync.mockResolvedValueOnce({
      sound: {
        setOnPlaybackStatusUpdate: jest.fn(),
        unloadAsync: mockUnload,
      },
    });

    expect(await playMatchStrikeSound(true, true)).toBe(true);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
    });
  });

  it('handles audio errors gracefully', async () => {
    mockSetAudioMode.mockRejectedValueOnce(new Error('audio err'));
    expect(await playMatchStrikeSound(true)).toBe(false);
  });
});
