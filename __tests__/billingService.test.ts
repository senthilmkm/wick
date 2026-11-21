const mockConfigure = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: (...args: unknown[]) => mockConfigure(...args),
    getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args),
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
    restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  },
}));

import {
  checkProEntitlement,
  fetchProPriceLabel,
  initBilling,
  purchaseProPackage,
  resolveProEntitlement,
  restoreProPurchases,
} from '../src/services/billingService';

describe('billingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes billing only when API key is provided and handles errors', () => {
    expect(initBilling(undefined)).toBe(false);
    expect(initBilling('appl_test_key')).toBe(true);
    mockConfigure.mockImplementationOnce(() => {
      throw new Error('config err');
    });
    expect(initBilling('appl_test_key')).toBe(false);
  });

  it('checks Pro entitlement safely', async () => {
    expect(await checkProEntitlement(undefined)).toBe(false);
    expect(await resolveProEntitlement(undefined)).toBe('unknown');
    mockGetCustomerInfo.mockResolvedValueOnce({ entitlements: { active: { pro: {} } } });
    expect(await checkProEntitlement('key')).toBe(true);
    mockGetCustomerInfo.mockResolvedValueOnce({ entitlements: { active: {} } });
    expect(await resolveProEntitlement('key')).toBe('inactive');
    mockGetCustomerInfo.mockRejectedValueOnce(new Error('err'));
    expect(await checkProEntitlement('key')).toBe(false);
    expect(await resolveProEntitlement('key')).toBe('unknown');
  });

  it('purchases Pro via RevenueCat or dev fallback when key is unset', async () => {
    const g = globalThis as { __DEV__?: boolean };
    g.__DEV__ = true;
    expect(await purchaseProPackage(undefined)).toEqual({
      purchased: true,
      sandboxFallback: true,
    });

    g.__DEV__ = false;
    expect(await purchaseProPackage(undefined)).toEqual({
      purchased: false,
      sandboxFallback: false,
    });
    delete g.__DEV__;

    mockGetOfferings.mockResolvedValueOnce({ current: { availablePackages: [] } });
    expect(await purchaseProPackage('key')).toEqual({
      purchased: false,
      sandboxFallback: false,
    });

    mockGetOfferings.mockResolvedValueOnce({
      current: { availablePackages: [{ identifier: 'annual', packageType: 'ANNUAL' }] },
    });
    expect(await purchaseProPackage('key')).toEqual({
      purchased: false,
      sandboxFallback: false,
    });
    expect(mockPurchasePackage).not.toHaveBeenCalled();

    mockGetOfferings.mockResolvedValueOnce({
      current: { availablePackages: [{ identifier: '$rc_lifetime', packageType: 'LIFETIME' }] },
    });
    mockPurchasePackage.mockResolvedValueOnce({
      customerInfo: { entitlements: { active: { pro: {} } } },
    });
    expect(await purchaseProPackage('key')).toEqual({
      purchased: true,
      sandboxFallback: false,
    });

    mockGetOfferings.mockRejectedValueOnce(new Error('cancelled'));
    expect(await purchaseProPackage('key')).toEqual({
      purchased: false,
      sandboxFallback: false,
    });
  });

  it('restores purchases safely', async () => {
    expect(await restoreProPurchases(undefined)).toBe(false);
    mockRestorePurchases.mockResolvedValueOnce({ entitlements: { active: { pro: {} } } });
    expect(await restoreProPurchases('key')).toBe(true);
    mockRestorePurchases.mockRejectedValueOnce(new Error('err'));
    expect(await restoreProPurchases('key')).toBe(false);
  });

  it('fetches localized StoreKit price string dynamically without hardcoding', async () => {
    expect(await fetchProPriceLabel(undefined)).toBeNull();
    mockGetOfferings.mockResolvedValueOnce({
      current: {
        availablePackages: [{ packageType: 'LIFETIME', product: { priceString: '$14.99' } }],
      },
    });
    expect(await fetchProPriceLabel('key')).toBe('$14.99');
    mockGetOfferings.mockResolvedValueOnce({ current: { availablePackages: [] } });
    expect(await fetchProPriceLabel('key')).toBeNull();
    mockGetOfferings.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchProPriceLabel('key')).toBeNull();
  });
});
