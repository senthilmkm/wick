import { WICK_THEMES } from '../constants/themes';
import { EntitlementState, ThemeId } from '../types/wick';
import { getLocalWeekKey } from './candleMath';

export const FREE_MAX_FRIENDS = 1;
export const FREE_MAX_LEDGER_DAYS = 7;
export const FREE_WEEKLY_VIDEO_EXPORTS = 1;
export const REVERSE_TRIAL_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours from Keychain firstInstallAt

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
    freeVideoExportsThisWeek: 0,
    weekKey: getLocalWeekKey(now),
  };
}

/**
 * Returns true during the first 72 hours from Keychain-persisted firstInstallAt
 * (survives app uninstall & reinstall).
 */
export function isInReverseTrial(entitlement: EntitlementState, nowMs: number): boolean {
  return nowMs - entitlement.firstInstallAt < REVERSE_TRIAL_MS;
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
  nowMs: number = entitlement.firstInstallAt + REVERSE_TRIAL_MS
): boolean {
  return hasProAccess(entitlement, nowMs);
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

export function canExportVideo(entitlement: EntitlementState, now: Date): boolean {
  if (hasProAccess(entitlement, now.getTime())) {
    return true;
  }
  const currentWeek = getLocalWeekKey(now);
  const usedThisWeek =
    entitlement.weekKey === currentWeek ? entitlement.freeVideoExportsThisWeek : 0;
  return usedThisWeek < FREE_WEEKLY_VIDEO_EXPORTS;
}

export function recordVideoExport(entitlement: EntitlementState, now: Date): EntitlementState {
  const currentWeek = getLocalWeekKey(now);
  const prevCount =
    entitlement.weekKey === currentWeek ? entitlement.freeVideoExportsThisWeek : 0;
  return {
    ...entitlement,
    weekKey: currentWeek,
    freeVideoExportsThisWeek: prevCount + 1,
  };
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
