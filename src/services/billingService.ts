import Purchases from 'react-native-purchases';

const PRO_ENTITLEMENT_ID = 'pro';
const LIFETIME_PACKAGE_ID = '$rc_lifetime';

export type ProEntitlementStatus = 'active' | 'inactive' | 'unknown';

interface PurchasesPackageLike {
  packageType?: string;
  identifier?: string;
  product?: { priceString?: string };
}

function lifetimePackageFrom(offerings: {
  current?: { availablePackages?: PurchasesPackageLike[] } | null;
}): PurchasesPackageLike | null {
  const packages = offerings.current?.availablePackages ?? [];
  return (
    packages.find(
      (pkg) => pkg.packageType === 'LIFETIME' || pkg.identifier === LIFETIME_PACKAGE_ID
    ) ?? null
  );
}

export function initBilling(apiKey?: string): boolean {
  if (!apiKey) {
    return false;
  }
  try {
    Purchases.configure({ apiKey });
    return true;
  } catch {
    return false;
  }
}

export async function resolveProEntitlement(apiKey?: string): Promise<ProEntitlementStatus> {
  if (!apiKey) {
    return 'unknown';
  }
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[PRO_ENTITLEMENT_ID] ? 'active' : 'inactive';
  } catch {
    return 'unknown';
  }
}

export async function checkProEntitlement(apiKey?: string): Promise<boolean> {
  return (await resolveProEntitlement(apiKey)) === 'active';
}

export async function fetchProPriceLabel(apiKey?: string): Promise<string | null> {
  if (!apiKey) {
    return null;
  }
  try {
    const offerings = await Purchases.getOfferings();
    const price = lifetimePackageFrom(offerings)?.product?.priceString;
    return typeof price === 'string' && price.length > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function purchaseProPackage(apiKey?: string): Promise<{
  purchased: boolean;
  sandboxFallback: boolean;
}> {
  if (!apiKey) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      return { purchased: true, sandboxFallback: true };
    }
    return { purchased: false, sandboxFallback: false };
  }
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = lifetimePackageFrom(offerings);
    if (!pkg) {
      return { purchased: false, sandboxFallback: false };
    }
    const { customerInfo } = await Purchases.purchasePackage(
      pkg as Parameters<typeof Purchases.purchasePackage>[0]
    );
    return {
      purchased: Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]),
      sandboxFallback: false,
    };
  } catch {
    return { purchased: false, sandboxFallback: false };
  }
}

export async function restoreProEntitlement(apiKey?: string): Promise<ProEntitlementStatus> {
  if (!apiKey) {
    return 'unknown';
  }
  try {
    const info = await Purchases.restorePurchases();
    return info.entitlements.active[PRO_ENTITLEMENT_ID] ? 'active' : 'inactive';
  } catch {
    return 'unknown';
  }
}

export async function restoreProPurchases(apiKey?: string): Promise<boolean> {
  return (await restoreProEntitlement(apiKey)) === 'active';
}
