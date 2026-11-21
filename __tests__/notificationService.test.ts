const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockCancelAll = jest.fn();
const mockSchedule = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  cancelAllScheduledNotificationsAsync: (...args: unknown[]) => mockCancelAll(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

import {
  notifySmokingGraceIfNeeded,
  presentNudgeNotification,
  requestNotificationPermission,
  scheduleMorningWakeNotification,
} from '../src/services/notificationService';
import { DEFAULT_SETTINGS } from '../src/services/storageService';

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests notification permissions and handles denials/errors', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    expect(await requestNotificationPermission()).toBe(true);

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    expect(await requestNotificationPermission()).toBe(false);

    mockGetPermissionsAsync.mockRejectedValueOnce(new Error('fail'));
    expect(await requestNotificationPermission()).toBe(false);
  });

  it('schedules morning wake notification when permitted and skips when denied/throws', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await scheduleMorningWakeNotification(DEFAULT_SETTINGS);
    expect(mockSchedule).not.toHaveBeenCalled();

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    await scheduleMorningWakeNotification(DEFAULT_SETTINGS);
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledTimes(2);

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    await scheduleMorningWakeNotification({
      ...DEFAULT_SETTINGS,
      eveningNudgeEnabled: false,
      candleName: 'Solace',
    });
    expect(mockSchedule).toHaveBeenCalledTimes(3);

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    await scheduleMorningWakeNotification({
      ...DEFAULT_SETTINGS,
      candleName: 'Solace',
    });
    expect(mockSchedule).toHaveBeenCalledTimes(5);

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockCancelAll.mockRejectedValueOnce(new Error('boom'));
    await scheduleMorningWakeNotification(DEFAULT_SETTINGS);
  });

  it('sends immediate smoking grace notification only on transition into SMOKING_GRACE', async () => {
    await notifySmokingGraceIfNeeded('SMOKING_GRACE', 'SMOKING_GRACE');
    await notifySmokingGraceIfNeeded('BLAZING', 'STEADY');
    expect(mockSchedule).not.toHaveBeenCalled();

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await notifySmokingGraceIfNeeded('DYING_EMBER', 'SMOKING_GRACE');
    expect(mockSchedule).not.toHaveBeenCalled();

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    await notifySmokingGraceIfNeeded('DYING_EMBER', 'SMOKING_GRACE');
    expect(mockSchedule).toHaveBeenCalledTimes(1);

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockSchedule.mockRejectedValueOnce(new Error('boom'));
    await notifySmokingGraceIfNeeded('DYING_EMBER', 'SMOKING_GRACE');
  });

  it('shows an incoming nudge when notifications are allowed', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await presentNudgeNotification('Maya', 'Walk');
    expect(mockSchedule).not.toHaveBeenCalled();

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    await presentNudgeNotification('Maya', 'Walk');
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: { title: 'Maya nudged your wick', body: 'Walk' },
        trigger: null,
      })
    );

    mockGetPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockSchedule.mockRejectedValueOnce(new Error('boom'));
    await presentNudgeNotification('Maya', 'Walk');
  });
});
