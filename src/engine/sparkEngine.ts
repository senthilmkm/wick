import { ActiveSparkRescue, SparkRequestToken } from '../types/wick';

export const SPARK_STEPS_REQUIRED = 500;
export const SPARK_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Deterministic lightweight FNV-1a 64-bit-like hex digest for signing local Spark tokens
 * alongside a secret stored in expo-secure-store.
 */
export function computeTokenSignature(payload: string, secret: string): string {
  let h1 = 0xdeadbeef ^ secret.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  const combined = `${secret}:${payload}`;
  for (let i = 0; i < combined.length; i += 1) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function createSparkToken(
  sparkId: string,
  senderName: string,
  senderDeviceId: string,
  secret: string,
  nowMs: number
): SparkRequestToken {
  const cleanName = senderName.trim() || 'A friend';
  const expiresAt = nowMs + SPARK_EXPIRY_MS;
  const payload = `${sparkId}|${cleanName}|${senderDeviceId}|${nowMs}|${expiresAt}|${SPARK_STEPS_REQUIRED}`;
  return {
    sparkId,
    senderName: cleanName,
    senderDeviceId,
    createdAt: nowMs,
    expiresAt,
    stepsRequired: SPARK_STEPS_REQUIRED,
    signature: computeTokenSignature(payload, secret),
  };
}

export function buildSparkUniversalLink(token: SparkRequestToken): string {
  const encoded = encodeURIComponent(JSON.stringify(token));
  return `https://wick.app/spark/${token.sparkId}?t=${encoded}`;
}

/**
 * Safely parses an incoming Universal Link or wick:// deep link into a SparkRequestToken.
 */
export function parseSparkLink(url: string): SparkRequestToken | null {
  try {
    const qIdx = url.indexOf('?t=');
    const ampIdx = qIdx === -1 ? url.indexOf('&t=') : qIdx;
    if (ampIdx === -1) {
      return null;
    }
    const rawParam = url.slice(ampIdx + 3).split('&')[0];
    const decoded = JSON.parse(decodeURIComponent(rawParam)) as Partial<SparkRequestToken>;
    if (
      typeof decoded.sparkId !== 'string' ||
      typeof decoded.senderName !== 'string' ||
      typeof decoded.senderDeviceId !== 'string' ||
      typeof decoded.createdAt !== 'number' ||
      typeof decoded.expiresAt !== 'number' ||
      typeof decoded.stepsRequired !== 'number' ||
      typeof decoded.signature !== 'string'
    ) {
      return null;
    }
    return decoded as SparkRequestToken;
  } catch {
    return null;
  }
}

export function validateSparkToken(
  token: SparkRequestToken,
  secret: string,
  nowMs: number,
  consumedSparkIds: ReadonlySet<string>
): { valid: boolean; reason?: string } {
  if (consumedSparkIds.has(token.sparkId)) {
    return { valid: false, reason: 'This Spark Request has already been completed.' };
  }
  if (nowMs > token.expiresAt) {
    return { valid: false, reason: 'This Spark Request has expired.' };
  }
  const payload = `${token.sparkId}|${token.senderName}|${token.senderDeviceId}|${token.createdAt}|${token.expiresAt}|${token.stepsRequired}`;
  const expectedSig = computeTokenSignature(payload, secret);
  if (token.signature !== expectedSig) {
    return { valid: false, reason: 'Invalid Spark token signature.' };
  }
  return { valid: true };
}

export function startSparkRescue(
  token: SparkRequestToken
): ActiveSparkRescue {
  return {
    sparkId: token.sparkId,
    senderName: token.senderName,
    stepsWalked: 0,
    stepsRequired: token.stepsRequired,
    expiresAt: token.expiresAt,
    completed: false,
  };
}

export function updateSparkRescueProgress(
  rescue: ActiveSparkRescue,
  stepsWalked: number,
  nowMs: number
): ActiveSparkRescue {
  if (rescue.completed || nowMs > rescue.expiresAt) {
    return rescue;
  }
  const clampedSteps = Math.max(0, Math.min(rescue.stepsRequired, Math.round(stepsWalked)));
  return {
    ...rescue,
    stepsWalked: clampedSteps,
    completed: clampedSteps >= rescue.stepsRequired,
  };
}
