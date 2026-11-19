import Healthkit, {
  HKQuantityTypeIdentifier,
  HKStatisticsOptions,
} from '@kingstinct/react-native-healthkit';

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
