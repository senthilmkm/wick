import { CandleState, FriendCandle } from '../types/wick';

export const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;

const SPARK_ASK_STATES: ReadonlySet<CandleState> = new Set([
  'FLICKERING',
  'DYING_EMBER',
  'SMOKING_GRACE',
  'EXTINGUISHED',
]);

export function isForgeablePairLink(url: string): boolean {
  return url.includes('pair.html') || url.includes('circle/pair') || url.includes('wick://circle/pair');
}

export function canAskForSpark(state: CandleState): boolean {
  return SPARK_ASK_STATES.has(state);
}

export function canSendNudge(lastSentAt: number | null, nowMs: number): boolean {
  if (lastSentAt == null || !Number.isFinite(lastSentAt)) {
    return true;
  }
  if (!Number.isFinite(nowMs)) {
    return false;
  }
  return nowMs - lastSentAt >= NUDGE_COOLDOWN_MS;
}

export function readNudgeCooldowns(raw: string | undefined): Record<string, number> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[id] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function withNudgeCooldown(
  current: Record<string, number>,
  friendId: string,
  nowMs: number
): Record<string, number> {
  return { ...current, [friendId]: nowMs };
}

export function nudgeBody(friend: Pick<FriendCandle, 'state' | 'streakDays'>): string {
  const stateLabel = friend.state.toLowerCase().replace(/_/g, ' ');
  return `Your Wick candle is ${stateLabel}. A short walk keeps your ${friend.streakDays}-day streak glowing.`;
}

export function nudgeShareMessage(
  friend: Pick<FriendCandle, 'displayName' | 'state' | 'streakDays'>
): string {
  const name = friend.displayName.trim() || 'Friend';
  const body = nudgeBody(friend);
  return `${name}, ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
}

export function sparkAskUsesRescue(friendCount: number): boolean {
  return Number.isFinite(friendCount) && friendCount > 0;
}

export function sparkAskText(): string {
  return 'My Wick is burning low. Walk 500 steps and open Wick to help reignite it.';
}

export function visitorRecordName(visitorId: string): string | null {
  const trimmed = visitorId.trim();
  if (!trimmed) {
    return null;
  }
  return `visitor_${trimmed}`;
}

export function isVisitorCandleName(recordName: string): boolean {
  return recordName.startsWith('visitor_') && recordName.length > 'visitor_'.length;
}

export function friendOwnerName(friendId: string): string | null {
  const splitAt = friendId.indexOf(':');
  if (splitAt <= 0) {
    return null;
  }
  const owner = friendId.slice(0, splitAt).trim();
  return owner.length > 0 ? owner : null;
}

export function friendListChanged(
  current: readonly FriendCandle[],
  next: readonly FriendCandle[]
): boolean {
  if (current.length !== next.length) {
    return true;
  }
  for (let index = 0; index < next.length; index += 1) {
    const prev = current[index];
    const friend = next[index];
    if (
      prev.id !== friend.id ||
      prev.displayName !== friend.displayName ||
      prev.state !== friend.state ||
      prev.flameIntensity !== friend.flameIntensity ||
      prev.streakDays !== friend.streakDays ||
      prev.updatedAt !== friend.updatedAt
    ) {
      return true;
    }
  }
  return false;
}

export function readIdList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function rememberId(current: readonly string[], id: string, limit = 40): string[] {
  if (!id) {
    return [...current];
  }
  const next = current.filter((item) => item !== id);
  next.push(id);
  if (next.length <= limit) {
    return next;
  }
  return next.slice(next.length - limit);
}

export interface SharedSparkRequest {
  sparkId: string;
  senderName: string;
  stepsRequired: number;
  expiresAt: number;
}

export interface SparkShareCreateResult {
  delivery: 'circle' | 'link';
  shareUrl: string | null;
}

export function parseSparkShareCreate(raw: unknown): SparkShareCreateResult | null {
  if (typeof raw === 'string') {
    return raw.length > 0 ? { delivery: 'link', shareUrl: raw } : null;
  }
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as { delivery?: unknown; shareUrl?: unknown };
  if (record.delivery === 'circle') {
    return { delivery: 'circle', shareUrl: null };
  }
  if (record.delivery === 'link' && typeof record.shareUrl === 'string' && record.shareUrl.length > 0) {
    return { delivery: 'link', shareUrl: record.shareUrl };
  }
  return null;
}

export function pickIncomingSpark(
  sparks: readonly SharedSparkRequest[],
  nowMs: number,
  activeSparkId: string | null,
  handledIds: ReadonlySet<string>
): SharedSparkRequest | null {
  if (activeSparkId || !Number.isFinite(nowMs)) {
    return null;
  }
  const ready = sparks.filter((spark) => {
    return (
      spark.sparkId.length > 0 &&
      !handledIds.has(spark.sparkId) &&
      Number.isFinite(spark.expiresAt) &&
      spark.expiresAt > nowMs &&
      Number.isFinite(spark.stepsRequired) &&
      spark.stepsRequired >= 500
    );
  });
  if (ready.length === 0) {
    return null;
  }
  return [...ready].sort((a, b) => a.expiresAt - b.expiresAt)[0];
}

export type SparkDelivery = 'ignore' | 'apply' | 'wait' | 'wait-silent';

export function classifySparkRescue(
  state: CandleState,
  stepsWalked: number,
  sparkId: string,
  appliedIds: ReadonlySet<string>,
  announcedWaitIds: ReadonlySet<string>
): SparkDelivery {
  if (!Number.isFinite(stepsWalked) || stepsWalked < 500 || appliedIds.has(sparkId)) {
    return 'ignore';
  }
  if (state === 'NIGHT_SLEEP' || state === 'GLASS_DOME') {
    return announcedWaitIds.has(sparkId) ? 'wait-silent' : 'wait';
  }
  return 'apply';
}
