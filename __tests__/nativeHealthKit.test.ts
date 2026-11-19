const mockIsHealthDataAvailable = jest.fn();
const mockRequestAuthorization = jest.fn();
const mockQueryStatisticsForQuantity = jest.fn();
const mockSubscribeToChanges = jest.fn();
const mockPedometerAvailable = jest.fn();
const mockPedometerPermission = jest.fn();
const mockWatchStepCount = jest.fn();

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

jest.mock('expo-sensors', () => ({
  Pedometer: {
    isAvailableAsync: (...args: unknown[]) => mockPedometerAvailable(...args),
    requestPermissionsAsync: (...args: unknown[]) => mockPedometerPermission(...args),
    watchStepCount: (...args: unknown[]) => mockWatchStepCount(...args),
  },
}));

import {
  fetchTodayHealthKitSteps,
  resetHealthKitSessionCache,
  subscribeToHealthKitSteps,
  subscribeToLivePedometer,
} from '../src/services/nativeHealthKit';

describe('nativeHealthKit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHealthKitSessionCache();
  });

  it('returns null when HealthKit is unavailable or throws', async () => {
    mockIsHealthDataAvailable.mockResolvedValueOnce(false);
    expect(await fetchTodayHealthKitSteps()).toBeNull();

    resetHealthKitSessionCache();
    mockIsHealthDataAvailable.mockRejectedValueOnce(new Error('not supported'));
    expect(await fetchTodayHealthKitSteps()).toBeNull();
  });

  it('requests authorization once per session and returns rounded cumulative steps', async () => {
    mockIsHealthDataAvailable.mockResolvedValue(true);
    mockRequestAuthorization.mockResolvedValue(true);
    mockQueryStatisticsForQuantity.mockResolvedValueOnce({ sumQuantity: { quantity: 7432.6 } });
    expect(await fetchTodayHealthKitSteps()).toBe(7433);

    // Second call skips isHealthDataAvailable & requestAuthorization
    mockQueryStatisticsForQuantity.mockResolvedValueOnce({});
    expect(await fetchTodayHealthKitSteps()).toBe(0);
    expect(mockIsHealthDataAvailable).toHaveBeenCalledTimes(1);
    expect(mockRequestAuthorization).toHaveBeenCalledTimes(1);
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

  it('streams live CoreMotion pedometer steps and handles unavailable/denied states', async () => {
    const onDelta = jest.fn();

    mockPedometerAvailable.mockResolvedValueOnce(false);
    const u1 = await subscribeToLivePedometer(onDelta);
    u1();

    mockPedometerAvailable.mockResolvedValueOnce(true);
    mockPedometerPermission.mockResolvedValueOnce({ granted: false });
    const u2 = await subscribeToLivePedometer(onDelta);
    u2();

    const removeMock = jest.fn();
    mockPedometerAvailable.mockResolvedValueOnce(true);
    mockPedometerPermission.mockResolvedValueOnce({ granted: true });
    mockWatchStepCount.mockImplementationOnce((cb: (r: { steps: number }) => void) => {
      cb({ steps: 14.2 });
      return { remove: removeMock };
    });
    const u3 = await subscribeToLivePedometer(onDelta);
    expect(onDelta).toHaveBeenCalledWith(14);
    u3();
    expect(removeMock).toHaveBeenCalledTimes(1);

    mockPedometerAvailable.mockRejectedValueOnce(new Error('motion err'));
    const u4 = await subscribeToLivePedometer(onDelta);
    u4();
  });
});
