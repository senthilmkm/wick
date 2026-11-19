const mockIsHealthDataAvailable = jest.fn();
const mockRequestAuthorization = jest.fn();
const mockQueryStatisticsForQuantity = jest.fn();
const mockSubscribeToChanges = jest.fn();

jest.mock('@kingstinct/react-native-healthkit', () => ({
  __esModule: true,
  default: {
    isHealthDataAvailable: (...args: unknown[]) => mockIsHealthDataAvailable(...args),
    requestAuthorization: (...args: unknown[]) => mockRequestAuthorization(...args),
    queryStatisticsForQuantity: (...args: unknown[]) => mockQueryStatisticsForQuantity(...args),
    subscribeToChanges: (...args: unknown[]) => mockSubscribeToChanges(...args),
  },
  HKQuantityTypeIdentifier: {
    stepCount: 'HKQuantityTypeIdentifierStepCount',
  },
  HKStatisticsOptions: {
    cumulativeSum: 'cumulativeSum',
  },
}));

import {
  fetchTodayHealthKitSteps,
  subscribeToHealthKitSteps,
} from '../src/services/nativeHealthKit';

describe('nativeHealthKit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when HealthKit is unavailable or throws', async () => {
    mockIsHealthDataAvailable.mockResolvedValueOnce(false);
    expect(await fetchTodayHealthKitSteps()).toBeNull();

    mockIsHealthDataAvailable.mockRejectedValueOnce(new Error('not supported'));
    expect(await fetchTodayHealthKitSteps()).toBeNull();
  });

  it('requests authorization and returns rounded cumulative steps', async () => {
    mockIsHealthDataAvailable.mockResolvedValue(true);
    mockRequestAuthorization.mockResolvedValue(true);
    mockQueryStatisticsForQuantity.mockResolvedValueOnce({ sumQuantity: { quantity: 7432.6 } });
    expect(await fetchTodayHealthKitSteps()).toBe(7433);

    mockQueryStatisticsForQuantity.mockResolvedValueOnce({});
    expect(await fetchTodayHealthKitSteps()).toBe(0);
  });

  it('subscribes and cleans up both function and object subscriptions safely', () => {
    const fnUnsub = jest.fn();
    mockSubscribeToChanges.mockImplementationOnce((_id, cb: () => void) => {
      cb();
      return fnUnsub;
    });
    const onChange = jest.fn();
    const unsub1 = subscribeToHealthKitSteps(onChange);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsub1();
    expect(fnUnsub).toHaveBeenCalledTimes(1);

    const objRemove = jest.fn();
    mockSubscribeToChanges.mockReturnValueOnce({ remove: objRemove });
    const unsub2 = subscribeToHealthKitSteps(onChange);
    unsub2();
    expect(objRemove).toHaveBeenCalledTimes(1);

    mockSubscribeToChanges.mockImplementationOnce(() => {
      throw new Error('sub error');
    });
    const unsub3 = subscribeToHealthKitSteps(onChange);
    unsub3();
  });
});
