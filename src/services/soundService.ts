import { Audio } from 'expo-av';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MATCH_STRIKE_ASSET = require('../../assets/match-strike.wav');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RAIN_DROPS_ASSET = require('../../assets/rain-drops.wav');

let rainSound: Audio.Sound | null = null;
let rainPending = false;
let rainGeneration = 0;

async function releaseSound(sound: Audio.Sound): Promise<void> {
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } catch {
    // The player may already be gone.
  }
}

/**
 * Plays the tactile match-strike sound respecting the iPhone Silent switch
 * (`playsInSilentModeIOS: false`) and mixing cleanly with background audio.
 */
export async function playMatchStrikeSound(
  enabled: boolean,
  preserveRecordingSession = false
): Promise<boolean> {
  if (!enabled) {
    return false;
  }
  try {
    await Audio.setAudioModeAsync(
      preserveRecordingSession
        ? { playsInSilentModeIOS: true, allowsRecordingIOS: true }
        : { playsInSilentModeIOS: false, allowsRecordingIOS: false }
    );
    const { sound } = await Audio.Sound.createAsync(MATCH_STRIKE_ASSET, {
      shouldPlay: true,
      volume: 1.0,
    });
    sound.setOnPlaybackStatusUpdate((status) => {
      if ((status.isLoaded && status.didJustFinish) || (!status.isLoaded && status.error)) {
        void sound.unloadAsync().catch(() => {});
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function playRainNudge(
  enabled: boolean,
  preserveRecordingSession = false
): Promise<boolean> {
  if (!enabled) {
    await stopRainNudge();
    return false;
  }
  if (rainSound || rainPending) {
    return true;
  }
  const ticket = rainGeneration;
  rainPending = true;
  try {
    await Audio.setAudioModeAsync(
      preserveRecordingSession
        ? { playsInSilentModeIOS: true, allowsRecordingIOS: true }
        : { playsInSilentModeIOS: false, allowsRecordingIOS: false }
    );
    const { sound } = await Audio.Sound.createAsync(RAIN_DROPS_ASSET, {
      shouldPlay: true,
      isLooping: true,
      volume: 0.22,
    });
    if (ticket !== rainGeneration) {
      await releaseSound(sound);
      return false;
    }
    rainSound = sound;
    return true;
  } catch {
    return false;
  } finally {
    if (ticket === rainGeneration) {
      rainPending = false;
    }
  }
}

export async function stopRainNudge(): Promise<void> {
  rainGeneration += 1;
  rainPending = false;
  const current = rainSound;
  rainSound = null;
  if (!current) return;
  await releaseSound(current);
}
