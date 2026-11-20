import { requireOptionalNativeModule } from 'expo-modules-core';
import { FriendCandle } from '../types/wick';
import { CloudKitDriver } from './cloudKitService';

export interface SparkShareAcceptanceResult {
  accepted: boolean;
  kind: 'friend' | 'spark' | 'unknown';
  sparkId?: string;
  senderName?: string;
  stepsRequired?: number;
  expiresAt?: number;
}

export interface WickNativeSpec {
  writeWidgetSnapshot(jsonPayload: string): void;
  reloadWidgets(): void;
  isICloudSignedIn(): Promise<boolean>;
  upsertOwnCandleRecord(
    displayName: string,
    state: string,
    flameIntensity: number,
    streakDays: number,
    updatedAt: number
  ): Promise<boolean>;
  createFriendShareUrl(): Promise<string>;
  acceptFriendShareUrl(shareUrl: string): Promise<boolean>;
  fetchSharedFriendCandles(): Promise<FriendCandle[]>;
  createSparkShareRecord?(
    sparkId: string,
    senderName: string,
    stepsRequired: number,
    expiresAt: number
  ): Promise<string>;
  acceptShareUrlWithKind?(shareUrl: string): Promise<SparkShareAcceptanceResult>;
  completeSparkShareRecord?(sparkId: string, stepsWalked: number): Promise<boolean>;
  checkPendingSparkRescues?(): Promise<string[]>;
}

function getNativeModule(): WickNativeSpec | null {
  try {
    return requireOptionalNativeModule<WickNativeSpec>('WickNative');
  } catch {
    return null;
  }
}

export function writeNativeWidgetSnapshot(jsonPayload: string): void {
  try {
    getNativeModule()?.writeWidgetSnapshot(jsonPayload);
  } catch {
    // Graceful no-op in Jest/web/unlinked builds
  }
}

export function reloadNativeWidgets(): void {
  try {
    getNativeModule()?.reloadWidgets();
  } catch {
    // Graceful no-op
  }
}

export async function acceptNativeFriendShareUrl(shareUrl: string): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) {
    return false;
  }
  try {
    return await mod.acceptFriendShareUrl(shareUrl);
  } catch {
    return false;
  }
}

export async function createNativeSparkShareUrl(
  sparkId: string,
  senderName: string,
  stepsRequired: number,
  expiresAt: number
): Promise<string | null> {
  const mod = getNativeModule();
  if (!mod?.createSparkShareRecord) {
    return null;
  }
  try {
    const url = await mod.createSparkShareRecord(sparkId, senderName, stepsRequired, expiresAt);
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

export async function acceptNativeShareUrlWithKind(
  shareUrl: string
): Promise<SparkShareAcceptanceResult> {
  const mod = getNativeModule();
  if (!mod) {
    return { accepted: false, kind: 'unknown' };
  }
  try {
    if (mod.acceptShareUrlWithKind) {
      return await mod.acceptShareUrlWithKind(shareUrl);
    }
    const ok = await mod.acceptFriendShareUrl(shareUrl);
    return { accepted: ok, kind: ok ? 'friend' : 'unknown' };
  } catch {
    return { accepted: false, kind: 'unknown' };
  }
}

export async function completeNativeSparkShare(
  sparkId: string,
  stepsWalked: number
): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.completeSparkShareRecord) {
    return false;
  }
  try {
    return await mod.completeSparkShareRecord(sparkId, stepsWalked);
  } catch {
    return false;
  }
}

export async function checkNativePendingSparkRescues(): Promise<string[]> {
  const mod = getNativeModule();
  if (!mod?.checkPendingSparkRescues) {
    return [];
  }
  try {
    return await mod.checkPendingSparkRescues();
  } catch {
    return [];
  }
}

export function createNativeCloudKitDriver(): CloudKitDriver {
  return {
    isICloudSignedIn: async () => {
      const mod = getNativeModule();
      if (!mod) {
        return false;
      }
      try {
        return await mod.isICloudSignedIn();
      } catch {
        return false;
      }
    },
    upsertOwnCandleRecord: async (payload) => {
      const mod = getNativeModule();
      if (!mod) {
        return;
      }
      await mod.upsertOwnCandleRecord(
        payload.displayName,
        payload.state,
        payload.flameIntensity,
        payload.streakDays,
        payload.updatedAt
      );
    },
    createFriendShareUrl: async () => {
      const mod = getNativeModule();
      if (!mod) {
        return '';
      }
      return mod.createFriendShareUrl();
    },
    fetchSharedFriendCandles: async () => {
      const mod = getNativeModule();
      if (!mod) {
        return [];
      }
      return mod.fetchSharedFriendCandles();
    },
  };
}
