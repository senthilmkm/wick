import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MMKV } from 'react-native-mmkv';
import { PaywallModal, PaywallReason } from './src/components/PaywallModal';
import { getThemeById } from './src/constants/themes';
import { getLocalDateKey, getLocalWeekKey, isNighttimeWindow } from './src/engine/candleMath';
import {
  activateGlassDome,
  createMorningSnapshot,
  evaluateCandleState,
  igniteWithLighter,
  removeGlassDome,
  triggerNightBlowOut,
} from './src/engine/candleStateMachine';
import {
  buildSparkUniversalLink,
  createSparkToken,
  parseSparkLink,
  startSparkRescue,
  updateSparkRescueProgress,
} from './src/engine/sparkEngine';
import {
  canAddFriend,
  canExportPdf,
  canExportVideo,
  canOfferFreeTrial,
  canUseGlassDome,
  canUseTheme,
  hasProAccess,
  recordVideoExport,
} from './src/engine/trialGuard';
import { CircleScreen } from './src/screens/CircleScreen';
import { FlameScreen } from './src/screens/FlameScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { SanctuaryScreen } from './src/screens/SanctuaryScreen';
import { WaxLedgerScreen } from './src/screens/WaxLedgerScreen';
import { AudioBlowDetector, computeWindShakeIntensity } from './src/services/audioBlowService';
import {
  checkProEntitlement,
  initBilling,
  purchaseProPackage,
  restoreProPurchases,
} from './src/services/billingService';
import { CloudKitCircleService } from './src/services/cloudKitService';
import {
  enableLanternBrightness,
  restoreLanternBrightness,
} from './src/services/lanternService';
import { buildWaxLedgerPdfHtml } from './src/services/exportService';
import {
  createNativeCloudKitDriver,
  reloadNativeWidgets,
  writeNativeWidgetSnapshot,
} from './src/services/nativeCloudBridge';
import {
  fetchTodayHealthKitSteps,
  subscribeToHealthKitSteps,
  subscribeToLivePedometer,
} from './src/services/nativeHealthKit';
import {
  notifySmokingGraceIfNeeded,
  scheduleMorningWakeNotification,
} from './src/services/notificationService';
import { playMatchStrikeSound } from './src/services/soundService';
import { DEFAULT_SETTINGS, LocalStorageService } from './src/services/storageService';
import { subscribeToTiltAngle } from './src/services/tiltService';
import {
  ActiveSparkRescue,
  CandleSnapshot,
  EntitlementState,
  FriendCandle,
  ThemeId,
  UserSettings,
  WaxLayer,
} from './src/types/wick';

type TabKey = 'flame' | 'ledger' | 'circle' | 'sanctuary';

const memoryFallback = new Map<string, string>();
let mmkvInstance: MMKV | null = null;
try {
  mmkvInstance = new MMKV({ id: 'wick.local.v1' });
} catch {
  mmkvInstance = null;
}

const kvGet = (key: string): string | undefined => {
  try {
    return mmkvInstance ? mmkvInstance.getString(key) : memoryFallback.get(key);
  } catch {
    return memoryFallback.get(key);
  }
};

const kvSet = (key: string, val: string): void => {
  memoryFallback.set(key, val);
  try {
    mmkvInstance?.set(key, val);
  } catch {
    // fallback already stored in memoryFallback
  }
};

const KEY_ONBOARDED = 'wick.onboarded.v1';
const KEY_PRO_CACHE = 'wick.pro_cached.v1';
const KEY_FRIENDS = 'wick.friends.v1';
const SECURE_ONBOARDED = 'wick_onboarded_v1';
const SECURE_SETTINGS = 'wick_settings_v1';
const SECURE_SNAPSHOT = 'wick_snapshot_v1';
const SECURE_PRO = 'wick_pro_v1';
const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

