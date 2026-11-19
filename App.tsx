import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MMKV } from 'react-native-mmkv';
import { PaywallModal, PaywallReason } from './src/components/PaywallModal';
import { getThemeById } from './src/constants/themes';
import {
  CANDLE_MOOD_COLORS,
  getLocalDateKey,
  getLocalWeekKey,
  isNighttimeWindow,
} from './src/engine/candleMath';
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
  SPARK_SHARED_APP_SECRET,
  startSparkRescue,
  updateSparkRescueProgress,
  validateSparkToken,
} from './src/engine/sparkEngine';
import {
  canAddFriend,
  canExportPdf,
  canExportVideo,
  canOfferFreeTrial,
  canUseGlassDome,
  canUseTheme,
  hasProAccess,
  isInReverseTrial,
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
  fetchProPriceLabel,
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
  acceptNativeFriendShareUrl,
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
  CandleMood,
  CandleSnapshot,
  EntitlementState,
  FriendCandle,
  ThemeId,
  UserSettings,
  WaxLayer,
} from './src/types/wick';

const MOOD_LIST = Object.keys(CANDLE_MOOD_COLORS) as CandleMood[];

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
const KEY_REMOVED_FRIENDS = 'wick.removed_friends.v1';
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
  const [proPriceLabel, setProPriceLabel] = useState<string | null>(null);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const prevCandleStateRef = useRef<CandleSnapshot['state'] | null>(null);
  const [isAppActive, setIsAppActive] = useState(true);
  const previousBrightnessRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepsTodayRef = useRef(0);
  const snapshotDateKeyRef = useRef<string>('');
  const manualBlowArmedUntilRef = useRef(0);
  const manualBlowActiveRef = useRef(false);
  const goalCelebratedDateRef = useRef<string | null>(null);

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

  const effectiveThemeId = canUseTheme(entitlement, settings.themeId, Date.now())
    ? settings.themeId
    : 'obsidian_night';
  const theme = getThemeById(effectiveThemeId);

  const entitlementRef = useRef(entitlement);
  const friendsRef = useRef(friends);
  const settingsRef = useRef(settings);
  useEffect(() => {
    entitlementRef.current = entitlement;
  }, [entitlement]);
  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    stepsTodayRef.current = snapshot.stepsToday;
    snapshotDateKeyRef.current = snapshot.dateKey;
  }, [snapshot.stepsToday, snapshot.dateKey]);

  useEffect(() => {
    const prev = prevCandleStateRef.current;
    prevCandleStateRef.current = snapshot.state;
    if (prev !== null && prev !== 'NIGHT_SLEEP' && snapshot.state === 'NIGHT_SLEEP' && !snapshot.mood) {
      setShowMoodModal(true);
    }
  }, [snapshot.state, snapshot.mood]);

  const showToast = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setStatusMessage(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const applyStepTotal = useCallback(
    (steps: number) => {
      const now = new Date();
      const todayKey = getLocalDateKey(now);
      setSnapshot((prev) => {
        const monotonicSteps =
          prev.dateKey === todayKey ? Math.max(prev.stepsToday, steps) : steps;
        const activeGoal = settingsRef.current.dailyStepGoal;
        const res = evaluateCandleState({
          snapshot: prev,
          stepsToday: monotonicSteps,
          settings: settingsRef.current,
          now,
        });
        const crossedGoalToday =
          (prev.dateKey !== todayKey || prev.stepsToday < activeGoal) &&
          res.snapshot.stepsToday >= activeGoal &&
          goalCelebratedDateRef.current !== res.snapshot.dateKey;
        if (crossedGoalToday) {
          goalCelebratedDateRef.current = res.snapshot.dateKey;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('Daily goal reached! Your wick is blazing.');
        }
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
    [showToast]
  );

  const syncHealthKit = useCallback(async () => {
    const steps = await fetchTodayHealthKitSteps();
    if (steps === null) {
      return;
    }
    const todayKey = getLocalDateKey(new Date());
    if (snapshotDateKeyRef.current !== todayKey || steps >= hkBaselineStepsRef.current) {
      hkBaselineStepsRef.current = steps;
      pedometerSessionOffsetRef.current = 0;
    }
    applyStepTotal(Math.max(steps, hkBaselineStepsRef.current));
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
        dynamicPrice,
        secOnboarded,
        secSettings,
        secSnapshot,
        secPro,
      ] = await Promise.all([
        storageService.ensureFirstInstallRecorded(now.getTime()),
        storageService.isStarterDomeClaimed(),
        storageService.loadVideoExportQuota(weekKey),
        checkProEntitlement(REVENUECAT_IOS_KEY),
        fetchProPriceLabel(REVENUECAT_IOS_KEY),
        SecureStore.getItemAsync(SECURE_ONBOARDED).catch(() => null),
        SecureStore.getItemAsync(SECURE_SETTINGS).catch(() => null),
        SecureStore.getItemAsync(SECURE_SNAPSHOT).catch(() => null),
        SecureStore.getItemAsync(SECURE_PRO).catch(() => null),
      ]);
      if (!mounted) {
        return;
      }
      if (dynamicPrice) {
        setProPriceLabel(dynamicPrice);
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
      if (url.includes('icloud.com/share')) {
        if (!canAddFriend(entitlementRef.current, friendsRef.current.length, Date.now())) {
          setActiveTab('circle');
          setPaywallReason('friend');
          return;
        }
        void acceptNativeFriendShareUrl(url).then((accepted) => {
          if (accepted) {
            void cloudKitService.refreshFriendCandles().then((remoteFriends) => {
              if (remoteFriends.length > 0) {
                setFriends(remoteFriends);
                kvSet(KEY_FRIENDS, JSON.stringify(remoteFriends));
              }
            });
            setActiveTab('circle');
            showToast('Friend paired via iCloud!');
          }
        });
        return;
      }
      if (url.includes('circle/pair') || url.includes('pair.html')) {
        if (!canAddFriend(entitlementRef.current, friendsRef.current.length, Date.now())) {
          setActiveTab('circle');
          setPaywallReason('friend');
          return;
        }
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
      const check = validateSparkToken(token, SPARK_SHARED_APP_SECRET, Date.now(), new Set());
      if (!check.valid) {
        showToast(check.reason ?? 'Invalid Spark Request.');
        return;
      }
      rescueBaselineStepsRef.current = stepsTodayRef.current;
      setActiveRescue(startSparkRescue(token));
      setActiveTab('circle');
      showToast(`Walk 500 steps to rescue ${token.senderName}'s wick!`);
    };

    void Linking.getInitialURL().then(handleIncomingUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => sub.remove();
  }, [showToast]);

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

    const applyFilteredFriends = (remoteFriends: FriendCandle[]) => {
      if (remoteFriends.length === 0) {
        return;
      }
      let removedSet = new Set<string>();
      try {
        const rawRemoved = kvGet(KEY_REMOVED_FRIENDS);
        if (rawRemoved) {
          removedSet = new Set(JSON.parse(rawRemoved) as string[]);
        }
      } catch {
        // ignore corrupt removed list
      }
      const filtered = remoteFriends.filter((f) => !removedSet.has(f.id));
      setFriends(filtered);
      kvSet(KEY_FRIENDS, JSON.stringify(filtered));
    };

    const appSub = AppState.addEventListener('change', (state) => {
      const activeNow = state === 'active';
      setIsAppActive(activeNow);
      if (activeNow) {
        setResumeTick((t) => t + 1);
        void syncHealthKit();
        void cloudKitService
          .refreshFriendCandles()
          .then(applyFilteredFriends)
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

  // iPhone tilt gravity sway while Flame screen is open and active
  useEffect(() => {
    if (!hydrated || !onboarded || !isAppActive || activeTab !== 'flame' || snapshot.flameIntensity <= 0) {
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
  }, [hydrated, onboarded, isAppActive, activeTab, snapshot.flameIntensity > 0]);

  // Lantern Mode: boost screen brightness to 100% on Flame tab when lit & active, restore on exit
  useEffect(() => {
    const active =
      hydrated &&
      onboarded &&
      isAppActive &&
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
      if (prev === null) {
        return;
      }
      if (cancelled) {
        void restoreLanternBrightness(prev);
      } else {
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
  }, [hydrated, onboarded, isAppActive, activeTab, settings.lanternModeEnabled, snapshot.flameIntensity > 0]);

  // Live breeze-shake on blow when Flame screen is open, active, and enabled in Sanctuary
  useEffect(() => {
    if (
      !hydrated ||
      !onboarded ||
      !isAppActive ||
      activeTab !== 'flame' ||
      !settings.liveBreezeEnabled ||
      snapshot.flameIntensity <= 0 ||
      snapshot.state === 'GLASS_DOME' ||
      snapshot.state === 'NIGHT_SLEEP'
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
          recording.setOnRecordingStatusUpdate(null);
          await recording.stopAndUnloadAsync().catch(() => {});
          recording = null;
        }
      },
    });

    let startDelayTimer: ReturnType<typeof setTimeout> | null = null;
    const startMic = async () => {
      if (cancelled) {
        return;
      }
      const ok = await detector.startBlowModal();
      if (!ok || cancelled) {
        if (ok && cancelled) {
          void detector.stopBlowModal();
        }
        return;
      }
      try {
        const rec = new Audio.Recording();
        recording = rec;
        await rec.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.LOW_QUALITY,
          isMeteringEnabled: true,
        });
        rec.setProgressUpdateInterval(50);
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
          const manualArmed = Date.now() <= manualBlowArmedUntilRef.current;
          if (
            (inNightWindow || manualArmed) &&
            settings.micBlowOutEnabled &&
            detector.processMeteringSample(st.metering)
          ) {
            manualBlowArmedUntilRef.current = 0;
            void detector.stopBlowModal().then(() => {
              if (cancelled) {
                return;
              }
              setWindIntensity(0);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSnapshot((prev) => {
                const next = triggerNightBlowOut(prev, Date.now());
                storageService.saveSnapshot(next, Date.now());
                void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(next));
                return next;
              });
              showToast('Goodnight. Wax is cooling.');
            });
          }
        });
        if (cancelled) {
          await rec.stopAndUnloadAsync().catch(() => {});
          recording = null;
          return;
        }
        await rec.startAsync();
      } catch {
        await detector.stopBlowModal();
      }
    };

    if (snapshot.state === 'IGNITING') {
      startDelayTimer = setTimeout(() => {
        void startMic();
      }, 500);
    } else {
      void startMic();
    }

    return () => {
      cancelled = true;
      if (startDelayTimer) {
        clearTimeout(startDelayTimer);
      }
      setWindIntensity(0);
      void detector.stopBlowModal();
    };
  }, [
    hydrated,
    onboarded,
    isAppActive,
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

  useEffect(() => {
    if (!onboarded || activeTab !== 'circle') {
      return;
    }
    void cloudKitService
      .refreshFriendCandles()
      .then((remoteFriends) => {
        if (remoteFriends.length > 0) {
          let removedSet = new Set<string>();
          try {
            const rawRemoved = kvGet(KEY_REMOVED_FRIENDS);
            if (rawRemoved) {
              removedSet = new Set(JSON.parse(rawRemoved) as string[]);
            }
          } catch {
            // ignore corrupt removed list
          }
          const filtered = remoteFriends.filter((f) => !removedSet.has(f.id));
          setFriends(filtered);
          kvSet(KEY_FRIENDS, JSON.stringify(filtered));
        }
      })
      .catch(() => {});
  }, [activeTab, onboarded]);

  const handleRemoveFriend = (friendId: string) => {
    setFriends((prev) => {
      const next = prev.filter((f) => f.id !== friendId);
      kvSet(KEY_FRIENDS, JSON.stringify(next));
      return next;
    });
    try {
      const raw = kvGet(KEY_REMOVED_FRIENDS);
      const existing = raw ? (JSON.parse(raw) as string[]) : [];
      if (!existing.includes(friendId)) {
        kvSet(KEY_REMOVED_FRIENDS, JSON.stringify([...existing, friendId]));
      }
    } catch {
      kvSet(KEY_REMOVED_FRIENDS, JSON.stringify([friendId]));
    }
    showToast('Friend removed from Circle.');
  };

  const handleUpdateSettings = (partial: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      settingsRef.current = next;
      storageService.saveSettings(next);
      void SecureStore.setItemAsync(SECURE_SETTINGS, JSON.stringify(next)).catch(() => {});
      if (
        partial.wakeHour !== undefined ||
        partial.wakeMinute !== undefined ||
        partial.sleepHour !== undefined ||
        partial.sleepMinute !== undefined ||
        partial.eveningNudgeEnabled !== undefined
      ) {
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
        void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(next));
        return next;
      });
      showToast('Goodnight. Wax is cooling.');
    };

    if (!settings.micBlowOutEnabled) {
      completeBlowOut();
      return;
    }

    // Avoid dual Audio.Recording race condition only when liveBreeze mic is actively running
    const liveBreezeMicActive =
      settings.liveBreezeEnabled &&
      activeTab === 'flame' &&
      snapshot.flameIntensity > 0 &&
      snapshot.state !== 'NIGHT_SLEEP';
    if (liveBreezeMicActive) {
      manualBlowArmedUntilRef.current = Date.now() + 8000;
      showToast('Blow into your mic now to extinguish...');
      return;
    }
    if (manualBlowActiveRef.current) {
      return;
    }
    manualBlowActiveRef.current = true;

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
      manualBlowActiveRef.current = false;
      completeBlowOut();
      return;
    }

    showToast('Blow into your mic now to extinguish...');
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const rec = new Audio.Recording();
      recording = rec;
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.LOW_QUALITY,
        isMeteringEnabled: true,
      });
      rec.setOnRecordingStatusUpdate((st) => {
        if (typeof st.metering === 'number' && detector.processMeteringSample(st.metering)) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          rec.setOnRecordingStatusUpdate(null);
          void detector.stopBlowModal().then(() => {
            manualBlowActiveRef.current = false;
            completeBlowOut();
          });
        }
      });
      await rec.startAsync();
      timeoutId = setTimeout(() => {
        manualBlowActiveRef.current = false;
        void detector.stopBlowModal();
      }, 6000);
    } catch {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      manualBlowActiveRef.current = false;
      await detector.stopBlowModal();
      completeBlowOut();
    }
  };

  const handleSendSpark = async () => {
    const senderName = settingsRef.current.candleName?.trim() || 'Your friend';
    const token = createSparkToken(
      `spark_${Date.now()}`,
      senderName,
      'local_ios',
      SPARK_SHARED_APP_SECRET,
      Date.now()
    );
    const url = buildSparkUniversalLink(token);
    try {
      await Share.share({
        title: 'Save my Wick!',
        message: `My wick is running low! Walk 500 steps to reignite my candle: ${url}`,
        url,
      });
    } catch {
      showToast('Could not open Share Sheet.');
    }
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
      const shareRes = await Share.share({
        title: 'My Wick Today',
        message: `Day ${snapshot.streakDays} • My wick is ${snapshot.state
          .toLowerCase()
          .replace('_', ' ')} (${snapshot.stepsToday.toLocaleString('en-US')} steps today) — Keep your wick lit!`,
      });
      if (shareRes.action !== Share.dismissedAction) {
        const updated = recordVideoExport(entitlementRef.current, now);
        setEntitlement(updated);
        await storageService.saveVideoExportQuota(updated.weekKey, updated.freeVideoExportsThisWeek);
      }
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
          initialCandleName={settings.candleName}
          onComplete={(goal, candleName) => {
            const nextPatch: Partial<UserSettings> = {
              dailyStepGoal: goal,
              ...(candleName ? { candleName } : {}),
            };
            handleUpdateSettings(nextPatch);
            kvSet(KEY_ONBOARDED, '1');
            void SecureStore.setItemAsync(SECURE_ONBOARDED, '1').catch(() => {});
            setOnboarded(true);
            void scheduleMorningWakeNotification({ ...settings, ...nextPatch });
            void syncHealthKit();
          }}
        />
      </GestureHandlerRootView>
    );
  }

  const handleResetLocalData = async () => {
    memoryFallback.clear();
    try {
      mmkvInstance?.clearAll();
    } catch {
      // ignore if MMKV unavailable
    }
    if (entitlementRef.current.isPro) {
      kvSet(KEY_PRO_CACHE, '1');
    }
    await Promise.allSettled([
      SecureStore.deleteItemAsync(SECURE_ONBOARDED),
      SecureStore.deleteItemAsync(SECURE_SETTINGS),
      SecureStore.deleteItemAsync(SECURE_SNAPSHOT),
    ]);
    const now = new Date();
    const freshSnapshot = createMorningSnapshot(getLocalDateKey(now), now.getTime(), 0, 0, 1);
    settingsRef.current = DEFAULT_SETTINGS;
    setSettings(DEFAULT_SETTINGS);
    setWaxLayers([]);
    setFriends([]);
    setActiveRescue(null);
    rescueBaselineStepsRef.current = null;
    hkBaselineStepsRef.current = 0;
    pedometerSessionOffsetRef.current = 0;
    goalCelebratedDateRef.current = null;
    setSnapshot(freshSnapshot);
    storageService.saveSnapshot(freshSnapshot, now.getTime());
    reloadNativeWidgets();
    setActiveTab('flame');
    setShowMoodModal(false);
    setOnboarded(false);
    showToast('All local data reset.');
  };

  const handleDebugInjectSteps = (delta: number) => {
    const res = evaluateCandleState({
      snapshot,
      stepsToday: snapshot.stepsToday + delta,
      settings,
      now: new Date(),
    });
    if (
      snapshot.stepsToday < settings.dailyStepGoal &&
      res.snapshot.stepsToday >= settings.dailyStepGoal &&
      goalCelebratedDateRef.current !== res.snapshot.dateKey
    ) {
      goalCelebratedDateRef.current = res.snapshot.dateKey;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Daily goal reached! Your wick is blazing.');
    }
    setSnapshot(res.snapshot);
    storageService.saveSnapshot(res.snapshot, Date.now());
    void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(res.snapshot));
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
            void playMatchStrikeSound(settings.soundEffectsEnabled, settings.liveBreezeEnabled);
            setSnapshot((prev) => {
              const next = igniteWithLighter(prev, Date.now());
              storageService.saveSnapshot(next, Date.now());
              void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(next));
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
              void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(res.snapshot));
              void storageService.markStarterDomeClaimed();
              setEntitlement((e) => ({ ...e, starterDomeClaimed: true }));
              showToast('Glass Dome active — flame protected from wind.');
            } else if (res.reason) {
              showToast(res.reason);
            }
          }}
          onRemoveGlassDome={() => {
            const next = removeGlassDome(snapshot, Date.now());
            setSnapshot(next);
            storageService.saveSnapshot(next, Date.now());
            void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(next));
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
          todaySteps={snapshot.stepsToday}
          dailyStepGoal={settings.dailyStepGoal}
          todayMood={snapshot.mood}
          todayDateKey={snapshot.dateKey}
          candleName={settings.candleName}
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
          onRemoveFriend={handleRemoveFriend}
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
          isPaidPro={entitlement.isPro}
          isReverseTrialActive={isInReverseTrial(entitlement, Date.now())}
          priceLabel={proPriceLabel}
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
                void SecureStore.setItemAsync(SECURE_PRO, '1');
                setEntitlement((e) => ({ ...e, isPro: true, isEligibleForIntroTrial: false }));
                showToast('Wick Pro restored!');
              } else {
                showToast('No previous Wick Pro purchase found.');
              }
            });
          }}
          onUpgradePro={() => setPaywallReason('general')}
          onResetData={() => {
            void handleResetLocalData();
          }}
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
        priceLabel={proPriceLabel}
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
              showToast('No previous Wick Pro purchase found.');
            }
          });
        }}
        onClose={() => setPaywallReason(null)}
      />

      <Modal
        visible={showMoodModal && snapshot.state === 'NIGHT_SLEEP'}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoodModal(false)}
      >
        <View style={styles.moodBackdrop}>
          <View style={styles.moodSheet}>
            <Text style={styles.moodTitle}>
              Goodnight{settings.candleName?.trim() ? `, ${settings.candleName.trim()}` : ''}
            </Text>
            <Text style={styles.moodSub}>
              How did today feel? Your mood tints tonight&apos;s wax band.
            </Text>
            <View style={styles.moodGrid}>
              {MOOD_LIST.map((mood) => (
                <Pressable
                  key={mood}
                  style={styles.moodChip}
                  onPress={() => {
                    const todayKey = getLocalDateKey(new Date());
                    setSnapshot((prev) => {
                      if (prev.dateKey !== todayKey) {
                        return prev;
                      }
                      const next = { ...prev, mood, updatedAt: Date.now() };
                      storageService.saveSnapshot(next, Date.now());
                      void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(next));
                      return next;
                    });
                    setShowMoodModal(false);
                    showToast(`Saved "${mood}" to tonight's wax band.`);
                  }}
                >
                  <View style={[styles.moodDot, { backgroundColor: CANDLE_MOOD_COLORS[mood] }]} />
                  <Text style={styles.moodChipText}>{mood}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.moodSkipBtn} onPress={() => setShowMoodModal(false)}>
              <Text style={styles.moodSkipText}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  moodBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  moodSheet: {
    backgroundColor: '#121216',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  moodTitle: { color: '#F5F5F7', fontSize: 22, fontWeight: '700' },
  moodSub: { color: '#A1A1AA', fontSize: 14, lineHeight: 20 },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moodChip: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
  },
  moodDot: { width: 12, height: 12, borderRadius: 6 },
  moodChipText: { color: '#F5F5F7', fontSize: 14, fontWeight: '600' },
  moodSkipBtn: { alignItems: 'center', paddingVertical: 8 },
  moodSkipText: { color: '#A1A1AA', fontSize: 14 },
});
