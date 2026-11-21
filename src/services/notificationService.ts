import * as Notifications from 'expo-notifications';
import { CandleState, UserSettings } from '../types/wick';

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') {
      return true;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

let scheduleQueue: Promise<void> = Promise.resolve();

export function scheduleMorningWakeNotification(settings: UserSettings): Promise<void> {
  const run = async (): Promise<void> => {
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        return;
      }
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Your wick is waiting',
          body: 'Take 5 steps or strike your lighter to ignite your candle for the day.',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: settings.wakeHour,
          minute: settings.wakeMinute,
        },
      });
      if (settings.eveningNudgeEnabled !== false) {
        const nudgeTotalMin = (settings.sleepHour * 60 + settings.sleepMinute - 90 + 1440) % 1440;
        const candleLabel = settings.candleName?.trim() || 'Your wick';
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${candleLabel} • Last Light`,
            body: 'A quick 10-minute evening walk keeps tonight’s wax band bright.',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: Math.floor(nudgeTotalMin / 60),
            minute: nudgeTotalMin % 60,
          },
        });
      }
    } catch {
      // Graceful no-op on simulator or denied permissions
    }
  };
  scheduleQueue = scheduleQueue.then(run, run);
  return scheduleQueue;
}

export async function notifySmokingGraceIfNeeded(
  prevState: CandleState,
  nextState: CandleState
): Promise<void> {
  if (prevState === 'SMOKING_GRACE' || nextState !== 'SMOKING_GRACE') {
    return;
  }
  try {
    const granted = await requestNotificationPermission();
    if (!granted) {
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your wick is smoking!',
        body: 'Walk 350 steps before midnight (or send a Spark) to save your streak.',
      },
      trigger: null,
    });
  } catch {
    // Graceful no-op
  }
}
