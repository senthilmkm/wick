const mockIsAvailableAsync = jest.fn();
const mockSetUpdateInterval = jest.fn();
const mockAddListener = jest.fn();

jest.mock('expo-sensors', () => ({
  Accelerometer: {
    isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
    setUpdateInterval: (...args: unknown[]) => mockSetUpdateInterval(...args),
    addListener: (...args: unknown[]) => mockAddListener(...args),
  },
}));

import { computeTiltAngle, subscribeToTiltAngle } from '../src/services/tiltService';

describe('tiltService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps lateral acceleration x to clamped opposite gravity tilt angle', () => {
    expect(computeTiltAngle(0)).toBeCloseTo(0, 5);
    expect(computeTiltAngle(0.6)).toBeCloseTo(-0.22, 5);
    expect(computeTiltAngle(-1.5)).toBeCloseTo(0.22, 5);
  });

  it('subscribes to accelerometer when available and handles unavailable/errors', async () => {
    const onTilt = jest.fn();
    mockIsAvailableAsync.mockResolvedValueOnce(false);
    const u1 = await subscribeToTiltAngle(onTilt);
    u1();

    const removeMock = jest.fn();
    mockIsAvailableAsync.mockResolvedValueOnce(true);
    mockAddListener.mockImplementationOnce((cb: (d: { x: number }) => void) => {
      cb({ x: 0.3 });
      return { remove: removeMock };
    });
    const u2 = await subscribeToTiltAngle(onTilt);
    expect(onTilt).toHaveBeenCalledWith(-0.11);
    u2();
    expect(removeMock).toHaveBeenCalledTimes(1);

    mockIsAvailableAsync.mockRejectedValueOnce(new Error('sensor err'));
    const u3 = await subscribeToTiltAngle(onTilt);
    u3();
  });
});
