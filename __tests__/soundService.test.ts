const mockSetAudioMode = jest.fn();
const mockCreateAsync = jest.fn();

jest.mock('../assets/match-strike.wav', () => 1, { virtual: true });
jest.mock('../assets/rain-drops.wav', () => 2, { virtual: true });

jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: (...args: unknown[]) => mockSetAudioMode(...args),
    Sound: {
      createAsync: (...args: unknown[]) => mockCreateAsync(...args),
    },
  },
}));

import { playMatchStrikeSound, playRainNudge, stopRainNudge } from '../src/services/soundService';

describe('soundService', () => {
  beforeEach(async () => {
    mockSetAudioMode.mockReset();
    mockCreateAsync.mockReset();
    await stopRainNudge();
  });

  it('skips playback when soundEffectsEnabled is false', async () => {
    expect(await playMatchStrikeSound(false)).toBe(false);
    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it('plays match-strike respecting Silent switch and unloads on finish', async () => {
    const mockUnload = jest.fn().mockResolvedValue(undefined);
    let statusCb: ((s: { isLoaded: boolean; didJustFinish?: boolean; error?: string }) => void) | null = null;
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
    expect(mockUnload).not.toHaveBeenCalled();
    statusCb!({ isLoaded: false, error: 'playback error' });
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

  it('loops a quiet rain only while the nudge is on', async () => {
    const sound = {
      stopAsync: jest.fn().mockResolvedValue(undefined),
      unloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    mockSetAudioMode.mockResolvedValue(undefined);
    mockCreateAsync.mockResolvedValue({ sound });

    expect(await playRainNudge(false)).toBe(false);
    expect(mockCreateAsync).not.toHaveBeenCalled();

    expect(await playRainNudge(true)).toBe(true);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      playsInSilentModeIOS: false,
      allowsRecordingIOS: false,
    });
    expect(mockCreateAsync).toHaveBeenCalledWith(2, {
      shouldPlay: true,
      isLooping: true,
      volume: 0.22,
    });
    expect(await playRainNudge(true)).toBe(true);
    expect(mockCreateAsync).toHaveBeenCalledTimes(1);

    expect(await playRainNudge(true, true)).toBe(true);
    expect(mockSetAudioMode).not.toHaveBeenCalledWith({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
    });

    sound.stopAsync.mockRejectedValueOnce(new Error('stop'));
    expect(await playRainNudge(false)).toBe(false);
    expect(sound.stopAsync).toHaveBeenCalled();
  });

  it('does not stack rain while a loop is starting, and drops a late start', async () => {
    let resolveCreate: (value: { sound: { stopAsync: jest.Mock; unloadAsync: jest.Mock } }) => void = () => {};
    const lateSound = {
      stopAsync: jest.fn().mockResolvedValue(undefined),
      unloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    mockSetAudioMode.mockResolvedValue(undefined);
    mockCreateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    const starting = playRainNudge(true);
    expect(await playRainNudge(true)).toBe(true);
    await stopRainNudge();
    resolveCreate({ sound: lateSound });
    expect(await starting).toBe(false);
    expect(lateSound.stopAsync).toHaveBeenCalled();
    expect(lateSound.unloadAsync).toHaveBeenCalled();

    lateSound.unloadAsync.mockRejectedValueOnce(new Error('unload'));
    const cancelled = playRainNudge(true);
    await stopRainNudge();
    resolveCreate({ sound: lateSound });
    expect(await cancelled).toBe(false);
  });

  it('returns false when the rain sound cannot start', async () => {
    mockSetAudioMode.mockRejectedValueOnce(new Error('audio err'));
    expect(await playRainNudge(true)).toBe(false);
    expect(await playRainNudge(true, true)).toBe(false);
  });
});
