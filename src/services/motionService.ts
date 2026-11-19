import { getLocalDateKey } from '../engine/candleMath';
import { evaluateCandleState } from '../engine/candleStateMachine';
import { CandleSnapshot, UserSettings } from '../types/wick';
import { LocalStorageService } from './storageService';

export interface MotionBridgeDriver {
  queryHealthKitStepsToday(): Promise<number>;
  isSleepFocusActive(): Promise<boolean>;
}

/**
 * Coordinates HealthKit (single source of truth) and foreground CMPedometer
 * delta updates through a strict serial promise queue to eliminate race conditions.
 */
export class MotionCoordinator {
  private queue: Promise<CandleSnapshot> = Promise.resolve({} as CandleSnapshot);
  private lastHealthKitSteps = 0;

  constructor(
    private readonly storage: LocalStorageService,
    private readonly motionBridge: MotionBridgeDriver
  ) {}

  private enqueue(
    fallback: CandleSnapshot,
    work: () => Promise<CandleSnapshot>
  ): Promise<CandleSnapshot> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => fallback);
    return next;
  }

  /**
   * Serializes state evaluations so concurrent HKObserverQuery wakeups and
   * CMPedometer ticks never overwrite each other out of order.
   */
  syncFromHealthKit(
    currentSnapshot: CandleSnapshot,
    settings: UserSettings,
    now: Date
  ): Promise<CandleSnapshot> {
    return this.enqueue(currentSnapshot, async () => {
      const latestSaved = this.storage.loadSnapshot() ?? currentSnapshot;
      const [hkSteps, sleepActive] = await Promise.all([
        this.motionBridge.queryHealthKitStepsToday(),
        this.motionBridge.isSleepFocusActive(),
      ]);

      this.lastHealthKitSteps = Math.max(0, Math.round(hkSteps));
      const { snapshot, completedDayLayer } = evaluateCandleState({
        snapshot: latestSaved,
        stepsToday: this.lastHealthKitSteps,
        settings,
        now,
        isSleepFocusActive: sleepActive,
      });

      if (completedDayLayer) {
        this.storage.appendWaxLayer(completedDayLayer);
      }
      this.storage.saveSnapshot(snapshot, now.getTime());
      return snapshot;
    });
  }

  /**
   * Applies live foreground CMPedometer delta on top of the latest HealthKit baseline
   * without double-counting Apple Watch + iPhone steps.
   */
  applyForegroundPedometerDelta(
    currentSnapshot: CandleSnapshot,
    pedometerSessionSteps: number,
    settings: UserSettings,
    now: Date
  ): Promise<CandleSnapshot> {
    return this.enqueue(currentSnapshot, async () => {
      const latestSaved = this.storage.loadSnapshot() ?? currentSnapshot;
      const isSameDay = latestSaved.dateKey === getLocalDateKey(now);
      if (!isSameDay) {
        this.lastHealthKitSteps = 0;
      }
      const deltaSteps = Math.max(0, Math.round(pedometerSessionSteps));
      const mergedSteps = isSameDay
        ? Math.max(latestSaved.stepsToday, this.lastHealthKitSteps + deltaSteps)
        : deltaSteps;

      const { snapshot, completedDayLayer } = evaluateCandleState({
        snapshot: latestSaved,
        stepsToday: mergedSteps,
        settings,
        now,
        isSleepFocusActive: false,
      });

      if (completedDayLayer) {
        this.storage.appendWaxLayer(completedDayLayer);
      }
      this.storage.saveSnapshot(snapshot, now.getTime());
      return snapshot;
    });
  }
}
