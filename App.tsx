import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaywallModal, PaywallReason } from './src/components/PaywallModal';
import { getThemeById } from './src/constants/themes';
import { getLocalDateKey, getLocalWeekKey } from './src/engine/candleMath';
import {
  activateGlassDome,
  createMorningSnapshot,
  evaluateCandleState,
  igniteWithLighter,
  triggerNightBlowOut,
} from './src/engine/candleStateMachine';
import {
  canAddFriend,
  canExportPdf,
  canExportVideo,
  canUseTheme,
  recordVideoExport,
} from './src/engine/trialGuard';
import { CircleScreen } from './src/screens/CircleScreen';
import { FlameScreen } from './src/screens/FlameScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { SanctuaryScreen } from './src/screens/SanctuaryScreen';
import { WaxLedgerScreen } from './src/screens/WaxLedgerScreen';
import { DEFAULT_SETTINGS } from './src/services/storageService';
import {
  CandleSnapshot,
  EntitlementState,
  FriendCandle,
  ThemeId,
  UserSettings,
  WaxLayer,
} from './src/types/wick';

type TabKey = 'flame' | 'ledger' | 'circle' | 'sanctuary';

export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('flame');
  const [tabsVisible, setTabsVisible] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<PaywallReason | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [waxLayers, setWaxLayers] = useState<WaxLayer[]>([]);
  const [friends] = useState<FriendCandle[]>([]);
  const [entitlement, setEntitlement] = useState<EntitlementState>(() => ({
    isPro: false,
    isEligibleForIntroTrial: true,
    starterDomeClaimed: false,
    firstInstallAt: Date.now(),
    freeVideoExportsThisWeek: 0,
    weekKey: getLocalWeekKey(new Date()),
  }));

  const [snapshot, setSnapshot] = useState<CandleSnapshot>(() =>
    createMorningSnapshot(getLocalDateKey(new Date()), Date.now(), 0, 0, 1)
  );

  const theme = getThemeById(settings.themeId);

  const scheduleAutoHide = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    setTabsVisible(true);
    if (activeTab === 'flame') {
      hideTimerRef.current = setTimeout(() => {
        setTabsVisible(false);
      }, 4000);
    }
  };

  useEffect(() => {
    scheduleAutoHide();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [activeTab]);

  if (!onboarded) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <StatusBar style="light" />
        <OnboardingScreen
          initialGoal={settings.dailyStepGoal}
          onComplete={(goal) => {
            setSettings((prev) => ({ ...prev, dailyStepGoal: goal }));
            setOnboarded(true);
          }}
        />
      </GestureHandlerRootView>
    );
  }

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDebugInjectSteps = (delta: number) => {
    const res = evaluateCandleState({
      snapshot,
      stepsToday: snapshot.stepsToday + delta,
      settings,
      now: new Date(),
    });
    setSnapshot(res.snapshot);
    if (res.completedDayLayer) {
      setWaxLayers((prev) => [...prev, res.completedDayLayer!]);
    }
  };

  return (
    <GestureHandlerRootView style={[styles.flex, { backgroundColor: theme.canvasTop }]}>
      <StatusBar style="light" />

      {activeTab === 'flame' && (
        <FlameScreen
          snapshot={snapshot}
          theme={theme}
          waxLayers={waxLayers}
          statusMessage={statusMessage}
          onStrikeLighter={() => {
            setSnapshot((prev) => igniteWithLighter(prev, Date.now()));
            showToast('Wick lit! Walk to keep the flame blazing.');
          }}
          onShareVideo={() => {
            const now = new Date();
            if (!canExportVideo(entitlement, now)) {
              setPaywallReason('video');
              return;
            }
            setEntitlement((prev) => recordVideoExport(prev, now));
            showToast('Rendering 3s candle loop for Share Sheet...');
          }}
          onSendSpark={() => showToast('Spark link ready to share with a friend.')}
          onActivateGlassDome={() => {
            const res = activateGlassDome(snapshot, Date.now());
            if (res.activated) {
              setSnapshot(res.snapshot);
              showToast('Glass Dome active for 24 hours.');
            } else if (res.reason) {
              showToast(res.reason);
            }
          }}
          onBlowOutNight={() => {
            setSnapshot((prev) => triggerNightBlowOut(prev, Date.now()));
            showToast('Goodnight. Wax is cooling.');
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
          entitlement={entitlement}
          onExportPdf={() => {
            if (!canExportPdf(entitlement)) {
              setPaywallReason('pdf');
              return;
            }
            showToast('Generating Wax Ledger PDF...');
          }}
          onUpgradePro={() => setPaywallReason('ledger')}
        />
      )}

      {activeTab === 'circle' && (
        <CircleScreen
          friends={friends}
          activeRescue={null}
          theme={theme}
          onInviteFriend={() => {
            if (!canAddFriend(entitlement, friends.length)) {
              setPaywallReason('friend');
              return;
            }
            showToast('Opening iCloud Share for Lock Screen Widget...');
          }}
          onSendSpark={() => showToast('Spark link ready to share with a friend.')}
        />
      )}

      {activeTab === 'sanctuary' && (
        <SanctuaryScreen
          settings={settings}
          theme={theme}
          entitlement={entitlement}
          glassDomesOwned={snapshot.glassDomesOwned}
          onSelectTheme={(themeId: ThemeId) => {
            if (!canUseTheme(entitlement, themeId)) {
              setPaywallReason('theme');
              return;
            }
            setSettings((s) => ({ ...s, themeId }));
          }}
          onUpdateSettings={(partial) => setSettings((s) => ({ ...s, ...partial }))}
          onRestorePurchases={() => showToast('Checking App Store receipt...')}
          onUpgradePro={() => setPaywallReason('general')}
          onDebugInjectSteps={handleDebugInjectSteps}
        />
      )}

      <PaywallModal
        visible={paywallReason !== null}
        reason={paywallReason ?? 'general'}
        entitlement={entitlement}
        onStartPro={() => {
          setEntitlement((e) => ({ ...e, isPro: true, isEligibleForIntroTrial: false }));
          setPaywallReason(null);
          showToast('Welcome to Wick Pro!');
        }}
        onRestorePurchases={() => {
          setPaywallReason(null);
          showToast('Checking App Store receipt...');
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
