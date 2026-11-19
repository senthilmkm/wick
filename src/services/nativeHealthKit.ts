import Healthkit, {
  HKQuantityTypeIdentifier,
  HKStatisticsOptions,
} from '@kingstinct/react-native-healthkit';
import { Pedometer } from 'expo-sensors';

/**
 * Requests HealthKit step-count read access (if not already granted)
 * and returns today's deduplicated Apple Watch + iPhone step total.
 */
export async function fetchTodayHealthKitSteps(): Promise<number | null> {
  try {
    const available = await Healthkit.isHealthDataAvailable();
    if (!available) {
      return null;
    }

    await Healthkit.requestAuthorization([HKQuantityTypeIdentifier.stepCount]);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const stats = await Healthkit.queryStatisticsForQuantity(
      HKQuantityTypeIdentifier.stepCount,
      [HKStatisticsOptions.cumulativeSum],
      startOfDay,
      now
    );

    const qty = stats?.sumQuantity?.quantity;
    return typeof qty === 'number' && Number.isFinite(qty) ? Math.max(0, Math.round(qty)) : 0;
  } catch {
    return null;
  }
}

/**
 * Subscribes to live HealthKit step-count sample changes while the app is open.
 */
export function subscribeToHealthKitSteps(onChange: () => void): () => void {
  try {
    const sub: unknown = Healthkit.subscribeToChanges(HKQuantityTypeIdentifier.stepCount, () => {
      onChange();
    });
    return () => {
      if (typeof sub === 'function') {
        (sub as () => void)();
      } else if (sub && typeof (sub as { remove?: () => void }).remove === 'function') {
        (sub as { remove: () => void }).remove();
      }
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
