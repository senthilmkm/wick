import { Audio } from 'expo-av';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MATCH_STRIKE_ASSET = require('../../assets/match-strike.wav');

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
      volume: 0.75,
    });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || status.didJustFinish) {
        void sound.unloadAsync().catch(() => {});
      }
    });
    return true;
  } catch {
    return false;
  }
}
