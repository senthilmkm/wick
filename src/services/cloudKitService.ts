import { CandleSnapshot, FriendCandle } from '../types/wick';

export interface CloudKitDriver {
  isICloudSignedIn(): Promise<boolean>;
  upsertOwnCandleRecord(payload: {
    displayName: string;
    state: string;
    flameIntensity: number;
    streakDays: number;
    updatedAt: number;
  }): Promise<void>;
  createFriendShareUrl(): Promise<string>;
  fetchSharedFriendCandles(): Promise<FriendCandle[]>;
}

export class CloudKitCircleService {
  private lastPublishedState: string | null = null;
  private lastPublishedAt = 0;

  constructor(private readonly driver: CloudKitDriver) {}

  /**
   * Publishes only minimal candle status (never raw steps) when state bucket
   * changes or 15+ minutes have elapsed.
   */
  async syncOwnCandleIfNeeded(
    displayName: string,
    snapshot: CandleSnapshot,
    nowMs: number,
    force = false
  ): Promise<boolean> {
    const signedIn = await this.driver.isICloudSignedIn();
    if (!signedIn) {
      return false;
    }

    const stateChanged = this.lastPublishedState !== snapshot.state;
    const fifteenMinutesElapsed = nowMs - this.lastPublishedAt >= 15 * 60 * 1000;
    if (!force && !stateChanged && !fifteenMinutesElapsed) {
      return false;
    }

    await this.driver.upsertOwnCandleRecord({
      displayName,
      state: snapshot.state,
      flameIntensity: snapshot.flameIntensity,
      streakDays: snapshot.streakDays,
      updatedAt: nowMs,
    });

    this.lastPublishedState = snapshot.state;
    this.lastPublishedAt = nowMs;
    return true;
  }

  async inviteFriendToLockScreen(): Promise<string | null> {
    const signedIn = await this.driver.isICloudSignedIn();
    if (!signedIn) {
      return null;
    }
    return this.driver.createFriendShareUrl();
  }

  async refreshFriendCandles(): Promise<FriendCandle[]> {
    const signedIn = await this.driver.isICloudSignedIn();
    if (!signedIn) {
      return [];
    }
    return this.driver.fetchSharedFriendCandles();
  }
}
