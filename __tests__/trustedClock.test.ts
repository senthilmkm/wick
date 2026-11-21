import {
  earlierInstallStamp,
  proFromStoreStatus,
  resolveAuthoritativeNow,
  resolveTrustedNow,
  TRUSTED_FORWARD_CAP_MS,
} from '../src/engine/trustedClock';
import { canUseGlassDome, createInitialEntitlement } from '../src/engine/trialGuard';

describe('trusted clock and store entitlement', () => {
  const install = new Date(2026, 10, 18, 9, 0).getTime();

  it('does not move backward and caps a single forward jump', () => {
    const rolled = resolveTrustedNow(install, install + 10 * 24 * 60 * 60 * 1000);
    expect(rolled.clockRolledBack).toBe(true);
    expect(rolled.trustedNowMs).toBe(install + 10 * 24 * 60 * 60 * 1000);
    expect(rolled.forwardCreditMs).toBe(0);

    const jumped = resolveTrustedNow(install + 8 * 24 * 60 * 60 * 1000, install);
    expect(jumped.clockRolledBack).toBe(false);
    expect(jumped.forwardCreditMs).toBe(TRUSTED_FORWARD_CAP_MS);
    expect(jumped.trustedNowMs).toBe(install + TRUSTED_FORWARD_CAP_MS);
  });

  it('prefers CloudKit server time over the device clock', () => {
    const serverNow = install + 2 * 60 * 60 * 1000;
    const clock = resolveAuthoritativeNow(install + 40 * 24 * 60 * 60 * 1000, install, serverNow);
    expect(clock.trustedNowMs).toBe(serverNow);
    expect(clock.clockRolledBack).toBe(false);
    expect(earlierInstallStamp(install + 999999, install)).toBe(install);
    expect(earlierInstallStamp(null, null)).toBeNull();
  });

  it('keeps Pro only for an active StoreKit grant or a recent confirmed cache', () => {
    expect(proFromStoreStatus('active', false, null, install)).toBe(true);
    expect(proFromStoreStatus('inactive', true, install, install + 1000)).toBe(false);
    expect(proFromStoreStatus('unknown', true, null, install)).toBe(false);
    expect(proFromStoreStatus('unknown', true, install, install + 60 * 60 * 1000)).toBe(true);
    expect(proFromStoreStatus('unknown', true, install, install + 8 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it('lets a free user spend the unclaimed starter dome and blocks wax domes after that', () => {
    const ent = createInitialEntitlement(new Date(install), false, false, install, false);
    const afterTrial = install + 5 * 24 * 60 * 60 * 1000;
    expect(canUseGlassDome(ent, afterTrial, 0)).toBe(false);
    expect(canUseGlassDome(ent, afterTrial, 1)).toBe(true);
    expect(canUseGlassDome({ ...ent, starterDomeClaimed: true }, afterTrial, 3)).toBe(false);
  });
});
