import { WICK_THEMES } from '../constants/themes';
import { EntitlementState, ThemeId } from '../types/wick';
import { getLocalWeekKey } from './candleMath';

export const FREE_MAX_FRIENDS = 1;
export const FREE_MAX_LEDGER_DAYS = 7;
export const FREE_WEEKLY_VIDEO_EXPORTS = 1;
export const REVERSE_TRIAL_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours from Keychain firstInstallAt
export const SHARE_QUOTA_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resolves intro trial eligibility combining StoreKit 2 Apple ID status
 * and Keychain-persisted device install history to prevent uninstall/reinstall abuse.
 */
export function canOfferFreeTrial(
  storeKitEligible: boolean,
  keychainFirstInstallAt: number | null,
  cloudKitStarterClaimed: boolean
): boolean {
  if (!storeKitEligible || cloudKitStarterClaimed) {
    return false;
  }
  if (keychainFirstInstallAt !== null) {
    return false;
  }
  return true;
}

export function createInitialEntitlement(
  now: Date,
  storeKitIsPro: boolean,
  storeKitIntroEligible: boolean,
  keychainFirstInstallAt: number | null,
  keychainStarterDomeClaimed: boolean
): EntitlementState {
  const nowMs = now.getTime();
  return {
    isPro: storeKitIsPro,
    isEligibleForIntroTrial: canOfferFreeTrial(
      storeKitIntroEligible,
      keychainFirstInstallAt,
      keychainStarterDomeClaimed
    ),
    starterDomeClaimed: keychainStarterDomeClaimed,
    firstInstallAt: keychainFirstInstallAt ?? nowMs,
    trialExpired: false,
    quotaElapsedMs: 0,
    freeVideoExportsThisWeek: 0,
    weekKey: getLocalWeekKey(now),
  };
}

/**
 * Returns true during the first 72 hours from Keychain-persisted firstInstallAt
 * (survives app uninstall & reinstall).
 */
export function isInReverseTrial(entitlement: EntitlementState, nowMs: number): boolean {
  if (entitlement.trialExpired) {
    return false;
  }
  if (!Number.isFinite(entitlement.firstInstallAt) || entitlement.firstInstallAt <= 0) {
    return false;
  }
  return nowMs - entitlement.firstInstallAt < REVERSE_TRIAL_MS;
}

/**
 * Permanently closes the reverse trial. A backward clock cannot clear this.
 */
export function latchTrialExpiry(
  entitlement: EntitlementState,
  nowMs: number,
  clockRolledBack: boolean
): EntitlementState {
  if (entitlement.trialExpired) {
    return entitlement;
  }
  const elapsed =
    Number.isFinite(entitlement.firstInstallAt) && entitlement.firstInstallAt > 0
      ? nowMs - entitlement.firstInstallAt
      : REVERSE_TRIAL_MS;
  if (clockRolledBack || elapsed >= REVERSE_TRIAL_MS) {
    return { ...entitlement, trialExpired: true, isEligibleForIntroTrial: false };
  }
  return entitlement;
}

/**
 * Effective Pro access: paid subscriber OR within the 3-day reverse trial.
 */
export function hasProAccess(entitlement: EntitlementState, nowMs: number): boolean {
  return entitlement.isPro || isInReverseTrial(entitlement, nowMs);
}

export function canUseTheme(
  entitlement: EntitlementState,
  themeId: ThemeId,
  nowMs: number = entitlement.firstInstallAt + REVERSE_TRIAL_MS
): boolean {
  if (hasProAccess(entitlement, nowMs)) {
    return true;
  }
  return !WICK_THEMES[themeId].isPro;
}

export function canUseGlassDome(
  entitlement: EntitlementState,
  nowMs: number = entitlement.firstInstallAt + REVERSE_TRIAL_MS,
  glassDomesOwned = 0
): boolean {
  if (hasProAccess(entitlement, nowMs)) {
    return true;
  }
  if (entitlement.starterDomeClaimed) {
    return false;
  }
  return glassDomesOwned > 0;
}

export function canAddFriend(
  entitlement: EntitlementState,
  currentFriendCount: number,
  nowMs: number = entitlement.firstInstallAt + REVERSE_TRIAL_MS
): boolean {
  if (hasProAccess(entitlement, nowMs)) {
    return true;
  }
  return currentFriendCount < FREE_MAX_FRIENDS;
}

export function shareWindowElapsed(entitlement: EntitlementState): boolean {
  return (entitlement.quotaElapsedMs ?? 0) >= SHARE_QUOTA_WINDOW_MS;
}

/**
 * Free share uses trusted elapsed time, not the device's ISO week,
 * so moving the date into next week does not refill the quota.
 */
export function canExportVideo(entitlement: EntitlementState, now: Date): boolean {
  if (hasProAccess(entitlement, now.getTime())) {
    return true;
  }
  if (shareWindowElapsed(entitlement)) {
    return true;
  }
  return entitlement.freeVideoExportsThisWeek < FREE_WEEKLY_VIDEO_EXPORTS;
}

/**
 * Free PNG cards left in the current 7-day window.
 * Null means Pro or the reverse trial, where cards are not counted.
 */
export function freeShareCardsRemaining(entitlement: EntitlementState, nowMs: number): number | null {
  if (hasProAccess(entitlement, nowMs)) {
    return null;
  }
  if (shareWindowElapsed(entitlement)) {
    return FREE_WEEKLY_VIDEO_EXPORTS;
  }
  return Math.max(0, FREE_WEEKLY_VIDEO_EXPORTS - entitlement.freeVideoExportsThisWeek);
}

export function formatFreeShareCardsLabel(entitlement: EntitlementState, nowMs: number): string {
  const remaining = freeShareCardsRemaining(entitlement, nowMs);
  if (remaining === null) {
    return 'Unlimited';
  }
  return remaining === 1 ? '1 free left' : `${remaining} free left`;
}

export function creditShareQuota(entitlement: EntitlementState, creditMs: number): EntitlementState {
  if (!Number.isFinite(creditMs) || creditMs <= 0) {
    return entitlement;
  }
  return {
    ...entitlement,
    quotaElapsedMs: (entitlement.quotaElapsedMs ?? 0) + creditMs,
  };
}

export function recordVideoExport(entitlement: EntitlementState, now: Date): EntitlementState {
  const reset = shareWindowElapsed(entitlement);
  const prevCount = reset ? 0 : entitlement.freeVideoExportsThisWeek;
  return {
    ...entitlement,
    quotaElapsedMs: reset ? 0 : (entitlement.quotaElapsedMs ?? 0),
    weekKey: getLocalWeekKey(now),
    freeVideoExportsThisWeek: prevCount + 1,
  };
}

export function capFriendList<T extends { updatedAt: number }>(
  friends: T[],
  entitlement: EntitlementState,
  nowMs: number
): T[] {
  if (hasProAccess(entitlement, nowMs)) {
    return friends;
  }
  return [...friends].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, FREE_MAX_FRIENDS);
}

export function canExportPdf(
  entitlement: EntitlementState,
  nowMs: number = entitlement.firstInstallAt + REVERSE_TRIAL_MS
): boolean {
  return hasProAccess(entitlement, nowMs);
}

export function getVisibleLedgerLimit(
  entitlement: EntitlementState,
  nowMs: number = entitlement.firstInstallAt + REVERSE_TRIAL_MS
): number {
  return hasProAccess(entitlement, nowMs) ? Number.MAX_SAFE_INTEGER : FREE_MAX_LEDGER_DAYS;
}
