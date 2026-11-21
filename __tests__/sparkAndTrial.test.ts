import {
  buildSparkUniversalLink,
  createSparkToken,
  parseSparkLink,
  SPARK_EXPIRY_MS,
  SPARK_STEPS_REQUIRED,
  startSparkRescue,
  updateSparkRescueProgress,
  validateSparkToken,
} from '../src/engine/sparkEngine';
import {
  canAddFriend,
  canExportPdf,
  canExportVideo,
  canOfferFreeTrial,
  canUseGlassDome,
  canUseTheme,
  createInitialEntitlement,
  FREE_MAX_LEDGER_DAYS,
  getVisibleLedgerLimit,
  capFriendList,
  creditShareQuota,
  formatFreeShareCardsLabel,
  freeShareCardsRemaining,
  hasProAccess,
  isInReverseTrial,
  latchTrialExpiry,
  recordVideoExport,
  REVERSE_TRIAL_MS,
  SHARE_QUOTA_WINDOW_MS,
} from '../src/engine/trialGuard';

describe('sparkEngine', () => {
  const secret = 'keychain-secret-123';
  const now = 1_700_000_000_000;

  it('creates, links, validates, and tracks a 500-step Spark Rescue', () => {
    const token = createSparkToken('spk-1', '  Maya  ', 'dev-a', secret, now);
    expect(token.senderName).toBe('Maya');
    const link = buildSparkUniversalLink(token);
    expect(link).toContain('https://senthilmkm.github.io/wick/spark.html?t=');
    expect(parseSparkLink(link)).toEqual(token);
    expect(parseSparkLink(`wick://spark/spk-1?foo=1&t=${encodeURIComponent(JSON.stringify(token))}`)).toEqual(token);
    expect(parseSparkLink('https://wick.app/spark/spk-1')).toBeNull();
    expect(parseSparkLink('https://wick.app/spark/spk-1?t=%7Bbad')).toBeNull();
    expect(parseSparkLink(`https://wick.app/spark/spk-1?t=${encodeURIComponent(JSON.stringify({ sparkId: 'only-id' }))}`)).toBeNull();

    const blankNameToken = createSparkToken('spk-2', '   ', 'dev-a', secret, now);
    expect(blankNameToken.senderName).toBe('A friend');

    const consumed = new Set<string>();
    expect(validateSparkToken(token, secret, now + 1000, consumed)).toEqual({ valid: true });

    // Tampered signature
    expect(
      validateSparkToken({ ...token, signature: 'bad' }, secret, now + 1000, consumed).valid
    ).toBe(false);

    // Expired token
    expect(
      validateSparkToken(token, secret, now + SPARK_EXPIRY_MS + 1, consumed).valid
    ).toBe(false);

    // Replay nonce
    consumed.add('spk-1');
    expect(validateSparkToken(token, secret, now + 1000, consumed).valid).toBe(false);

    // Rescue step progress
    const rescue = startSparkRescue(token);
    const mid = updateSparkRescueProgress(rescue, 250, now + 5000);
    expect(mid.completed).toBe(false);
    expect(mid.stepsWalked).toBe(250);

    const done = updateSparkRescueProgress(mid, 650, now + 9000);
    expect(done.completed).toBe(true);
    expect(done.stepsWalked).toBe(SPARK_STEPS_REQUIRED);

    // No-op once completed or expired
    expect(updateSparkRescueProgress(done, 700, now + 10000)).toBe(done);
    expect(updateSparkRescueProgress(rescue, 100, now + SPARK_EXPIRY_MS + 100)).toBe(rescue);
  });
});

