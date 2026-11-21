export const MIN_DAILY_STEP_GOAL = 2000;
export const MAX_DAILY_STEP_GOAL = 25000;
export const TIME_STEP_MINUTES = 15;

export function shiftClockMinutes(
  hour: number,
  minute: number,
  deltaMinutes: number
): { hour: number; minute: number } {
  const total = (((hour * 60 + minute + deltaMinutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export function formatHourMinute(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