const storageService = new LocalStorageService(
  {
    getString: kvGet,
    set: kvSet,
  },
  {
    getItemAsync: (k) => SecureStore.getItemAsync(k),
    setItemAsync: (k, v) => SecureStore.setItemAsync(k, v),
  },
  {
    writeAppGroupSnapshot: (payload) => {
      kvSet('wick.widget.snapshot', payload);
      writeNativeWidgetSnapshot(payload);
    },
    reloadAllTimelines: () => {
      reloadNativeWidgets();
    },
  }
);

const cloudKitService = new CloudKitCircleService(createNativeCloudKitDriver());

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { errorMessage: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { errorMessage: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { errorMessage: error?.message ?? 'Unexpected error' };
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <View style={[styles.flex, styles.errorFallback]}>
          <Text style={styles.errorTitle}>Wick recovered from an issue</Text>
          <Text style={styles.errorBody}>{this.state.errorMessage}</Text>
          <Pressable
            style={styles.errorBtn}
            onPress={() => this.setState({ errorMessage: null })}
          >
            <Text style={styles.errorBtnText}>Reload Candle</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <WickRoot />
    </AppErrorBoundary>
  );
}

function WickRoot() {
  const [hydrated, setHydrated] = useState<boolean>(() => mmkvInstance !== null);
  const [onboarded, setOnboarded] = useState<boolean>(() => kvGet(KEY_ONBOARDED) === '1');
  const [activeTab, setActiveTab] = useState<TabKey>('flame');
  const [tabsVisible, setTabsVisible] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<PaywallReason | null>(null);
  const [resumeTick, setResumeTick] = useState(0);
  const [windIntensity, setWindIntensity] = useState(0);
  const [tiltAngle, setTiltAngle] = useState(0);
  const previousBrightnessRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [settings, setSettings] = useState<UserSettings>(() => storageService.loadSettings());
  const [waxLayers, setWaxLayers] = useState<WaxLayer[]>(() => storageService.loadWaxLayers());
  const [friends, setFriends] = useState<FriendCandle[]>(() => {
    const raw = kvGet(KEY_FRIENDS);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as FriendCandle[]) : [];
    } catch {
      return [];
    }
  });
  const [activeRescue, setActiveRescue] = useState<ActiveSparkRescue | null>(null);
  const rescueBaselineStepsRef = useRef<number | null>(null);
  const hkBaselineStepsRef = useRef<number>(0);
  const pedometerSessionOffsetRef = useRef<number>(0);
  const [entitlement, setEntitlement] = useState<EntitlementState>(() => ({
    isPro: kvGet(KEY_PRO_CACHE) === '1',
    isEligibleForIntroTrial: true,
    starterDomeClaimed: false,
    firstInstallAt: Date.now(),
    freeVideoExportsThisWeek: 0,
    weekKey: getLocalWeekKey(new Date()),
  }));

  const [snapshot, setSnapshot] = useState<CandleSnapshot>(() => {
    const saved = storageService.loadSnapshot();
    if (saved) {
      return saved;
    }
    return createMorningSnapshot(getLocalDateKey(new Date()), Date.now(), 0, 0, 1);
  });

  const theme = getThemeById(settings.themeId);

  const showToast = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setStatusMessage(null), 3200);
  }, []);

  const applyStepTotal = useCallback(
    (steps: number) => {
      setSnapshot((prev) => {
        const res = evaluateCandleState({
          snapshot: prev,
          stepsToday: steps,
          settings,
          now: new Date(),
        });
        void notifySmokingGraceIfNeeded(prev.state, res.snapshot.state);
        if (res.completedDayLayer) {
          const nextLayers = storageService.appendWaxLayer(res.completedDayLayer);
          setWaxLayers(nextLayers);
        }
        storageService.saveSnapshot(res.snapshot, Date.now());
        void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(res.snapshot)).catch(() => {});
        void cloudKitService.syncOwnCandleIfNeeded('Friend', res.snapshot, Date.now()).catch(() => {});
        return res.snapshot;
      });

      // Advance active 500-step Spark Rescue if user is rescuing a friend
      setActiveRescue((prevRescue) => {
        if (!prevRescue || prevRescue.completed) {
          return prevRescue;
        }
        if (rescueBaselineStepsRef.current === null) {
          rescueBaselineStepsRef.current = steps;
        }
        const walked = Math.max(0, steps - rescueBaselineStepsRef.current);
        const updated = updateSparkRescueProgress(prevRescue, walked, Date.now());
        if (updated.completed && !prevRescue.completed) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast(`500 steps done! ${updated.senderName}'s wick is reignited!`);
        }
        return updated;
      });
    },
    [settings, showToast]
  );

  const syncHealthKit = useCallback(async () => {
    const steps = await fetchTodayHealthKitSteps();
    if (steps === null) {
      return;
    }
    hkBaselineStepsRef.current = steps;
    pedometerSessionOffsetRef.current = 0;
    applyStepTotal(steps);
  }, [applyStepTotal]);

  // Initialize Keychain anti-abuse state, durable onboarding/settings fallback, and billing on mount
  useEffect(() => {
    let mounted = true;
    initBilling(REVENUECAT_IOS_KEY);
    (async () => {
      const now = new Date();
      const weekKey = getLocalWeekKey(now);
      const [
        firstInstall,
        domeClaimed,
        quota,
        remotePro,
        secOnboarded,
        secSettings,
        secSnapshot,
        secPro,
      ] = await Promise.all([
        storageService.ensureFirstInstallRecorded(now.getTime()),
        storageService.isStarterDomeClaimed(),
        storageService.loadVideoExportQuota(weekKey),
        checkProEntitlement(REVENUECAT_IOS_KEY),
        SecureStore.getItemAsync(SECURE_ONBOARDED).catch(() => null),
        SecureStore.getItemAsync(SECURE_SETTINGS).catch(() => null),
        SecureStore.getItemAsync(SECURE_SNAPSHOT).catch(() => null),
        SecureStore.getItemAsync(SECURE_PRO).catch(() => null),
      ]);
      if (!mounted) {
        return;
      }
      if (secOnboarded === '1') {
        kvSet(KEY_ONBOARDED, '1');
        setOnboarded(true);
      }
      if (secSettings) {
        try {
          const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(secSettings) } as UserSettings;
          setSettings(parsed);
          storageService.saveSettings(parsed);
        } catch {
          // ignore corrupt fallback
        }
      }
      if (secSnapshot) {
        try {
          const parsedSnap = JSON.parse(secSnapshot) as CandleSnapshot;
          setSnapshot(parsedSnap);
          storageService.saveSnapshot(parsedSnap, now.getTime());
        } catch {
          // ignore corrupt fallback
        }
      }
      const isProUser = remotePro || secPro === '1';
      if (isProUser) {
        kvSet(KEY_PRO_CACHE, '1');
      }
      setEntitlement((prev) => ({
        ...prev,
        isPro: prev.isPro || isProUser,
        firstInstallAt: firstInstall,
        starterDomeClaimed: domeClaimed,
        isEligibleForIntroTrial: canOfferFreeTrial(true, firstInstall === now.getTime() ? null : firstInstall, domeClaimed),
        freeVideoExportsThisWeek: quota.count,
        weekKey: quota.weekKey,
      }));
      if (!isProUser && now.getTime() - firstInstall >= 3 * 24 * 60 * 60 * 1000) {
        setSettings((prevSettings) => {
          if (prevSettings.themeId === 'obsidian_night') {
            return prevSettings;
          }
          const reverted = { ...prevSettings, themeId: 'obsidian_night' as ThemeId };
          storageService.saveSettings(reverted);
          return reverted;
        });
      }
      setHydrated(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Handle incoming Spark Rescue & Circle Pair links
  useEffect(() => {
    const handleIncomingUrl = (url: string | null) => {
      if (!url) {
        return;
      }
      if (url.includes('circle/pair') || url.includes('pair.html')) {
        const idMatch = /[?&]id=([^&]+)/.exec(url);
        const nameMatch = /[?&]name=([^&]+)/.exec(url);
        const streakMatch = /[?&]streak=(\d+)/.exec(url);
        const friendId = idMatch ? decodeURIComponent(idMatch[1]) : `friend_${Date.now()}`;
        const displayName = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Friend';
        const streakDays = streakMatch ? Number(streakMatch[1]) : 1;

        setFriends((prev) => {
          if (prev.some((f) => f.id === friendId)) {
            return prev;
          }
          const next: FriendCandle[] = [
            ...prev,
            {
              id: friendId,
              displayName,
              state: 'BLAZING',
              flameIntensity: 0.9,
              streakDays,
              updatedAt: Date.now(),
            },
          ];
          kvSet(KEY_FRIENDS, JSON.stringify(next));
          return next;
        });
        setActiveTab('circle');
        showToast(`${displayName} paired to your Circle!`);
        return;
      }

      const token = parseSparkLink(url);
      if (!token) {
        return;
      }
      if (Date.now() > token.expiresAt) {
        showToast('This Spark Request has expired.');
        return;
      }
      rescueBaselineStepsRef.current = snapshot.stepsToday;
      setActiveRescue(startSparkRescue(token));
      setActiveTab('circle');
      showToast(`Walk 500 steps to rescue ${token.senderName}'s wick!`);
    };

    void Linking.getInitialURL().then(handleIncomingUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => sub.remove();
  }, [showToast, snapshot.stepsToday]);

  // Sync HealthKit & live CoreMotion pedometer while foregrounded
  useEffect(() => {
    if (!onboarded) {
      return;
    }
    void syncHealthKit();
    const unsubHk = subscribeToHealthKitSteps(() => {
      void syncHealthKit();
    });
    let unsubPedometer: (() => void) | null = null;
    let active = true;
    void subscribeToLivePedometer((sessionSteps) => {
      if (!active) {
        return;
      }
      const delta = Math.max(0, sessionSteps - pedometerSessionOffsetRef.current);
      pedometerSessionOffsetRef.current = sessionSteps;
      hkBaselineStepsRef.current += delta;
      applyStepTotal(hkBaselineStepsRef.current);
    }).then((unsub) => {
      if (active) {
        unsubPedometer = unsub;
      } else {
        unsub();
      }
    });

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setResumeTick((t) => t + 1);
        void syncHealthKit();
        void cloudKitService
          .refreshFriendCandles()
          .then((remoteFriends) => {
            if (remoteFriends.length > 0) {
              setFriends(remoteFriends);
              kvSet(KEY_FRIENDS, JSON.stringify(remoteFriends));
            }
          })
          .catch(() => {});
      }
    });
    const poll = setInterval(() => {
      void syncHealthKit();
    }, 15000);

    return () => {
      active = false;
      unsubHk();
      if (unsubPedometer) {
        unsubPedometer();
      }
      appSub.remove();
      clearInterval(poll);
    };
  }, [onboarded, syncHealthKit, applyStepTotal]);

  // iPhone tilt gravity sway while Flame screen is open and candle is lit
  useEffect(() => {
    if (!hydrated || !onboarded || activeTab !== 'flame' || snapshot.flameIntensity <= 0) {
      setTiltAngle(0);
      return;
    }
    let active = true;
    let unsubTilt: (() => void) | null = null;
    void subscribeToTiltAngle((rad) => {
      if (active) {
        setTiltAngle(rad);
      }
    }).then((unsub) => {
      if (active) {
        unsubTilt = unsub;
      } else {
        unsub();
      }
    });
    return () => {
      active = false;
      setTiltAngle(0);
      if (unsubTilt) {
        unsubTilt();
      }
    };
  }, [hydrated, onboarded, activeTab, snapshot.flameIntensity > 0]);

  // Lantern Mode: boost screen brightness to 100% on Flame tab when lit, restore on exit
  useEffect(() => {
    const active =
      hydrated &&
      onboarded &&
      activeTab === 'flame' &&
      settings.lanternModeEnabled &&
      snapshot.flameIntensity > 0;

    if (!active) {
      if (previousBrightnessRef.current !== null) {
        const prev = previousBrightnessRef.current;
        previousBrightnessRef.current = null;
        void restoreLanternBrightness(prev);
      }
      return;
    }

    let cancelled = false;
    void enableLanternBrightness().then((prev) => {
      if (!cancelled && prev !== null) {
        previousBrightnessRef.current = prev;
      }
    });

    return () => {
      cancelled = true;
      if (previousBrightnessRef.current !== null) {
        const prev = previousBrightnessRef.current;
        previousBrightnessRef.current = null;
        void restoreLanternBrightness(prev);
      }
    };
  }, [hydrated, onboarded, activeTab, settings.lanternModeEnabled, snapshot.flameIntensity > 0]);

  // Live breeze-shake on blow when Flame screen is open and enabled in Sanctuary
  useEffect(() => {
    if (
      !hydrated ||
      !onboarded ||
      activeTab !== 'flame' ||
      !settings.liveBreezeEnabled ||
      snapshot.flameIntensity <= 0 ||
      snapshot.state === 'GLASS_DOME'
    ) {
      setWindIntensity(0);
      return;
    }

    let cancelled = false;
    let recording: Audio.Recording | null = null;
    const detector = new AudioBlowDetector({
      setAmbientMixMode: async () => {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
        }).catch(() => {});
      },
      activateMicSession: async () => {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          return false;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        return true;
      },
      deactivateMicSession: async () => {
        if (recording) {
          await recording.stopAndUnloadAsync().catch(() => {});
          recording = null;
        }
      },
    });

    (async () => {
      const ok = await detector.startBlowModal();
      if (!ok || cancelled) {
        return;
      }
      try {
        const rec = new Audio.Recording();
        recording = rec;
        await rec.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.LOW_QUALITY,
          isMeteringEnabled: true,
        });
        rec.setProgressUpdateInterval(120);
        rec.setOnRecordingStatusUpdate((st) => {
          if (cancelled || typeof st.metering !== 'number') {
            return;
          }
          setWindIntensity(computeWindShakeIntensity(st.metering));
          const inNightWindow = isNighttimeWindow(
            new Date(),
            settings.wakeHour,
            settings.wakeMinute,
            settings.sleepHour,
            settings.sleepMinute
          );
          if (
            inNightWindow &&
            settings.micBlowOutEnabled &&
            detector.processMeteringSample(st.metering)
          ) {
            void detector.stopBlowModal().then(() => {
              setWindIntensity(0);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSnapshot((prev) => {
                const next = triggerNightBlowOut(prev, Date.now());
                storageService.saveSnapshot(next, Date.now());
                return next;
              });
              showToast('Goodnight. Wax is cooling.');
            });
          }
        });
        await rec.startAsync();
      } catch {
        await detector.stopBlowModal();
      }
    })();

    return () => {
      cancelled = true;
      setWindIntensity(0);
      void detector.stopBlowModal();
    };
  }, [
    hydrated,
    onboarded,
    activeTab,
    settings.liveBreezeEnabled,
    settings.micBlowOutEnabled,
    settings.wakeHour,
    settings.wakeMinute,
    settings.sleepHour,
    settings.sleepMinute,
    snapshot.flameIntensity > 0,
    snapshot.state,
    showToast,
  ]);

  const scheduleAutoHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    setTabsVisible(true);
    if (activeTab === 'flame') {
      hideTimerRef.current = setTimeout(() => {
        setTabsVisible(false);
      }, 4000);
    }
  }, [activeTab]);

  useEffect(() => {
    scheduleAutoHide();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [activeTab, scheduleAutoHide]);

  const handleUpdateSettings = (partial: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      storageService.saveSettings(next);
      void SecureStore.setItemAsync(SECURE_SETTINGS, JSON.stringify(next)).catch(() => {});
      if (partial.wakeHour !== undefined || partial.wakeMinute !== undefined) {
        void scheduleMorningWakeNotification(next);
      }
      return next;
    });
  };

  const handleBlowOutWithMic = async () => {
    if (snapshot.state === 'GLASS_DOME') {
      showToast('Glass Dome protects the flame. Lift it first to blow out.');
      return;
    }
    const completeBlowOut = () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSnapshot((prev) => {
        const next = triggerNightBlowOut(prev, Date.now());
        storageService.saveSnapshot(next, Date.now());
        return next;
      });
      showToast('Goodnight. Wax is cooling.');
    };

    if (!settings.micBlowOutEnabled) {
      completeBlowOut();
      return;
    }

    // Avoid dual Audio.Recording race condition when liveBreezeEnabled already holds the mic
    if (settings.liveBreezeEnabled && activeTab === 'flame') {
      showToast('Blow into your mic now to extinguish...');
      return;
    }

    let recording: Audio.Recording | null = null;
    const detector = new AudioBlowDetector({
      setAmbientMixMode: async () => {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
        });
      },
      activateMicSession: async () => {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          return false;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        return true;
      },
      deactivateMicSession: async () => {
        if (recording) {
          await recording.stopAndUnloadAsync().catch(() => {});
          recording = null;
        }
      },
    });

    const started = await detector.startBlowModal();
    if (!started) {
      completeBlowOut();
      return;
    }

    showToast('Blow into your mic now to extinguish...');
    try {
      const rec = new Audio.Recording();
      recording = rec;
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.LOW_QUALITY,
        isMeteringEnabled: true,
      });
      rec.setOnRecordingStatusUpdate((st) => {
        if (typeof st.metering === 'number' && detector.processMeteringSample(st.metering)) {
          void detector.stopBlowModal().then(completeBlowOut);
        }
      });
      await rec.startAsync();
      setTimeout(() => {
        void detector.stopBlowModal();
      }, 6000);
    } catch {
      await detector.stopBlowModal();
      completeBlowOut();
    }
  };

  const handleSendSpark = async () => {
    const secret = await storageService.getOrCreateSparkSecret(
      () => `spk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    );
    const token = createSparkToken(
      `spark_${Date.now()}`,
      'Your friend',
      'local_ios',
      secret,
      Date.now()
    );
    const url = buildSparkUniversalLink(token);
    await Share.share({
      title: 'Save my Wick!',
      message: `My wick is running low! Walk 500 steps to reignite my candle: ${url}`,
      url,
    });
  };

  const handleInviteFriend = async () => {
    if (!canAddFriend(entitlement, friends.length, Date.now())) {
      setPaywallReason('friend');
      return;
    }
    const ckShareUrl = await cloudKitService.inviteFriendToLockScreen().catch(() => null);
    const pairUrl =
      ckShareUrl && ckShareUrl.length > 0
        ? ckShareUrl
        : `https://senthilmkm.github.io/wick/pair.html?id=${encodeURIComponent(
            `usr_${Date.now()}`
          )}&name=${encodeURIComponent('Friend')}&streak=${snapshot.streakDays}`;
    try {
      await Share.share({
        title: 'Pair our Wick Candles',
        message: `Join my Wick Circle to keep our candles lit together: ${pairUrl}`,
        url: pairUrl,
      });
      showToast('Circle invite link shared.');
    } catch {
      showToast('Could not open Share Sheet.');
    }
  };

  const handleShareCandle = async () => {
    const now = new Date();
    if (!canExportVideo(entitlement, now)) {
      setPaywallReason('video');
      return;
    }
    try {
      await Share.share({
        title: 'My Wick Today',
        message: `Day ${snapshot.streakDays} • My wick is ${snapshot.state
          .toLowerCase()
          .replace('_', ' ')} (${snapshot.stepsToday.toLocaleString('en-US')} steps today) — Keep your wick lit!`,
      });
      const updated = recordVideoExport(entitlement, now);
      setEntitlement(updated);
      await storageService.saveVideoExportQuota(updated.weekKey, updated.freeVideoExportsThisWeek);
    } catch {
      showToast('Could not open Share Sheet.');
    }
  };

  const handleExportPdf = async () => {
    if (!canExportPdf(entitlement, Date.now())) {
      setPaywallReason('pdf');
      return;
    }
    try {
      const html = buildWaxLedgerPdfHtml(
        waxLayers,
        snapshot.streakDays,
        getLocalDateKey(new Date())
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Share.share({
        title: 'Wick Wax Ledger PDF',
        url: uri,
      });
    } catch {
      showToast('PDF export failed.');
    }
  };

  if (!hydrated) {
    return <View style={[styles.flex, { backgroundColor: '#0A0A0C' }]} />;
  }

  if (!onboarded) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <StatusBar style="light" />
        <OnboardingScreen
          initialGoal={settings.dailyStepGoal}
          onComplete={(goal) => {
            handleUpdateSettings({ dailyStepGoal: goal });
            kvSet(KEY_ONBOARDED, '1');
            void SecureStore.setItemAsync(SECURE_ONBOARDED, '1').catch(() => {});
            setOnboarded(true);
            void scheduleMorningWakeNotification({ ...settings, dailyStepGoal: goal });
            void syncHealthKit();
          }}
        />
      </GestureHandlerRootView>
    );
  }

  const handleDebugInjectSteps = (delta: number) => {
    const res = evaluateCandleState({
      snapshot,
      stepsToday: snapshot.stepsToday + delta,
      settings,
      now: new Date(),
    });
    setSnapshot(res.snapshot);
    storageService.saveSnapshot(res.snapshot, Date.now());
    if (res.completedDayLayer) {
      const nextLayers = storageService.appendWaxLayer(res.completedDayLayer);
      setWaxLayers(nextLayers);
    }
  };

  return (
    <GestureHandlerRootView style={[styles.flex, { backgroundColor: theme.canvasTop }]}>
      <StatusBar style="light" />

      {activeTab === 'flame' && (
        <FlameScreen
          snapshot={snapshot}
          settings={settings}
          theme={theme}
          waxLayers={waxLayers}
          resumeTick={resumeTick}
          windIntensity={windIntensity}
          tiltAngle={tiltAngle}
          onStrikeLighter={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            void playMatchStrikeSound(settings.soundEffectsEnabled);
            setSnapshot((prev) => {
              const next = igniteWithLighter(prev, Date.now());
              storageService.saveSnapshot(next, Date.now());
              return next;
            });
            showToast('Wick lit! Walk to keep the flame blazing.');
          }}
          onShareVideo={() => {
            void handleShareCandle();
          }}
          onSendSpark={() => {
            void handleSendSpark();
          }}
          onActivateGlassDome={() => {
            if (!canUseGlassDome(entitlement, Date.now())) {
              setPaywallReason('dome');
              return;
            }
            const res = activateGlassDome(snapshot, Date.now());
            if (res.activated) {
              setSnapshot(res.snapshot);
              storageService.saveSnapshot(res.snapshot, Date.now());
              void storageService.markStarterDomeClaimed();
              showToast('Glass Dome active — flame protected from wind.');
            } else if (res.reason) {
              showToast(res.reason);
            }
          }}
          onRemoveGlassDome={() => {
            const next = removeGlassDome(snapshot, Date.now());
            setSnapshot(next);
            storageService.saveSnapshot(next, Date.now());
            showToast('Glass Dome lifted.');
          }}
          onBlowOutNight={() => {
            void handleBlowOutWithMic();
          }}
          onToggleControlsVisibility={scheduleAutoHide}
        />
      )}

      {activeTab === 'ledger' && (
        <WaxLedgerScreen
          layers={waxLayers}
          streakDays={snapshot.streakDays}
          waxGrams={snapshot.waxGrams}
          theme={theme}
          entitlement={{
            ...entitlement,
            isPro: hasProAccess(entitlement, Date.now()),
          }}
          onExportPdf={() => {
            void handleExportPdf();
          }}
          onUpgradePro={() => setPaywallReason('ledger')}
        />
      )}

      {activeTab === 'circle' && (
        <CircleScreen
          friends={friends}
          activeRescue={activeRescue}
          theme={theme}
          onInviteFriend={() => {
            void handleInviteFriend();
          }}
          onSendSpark={() => {
            void handleSendSpark();
          }}
        />
      )}

      {activeTab === 'sanctuary' && (
        <SanctuaryScreen
          settings={settings}
          theme={theme}
          entitlement={{
            ...entitlement,
            isPro: hasProAccess(entitlement, Date.now()),
          }}
          glassDomesOwned={snapshot.glassDomesOwned}
          onSelectTheme={(themeId: ThemeId) => {
            if (!canUseTheme(entitlement, themeId, Date.now())) {
              setPaywallReason('theme');
              return;
            }
            handleUpdateSettings({ themeId });
            showToast('Theme updated.');
          }}
          onUpdateSettings={handleUpdateSettings}
          onRestorePurchases={() => {
            void restoreProPurchases(REVENUECAT_IOS_KEY).then((restored) => {
              if (restored) {
                kvSet(KEY_PRO_CACHE, '1');
                setEntitlement((e) => ({ ...e, isPro: true, isEligibleForIntroTrial: false }));
                showToast('Wick Pro restored!');
              } else {
                showToast('No active Pro subscription found.');
              }
            });
          }}
          onUpgradePro={() => setPaywallReason('general')}
          onDebugInjectSteps={handleDebugInjectSteps}
        />
      )}

      {/* Global Toast Banner (visible across all tabs) */}
      {statusMessage && (
        <View style={styles.toastBanner} pointerEvents="none">
          <Text style={styles.toastText}>{statusMessage}</Text>
        </View>
      )}

      <PaywallModal
        visible={paywallReason !== null}
        reason={paywallReason ?? 'general'}
        entitlement={entitlement}
        onStartPro={() => {
          void purchaseProPackage(REVENUECAT_IOS_KEY).then(({ purchased }) => {
            if (purchased) {
              kvSet(KEY_PRO_CACHE, '1');
              void SecureStore.setItemAsync(SECURE_PRO, '1').catch(() => {});
              setEntitlement((e) => ({ ...e, isPro: true, isEligibleForIntroTrial: false }));
              setPaywallReason(null);
              showToast('Welcome to Wick Pro!');
            } else {
              showToast('Purchase could not be completed.');
            }
          });
        }}
        onRestorePurchases={() => {
          void restoreProPurchases(REVENUECAT_IOS_KEY).then((restored) => {
            setPaywallReason(null);
            if (restored) {
              kvSet(KEY_PRO_CACHE, '1');
              void SecureStore.setItemAsync(SECURE_PRO, '1').catch(() => {});
              setEntitlement((e) => ({ ...e, isPro: true, isEligibleForIntroTrial: false }));
              showToast('Wick Pro restored!');
            } else {
              showToast('No active Pro subscription found.');
            }
          });
        }}
        onClose={() => setPaywallReason(null)}
      />

      {(tabsVisible || activeTab !== 'flame') && (
        <View style={styles.tabBarWrap}>
          <BlurView intensity={40} tint="dark" style={styles.tabBar}>
            {(
              [
                ['flame', 'Flame'],
                ['ledger', 'Ledger'],
                ['circle', 'Circle'],
                ['sanctuary', 'Sanctuary'],
              ] as [TabKey, string][]
            ).map(([key, label]) => {
              const active = activeTab === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.tabItem, active && { backgroundColor: 'rgba(255,255,255,0.12)' }]}
                  onPress={() => setActiveTab(key)}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: active ? theme.accent : '#A1A1AA' },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </BlurView>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  errorFallback: {
    backgroundColor: '#0A0A0C',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: { color: '#FF9F43', fontSize: 18, fontWeight: '700' },
  errorBody: { color: '#A1A1AA', fontSize: 13, textAlign: 'center' },
  errorBtn: {
    backgroundColor: '#FF9F43',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
  },
  errorBtnText: { color: '#0A0A0C', fontWeight: '700', fontSize: 14 },
  toastBanner: {
    position: 'absolute',
    bottom: 102,
    alignSelf: 'center',
    backgroundColor: 'rgba(24, 24, 27, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,67,0.35)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBarWrap: {
    position: 'absolute',
    bottom: 28,
    left: 20,
    right: 20,
    borderRadius: 28,
    overflow: 'hidden',
  },
  tabBar: {
    flexDirection: 'row',
    padding: 6,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(18, 18, 22, 0.72)',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 22,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