describe('trialGuard & anti-reinstall protection', () => {
  const day1 = new Date(2026, 10, 18, 9, 0);
  const nextWeek = new Date(2026, 10, 26, 9, 0);

  it('denies free trial on reinstall or when StoreKit/CloudKit flags already exist', () => {
    expect(canOfferFreeTrial(true, null, false)).toBe(true);
    expect(canOfferFreeTrial(false, null, false)).toBe(false);
    expect(canOfferFreeTrial(true, 123456, false)).toBe(false);
    expect(canOfferFreeTrial(true, null, true)).toBe(false);
  });

  it('enforces Free vs Wick Pro entitlements and weekly video export quotas', () => {
    const freeEnt = createInitialEntitlement(day1, false, true, null, false);
    expect(freeEnt.isEligibleForIntroTrial).toBe(true);
    // Within 3-day reverse trial: all Pro features unlocked
    expect(isInReverseTrial(freeEnt, day1.getTime() + 1000)).toBe(true);
    expect(isInReverseTrial({ ...freeEnt, trialExpired: true }, day1.getTime() + 1000)).toBe(false);
    expect(isInReverseTrial({ ...freeEnt, firstInstallAt: 0 }, day1.getTime() + 1000)).toBe(false);
    expect(isInReverseTrial({ ...freeEnt, firstInstallAt: Number.NaN }, day1.getTime() + 1000)).toBe(
      false
    );
    expect(latchTrialExpiry({ ...freeEnt, trialExpired: true }, day1.getTime(), false).trialExpired).toBe(
      true
    );
    expect(latchTrialExpiry({ ...freeEnt, firstInstallAt: 0 }, day1.getTime(), false).trialExpired).toBe(
      true
    );
    expect(latchTrialExpiry(freeEnt, day1.getTime(), true).trialExpired).toBe(true);
    expect(latchTrialExpiry(freeEnt, day1.getTime() + 1000, false)).toBe(freeEnt);
    const missingQuota = { ...freeEnt, quotaElapsedMs: undefined as unknown as number };
    expect(creditShareQuota(missingQuota, 5).quotaElapsedMs).toBe(5);
    expect(recordVideoExport(missingQuota, day1).quotaElapsedMs).toBe(0);
    expect(creditShareQuota(freeEnt, Number.NaN)).toBe(freeEnt);
    expect(creditShareQuota(freeEnt, 0)).toBe(freeEnt);
    const friends = [
      { updatedAt: 1, id: 'old' },
      { updatedAt: 9, id: 'new' },
    ];
    expect(capFriendList(friends, { ...freeEnt, isPro: true }, day1.getTime())).toBe(friends);
    expect(
      capFriendList(friends, { ...freeEnt, trialExpired: true, firstInstallAt: 0 }, day1.getTime() + 1000)
    ).toEqual([{ updatedAt: 9, id: 'new' }]);
    expect(hasProAccess(freeEnt, day1.getTime() + 1000)).toBe(true);
    expect(canUseTheme(freeEnt, 'midnight_hearth', day1.getTime() + 1000)).toBe(true);
    expect(canUseGlassDome(freeEnt, day1.getTime() + 1000)).toBe(true);

    // After 3 days (72h+): gated behind Wick Pro
    expect(canUseTheme(freeEnt, 'obsidian_night')).toBe(true);
    expect(canUseTheme(freeEnt, 'midnight_hearth')).toBe(false);
    expect(canUseGlassDome(freeEnt)).toBe(false);
    expect(canAddFriend(freeEnt, 0)).toBe(true);
    expect(canAddFriend(freeEnt, 1)).toBe(false);
    expect(canExportPdf(freeEnt)).toBe(false);
    expect(getVisibleLedgerLimit(freeEnt)).toBe(FREE_MAX_LEDGER_DAYS);

    const afterDay3 = new Date(day1.getTime() + REVERSE_TRIAL_MS + 1000);
    const nextWeekAfterDay3 = new Date(afterDay3.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(canExportVideo(freeEnt, afterDay3)).toBe(true);
    expect(freeShareCardsRemaining(freeEnt, afterDay3.getTime())).toBe(1);
    expect(formatFreeShareCardsLabel(freeEnt, afterDay3.getTime())).toBe('1 free left');
    const afterExport = recordVideoExport(freeEnt, afterDay3);
    expect(canExportVideo(afterExport, afterDay3)).toBe(false);
    expect(formatFreeShareCardsLabel(afterExport, afterDay3.getTime())).toBe('0 free left');
    // A later calendar date alone does not refill the free share.
    expect(canExportVideo(afterExport, nextWeekAfterDay3)).toBe(false);
    const credited = creditShareQuota(afterExport, SHARE_QUOTA_WINDOW_MS);
    expect(canExportVideo(credited, nextWeekAfterDay3)).toBe(true);
    expect(formatFreeShareCardsLabel(credited, nextWeekAfterDay3.getTime())).toBe('1 free left');
    const newWeekExport = recordVideoExport(credited, nextWeekAfterDay3);
    expect(newWeekExport.freeVideoExportsThisWeek).toBe(1);
    expect(newWeekExport.quotaElapsedMs).toBe(0);

    const proEnt = createInitialEntitlement(day1, true, false, 1000, true);
    expect(canUseTheme(proEnt, 'midnight_hearth')).toBe(true);
    expect(canAddFriend(proEnt, 10)).toBe(true);
    expect(canExportVideo(proEnt, day1)).toBe(true);
    expect(freeShareCardsRemaining(proEnt, day1.getTime())).toBeNull();
    expect(formatFreeShareCardsLabel(proEnt, day1.getTime())).toBe('Unlimited');
    expect(canExportPdf(proEnt)).toBe(true);
    expect(getVisibleLedgerLimit(proEnt)).toBe(Number.MAX_SAFE_INTEGER);

    // Non-finite step progress defaults safely to 0
    const token = createSparkToken('spk-nan', 'Maya', 'dev-2', 'sec', 1000);
    const rescue = startSparkRescue(token);
    expect(updateSparkRescueProgress(rescue, Number.NaN, 2000).stepsWalked).toBe(0);
  });
});
