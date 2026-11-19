import Purchases from 'react-native-purchases';

const PRO_ENTITLEMENT_ID = 'pro';

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

export async function checkProEntitlement(apiKey?: string): Promise<boolean> {
  if (!apiKey) {
    return false;
  }
  try {
    const info = await Purchases.getCustomerInfo();
    return Boolean(info.entitlements.active[PRO_ENTITLEMENT_ID]);
  } catch {
    return false;
  }
}

export async function fetchProPriceLabel(apiKey?: string): Promise<string | null> {
  if (!apiKey) {
    return null;
  }
  try {
    const offerings = await Purchases.getOfferings();
    const price = offerings.current?.availablePackages[0]?.product?.priceString;
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
    const pkg = offerings.current?.availablePackages[0];
    if (!pkg) {
      return { purchased: false, sandboxFallback: false };
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return {
      purchased: Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]),
      sandboxFallback: false,
    };
  } catch {
    return { purchased: false, sandboxFallback: false };
  }
}

export async function restoreProPurchases(apiKey?: string): Promise<boolean> {
  if (!apiKey) {
    return false;
  }
  try {
    const info = await Purchases.restorePurchases();
    return Boolean(info.entitlements.active[PRO_ENTITLEMENT_ID]);
  } catch {
    return false;
  }
}
