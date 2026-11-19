import * as Brightness from 'expo-brightness';

export async function enableLanternBrightness(): Promise<number | null> {
  try {
    const previous = await Brightness.getBrightnessAsync();
    await Brightness.setBrightnessAsync(1.0);
    return previous;
  } catch {
    return null;
  }
}

export async function restoreLanternBrightness(previousBrightness: number | null): Promise<void> {
  if (previousBrightness === null) {
    return;
  }
  try {
    await Brightness.setBrightnessAsync(previousBrightness);
  } catch {
    // Graceful no-op on simulator or restricted devices
  }
}
