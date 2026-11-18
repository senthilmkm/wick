import { WICK_THEMES } from '../constants/themes';
import { EntitlementState, ThemeId } from '../types/wick';
import { getLocalWeekKey } from './candleMath';

export const FREE_MAX_FRIENDS = 1;
export const FREE_MAX_LEDGER_DAYS = 7;
export const FREE_WEEKLY_VIDEO_EXPORTS = 1;

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
  // If Keychain already recorded an earlier install, deny local-only intro perks
  // while deferring final StoreKit intro-offer billing to Apple's receipt check.
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

export function canUseTheme(entitlement: EntitlementState, themeId: ThemeId): boolean {
  if (entitlement.isPro) {
    return true;
  }
  return !WICK_THEMES[themeId].isPro;
}

export function canAddFriend(entitlement: EntitlementState, currentFriendCount: number): boolean {
  if (entitlement.isPro) {
    return true;
  }
  return currentFriendCount < FREE_MAX_FRIENDS;
}

export function canExportVideo(entitlement: EntitlementState, now: Date): boolean {
  if (entitlement.isPro) {
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

export function canExportPdf(entitlement: EntitlementState): boolean {
  return entitlement.isPro;
}

export function getVisibleLedgerLimit(entitlement: EntitlementState): number {
  return entitlement.isPro ? Number.MAX_SAFE_INTEGER : FREE_MAX_LEDGER_DAYS;
}
