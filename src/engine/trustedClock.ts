export const TRUSTED_ROLLBACK_TOLERANCE_MS = 6 * 60 * 60 * 1000;
export const TRUSTED_FORWARD_CAP_MS = 36 * 60 * 60 * 1000;
export const PRO_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface TrustedClockResolution {
  trustedNowMs: number;
  clockRolledBack: boolean;
  forwardCreditMs: number;
}

/**
 * High-water device clock. A backward jump keeps the previous time.
 * A single launch can move forward by at most 36 hours, so a date change
 * cannot skip a week of quota or several candle days at once.
 */
export function resolveTrustedNow(wallNowMs: number, lastTrustedMs: number | null): TrustedClockResolution {
  if (lastTrustedMs === null || !Number.isFinite(lastTrustedMs) || lastTrustedMs <= 0) {
    return { trustedNowMs: wallNowMs, clockRolledBack: false, forwardCreditMs: 0 };
  }
  if (wallNowMs + TRUSTED_ROLLBACK_TOLERANCE_MS < lastTrustedMs) {
    return { trustedNowMs: lastTrustedMs, clockRolledBack: true, forwardCreditMs: 0 };
  }
  if (wallNowMs <= lastTrustedMs) {
    return { trustedNowMs: lastTrustedMs, clockRolledBack: false, forwardCreditMs: 0 };
  }
  const gap = wallNowMs - lastTrustedMs;
  const credit = Math.min(gap, TRUSTED_FORWARD_CAP_MS);
  return {
    trustedNowMs: lastTrustedMs + credit,
    clockRolledBack: false,
    forwardCreditMs: credit,
  };
}

/**
 * CloudKit server time wins over the device clock. Quota credit is the real
 * gap since the last server timestamp, which a settings date change cannot move.
 */
export function resolveAuthoritativeNow(
  wallNowMs: number,
  lastTrustedMs: number | null,
  serverNowMs: number | null
): TrustedClockResolution {
  if (serverNowMs !== null && Number.isFinite(serverNowMs) && serverNowMs > 0) {
    const prev = lastTrustedMs !== null && lastTrustedMs > 0 ? lastTrustedMs : serverNowMs;
    return {
      trustedNowMs: serverNowMs,
      clockRolledBack: false,
      forwardCreditMs: Math.max(0, serverNowMs - prev),
    };
  }
  return resolveTrustedNow(wallNowMs, lastTrustedMs);
}

export function earlierInstallStamp(localMs: number | null, serverMs: number | null): number | null {
  const stamps = [localMs, serverMs].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  );
  if (stamps.length === 0) {
    return null;
  }
  return Math.min(...stamps);
}

/**
 * StoreKit `active` grants Pro. `inactive` removes it.
 * `unknown` (offline) may keep a grant that StoreKit confirmed within 7 days.
 */
export function proFromStoreStatus(
  status: 'active' | 'inactive' | 'unknown',
  cachedGrant: boolean,
  verifiedAtMs: number | null,
  trustedNowMs: number
): boolean {
  if (status === 'active') {
    return true;
  }
  if (status === 'inactive') {
    return false;
  }
  if (!cachedGrant || verifiedAtMs === null || !Number.isFinite(verifiedAtMs)) {
    return false;
  }
  const age = trustedNowMs - verifiedAtMs;
  return age >= 0 && age < PRO_OFFLINE_GRACE_MS;
}
