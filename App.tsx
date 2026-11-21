import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MMKV } from 'react-native-mmkv';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaywallModal, PaywallReason } from './src/components/PaywallModal';
import { getThemeById, THEME_LIST } from './src/constants/themes';
import {
  CANDLE_MOOD_COLORS,
  getLocalDateKey,
  getLocalWeekKey,
  isNighttimeWindow,
  WeeklyRecapSummary,
} from './src/engine/candleMath';
import { reigniteFromSpark, activateGlassDome, createMorningSnapshot, evaluateCandleState, igniteWithLighter, removeGlassDome, triggerNightBlowOut } from './src/engine/candleStateMachine';
import {
  canAskForSpark,
  classifySparkRescue,
  friendArrivalLine,
  friendListChanged,
  isForgeablePairLink,
  nextFriendArrival,
  nudgeShareMessage,
  pickIncomingSpark,
  readIdList,
  rememberId,
  sparkAskText,
  sparkAskUsesRescue,
} from './src/engine/circleFlow';
import {
  SPARK_EXPIRY_MS,
  SPARK_STEPS_REQUIRED,
  updateSparkRescueProgress,
} from './src/engine/sparkEngine';
import {
  canAddFriend,
  canExportPdf,
  canExportVideo,
  canUseGlassDome,
  canUseTheme,
  capFriendList,
  creditShareQuota,
  formatFreeShareCardsLabel,
  getVisibleLedgerLimit,
  hasProAccess,
  isInReverseTrial,
  latchTrialExpiry,
  recordVideoExport,
} from './src/engine/trialGuard';
import {
  cameBackLine,
  celebrationLine,
  flameCoachLine,
  FREE_STAYS,
  PRO_ADDS,
  savedDayLine,
  streakBandLine,
  shouldShowLighter,
  stateForFriends,
  WICK_LIT_LINE,
  TAB_HINTS,
  tabsShouldHide,
  walkLitTheCandle,
} from './src/engine/firstRunCopy';
import { buildOnboardingSettings, finishOnboardingSnapshot } from './src/engine/onboardingFlow';
import { earlierInstallStamp, proFromStoreStatus, resolveAuthoritativeNow } from './src/engine/trustedClock';
import { CircleScreen } from './src/screens/CircleScreen';
import { FlameScreen } from './src/screens/FlameScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { SanctuaryScreen } from './src/screens/SanctuaryScreen';
import { WaxLedgerScreen } from './src/screens/WaxLedgerScreen';
import { AudioBlowDetector, computeWindShakeIntensity } from './src/services/audioBlowService';
import {
  fetchProPriceLabel,
  initBilling,
  purchaseProPackage,
  resolveProEntitlement,
  restoreProEntitlement,
} from './src/services/billingService';
import { CloudKitCircleService } from './src/services/cloudKitService';
import {
  enableLanternBrightness,
  restoreLanternBrightness,
} from './src/services/lanternService';
import { buildWaxLedgerPdfHtml } from './src/services/exportService';
import {
  acceptNativeShareUrlWithKind,
  checkNativePendingSparkRescues,
  completeNativeSparkShare,
  createNativeCloudKitDriver,
  createNativeSparkShareUrl,
  deleteNativeCompletedSparks,
  deleteNativeNudges,
  fetchNativeNudges,
  fetchNativeSharedPendingSparks,
  fetchNativeSleepFocus,
  fetchNativeTrialAnchor,
  markNativeTrialAnchorExpired,
  peekNativeShareUrlKind,
  publishNativeVisitorCandle,
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
  presentNudgeNotification,
  scheduleMorningWakeNotification,
} from './src/services/notificationService';
import { playMatchStrikeSound } from './src/services/soundService';
import { createDefaultShareCardDriver, ShareCardService } from './src/services/shareCardService';
import { DEFAULT_SETTINGS, KEY_WAX_LAYERS, LocalStorageService } from './src/services/storageService';
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

const ensureVisitorId = (): string => {
  const existing = kvGet(KEY_VISITOR_ID)?.trim();
  if (existing) {
    return existing;
  }
  const created = `c${Date.now().toString(36)}`;
  kvSet(KEY_VISITOR_ID, created);
  return created;
};

let friendsSeeRain = false;

const publishMyCandleToFriends = (
  snap: Pick<CandleSnapshot, 'state' | 'flameIntensity' | 'streakDays'>,
  displayName: string
) => {
  void publishNativeVisitorCandle({
    visitorId: ensureVisitorId(),
    displayName: displayName.trim() || 'Wick',
    state: stateForFriends(snap.state, friendsSeeRain),
    flameIntensity: snap.flameIntensity,
    streakDays: snap.streakDays,
    updatedAt: Date.now(),
  });
};

const KEY_ONBOARDED = 'wick.onboarded.v1';
const KEY_PRO_CACHE = 'wick.pro_cached.v1';
const KEY_FRIENDS = 'wick.friends.v1';
const KEY_REMOVED_FRIENDS = 'wick.removed_friends.v1';
const KEY_VISITOR_ID = 'wick.visitor.candle.id';
const KEY_FLAME_COACH = 'wick.coach.flame.v1';
const KEY_TABS_MAY_HIDE = 'wick.tabs.may_hide.v1';
const KEY_LIT_BY_WALK = 'wick.lit.by.walk.v1';
const KEY_STEPS_OFF = 'wick.steps.off.v1';
const KEY_INVITE_SENT = 'wick.circle.invite_sent.v1';
const KEY_SEEN_FRIEND_ARRIVALS = 'wick.friends.arrived.v1';
const KEY_SEEN_TABS = 'wick.hint.tabs.v1';
const KEY_SEEN_NUDGES = 'wick.nudge.seen.v1';
const KEY_HANDLED_SPARKS = 'wick.spark.handled.v1';
const SECURE_ONBOARDED = 'wick_onboarded_v1';
const SECURE_SETTINGS = 'wick_settings_v1';
const SECURE_SNAPSHOT = 'wick_snapshot_v1';
const SECURE_PRO = 'wick_pro_v1';
const SECURE_WAX_LAYERS = 'wick_wax_layers_v1';
const SECURE_TRUSTED_NOW = 'wick_last_trusted_now';
const SECURE_TRIAL_EXPIRED = 'wick_trial_expired_v1';
const SECURE_PRO_VERIFIED = 'wick_pro_verified_at';
const SECURE_TRIAL_NOTICE = 'wick_trial_end_notice_v1';
const SECURE_SERVER_ANCHOR = 'wick_server_trial_anchor';
const SECURE_SHARE_QUOTA = 'wick_share_quota_v2';
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
const shareCardService = new ShareCardService(createDefaultShareCardDriver());

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
    <SafeAreaProvider>
      <AppErrorBoundary>
        <WickRoot />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

