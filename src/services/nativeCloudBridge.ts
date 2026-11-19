import { requireOptionalNativeModule } from 'expo-modules-core';
import { FriendCandle } from '../types/wick';
import { CloudKitDriver } from './cloudKitService';

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
