import { Accelerometer } from 'expo-sensors';
import { clamp } from '../engine/candleMath';

/**
 * Converts iPhone lateral acceleration x in [-1, 1] into a gentle upward
 * flame tilt angle (radians in [-0.22, 0.22]) fighting gravity.
 */
export function computeTiltAngle(accelX: number): number {
  const safeX = clamp(accelX, -0.6, 0.6);
  return -(safeX / 0.6) * 0.22;
}

export async function subscribeToTiltAngle(
  onTilt: (radians: number) => void
): Promise<() => void> {
  try {
    const available = await Accelerometer.isAvailableAsync();
    if (!available) {
      return () => {};
    }
    Accelerometer.setUpdateInterval(80);
    const sub = Accelerometer.addListener(({ x }) => {
      onTilt(computeTiltAngle(x));
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