function WickRoot() {
  const insets = useSafeAreaInsets();
  const [hydrated, setHydrated] = useState<boolean>(() => mmkvInstance !== null);
  const [onboarded, setOnboarded] = useState<boolean>(() => kvGet(KEY_ONBOARDED) === '1');
  const [activeTab, setActiveTab] = useState<TabKey>('flame');
  const [flameCoachOn, setFlameCoachOn] = useState(() => kvGet(KEY_FLAME_COACH) !== '1');
  const [tabsMayHide, setTabsMayHide] = useState(() => kvGet(KEY_TABS_MAY_HIDE) === '1');
  const [litByWalk, setLitByWalk] = useState(() => kvGet(KEY_LIT_BY_WALK) === '1');
  const [stepsOff, setStepsOff] = useState(() => kvGet(KEY_STEPS_OFF) === '1');
  const [inviteSent, setInviteSent] = useState(() => kvGet(KEY_INVITE_SENT) === '1');
  const [seenTabs, setSeenTabs] = useState<string[]>(() => readIdList(kvGet(KEY_SEEN_TABS)));
  const [tabsVisible, setTabsVisible] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<PaywallReason | null>(null);
  const [showTrialEnded, setShowTrialEnded] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [resumeTick, setResumeTick] = useState(0);
  const [windIntensity, setWindIntensity] = useState(0);
  const [tiltAngle, setTiltAngle] = useState(0);
  const [proPriceLabel, setProPriceLabel] = useState<string | null>(null);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [showCandleNameModal, setShowCandleNameModal] = useState(false);
  const [candleNameDraft, setCandleNameDraft] = useState('');
  const [candleNameError, setCandleNameError] = useState<string | null>(null);
  const pendingInviteAfterNameRef = useRef(false);
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
  const completedSparkSubmittedRef = useRef<string | null>(null);
  const sparkSyncAnnouncedRef = useRef<Set<string>>(new Set());
  const appliedSparkIdsRef = useRef<Set<string>>(new Set());
  const announcedSparkWaitRef = useRef<Set<string>>(new Set());
  const seenNudgeIdsRef = useRef<Set<string>>(new Set());
  const checkingSparkRescuesRef = useRef(false);
  const snapshotRef = useRef<CandleSnapshot | null>(null);
  const rainOnRef = useRef(false);
  const [friendRain, setFriendRain] = useState(false);
  const sharingCandleRef = useRef(false);
  const exportingPdfRef = useRef(false);

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
  const activeRescueRef = useRef<ActiveSparkRescue | null>(null);
  const rescueBaselineStepsRef = useRef<number | null>(null);
  const rescueBaselineDateKeyRef = useRef<string | null>(null);
  const rescueCarryoverStepsRef = useRef<number>(0);
  const hkBaselineStepsRef = useRef<number>(0);
  const pedometerSessionOffsetRef = useRef<number>(0);
  const [entitlement, setEntitlement] = useState<EntitlementState>(() => ({
    isPro: false,
    isEligibleForIntroTrial: false,
    starterDomeClaimed: false,
    firstInstallAt: 0,
    trialExpired: true,
    quotaElapsedMs: 0,
    freeVideoExportsThisWeek: 0,
    weekKey: getLocalWeekKey(new Date()),
  }));
  const trustedNowRef = useRef(Date.now());
  const [trustedNowMs, setTrustedNowMs] = useState(() => Date.now());
  const accessReadyRef = useRef(false);
  const sleepFocusRef = useRef(false);
  const trialNoticeShownRef = useRef(false);

  const [snapshot, setSnapshot] = useState<CandleSnapshot>(() => {
    const saved = storageService.loadSnapshot();
    if (saved) {
      return saved;
    }
    return createMorningSnapshot(getLocalDateKey(new Date()), Date.now(), 0, 0, 1);
  });

  const allowProNow = accessReady && hasProAccess(entitlement, trustedNowMs);
  const effectiveThemeId = canUseTheme(
    { ...entitlement, isPro: allowProNow, trialExpired: accessReady ? entitlement.trialExpired : true },
    settings.themeId,
    trustedNowMs
  )
    ? settings.themeId
    : 'obsidian_night';
  const theme = getThemeById(effectiveThemeId);

  const entitlementRef = useRef(entitlement);
  const friendsRef = useRef(friends);
  const settingsRef = useRef(settings);
  const handleRainChange = useCallback((on: boolean) => {
    if (friendsSeeRain === on) return;
    friendsSeeRain = on;
    rainOnRef.current = on;
    setFriendRain(on);
    const snap = snapshotRef.current;
    if (!snap) return;
    const name = settingsRef.current.candleName?.trim() || 'Wick';
    void cloudKitService.syncOwnCandleIfNeeded(name, snap, Date.now(), true, on).catch(() => {});
    publishMyCandleToFriends(snap, name);
  }, []);
  useEffect(() => {
    entitlementRef.current = entitlement;
  }, [entitlement]);
  useEffect(() => {
    accessReadyRef.current = accessReady;
  }, [accessReady]);

  const syncTrusted = useCallback((ms: number) => {
    trustedNowRef.current = ms;
    setTrustedNowMs(ms);
  }, []);

  const trustedDate = useCallback(() => new Date(trustedNowRef.current), []);

  const gatesAllow = useCallback(
    (nowMs = trustedNowRef.current) =>
      accessReadyRef.current && hasProAccess(entitlementRef.current, nowMs),
    []
  );
  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    activeRescueRef.current = activeRescue;
  }, [activeRescue]);
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

  useEffect(() => {
    if (!activeRescue?.completed || completedSparkSubmittedRef.current === activeRescue.sparkId) {
      return;
    }
    const { sparkId, stepsWalked } = activeRescue;
    let cancelled = false;
    const submitCompletion = () => {
      if (cancelled || completedSparkSubmittedRef.current === sparkId) {
        return;
      }
      void completeNativeSparkShare(sparkId, stepsWalked).then((ok) => {
        if (ok) {
          completedSparkSubmittedRef.current = sparkId;
          kvSet(
            KEY_HANDLED_SPARKS,
            JSON.stringify(rememberId(readIdList(kvGet(KEY_HANDLED_SPARKS)), sparkId))
          );
          showToast('Rescue synced. Their candle can reignite.');
        }
      });
    };
    submitCompletion();
    const retryTimer = setInterval(submitCompletion, 15000);
    return () => {
      cancelled = true;
      clearInterval(retryTimer);
    };
  }, [activeRescue?.completed, activeRescue?.sparkId, activeRescue?.stepsWalked]);

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
      const now = trustedDate();
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
          isSleepFocusActive: sleepFocusRef.current,
        });
        const crossedGoalToday =
          (prev.dateKey !== todayKey || prev.stepsToday < activeGoal) &&
          res.snapshot.stepsToday >= activeGoal &&
          goalCelebratedDateRef.current !== res.snapshot.dateKey;
        if (crossedGoalToday) {
          goalCelebratedDateRef.current = res.snapshot.dateKey;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        void notifySmokingGraceIfNeeded(prev.state, res.snapshot.state);
        const litNow = walkLitTheCandle(prev, res.snapshot);
        if (litNow) {
          kvSet(KEY_LIT_BY_WALK, '1');
          setLitByWalk(true);
        }
        const savedLine = res.completedDayLayer
          ? savedDayLine(settingsRef.current.candleName, res.completedDayLayer.stepsAchieved)
          : null;
        const moment = celebrationLine({
          band: streakBandLine(prev.streakDays, res.snapshot.streakDays),
          lit: litNow,
          goal: crossedGoalToday,
          saved: savedLine,
        });
        if (moment) showToast(moment);
        if (res.completedDayLayer) {
          const nextLayers = storageService.appendWaxLayer(res.completedDayLayer);
          setWaxLayers(nextLayers);
          void SecureStore.setItemAsync(
            SECURE_WAX_LAYERS,
            JSON.stringify(nextLayers.slice(-20))
          ).catch(() => {});
        }
        storageService.saveSnapshot(res.snapshot, Date.now());
        void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(res.snapshot)).catch(() => {});
        const ownerLabel = settingsRef.current.candleName?.trim() || 'Friend';
        void cloudKitService.syncOwnCandleIfNeeded(ownerLabel, res.snapshot, Date.now(), false, friendsSeeRain).catch(() => {});
        publishMyCandleToFriends(res.snapshot, ownerLabel);
        return res.snapshot;
      });

      // Advance active 500-step Spark Rescue if user is rescuing a friend
      setActiveRescue((prevRescue) => {
        if (!prevRescue || prevRescue.completed) {
          return prevRescue;
        }
        if (rescueBaselineStepsRef.current === null) {
          rescueBaselineStepsRef.current = steps;
          rescueBaselineDateKeyRef.current = todayKey;
          rescueCarryoverStepsRef.current = prevRescue.stepsWalked;
        } else if (
          rescueBaselineDateKeyRef.current !== null &&
          rescueBaselineDateKeyRef.current !== todayKey
        ) {
          rescueCarryoverStepsRef.current = prevRescue.stepsWalked;
          rescueBaselineStepsRef.current = 0;
          rescueBaselineDateKeyRef.current = todayKey;
        }
        const walkedToday = Math.max(0, steps - rescueBaselineStepsRef.current);
        const totalWalked = rescueCarryoverStepsRef.current + walkedToday;
        const updated = updateSparkRescueProgress(prevRescue, totalWalked, Date.now());
        if (updated.completed && !prevRescue.completed && !sparkSyncAnnouncedRef.current.has(updated.sparkId)) {
          sparkSyncAnnouncedRef.current.add(updated.sparkId);
          showToast('500 steps done. Syncing the rescue…');
        }
        return updated;
      });
    },
    [showToast, trustedDate]
  );

  const syncPendingSparkRescues = useCallback(async () => {
    if (checkingSparkRescuesRef.current) {
      return;
    }
    checkingSparkRescuesRef.current = true;
    try {
      const completedRescues = await checkNativePendingSparkRescues();
      const current = snapshotRef.current;
      if (!current || completedRescues.length === 0) {
        return;
      }
      const applyIds: string[] = [];
      const waitIds: string[] = [];
      let totalSteps = 0;
      for (const rescue of completedRescues) {
        const decision = classifySparkRescue(
          current.state,
          rescue.stepsWalked,
          rescue.sparkId,
          appliedSparkIdsRef.current,
          announcedSparkWaitRef.current
        );
        if (decision === 'apply') {
          applyIds.push(rescue.sparkId);
          totalSteps += rescue.stepsWalked;
        } else if (decision === 'wait') {
          waitIds.push(rescue.sparkId);
        }
      }
      if (waitIds.length > 0) {
        for (const id of waitIds) {
          announcedSparkWaitRef.current.add(id);
        }
        showToast('Your friend walked 500 steps. The candle reignites when night or the rest day ends.');
      }
      if (applyIds.length === 0) {
        return;
      }
      const nowMs = trustedNowRef.current;
      setSnapshot((prev) => {
        if (prev.state === 'NIGHT_SLEEP' || prev.state === 'GLASS_DOME') {
          return prev;
        }
        const reignited = reigniteFromSpark(prev, nowMs);
        storageService.saveSnapshot(reignited, nowMs);
        void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(reignited)).catch(() => {});
        return reignited;
      });
      for (const id of applyIds) {
        appliedSparkIdsRef.current.add(id);
      }
      void deleteNativeCompletedSparks(applyIds);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        `Your candle was reignited. Your friend walked ${totalSteps.toLocaleString('en-US')} steps.`
      );
    } finally {
      checkingSparkRescuesRef.current = false;
    }
  }, [showToast]);

  const syncIncomingNudges = useCallback(async () => {
    const nudges = await fetchNativeNudges();
    const seen = new Set(readIdList(kvGet(KEY_SEEN_NUDGES)));
    const delivered: string[] = [];
    for (const nudge of nudges) {
      if (!nudge?.nudgeId) {
        continue;
      }
      if (seen.has(nudge.nudgeId) || seenNudgeIdsRef.current.has(nudge.nudgeId)) {
        delivered.push(nudge.nudgeId);
        continue;
      }
      seenNudgeIdsRef.current.add(nudge.nudgeId);
      seen.add(nudge.nudgeId);
      const fromName = nudge.fromName?.trim() || 'A friend';
      const message = nudge.message?.trim() || 'Keep your wick lit.';
      showToast(`${fromName}: ${message}`);
      void presentNudgeNotification(fromName, message);
      delivered.push(nudge.nudgeId);
    }
    if (delivered.length === 0) {
      return;
    }
    let stored = readIdList(kvGet(KEY_SEEN_NUDGES));
    for (const id of delivered) {
      stored = rememberId(stored, id);
    }
    kvSet(KEY_SEEN_NUDGES, JSON.stringify(stored));
    void deleteNativeNudges(delivered);
  }, [showToast]);

  const syncIncomingSparks = useCallback(async () => {
    const rows = await fetchNativeSharedPendingSparks();
    const handled = new Set(readIdList(kvGet(KEY_HANDLED_SPARKS)));
    const picked = pickIncomingSpark(
      rows,
      trustedNowRef.current,
      activeRescueRef.current?.sparkId ?? null,
      handled
    );
    if (!picked) {
      return;
    }
    const stepsRequired = Math.max(SPARK_STEPS_REQUIRED, picked.stepsRequired);
    const senderName = picked.senderName.trim() || 'Friend';
    rescueBaselineStepsRef.current = stepsTodayRef.current;
    rescueBaselineDateKeyRef.current = snapshotDateKeyRef.current || getLocalDateKey(trustedDate());
    rescueCarryoverStepsRef.current = 0;
    setActiveRescue({
      sparkId: picked.sparkId,
      senderName,
      stepsWalked: 0,
      stepsRequired,
      expiresAt: picked.expiresAt,
      completed: false,
    });
    setActiveTab('circle');
    showToast(`Walk ${stepsRequired} steps to rescue ${senderName}'s wick!`);
  }, [showToast, trustedDate]);

  const syncHealthKit = useCallback(async () => {
    const steps = await fetchTodayHealthKitSteps();
    const off = steps === null;
    setStepsOff((current) => {
      if (current === off) {
        return current;
      }
      kvSet(KEY_STEPS_OFF, off ? '1' : '0');
      return off;
    });
    if (off) {
      return;
    }
    const todayKey = getLocalDateKey(trustedDate());
    if (snapshotDateKeyRef.current !== todayKey || steps >= hkBaselineStepsRef.current) {
      hkBaselineStepsRef.current = steps;
      pedometerSessionOffsetRef.current = 0;
    }
    applyStepTotal(Math.max(steps, hkBaselineStepsRef.current));
  }, [applyStepTotal, trustedDate]);

  // Initialize Keychain anti-abuse state, durable onboarding/settings fallback, and billing on mount
  useEffect(() => {
    let mounted = true;
    initBilling(REVENUECAT_IOS_KEY);
    (async () => {
      try {
        const wallNow = Date.now();
        const [
          localInstall,
          domeClaimed,
          legacyQuota,
          proStatus,
          dynamicPrice,
          secOnboarded,
          secSettings,
          secSnapshot,
          secPro,
          secWaxLayers,
          savedTrusted,
          savedExpired,
          savedVerified,
          savedNotice,
          savedServerAnchor,
          savedQuota,
          liveAnchor,
        ] = await Promise.all([
          storageService.ensureFirstInstallRecorded(wallNow),
          storageService.isStarterDomeClaimed(),
          storageService.loadVideoExportQuota(getLocalWeekKey(new Date(wallNow))),
          resolveProEntitlement(REVENUECAT_IOS_KEY),
          fetchProPriceLabel(REVENUECAT_IOS_KEY),
          SecureStore.getItemAsync(SECURE_ONBOARDED).catch(() => null),
          SecureStore.getItemAsync(SECURE_SETTINGS).catch(() => null),
          SecureStore.getItemAsync(SECURE_SNAPSHOT).catch(() => null),
          SecureStore.getItemAsync(SECURE_PRO).catch(() => null),
          SecureStore.getItemAsync(SECURE_WAX_LAYERS).catch(() => null),
          SecureStore.getItemAsync(SECURE_TRUSTED_NOW).catch(() => null),
          SecureStore.getItemAsync(SECURE_TRIAL_EXPIRED).catch(() => null),
          SecureStore.getItemAsync(SECURE_PRO_VERIFIED).catch(() => null),
          SecureStore.getItemAsync(SECURE_TRIAL_NOTICE).catch(() => null),
          SecureStore.getItemAsync(SECURE_SERVER_ANCHOR).catch(() => null),
          SecureStore.getItemAsync(SECURE_SHARE_QUOTA).catch(() => null),
          fetchNativeTrialAnchor(),
        ]);
        if (!mounted) {
          return;
        }
        const serverCreated =
          liveAnchor?.createdAtMs ??
          (savedServerAnchor && Number(savedServerAnchor) > 0 ? Number(savedServerAnchor) : null);
        const lastTrusted = savedTrusted && Number(savedTrusted) > 0 ? Number(savedTrusted) : null;
        const clock = resolveAuthoritativeNow(wallNow, lastTrusted, liveAnchor?.serverNowMs ?? null);
        syncTrusted(clock.trustedNowMs);
        await SecureStore.setItemAsync(SECURE_TRUSTED_NOW, String(clock.trustedNowMs)).catch(() => {});
        if (liveAnchor?.createdAtMs) {
          await SecureStore.setItemAsync(SECURE_SERVER_ANCHOR, String(liveAnchor.createdAtMs)).catch(
            () => {}
          );
        }
        const installAt = earlierInstallStamp(localInstall, serverCreated);
        if (installAt !== null) {
          await storageService.setFirstInstallAt(installAt);
        }

        let quotaElapsed = 0;
        let quotaCount = legacyQuota.count;
        if (savedQuota) {
          try {
            const parsed = JSON.parse(savedQuota) as { elapsedMs?: number; count?: number };
            quotaElapsed = Math.max(0, Number(parsed.elapsedMs) || 0);
            quotaCount = Math.max(0, Number(parsed.count) || 0);
          } catch {
            quotaElapsed = 0;
          }
        }
        quotaElapsed += clock.forwardCreditMs;

        const verifiedAt = savedVerified ? Number(savedVerified) : null;
        const cachedGrant = secPro === '1' || kvGet(KEY_PRO_CACHE) === '1';
        const isProUser = proFromStoreStatus(
          proStatus,
          cachedGrant,
          Number.isFinite(verifiedAt) ? verifiedAt : null,
          clock.trustedNowMs
        );
        if (isProUser) {
          kvSet(KEY_PRO_CACHE, '1');
          await SecureStore.setItemAsync(SECURE_PRO, '1').catch(() => {});
          if (proStatus === 'active') {
            await SecureStore.setItemAsync(SECURE_PRO_VERIFIED, String(clock.trustedNowMs)).catch(() => {});
          }
        } else {
          kvSet(KEY_PRO_CACHE, '0');
          await SecureStore.deleteItemAsync(SECURE_PRO).catch(() => {});
          await SecureStore.deleteItemAsync(SECURE_PRO_VERIFIED).catch(() => {});
        }

        let nextEnt: EntitlementState = latchTrialExpiry(
          {
            isPro: isProUser,
            isEligibleForIntroTrial: false,
            starterDomeClaimed: domeClaimed,
            firstInstallAt: installAt ?? 0,
            trialExpired: savedExpired === '1' || liveAnchor?.expired === true || installAt === null,
            quotaElapsedMs: quotaElapsed,
            freeVideoExportsThisWeek: quotaCount,
            weekKey: getLocalWeekKey(new Date(clock.trustedNowMs)),
          },
          clock.trustedNowMs,
          clock.clockRolledBack && liveAnchor?.serverNowMs == null
        );
        nextEnt = {
          ...nextEnt,
          isEligibleForIntroTrial: isInReverseTrial(nextEnt, clock.trustedNowMs),
        };
        if (nextEnt.trialExpired) {
          await SecureStore.setItemAsync(SECURE_TRIAL_EXPIRED, '1').catch(() => {});
          void markNativeTrialAnchorExpired();
        }
        await SecureStore.setItemAsync(
          SECURE_SHARE_QUOTA,
          JSON.stringify({
            elapsedMs: nextEnt.quotaElapsedMs ?? 0,
            count: nextEnt.freeVideoExportsThisWeek,
          })
        ).catch(() => {});
        if (!mounted) {
          return;
        }
        setEntitlement(nextEnt);
        if (dynamicPrice) {
          setProPriceLabel(dynamicPrice);
        }
        if (secOnboarded === '1') {
          kvSet(KEY_ONBOARDED, '1');
          setOnboarded(true);
        }
        let loadedSettings = storageService.loadSettings();
        if (secSettings) {
          try {
            loadedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(secSettings) } as UserSettings;
          } catch {
            // ignore corrupt fallback
          }
        }
        const proAccess = nextEnt.isPro || isInReverseTrial(nextEnt, clock.trustedNowMs);
        if (!proAccess && loadedSettings.themeId !== 'obsidian_night') {
          loadedSettings = { ...loadedSettings, themeId: 'obsidian_night' };
        }
        setSettings(loadedSettings);
        storageService.saveSettings(loadedSettings);
        void SecureStore.setItemAsync(SECURE_SETTINGS, JSON.stringify(loadedSettings)).catch(() => {});
        if (!proAccess) {
          setFriends((prev) => {
            const capped = capFriendList(prev, nextEnt, clock.trustedNowMs);
            kvSet(KEY_FRIENDS, JSON.stringify(capped));
            return capped;
          });
        }
        if (secSnapshot) {
          try {
            const parsedSnap = JSON.parse(secSnapshot) as CandleSnapshot;
            setSnapshot(parsedSnap);
            storageService.saveSnapshot(parsedSnap, clock.trustedNowMs);
          } catch {
            // ignore corrupt fallback
          }
        }
        if (secWaxLayers) {
          try {
            const parsedLayers = JSON.parse(secWaxLayers) as WaxLayer[];
            if (Array.isArray(parsedLayers) && parsedLayers.length > storageService.loadWaxLayers().length) {
              kvSet(KEY_WAX_LAYERS, JSON.stringify(parsedLayers));
              setWaxLayers(parsedLayers);
            }
          } catch {
            // ignore corrupt fallback
          }
        }
        if (savedNotice === '1') {
          trialNoticeShownRef.current = true;
        } else if (nextEnt.trialExpired && !nextEnt.isPro) {
          trialNoticeShownRef.current = true;
          setShowTrialEnded(true);
        }
      } catch {
        if (mounted) {
          setEntitlement((prev) => ({
            ...prev,
            isPro: false,
            trialExpired: true,
            firstInstallAt: 0,
            isEligibleForIntroTrial: false,
          }));
        }
      } finally {
        if (mounted) {
          setAccessReady(true);
          setHydrated(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [syncTrusted]);

  useEffect(() => {
    const id = setInterval(() => {
      const wall = Date.now();
      const last = trustedNowRef.current;
      if (wall > last && wall - last < 2 * 60 * 1000) {
        trustedNowRef.current = wall;
        setTrustedNowMs(wall);
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      const now = new Date(trustedNowRef.current);
      const scheduleOn =
        settingsRef.current.sleepFocusSyncEnabled &&
        isNighttimeWindow(
          now,
          settingsRef.current.wakeHour,
          settingsRef.current.wakeMinute,
          settingsRef.current.sleepHour,
          settingsRef.current.sleepMinute
        );
      sleepFocusRef.current = settingsRef.current.sleepFocusSyncEnabled && scheduleOn;
      if (!settingsRef.current.sleepFocusSyncEnabled) {
        return;
      }
      void fetchNativeSleepFocus().then((focused) => {
        if (!cancelled && settingsRef.current.sleepFocusSyncEnabled) {
          sleepFocusRef.current = scheduleOn || focused;
        }
      });
    };
    refresh();
    const id = setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [settings.sleepFocusSyncEnabled, settings.wakeHour, settings.wakeMinute, settings.sleepHour, settings.sleepMinute, trustedNowMs]);

  // Handle incoming Spark Rescue & Circle Pair links
  useEffect(() => {
    const handleIncomingUrl = (url: string | null) => {
      if (!url) {
        return;
      }
      if (url.includes('icloud.com/share')) {
        void (async () => {
          const peek = await peekNativeShareUrlKind(url);
          const nowMs = trustedNowRef.current;
          if (
            peek.kind === 'friend' &&
            !canAddFriend(entitlementRef.current, friendsRef.current.length, nowMs)
          ) {
            setActiveTab('circle');
            setPaywallReason('friend');
            return;
          }
          const res = await acceptNativeShareUrlWithKind(url);
          if (!res.accepted) {
            return;
          }
          if (res.kind === 'spark' && res.sparkId) {
            const exp = res.expiresAt && res.expiresAt > 0 ? res.expiresAt : nowMs + SPARK_EXPIRY_MS;
            if (trustedNowRef.current > exp) {
              showToast('This Spark Request has expired.');
              return;
            }
            const senderName = res.senderName ?? 'Friend';
            const stepsRequired = Math.max(SPARK_STEPS_REQUIRED, res.stepsRequired ?? SPARK_STEPS_REQUIRED);
            rescueBaselineStepsRef.current = stepsTodayRef.current;
            rescueBaselineDateKeyRef.current = snapshotDateKeyRef.current || getLocalDateKey(trustedDate());
            rescueCarryoverStepsRef.current = 0;
            setActiveRescue({
              sparkId: res.sparkId,
              senderName,
              stepsWalked: 0,
              stepsRequired,
              expiresAt: exp,
              completed: false,
            });
            setActiveTab('circle');
            showToast(`Walk ${stepsRequired} steps to rescue ${senderName}'s wick!`);
            return;
          }
          if (!canAddFriend(entitlementRef.current, friendsRef.current.length, trustedNowRef.current)) {
            setActiveTab('circle');
            setPaywallReason('friend');
            return;
          }
          const syncRemoteFriends = () =>
            cloudKitService.refreshFriendCandles().then((remoteFriends) => {
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
                const filtered = capFriendList(
                  remoteFriends.filter((f) => !removedSet.has(f.id)),
                  entitlementRef.current,
                  trustedNowRef.current
                );
                setFriends(filtered);
                kvSet(KEY_FRIENDS, JSON.stringify(filtered));
              }
              return remoteFriends.length;
            });
          void syncRemoteFriends().then((count) => {
            if (count === 0) {
              setTimeout(() => {
                void syncRemoteFriends().catch(() => {});
              }, 2000);
            }
          });
          setActiveTab('circle');
          showToast('Friend paired via iCloud!');
          const pairedSnap = snapshotRef.current;
          if (pairedSnap) {
            publishMyCandleToFriends(pairedSnap, settingsRef.current.candleName?.trim() || 'Wick');
          }
          if (!settingsRef.current.candleName?.trim()) {
            pendingInviteAfterNameRef.current = false;
            setCandleNameDraft('');
            setCandleNameError(null);
            setShowCandleNameModal(true);
          }
        })();
        return;
      }
      if (isForgeablePairLink(url)) {
        showToast('Ask your friend to send the iCloud invite from Wick.');
        return;
      }

      if (url.includes('spark.html') || url.includes('wick://spark')) {
        showToast('Ask your friend to resend the Spark from Wick.');
      }
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
    void syncPendingSparkRescues();
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
      const filtered = capFriendList(
        remoteFriends.filter((f) => !removedSet.has(f.id)),
        entitlementRef.current,
        trustedNowRef.current
      );
      if (!friendListChanged(friendsRef.current, filtered)) {
        return;
      }
      setFriends(filtered);
      kvSet(KEY_FRIENDS, JSON.stringify(filtered));
    };

    const appSub = AppState.addEventListener('change', (state) => {
      const activeNow = state === 'active';
      setIsAppActive(activeNow);
      if (activeNow) {
        const clock = resolveAuthoritativeNow(Date.now(), trustedNowRef.current, null);
        syncTrusted(clock.trustedNowMs);
        void SecureStore.setItemAsync(SECURE_TRUSTED_NOW, String(clock.trustedNowMs)).catch(() => {});
        if (clock.forwardCreditMs > 0 || clock.clockRolledBack) {
          setEntitlement((prev) => {
            const credited = creditShareQuota(prev, clock.forwardCreditMs);
            const latched = latchTrialExpiry(credited, clock.trustedNowMs, clock.clockRolledBack);
            if (latched.trialExpired && !prev.trialExpired) {
              void SecureStore.setItemAsync(SECURE_TRIAL_EXPIRED, '1').catch(() => {});
              void markNativeTrialAnchorExpired();
              if (!latched.isPro && !trialNoticeShownRef.current) {
                trialNoticeShownRef.current = true;
                setShowTrialEnded(true);
              }
            }
            persistShareQuota(latched);
            return latched;
          });
        }
        setResumeTick((t) => t + 1);
        void syncHealthKit();
        void syncPendingSparkRescues();
        void syncIncomingNudges();
        void syncIncomingSparks();
        const resumedSnap = snapshotRef.current;
        if (resumedSnap) {
          publishMyCandleToFriends(resumedSnap, settingsRef.current.candleName?.trim() || 'Wick');
        }
        void cloudKitService
          .refreshFriendCandles()
          .then(applyFilteredFriends)
          .catch(() => {});
      }
    });
    void syncIncomingSparks();
    const snapForFriends = snapshotRef.current;
    if (snapForFriends) {
      publishMyCandleToFriends(snapForFriends, settingsRef.current.candleName?.trim() || 'Wick');
    }
    void cloudKitService
      .refreshFriendCandles()
      .then(applyFilteredFriends)
      .catch(() => {});
    const poll = setInterval(() => {
      void syncHealthKit();
      void syncPendingSparkRescues();
      void syncIncomingNudges();
      void syncIncomingSparks();
      const polledSnap = snapshotRef.current;
      if (polledSnap) {
        publishMyCandleToFriends(polledSnap, settingsRef.current.candleName?.trim() || 'Wick');
      }
      void cloudKitService
        .refreshFriendCandles()
        .then(applyFilteredFriends)
        .catch(() => {});
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
  }, [onboarded, syncHealthKit, syncPendingSparkRescues, syncIncomingNudges, syncIncomingSparks, applyStepTotal]);

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
    if (tabsShouldHide(activeTab, tabsMayHide)) {
      hideTimerRef.current = setTimeout(() => {
        setTabsVisible(false);
      }, 4000);
    }
  }, [activeTab, tabsMayHide]);

  useEffect(() => {
    if (activeTab !== 'flame' && !tabsMayHide) {
      setTabsMayHide(true);
      kvSet(KEY_TABS_MAY_HIDE, '1');
    }
  }, [activeTab, tabsMayHide]);

  useEffect(() => {
    if (litByWalk || (snapshot.streakDays <= 0 && waxLayers.length === 0)) {
      return;
    }
    kvSet(KEY_LIT_BY_WALK, '1');
    setLitByWalk(true);
  }, [litByWalk, snapshot.streakDays, waxLayers.length]);

  const friendArrivalReady = useRef(false);
  useEffect(() => {
    const seen = readIdList(kvGet(KEY_SEEN_FRIEND_ARRIVALS));
    if (!friendArrivalReady.current) {
      friendArrivalReady.current = true;
      let stored = seen;
      for (const friend of friends) {
        stored = rememberId(stored, friend.id);
      }
      if (stored.length !== seen.length) {
        kvSet(KEY_SEEN_FRIEND_ARRIVALS, JSON.stringify(stored));
      }
      return;
    }
    const arrival = nextFriendArrival(seen, friends);
    if (!arrival) {
      return;
    }
    let stored = seen;
    for (const friend of friends) {
      stored = rememberId(stored, friend.id);
    }
    kvSet(KEY_SEEN_FRIEND_ARRIVALS, JSON.stringify(stored));
    showToast(friendArrivalLine(arrival.name));
  }, [friends, showToast]);

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
          const filtered = capFriendList(
            remoteFriends.filter((f) => !removedSet.has(f.id)),
            entitlementRef.current,
            trustedNowRef.current
          );
          if (!friendListChanged(friendsRef.current, filtered)) {
            return;
          }
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
      if (partial.candleName !== undefined && partial.candleName.trim().length > 0) {
        void cloudKitService
          .syncOwnCandleIfNeeded(partial.candleName.trim(), snapshot, Date.now(), true, friendsSeeRain)
          .catch(() => {});
        publishMyCandleToFriends(snapshot, partial.candleName.trim());
      }
      return next;
    });
  };

  const handleBlowOutWithMic = async () => {
    if (snapshot.state === 'GLASS_DOME') {
      showToast('A rest day is on. End it before blowing the candle out.');
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

  const handleNudgeFriend = async (friend: FriendCandle) => {
    try {
      await Share.share({
        message: nudgeShareMessage(friend),
      });
    } catch {
      showToast('Could not open the text.');
    }
  };

  const handleSendSpark = async () => {
    if (!canAskForSpark(snapshotRef.current?.state ?? snapshot.state) && !rainOnRef.current) {
      showToast('Ask for Spark when your flame is flickering, an ember, smoking, or out.');
      return;
    }
    if (!sparkAskUsesRescue(friendsRef.current.length)) {
      try {
        await Share.share({ message: sparkAskText() });
      } catch {
        showToast('Could not open the text.');
      }
      return;
    }
    const senderName = settingsRef.current.candleName?.trim() || 'Your friend';
    const nowMs = trustedNowRef.current;
    const sparkId = `spark_${nowMs}`;
    const expiresAt = nowMs + SPARK_EXPIRY_MS;
    const created = await createNativeSparkShareUrl(
      sparkId,
      senderName,
      SPARK_STEPS_REQUIRED,
      expiresAt
    );
    if (!created) {
      showToast('Sign in to iCloud to send a Spark your friend can complete.');
      return;
    }
    if (created.delivery === 'circle') {
      showToast('Spark sent to your Circle. Your paired friend will see it in Wick.');
      return;
    }
    try {
      await Share.share({
        title: 'Save my Wick!',
        message: `My wick is running low! Walk 500 steps to reignite my candle: ${created.shareUrl}`,
        url: created.shareUrl ?? undefined,
      });
    } catch {
      showToast('Could not open Share Sheet.');
    }
  };

  const persistShareQuota = (ent: EntitlementState) => {
    void SecureStore.setItemAsync(
      SECURE_SHARE_QUOTA,
      JSON.stringify({
        elapsedMs: ent.quotaElapsedMs ?? 0,
        count: ent.freeVideoExportsThisWeek,
      })
    ).catch(() => {});
  };

  const grantPro = (persist: boolean) => {
    if (persist) {
      kvSet(KEY_PRO_CACHE, '1');
      void SecureStore.setItemAsync(SECURE_PRO, '1').catch(() => {});
      void SecureStore.setItemAsync(SECURE_PRO_VERIFIED, String(trustedNowRef.current)).catch(() => {});
    }
    setEntitlement((e) => ({ ...e, isPro: true, isEligibleForIntroTrial: false }));
  };

  const clearProGrant = () => {
    kvSet(KEY_PRO_CACHE, '0');
    void SecureStore.deleteItemAsync(SECURE_PRO).catch(() => {});
    void SecureStore.deleteItemAsync(SECURE_PRO_VERIFIED).catch(() => {});
    setEntitlement((e) => ({ ...e, isPro: false }));
  };

  const handleInviteFriend = async (nameOverride?: string) => {
    if (!canAddFriend(entitlement, friends.length, trustedNowRef.current)) {
      setPaywallReason('friend');
      return;
    }
    const effectiveName = (nameOverride ?? settingsRef.current.candleName ?? '').trim();
    if (!effectiveName) {
      pendingInviteAfterNameRef.current = true;
      setCandleNameDraft('');
      setCandleNameError(null);
      setShowCandleNameModal(true);
      return;
    }
    await cloudKitService.syncOwnCandleIfNeeded(effectiveName, snapshot, Date.now(), true, friendsSeeRain).catch(() => {});
    publishMyCandleToFriends(snapshot, effectiveName);
    const ckShareUrl = await cloudKitService
      .inviteFriendToLockScreen({
        displayName: effectiveName,
        state: snapshot.state,
        flameIntensity: snapshot.flameIntensity,
        streakDays: snapshot.streakDays,
      })
      .catch(() => null);
    if (!ckShareUrl) {
      showToast('Sign in to iCloud to pair a lock screen candle.');
      return;
    }
    try {
      const result = await Share.share({
        title: 'Pair our Wick Candles',
        message: `Join my Wick Circle to keep our candles lit together: ${ckShareUrl}`,
        url: ckShareUrl,
      });
      if (result.action === Share.dismissedAction) {
        return;
      }
      kvSet(KEY_INVITE_SENT, '1');
      setInviteSent(true);
      showToast('Circle invite link shared.');
    } catch {
      showToast('Could not open Share Sheet.');
    }
  };

  const handleSaveCandleNameModal = () => {
    const trimmed = candleNameDraft.trim().slice(0, 12);
    if (!trimmed) {
      setCandleNameError('Please enter a name (1–12 characters) so your friends can recognize you.');
      return;
    }
    setCandleNameError(null);
    handleUpdateSettings({ candleName: trimmed });
    setShowCandleNameModal(false);
    const shouldResumeInvite = pendingInviteAfterNameRef.current;
    pendingInviteAfterNameRef.current = false;
    if (shouldResumeInvite) {
      void handleInviteFriend(trimmed);
    } else {
      showToast(`Candle named "${trimmed}" — friends will see this name.`);
    }
  };

  const handleShareCandle = async () => {
    if (sharingCandleRef.current) {
      return;
    }
    const now = trustedDate();
    if (!canExportVideo(entitlementRef.current, now)) {
      setPaywallReason('video');
      return;
    }
    sharingCandleRef.current = true;
    try {
      const outcome = await shareCardService.shareDailyCard({
        candleName: settingsRef.current.candleName,
        streakDays: snapshot.streakDays,
        stepsToday: snapshot.stepsToday,
        dailyStepGoal: settingsRef.current.dailyStepGoal,
        state: snapshot.state,
        flameIntensity: snapshot.flameIntensity,
        flameColorHex: snapshot.flameColorHex,
        waxGrams: snapshot.waxGrams,
        theme,
        dateKey: snapshot.dateKey,
        mood: snapshot.mood,
      });
      if (outcome === 'shared') {
        const updated = recordVideoExport(entitlementRef.current, now);
        setEntitlement(updated);
        persistShareQuota(updated);
        await storageService.saveVideoExportQuota(updated.weekKey, updated.freeVideoExportsThisWeek);
      }
    } catch {
      showToast('Could not open Share Sheet.');
    } finally {
      sharingCandleRef.current = false;
    }
  };

  const handleExportPdf = async () => {
    if (exportingPdfRef.current) {
      return;
    }
    if (!canExportPdf(entitlementRef.current, trustedNowRef.current)) {
      setPaywallReason('pdf');
      return;
    }
    exportingPdfRef.current = true;
    try {
      const html = buildWaxLedgerPdfHtml(
        waxLayers,
        snapshot.streakDays,
        getLocalDateKey(new Date()),
        {
          candleName: settingsRef.current.candleName,
          waxGrams: snapshot.waxGrams,
          todaySteps: snapshot.stepsToday,
          dailyStepGoal: settingsRef.current.dailyStepGoal,
          todayMood: snapshot.mood,
        }
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Share.share({
        title: 'Wick Wax Ledger PDF',
        url: uri,
      });
    } catch {
      showToast('PDF export failed.');
    } finally {
      exportingPdfRef.current = false;
    }
  };

  const handleShareWeek = async (recap: WeeklyRecapSummary) => {
    const now = trustedDate();
    if (!canExportVideo(entitlementRef.current, now)) {
      setPaywallReason('video');
      return;
    }
    const themeId = canUseTheme(entitlementRef.current, settingsRef.current.themeId, now.getTime())
      ? settingsRef.current.themeId
      : 'obsidian_night';
    const outcome = await shareCardService.shareWeeklyCard({
      candleName: settingsRef.current.candleName,
      recap,
      theme: getThemeById(themeId),
    });
    if (outcome === 'shared') {
      const updated = recordVideoExport(entitlementRef.current, now);
      setEntitlement(updated);
      persistShareQuota(updated);
      await storageService.saveVideoExportQuota(updated.weekKey, updated.freeVideoExportsThisWeek);
    }
  };

  const chooseLook = (themeId: ThemeId) => {
    if (!canUseTheme(entitlementRef.current, themeId, trustedNowRef.current)) {
      setPaywallReason('theme');
      return;
    }
    handleUpdateSettings({ themeId });
    showToast(`${getThemeById(themeId).name} is on.`);
  };
  const trialLooks =
    litByWalk && accessReady && isInReverseTrial(entitlement, trustedNowMs) && !entitlement.isPro
      ? THEME_LIST.filter((look) => look.isPro)
      : null;

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
          initialThemeId={settings.themeId}
          initialWakeHour={settings.wakeHour}
          initialWakeMinute={settings.wakeMinute}
          initialSleepHour={settings.sleepHour}
          initialSleepMinute={settings.sleepMinute}
          onComplete={(completion) => {
            const patch = buildOnboardingSettings(completion);
            handleUpdateSettings(patch);
            const stepsAreOff = completion.healthSteps == null;
            kvSet(KEY_STEPS_OFF, stepsAreOff ? '1' : '0');
            setStepsOff(stepsAreOff);
            kvSet(KEY_ONBOARDED, '1');
            void SecureStore.setItemAsync(SECURE_ONBOARDED, '1').catch(() => {});
            const now = trustedDate();
            setSnapshot((prev) => {
              const next = finishOnboardingSnapshot(
                prev,
                { ...settingsRef.current, ...patch },
                now,
                completion.healthSteps
              );
              storageService.saveSnapshot(next, now.getTime());
              void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(next)).catch(() => {});
              if (walkLitTheCandle(prev, next)) {
                kvSet(KEY_LIT_BY_WALK, '1');
                setLitByWalk(true);
                showToast(WICK_LIT_LINE);
              }
              return next;
            });
            setOnboarded(true);
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
      SecureStore.deleteItemAsync(SECURE_WAX_LAYERS),
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
    setFlameCoachOn(true);
    setLitByWalk(false);
    setStepsOff(false);
    setInviteSent(false);
    setTabsMayHide(false);
    setTabsVisible(true);
    setSeenTabs([]);
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
    const crossedGoal =
      snapshot.stepsToday < settings.dailyStepGoal &&
      res.snapshot.stepsToday >= settings.dailyStepGoal &&
      goalCelebratedDateRef.current !== res.snapshot.dateKey;
    if (crossedGoal) {
      goalCelebratedDateRef.current = res.snapshot.dateKey;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const litNow = walkLitTheCandle(snapshot, res.snapshot);
    if (litNow) {
      kvSet(KEY_LIT_BY_WALK, '1');
      setLitByWalk(true);
    }
    const savedLine = res.completedDayLayer
      ? savedDayLine(settings.candleName, res.completedDayLayer.stepsAchieved)
      : null;
    const moment = celebrationLine({
      band: streakBandLine(snapshot.streakDays, res.snapshot.streakDays),
      lit: litNow,
      goal: crossedGoal,
      saved: savedLine,
    });
    if (moment) showToast(moment);
    setSnapshot(res.snapshot);
    storageService.saveSnapshot(res.snapshot, Date.now());
    void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(res.snapshot));
    if (res.completedDayLayer) {
      const nextLayers = storageService.appendWaxLayer(res.completedDayLayer);
      setWaxLayers(nextLayers);
      void SecureStore.setItemAsync(
        SECURE_WAX_LAYERS,
        JSON.stringify(nextLayers.slice(-20))
      ).catch(() => {});
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
          maxWaxLayers={getVisibleLedgerLimit({
            ...entitlement,
            isPro: allowProNow,
            trialExpired: accessReady ? entitlement.trialExpired : true,
          }, trustedNowMs)}
          onRainChange={handleRainChange}
          onCameBack={() => showToast(cameBackLine(settings.candleName))}
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
          shareCardsLabel={formatFreeShareCardsLabel(
            {
              ...entitlement,
              isPro: allowProNow,
              trialExpired: accessReady ? entitlement.trialExpired : true,
            },
            trustedNowMs
          )}
          onShareVideo={() => {
            void handleShareCandle();
          }}
          onSendSpark={() => {
            void handleSendSpark();
          }}
          onActivateGlassDome={() => {
            const nowMs = trustedNowRef.current;
            if (!canUseGlassDome(entitlementRef.current, nowMs, snapshot.glassDomesOwned)) {
              setPaywallReason('dome');
              return;
            }
            const ownedBefore = snapshot.glassDomesOwned;
            const res = activateGlassDome(snapshot, nowMs);
            if (res.activated) {
              setSnapshot(res.snapshot);
              storageService.saveSnapshot(res.snapshot, nowMs);
              void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(res.snapshot));
              if (ownedBefore > res.snapshot.glassDomesOwned && !gatesAllow(nowMs)) {
                void storageService.markStarterDomeClaimed();
                setEntitlement((e) => ({ ...e, starterDomeClaimed: true }));
              }
              showToast('Rest day. The flame stays still.');
            } else if (res.reason) {
              showToast(res.reason);
            }
          }}
          onRemoveGlassDome={() => {
            const next = removeGlassDome(snapshot, Date.now());
            setSnapshot(next);
            storageService.saveSnapshot(next, Date.now());
            void SecureStore.setItemAsync(SECURE_SNAPSHOT, JSON.stringify(next));
            showToast('Rest day ended.');
          }}
          onBlowOutNight={() => {
            void handleBlowOutWithMic();
          }}
          onToggleControlsVisibility={scheduleAutoHide}
          coachLine={
            stepsOff || flameCoachOn || !litByWalk
              ? flameCoachLine(snapshot.state, litByWalk, stepsOff)
              : null
          }
          onDismissCoach={
            stepsOff
              ? () => {
                  void Linking.openSettings();
                }
              : litByWalk
                ? () => {
                    setFlameCoachOn(false);
                    kvSet(KEY_FLAME_COACH, '1');
                  }
                : undefined
          }
          showLighter={shouldShowLighter(snapshot.state, litByWalk, stepsOff)}
          trialLooks={trialLooks}
          onSelectLook={chooseLook}
        />
      )}

      {activeTab === 'ledger' && (
        <WaxLedgerScreen
          layers={waxLayers}
          streakDays={snapshot.streakDays}
          todaySteps={snapshot.stepsToday}
          dailyStepGoal={settings.dailyStepGoal}
          todayMood={snapshot.mood}
          todayDateKey={snapshot.dateKey}
          candleName={settings.candleName}
          theme={theme}
          entitlement={{
            ...entitlement,
            isPro: allowProNow,
            trialExpired: accessReady ? entitlement.trialExpired : true,
          }}
          shareCardsLabel={formatFreeShareCardsLabel(
            {
              ...entitlement,
              isPro: allowProNow,
              trialExpired: accessReady ? entitlement.trialExpired : true,
            },
            trustedNowMs
          )}
          onExportPdf={() => {
            void handleExportPdf();
          }}
          onUpgradePro={() => setPaywallReason('ledger')}
          onShareWeek={(recap) => handleShareWeek(recap)}
          hint={seenTabs.includes('ledger') ? null : TAB_HINTS.ledger}
          onDismissHint={() => {
            setSeenTabs((prev) => {
              if (prev.includes('ledger')) {
                return prev;
              }
              const next = [...prev, 'ledger'];
              kvSet(KEY_SEEN_TABS, JSON.stringify(next));
              return next;
            });
          }}
        />
      )}

      {activeTab === 'circle' && (
        <CircleScreen
          friends={friends}
          activeRescue={activeRescue}
          theme={theme}
          inviteSent={inviteSent}
          onInviteFriend={() => {
            void handleInviteFriend();
          }}
          canAskSpark={canAskForSpark(snapshot.state) || friendRain}
          onSendSpark={() => {
            void handleSendSpark();
          }}
          onNudgeFriend={(friend) => {
            void handleNudgeFriend(friend);
          }}
          onDismissRescue={() => {
            const sparkId = activeRescueRef.current?.sparkId;
            if (sparkId) {
              kvSet(
                KEY_HANDLED_SPARKS,
                JSON.stringify(rememberId(readIdList(kvGet(KEY_HANDLED_SPARKS)), sparkId))
              );
            }
            setActiveRescue(null);
            rescueBaselineStepsRef.current = null;
          }}
          onRemoveFriend={handleRemoveFriend}
          hint={seenTabs.includes('circle') ? null : TAB_HINTS.circle}
          onDismissHint={() => {
            setSeenTabs((prev) => {
              if (prev.includes('circle')) {
                return prev;
              }
              const next = [...prev, 'circle'];
              kvSet(KEY_SEEN_TABS, JSON.stringify(next));
              return next;
            });
          }}
        />
      )}

      {activeTab === 'sanctuary' && (
        <SanctuaryScreen
          settings={settings}
          theme={theme}
          entitlement={{
            ...entitlement,
            isPro: allowProNow,
            trialExpired: accessReady ? entitlement.trialExpired : true,
          }}
          isPaidPro={entitlement.isPro}
          isReverseTrialActive={accessReady && isInReverseTrial(entitlement, trustedNowMs)}
          priceLabel={proPriceLabel}
          glassDomesOwned={snapshot.glassDomesOwned}
          onSelectTheme={chooseLook}
          onUpdateSettings={handleUpdateSettings}
          onRestorePurchases={() => {
            void restoreProEntitlement(REVENUECAT_IOS_KEY).then((status) => {
              if (status === 'active') {
                grantPro(true);
                showToast('Wick Pro restored!');
              } else if (status === 'inactive') {
                clearProGrant();
                showToast('No previous Wick Pro purchase found.');
              } else {
                showToast('Could not reach the App Store. Try again.');
              }
            });
          }}
          onUpgradePro={() => setPaywallReason('general')}
          onResetData={() => {
            void handleResetLocalData();
          }}
          onDebugInjectSteps={handleDebugInjectSteps}
          hint={seenTabs.includes('sanctuary') ? null : TAB_HINTS.sanctuary}
          onDismissHint={() => {
            setSeenTabs((prev) => {
              if (prev.includes('sanctuary')) {
                return prev;
              }
              const next = [...prev, 'sanctuary'];
              kvSet(KEY_SEEN_TABS, JSON.stringify(next));
              return next;
            });
          }}
        />
      )}

      {/* Global Toast Banner (visible across all tabs) */}
      {statusMessage && (
        <View style={styles.toastBanner} pointerEvents="none">
          <Text style={styles.toastText}>{statusMessage}</Text>
        </View>
      )}

      <Modal
        visible={showTrialEnded}
        transparent
        animationType="slide"
        onRequestClose={() => {
          trialNoticeShownRef.current = true;
          setShowTrialEnded(false);
          void SecureStore.setItemAsync(SECURE_TRIAL_NOTICE, '1').catch(() => {});
        }}
      >
        <View style={styles.moodBackdrop}>
          <View style={styles.moodSheet}>
            <Text style={styles.moodTitle}>Your 3 days of full access ended</Text>
            <Text style={styles.moodSub}>
              {PRO_ADDS} {FREE_STAYS}
            </Text>
            <Pressable
              style={styles.nameSaveBtn}
              onPress={() => {
                trialNoticeShownRef.current = true;
                setShowTrialEnded(false);
                void SecureStore.setItemAsync(SECURE_TRIAL_NOTICE, '1').catch(() => {});
                setPaywallReason('general');
              }}
            >
              <Text style={styles.nameSaveBtnText}>
                {proPriceLabel ? `Unlock Wick Pro • ${proPriceLabel}` : 'See Wick Pro'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.moodSkipBtn}
              onPress={() => {
                trialNoticeShownRef.current = true;
                setShowTrialEnded(false);
                void SecureStore.setItemAsync(SECURE_TRIAL_NOTICE, '1').catch(() => {});
              }}
            >
              <Text style={styles.moodSkipText}>Keep the free candle</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PaywallModal
        visible={paywallReason !== null}
        reason={paywallReason ?? 'general'}
        entitlement={entitlement}
        priceLabel={proPriceLabel}
        onStartPro={async () => {
          let price = proPriceLabel;
          if (!price) {
            price = await fetchProPriceLabel(REVENUECAT_IOS_KEY);
            if (price) {
              setProPriceLabel(price);
            }
          }
          if (!price && REVENUECAT_IOS_KEY) {
            showToast('Price unavailable. Check your connection and try again.');
            return;
          }
          const { purchased, sandboxFallback } = await purchaseProPackage(REVENUECAT_IOS_KEY);
          if (purchased) {
            grantPro(!sandboxFallback);
            setPaywallReason(null);
            showToast(sandboxFallback ? 'Dev Pro unlocked for this session.' : 'Welcome to Wick Pro!');
          } else {
            showToast('Purchase could not be completed.');
          }
        }}
        onRestorePurchases={async () => {
          const status = await restoreProEntitlement(REVENUECAT_IOS_KEY);
          if (status === 'active') {
            grantPro(true);
            setPaywallReason(null);
            showToast('Wick Pro restored!');
          } else if (status === 'inactive') {
            clearProGrant();
            showToast('No previous Wick Pro purchase found.');
          } else {
            showToast('Could not reach the App Store. Try again.');
          }
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

      <Modal
        visible={showCandleNameModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          pendingInviteAfterNameRef.current = false;
          setShowCandleNameModal(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.moodBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.moodSheet, { maxHeight: '88%', paddingBottom: Math.max(28, insets.bottom + 16) }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <Text style={styles.moodTitle}>Name Your Candle</Text>
            <Text style={styles.moodSub}>Friends see this name.</Text>
            <TextInput
              style={styles.nameInput}
              value={candleNameDraft}
              onChangeText={(t) => {
                setCandleNameDraft(t.slice(0, 12));
                if (candleNameError) {
                  setCandleNameError(null);
                }
              }}
              placeholder="Your name"
              placeholderTextColor="#71717A"
              maxLength={12}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveCandleNameModal}
            />
            {candleNameError && <Text style={styles.nameErrorText}>{candleNameError}</Text>}
            <Pressable style={styles.nameSaveBtn} onPress={handleSaveCandleNameModal}>
              <Text style={styles.nameSaveBtnText}>
                {pendingInviteAfterNameRef.current ? 'Save and invite' : 'Save'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.moodSkipBtn}
              onPress={() => {
                pendingInviteAfterNameRef.current = false;
                setShowCandleNameModal(false);
              }}
            >
              <Text style={styles.moodSkipText}>Cancel</Text>
            </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {(tabsVisible || activeTab !== 'flame') && (
        <View style={[styles.tabBarWrap, { bottom: Math.max(20, insets.bottom + 8) }]}>
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
  nameInfoBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  nameInfoTitle: { color: '#E4E4E7', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  nameInfoItem: { color: '#A1A1AA', fontSize: 12, lineHeight: 17 },
  nameInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 67, 0.35)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 16,
    fontWeight: '600',
  },
  nameErrorText: { color: '#FCA5A5', fontSize: 12, fontWeight: '600' },
  nameSaveBtn: {
    backgroundColor: '#FF9F43',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nameSaveBtnText: { color: '#0A0A0C', fontSize: 15, fontWeight: '700' },
});
