import { requireOptionalNativeModule } from 'expo-modules-core';
import { parseSparkShareCreate, SharedSparkRequest, SparkShareCreateResult } from '../engine/circleFlow';
import { FriendCandle } from '../types/wick';
import { CloudKitDriver } from './cloudKitService';

export interface CompletedSparkRescueInfo {
  sparkId: string;
  stepsWalked: number;
}

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
  createFriendShareUrl(
    displayName: string,
    state: string,
    flameIntensity: number,
    streakDays: number
  ): Promise<string>;
  acceptFriendShareUrl(shareUrl: string): Promise<boolean>;
  fetchSharedFriendCandles(): Promise<FriendCandle[]>;
  createSparkShareRecord?(
    sparkId: string,
    senderName: string,
    stepsRequired: number,
    expiresAt: number
  ): Promise<unknown>;
  acceptShareUrlWithKind?(shareUrl: string): Promise<SparkShareAcceptanceResult>;
  completeSparkShareRecord?(sparkId: string, stepsWalked: number): Promise<boolean>;
  checkPendingSparkRescues?(): Promise<CompletedSparkRescueInfo[]>;
  fetchSharedPendingSparks?(): Promise<SharedSparkRequest[]>;
  deleteCompletedSparkRecords?(sparkIds: string[]): Promise<boolean>;
  sendNudge?(
    ownerName: string,
    nudgeId: string,
    fromName: string,
    message: string,
    createdAt: number
  ): Promise<boolean>;
  fetchNudges?(): Promise<{ nudgeId: string; fromName: string; message: string; createdAt: number }[]>;
  deleteNudgeRecords?(nudgeIds: string[]): Promise<boolean>;
  writeFriendWidgetSnapshot?(jsonPayload: string): void;
  peekShareUrlKind?(shareUrl: string): Promise<SparkShareAcceptanceResult>;
  fetchOrCreateTrialAnchor?(): Promise<{
    createdAtMs?: number;
    serverNowMs?: number;
    expired?: boolean;
  }>;
  markTrialAnchorExpired?(): Promise<boolean>;
  isSleepFocusActive?(): Promise<boolean>;
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
): Promise<SparkShareCreateResult | null> {
  const mod = getNativeModule();
  if (!mod?.createSparkShareRecord) {
    return null;
  }
  try {
    const raw = await mod.createSparkShareRecord(sparkId, senderName, stepsRequired, expiresAt);
    return parseSparkShareCreate(raw);
  } catch {
    return null;
  }
}

export async function fetchNativeSharedPendingSparks(): Promise<SharedSparkRequest[]> {
  const mod = getNativeModule();
  if (!mod?.fetchSharedPendingSparks) {
    return [];
  }
  try {
    const rows = await mod.fetchSharedPendingSparks();
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.filter(
      (row) =>
        !!row &&
        typeof row.sparkId === 'string' &&
        row.sparkId.length > 0 &&
        typeof row.senderName === 'string' &&
        typeof row.stepsRequired === 'number' &&
        typeof row.expiresAt === 'number'
    );
  } catch {
    return [];
  }
}

export async function deleteNativeNudges(nudgeIds: string[]): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.deleteNudgeRecords || nudgeIds.length === 0) {
    return false;
  }
  try {
    return await mod.deleteNudgeRecords(nudgeIds);
  } catch {
    return false;
  }
}

export async function peekNativeShareUrlKind(
  shareUrl: string
): Promise<SparkShareAcceptanceResult> {
  const mod = getNativeModule();
  if (!mod?.peekShareUrlKind) {
    return { accepted: false, kind: 'unknown' };
  }
  try {
    return await mod.peekShareUrlKind(shareUrl);
  } catch {
    return { accepted: false, kind: 'unknown' };
  }
}

export interface TrialAnchorInfo {
  createdAtMs: number;
  serverNowMs: number;
  expired: boolean;
}

export async function fetchNativeTrialAnchor(): Promise<TrialAnchorInfo | null> {
  const mod = getNativeModule();
  if (!mod?.fetchOrCreateTrialAnchor) {
    return null;
  }
  try {
    const raw = await mod.fetchOrCreateTrialAnchor();
    const createdAtMs = Number(raw?.createdAtMs);
    const serverNowMs = Number(raw?.serverNowMs);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) {
      return null;
    }
    return {
      createdAtMs,
      serverNowMs: Number.isFinite(serverNowMs) && serverNowMs > 0 ? serverNowMs : createdAtMs,
      expired: Boolean(raw?.expired),
    };
  } catch {
    return null;
  }
}

export async function markNativeTrialAnchorExpired(): Promise<void> {
  const mod = getNativeModule();
  if (!mod?.markTrialAnchorExpired) {
    return;
  }
  try {
    await mod.markTrialAnchorExpired();
  } catch {
    // Local latch still closes the trial when iCloud is unreachable.
  }
}

export async function fetchNativeSleepFocus(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.isSleepFocusActive) {
    return false;
  }
  try {
    return Boolean(await mod.isSleepFocusActive());
  } catch {
    return false;
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

export function writeNativeFriendWidgetSnapshot(jsonPayload: string): void {
  try {
    getNativeModule()?.writeFriendWidgetSnapshot?.(jsonPayload);
  } catch {
    // Graceful no-op in Jest/web/unlinked builds
  }
}

export async function deleteNativeCompletedSparks(sparkIds: string[]): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.deleteCompletedSparkRecords || sparkIds.length === 0) {
    return false;
  }
  try {
    return await mod.deleteCompletedSparkRecords(sparkIds);
  } catch {
    return false;
  }
}

export interface IncomingNudge {
  nudgeId: string;
  fromName: string;
  message: string;
  createdAt: number;
}

export async function sendNativeNudge(input: {
  ownerName: string;
  nudgeId: string;
  fromName: string;
  message: string;
  createdAt: number;
}): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.sendNudge) {
    return false;
  }
  try {
    return await mod.sendNudge(
      input.ownerName,
      input.nudgeId,
      input.fromName,
      input.message,
      input.createdAt
    );
  } catch {
    return false;
  }
}

export async function fetchNativeNudges(): Promise<IncomingNudge[]> {
  const mod = getNativeModule();
  if (!mod?.fetchNudges) {
    return [];
  }
  try {
    const rows = await mod.fetchNudges();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function checkNativePendingSparkRescues(): Promise<CompletedSparkRescueInfo[]> {
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
    createFriendShareUrl: async (candle) => {
      const mod = getNativeModule();
      if (!mod) {
        return '';
      }
      return mod.createFriendShareUrl(
        candle.displayName,
        candle.state,
        candle.flameIntensity,
        candle.streakDays
      );
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
