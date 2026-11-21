import {
  canAskForSpark,
  canSendNudge,
  classifySparkRescue,
  friendArrivalLine,
  friendListChanged,
  nextFriendArrival,
  friendOwnerName,
  isForgeablePairLink,
  isVisitorCandleName,
  NUDGE_COOLDOWN_MS,
  nudgeBody,
  nudgeShareMessage,
  parseSparkShareCreate,
  pickIncomingSpark,
  readIdList,
  readNudgeCooldowns,
  rememberId,
  sparkAskText,
  sparkAskUsesRescue,
  visitorRecordName,
  withNudgeCooldown,
} from '../src/engine/circleFlow';
import { FriendCandle } from '../src/types/wick';

const friend = (id: string, updatedAt: number, state: FriendCandle['state'] = 'STEADY'): FriendCandle => ({
  id,
  displayName: id,
  state,
  flameIntensity: 0.4,
  streakDays: 3,
  updatedAt,
});

describe('circle pairing, nudge, and spark regression', () => {
  it('rejects forged pair links and keeps iCloud share links', () => {
    expect(isForgeablePairLink('https://senthilmkm.github.io/wick/pair.html?id=1&name=Maya&streak=9')).toBe(true);
    expect(isForgeablePairLink('wick://circle/pair?id=1')).toBe(true);
    expect(isForgeablePairLink('https://www.icloud.com/share/abc')).toBe(false);
  });

  it('asks for a Spark only when the flame is in trouble', () => {
    expect(canAskForSpark('BLAZING')).toBe(false);
    expect(canAskForSpark('STEADY')).toBe(false);
    expect(canAskForSpark('FLICKERING')).toBe(true);
    expect(canAskForSpark('DYING_EMBER')).toBe(true);
    expect(canAskForSpark('SMOKING_GRACE')).toBe(true);
    expect(canAskForSpark('EXTINGUISHED')).toBe(true);
  });

  it('sends one nudge per friend every five minutes and addresses their iCloud owner', () => {
    expect(canSendNudge(null, 1_000)).toBe(true);
    expect(canSendNudge(Number.NaN, 1_000)).toBe(true);
    expect(canSendNudge(1_000, Number.NaN)).toBe(false);
    expect(canSendNudge(1_000, 1_000 + NUDGE_COOLDOWN_MS - 1)).toBe(false);
    expect(canSendNudge(1_000, 1_000 + NUDGE_COOLDOWN_MS)).toBe(true);
    expect(readNudgeCooldowns(undefined)).toEqual({});
    expect(readNudgeCooldowns('not-json')).toEqual({});
    expect(readNudgeCooldowns(JSON.stringify({ a: 5, b: 'no' }))).toEqual({ a: 5 });
    expect(withNudgeCooldown({ a: 5 }, 'b', 9)).toEqual({ a: 5, b: 9 });
    expect(nudgeBody({ state: 'SMOKING_GRACE', streakDays: 4 })).toBe(
      'Your Wick candle is smoking grace. A short walk keeps your 4-day streak glowing.'
    );
    expect(
      nudgeShareMessage({ displayName: 'Maya', state: 'SMOKING_GRACE', streakDays: 4 })
    ).toBe(
      'Maya, your Wick candle is smoking grace. A short walk keeps your 4-day streak glowing.'
    );
    expect(nudgeShareMessage({ displayName: '  ', state: 'BLAZING', streakDays: 1 })).toContain('Friend, ');
    expect(sparkAskUsesRescue(0)).toBe(false);
    expect(sparkAskUsesRescue(Number.NaN)).toBe(false);
    expect(sparkAskUsesRescue(1)).toBe(true);
    expect(sparkAskText()).toContain('500 steps');
    expect(visitorRecordName('  abc  ')).toBe('visitor_abc');
    expect(visitorRecordName('   ')).toBeNull();
    expect(isVisitorCandleName('visitor_abc')).toBe(true);
    expect(isVisitorCandleName('visitor_')).toBe(false);
    expect(isVisitorCandleName('myCandleStatus')).toBe(false);
    expect(friendOwnerName('owner-name:myCandleStatus')).toBe('owner-name');
    expect(friendOwnerName('local-only')).toBeNull();
    expect(friendOwnerName(':missing')).toBeNull();
    expect(friendOwnerName('   :record')).toBeNull();
  });

  it('keeps a paired friend off the lock screen payload and on the Circle list', () => {
    const older = friend('a:one', 10);
    const newer = friend('b:two', 20, 'BLAZING');
    expect(friendListChanged([older], [newer])).toBe(true);
    expect(isVisitorCandleName(visitorRecordName('maya-1') ?? '')).toBe(true);
  });

  it('applies a completed Spark only when the candle can burn, and keeps it while night or a dome is active', () => {
    const applied = new Set<string>();
    const announced = new Set<string>();
    expect(classifySparkRescue('BLAZING', 100, 's1', applied, announced)).toBe('ignore');
    expect(classifySparkRescue('SMOKING_GRACE', Number.NaN, 's1', applied, announced)).toBe('ignore');
    expect(classifySparkRescue('SMOKING_GRACE', 500, 's1', applied, announced)).toBe('apply');
    applied.add('s1');
    expect(classifySparkRescue('SMOKING_GRACE', 500, 's1', applied, announced)).toBe('ignore');
    expect(classifySparkRescue('NIGHT_SLEEP', 500, 's2', applied, announced)).toBe('wait');
    announced.add('s2');
    expect(classifySparkRescue('GLASS_DOME', 500, 's2', applied, announced)).toBe('wait-silent');
    expect(classifySparkRescue('UNLIT_MORNING', 500, 's2', applied, announced)).toBe('apply');
  });

  it('says a friend is here the first time their candle appears', () => {
    expect(friendArrivalLine('Alex')).toBe('Alex is here.');
    expect(friendArrivalLine('  ')).toBe('A friend is here.');
    expect(nextFriendArrival(['a'], [{ id: 'a', displayName: 'Alex' }])).toBeNull();
    expect(nextFriendArrival(['a'], [{ id: 'b', displayName: 'Alex' }])).toEqual({
      id: 'b',
      name: 'Alex',
    });
    expect(nextFriendArrival([], [{ id: ' ', displayName: 'Alex' }])).toBeNull();
  });

  it('keeps the lock screen candle still when a friend refresh has the same fields', () => {
    const current = [friend('a:one', 10)];
    expect(friendListChanged(current, current)).toBe(false);
    expect(friendListChanged(current, [])).toBe(true);
    expect(friendListChanged(current, [friend('a:one', 11)])).toBe(true);
    expect(friendListChanged(current, [{ ...current[0], displayName: 'Maya' }])).toBe(true);
    expect(friendListChanged(current, [{ ...current[0], state: 'BLAZING' }])).toBe(true);
    expect(friendListChanged(current, [{ ...current[0], flameIntensity: 0.9 }])).toBe(true);
    expect(friendListChanged(current, [{ ...current[0], streakDays: 8 }])).toBe(true);
  });

  it('remembers seen nudges and starts the earliest open Spark', () => {
    expect(readIdList(undefined)).toEqual([]);
    expect(readIdList('nope')).toEqual([]);
    expect(readIdList(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(readIdList(JSON.stringify(['n1', '', 2, 'n2']))).toEqual(['n1', 'n2']);
    expect(rememberId(['n1'], '')).toEqual(['n1']);
    expect(rememberId(['n1', 'n2'], 'n1')).toEqual(['n2', 'n1']);
    expect(rememberId(['a', 'b', 'c'], 'd', 2)).toEqual(['c', 'd']);

    const open = { sparkId: 's-open', senderName: 'Maya', stepsRequired: 500, expiresAt: 5_000 };
    const sooner = { sparkId: 's-soon', senderName: 'Alex', stepsRequired: 700, expiresAt: 4_000 };
    expect(pickIncomingSpark([open], Number.NaN, null, new Set())).toBeNull();
    expect(pickIncomingSpark([open], 1_000, 'busy', new Set())).toBeNull();
    expect(
      pickIncomingSpark(
        [
          { sparkId: '', senderName: 'Maya', stepsRequired: 500, expiresAt: 5_000 },
          { ...open, sparkId: 'seen' },
          { ...open, expiresAt: 500 },
          { ...open, expiresAt: Number.NaN },
          { ...open, stepsRequired: 499 },
          { ...open, stepsRequired: Number.NaN },
        ],
        1_000,
        null,
        new Set(['seen'])
      )
    ).toBeNull();
    expect(pickIncomingSpark([open, sooner], 1_000, null, new Set())?.sparkId).toBe('s-soon');
  });

  it('reads a Circle delivery and a textable Spark link', () => {
    expect(parseSparkShareCreate('https://www.icloud.com/share/spark')).toEqual({
      delivery: 'link',
      shareUrl: 'https://www.icloud.com/share/spark',
    });
    expect(parseSparkShareCreate('')).toBeNull();
    expect(parseSparkShareCreate(null)).toBeNull();
    expect(parseSparkShareCreate(4)).toBeNull();
    expect(parseSparkShareCreate({ delivery: 'circle' })).toEqual({ delivery: 'circle', shareUrl: null });
    expect(parseSparkShareCreate({ delivery: 'link', shareUrl: 'https://www.icloud.com/share/s' })).toEqual({
      delivery: 'link',
      shareUrl: 'https://www.icloud.com/share/s',
    });
    expect(parseSparkShareCreate({ delivery: 'link', shareUrl: '' })).toBeNull();
    expect(parseSparkShareCreate({ delivery: 'other' })).toBeNull();
  });
});
