export interface AudioSessionDriver {
  setAmbientMixMode(): Promise<void>;
  activateMicSession(): Promise<boolean>;
  deactivateMicSession(): Promise<void>;
}

export const BLOW_DECIBEL_THRESHOLD = -12; // dBFS sustained wind burst
export const BLOW_REQUIRED_CONSECUTIVE_FRAMES = 3;

export class AudioBlowDetector {
  private consecutiveHits = 0;
  private isListening = false;

  constructor(private readonly driver: AudioSessionDriver) {}

  async startBlowModal(): Promise<boolean> {
    const granted = await this.driver.activateMicSession();
    if (!granted) {
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
    this.isListening = false;
    this.consecutiveHits = 0;
    await this.driver.deactivateMicSession();
    await this.driver.setAmbientMixMode();
  }
}
