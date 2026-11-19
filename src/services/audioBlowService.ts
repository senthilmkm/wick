export interface AudioSessionDriver {
  setAmbientMixMode(): Promise<void>;
  activateMicSession(): Promise<boolean>;
  deactivateMicSession(): Promise<void>;
}

export const BLOW_DECIBEL_THRESHOLD = -12; // dBFS sustained wind burst
export const BREEZE_MIN_DECIBEL = -28; // dBFS gentle breath/air flow
export const BLOW_REQUIRED_CONSECUTIVE_FRAMES = 3;

/**
 * Maps a microphone dBFS sample to a normalized [0, 1] breeze shake intensity.
 */
export function computeWindShakeIntensity(meteringDb: number): number {
  if (Number.isNaN(meteringDb) || meteringDb <= BREEZE_MIN_DECIBEL) {
    return 0;
  }
  if (meteringDb >= BLOW_DECIBEL_THRESHOLD) {
    return 1;
  }
  return (meteringDb - BREEZE_MIN_DECIBEL) / (BLOW_DECIBEL_THRESHOLD - BREEZE_MIN_DECIBEL);
}

export class AudioBlowDetector {
  private consecutiveHits = 0;
  private isListening = false;
  private sessionEpoch = 0;

  constructor(private readonly driver: AudioSessionDriver) {}

  async startBlowModal(): Promise<boolean> {
    const startEpoch = ++this.sessionEpoch;
    const granted = await this.driver.activateMicSession();
    if (!granted || startEpoch !== this.sessionEpoch) {
      if (granted) {
        await this.driver.deactivateMicSession();
      }
      await this.driver.setAmbientMixMode();
      this.isListening = false;
      this.consecutiveHits = 0;
      return false;
    }
    this.isListening = true;
    this.consecutiveHits = 0;
    return true;
  }

  /**
   * Feeds a microphone metering sample (dBFS in [-160, 0]).
   * Returns true once sustained wind-burst frames exceed threshold.
   */
  processMeteringSample(meteringDb: number): boolean {
    if (!this.isListening || Number.isNaN(meteringDb)) {
      return false;
    }
    if (meteringDb >= BLOW_DECIBEL_THRESHOLD) {
      this.consecutiveHits += 1;
      if (this.consecutiveHits >= BLOW_REQUIRED_CONSECUTIVE_FRAMES) {
        return true;
      }
    } else {
      this.consecutiveHits = 0;
    }
    return false;
  }

  async stopBlowModal(): Promise<void> {
    this.sessionEpoch += 1;
    this.isListening = false;
    this.consecutiveHits = 0;
    try {
      await this.driver.deactivateMicSession();
    } finally {
      await this.driver.setAmbientMixMode();
    }
  }
}
