import Healthkit, {
  HKQuantityTypeIdentifier,
  HKStatisticsOptions,
} from '@kingstinct/react-native-healthkit';
import { Pedometer } from 'expo-sensors';

let cachedAvailable: boolean | null = null;
let authRequested = false;
let inFlightAuth: Promise<void> | null = null;

/**
 * Resets cached HealthKit availability/authorization flags (used in tests).
 */
export function resetHealthKitSessionCache(): void {
  cachedAvailable = null;
  authRequested = false;
  inFlightAuth = null;
}

/**
 * Requests HealthKit step-count read access once per session (industry standard)
 * and immediately queries today's deduplicated Apple Watch + iPhone step total.
 */
export async function fetchTodayHealthKitSteps(): Promise<number | null> {
  try {
    if (cachedAvailable === null) {
      cachedAvailable = await Healthkit.isHealthDataAvailable();
    }
    if (!cachedAvailable) {
      return null;
    }

    if (!authRequested) {
      if (!inFlightAuth) {
        inFlightAuth = Healthkit.requestAuthorization([HKQuantityTypeIdentifier.stepCount]).then(
          () => {
            authRequested = true;
          }
        );
      }
      try {
        await inFlightAuth;
      } finally {
        inFlightAuth = null;
      }
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const stats = await Healthkit.queryStatisticsForQuantity(
      HKQuantityTypeIdentifier.stepCount,
      [HKStatisticsOptions.cumulativeSum],
      startOfDay,
      now
    );

    const qty = stats?.sumQuantity?.quantity;
    if (typeof qty !== 'number' || !Number.isFinite(qty)) {
      return null;
    }
    return Math.max(0, Math.round(qty));
  } catch {
    return null;
  }
}

/**
 * Subscribes to live HealthKit step-count sample changes while the app is open.
 */
export function subscribeToHealthKitSteps(onChange: () => void): () => void {
  try {
    let disposed = false;
    let resolvedUnsub: (() => unknown) | { remove: () => unknown } | null = null;
    const sub: unknown = Healthkit.subscribeToChanges(HKQuantityTypeIdentifier.stepCount, () => {
      onChange();
    });
    const invokeUnsub = (target: unknown) => {
      if (typeof target === 'function') {
        void Promise.resolve((target as () => unknown)()).catch(() => {});
      } else if (target && typeof (target as { remove?: () => unknown }).remove === 'function') {
        void Promise.resolve((target as { remove: () => unknown }).remove()).catch(() => {});
      }
    };
    if (sub && typeof (sub as Promise<unknown>).then === 'function') {
      void (sub as Promise<unknown>)
        .then((u) => {
          resolvedUnsub = u as typeof resolvedUnsub;
          if (disposed) {
            invokeUnsub(u);
          }
        })
        .catch(() => {});
    } else {
      resolvedUnsub = sub as typeof resolvedUnsub;
    }
    return () => {
      disposed = true;
      invokeUnsub(resolvedUnsub);
    };
  } catch {
    return () => {};
  }
}

/**
 * Streams live foreground step-by-step updates from CoreMotion (CMPedometer)
 * so the candle & step counter update immediately while walking.
 */
export async function subscribeToLivePedometer(
  onStepDelta: (sessionSteps: number) => void
): Promise<() => void> {
  try {
    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      return () => {};
    }
    const { granted } = await Pedometer.requestPermissionsAsync();
    if (!granted) {
      return () => {};
    }
    const sub = Pedometer.watchStepCount((result) => {
      onStepDelta(Math.max(0, Math.round(result.steps)));
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
