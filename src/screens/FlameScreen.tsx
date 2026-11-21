import { Canvas, LinearGradient, RoundedRect, Circle, vec } from '@shopify/react-native-skia';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Candle3DCanvas } from '../components/Candle3DCanvas';
import { InfoModal } from '../components/InfoModal';
import { formatTimeLeftLabel } from '../engine/candleMath';
import {
  rainClearedByWalk,
  rainNudgeOn,
  rainStaysUntilWalk,
  shortWalkLine,
  shortWalkSteps,
} from '../engine/firstRunCopy';
import { DAILY_SHARE_BUTTON_TITLE } from '../services/shareCardService';
import { playRainNudge, stopRainNudge } from '../services/soundService';
import { CandleSnapshot, ThemeId, UserSettings, WaxLayer, WickTheme } from '../types/wick';

interface FlameScreenProps {
  snapshot: CandleSnapshot;
  settings: UserSettings;
  theme: WickTheme;
  waxLayers: WaxLayer[];
  resumeTick?: number;
  windIntensity?: number;
  tiltAngle?: number;
  maxWaxLayers?: number;
  statusMessage?: string | null;
  shareCardsLabel: string;
  onStrikeLighter: () => void;
  onShareVideo: () => void;
  onSendSpark: () => void;
  onActivateGlassDome: () => void;
  onRemoveGlassDome: () => void;
  onBlowOutNight: () => void;
  onToggleControlsVisibility: () => void;
  coachLine?: string | null;
  onDismissCoach?: () => void;
  showLighter?: boolean;
  trialLooks?: WickTheme[] | null;
  onSelectLook?: (themeId: ThemeId) => void;
  onRainChange?: (on: boolean) => void;
  onCameBack?: () => void;
}

export const FlameScreen: React.FC<FlameScreenProps> = ({
  snapshot,
  settings,
  theme,
  waxLayers,
  resumeTick,
  windIntensity = 0,
  tiltAngle = 0,
  maxWaxLayers,
  statusMessage,
  shareCardsLabel,
  onStrikeLighter,
  onShareVideo,
  onSendSpark,
  onActivateGlassDome,
  onRemoveGlassDome,
  onBlowOutNight,
  onToggleControlsVisibility,
  coachLine = null,
  onDismissCoach,
  showLighter = false,
  trialLooks = null,
  onSelectLook,
  onRainChange,
  onCameBack,
}) => {
  const insets = useSafeAreaInsets();
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [, setMinuteTick] = useState(0);
  const lastStepsRef = useRef(snapshot.stepsToday);
  const lastDateKeyRef = useRef(snapshot.dateKey);
  const lastStepActivityAtRef = useRef(snapshot.updatedAt || Date.now());
  const rainStartStepsRef = useRef<number | null>(null);
  const rainStepsNeededRef = useRef<number | null>(null);
  const cameBackRef = useRef(false);

  if (snapshot.dateKey !== lastDateKeyRef.current) {
    lastDateKeyRef.current = snapshot.dateKey;
    lastStepsRef.current = snapshot.stepsToday;
    lastStepActivityAtRef.current = Date.now();
    rainStartStepsRef.current = null;
    rainStepsNeededRef.current = null;
  }

  useEffect(() => {
    const timer = setInterval(() => setMinuteTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const stepsRemaining = Math.max(0, settings.dailyStepGoal - snapshot.stepsToday);
  const goalMet = stepsRemaining === 0;
  const goalRatio = Math.min(1, snapshot.stepsToday / Math.max(1, settings.dailyStepGoal));
  const rainHeld =
    rainStartStepsRef.current != null &&
    rainStepsNeededRef.current != null &&
    rainStaysUntilWalk({
      goalMet,
      ignitedAt: snapshot.ignitedAt,
      state: snapshot.state,
      stepsGained: snapshot.stepsToday - rainStartStepsRef.current,
      stepsNeeded: rainStepsNeededRef.current,
    });
  if (
    rainStartStepsRef.current != null &&
    rainStepsNeededRef.current != null &&
    !goalMet &&
    rainClearedByWalk(snapshot.stepsToday - rainStartStepsRef.current, rainStepsNeededRef.current)
  ) {
    cameBackRef.current = true;
  }
  if (rainStartStepsRef.current != null && !rainHeld) {
    rainStartStepsRef.current = null;
    rainStepsNeededRef.current = null;
    lastStepsRef.current = snapshot.stepsToday;
    lastStepActivityAtRef.current = Date.now();
  } else if (rainStartStepsRef.current == null) {
    const gained = snapshot.stepsToday - lastStepsRef.current;
    const needed = shortWalkSteps(Math.max(0, settings.dailyStepGoal - lastStepsRef.current));
    if (gained > 0 && rainClearedByWalk(gained, needed)) {
      lastStepsRef.current = snapshot.stepsToday;
      lastStepActivityAtRef.current = Date.now();
    }
  }
  const rainOn =
    rainHeld ||
    rainNudgeOn({
      goalMet,
      ignitedAt: snapshot.ignitedAt,
      state: snapshot.state,
      stillForMs: Date.now() - lastStepActivityAtRef.current,
    });
  if (rainOn && rainStartStepsRef.current == null) {
    rainStartStepsRef.current = snapshot.stepsToday;
    rainStepsNeededRef.current = shortWalkSteps(stepsRemaining);
  }

  useEffect(() => {
    onRainChange?.(rainOn);
  }, [rainOn, onRainChange]);

  useEffect(() => {
    if (!cameBackRef.current) return;
    cameBackRef.current = false;
    onCameBack?.();
  });

  useEffect(() => {
    if (!rainOn || !settings.soundEffectsEnabled) {
      void stopRainNudge();
      return;
    }
    void playRainNudge(true, settings.liveBreezeEnabled);
    return () => {
      void stopRainNudge();
    };
  }, [rainOn, settings.soundEffectsEnabled, settings.liveBreezeEnabled]);

  const needsSpark =
    snapshot.state === 'FLICKERING' ||
    snapshot.state === 'DYING_EMBER' ||
    snapshot.state === 'SMOKING_GRACE' ||
    snapshot.state === 'EXTINGUISHED';

  const handleTapCandle = () => {
    onDismissCoach?.();
    onToggleControlsVisibility();
  };

  const timeLeftLabel = formatTimeLeftLabel(
    new Date(),
    settings.sleepHour,
    settings.sleepMinute,
    snapshot.stepsToday,
    settings.dailyStepGoal,
    snapshot.state
  );

  return (
    <View style={[styles.root, { paddingTop: Math.max(24, insets.top + 8) }]}>
      {/* Top Minimal Corner Actions (Two-Line Micro-Header) */}
      <View style={styles.topRow}>
        <View style={styles.headerLeft}>
          <Text
            style={[styles.streakBadge, { color: theme.primaryText }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            Day {snapshot.streakDays} • {snapshot.stepsToday.toLocaleString('en-US')} /{' '}
            {settings.dailyStepGoal.toLocaleString('en-US')}
          </Text>
          <View style={styles.goalBarTrack}>
            <View
              style={[
                styles.goalBarFill,
                {
                  width: `${Math.round(goalRatio * 100)}%`,
                  backgroundColor: goalMet ? '#FFF6D6' : theme.accent,
                },
              ]}
            />
          </View>
          <Text style={styles.timeLeftSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {goalMet ? (timeLeftLabel === 'Goal reached' ? 'Goal reached!' : timeLeftLabel) : shortWalkLine(stepsRemaining)}
          </Text>
        </View>
        <View style={styles.topRightActions}>
          {(needsSpark || rainOn) && (
            <Pressable style={styles.sparkBtn} onPress={onSendSpark}>
              <Text style={styles.sparkBtnText}>Ask for Spark</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.infoCircleBtn}
            onPress={() => setShowInfoModal(true)}
            accessible
            accessibilityRole="button"
            accessibilityLabel="How it works"
          >
            <Text style={[styles.howItWorks, { color: theme.primaryText }]}>How it works</Text>
          </Pressable>
        </View>
      </View>

      {coachLine ? (
        <Pressable onPress={onDismissCoach} accessibilityRole="button" accessibilityLabel={coachLine}>
          <Text style={styles.coachLine}>{coachLine}</Text>
        </Pressable>
      ) : null}

      {trialLooks && trialLooks.length > 0 ? (
        <View style={styles.lookBlock}>
          <Text style={styles.lookCaption}>Yours for 3 days</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lookRow}>
            {trialLooks.map((look) => {
              const selected = settings.themeId === look.id;
              return (
                <Pressable
                  key={look.id}
                  style={[styles.lookChip, selected && { borderColor: look.accent }]}
                  onPress={() => onSelectLook?.(look.id)}
                  accessibilityRole="button"
                  accessibilityLabel={look.name}
                >
                  <View style={[styles.lookDot, { backgroundColor: look.accent }]} />
                  <Text style={[styles.lookName, { color: theme.primaryText }]}>{look.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Single-Page Hero: 90% Interactive 3D Candle */}
      <Pressable
        style={styles.candleTouchZone}
        onPress={handleTapCandle}
        onLongPress={() => setShowActionsSheet(true)}
      >
        <Candle3DCanvas
          snapshot={snapshot}
          theme={theme}
          waxLayers={waxLayers}
          resumeTick={resumeTick}
          windIntensity={windIntensity}
          tiltAngle={tiltAngle}
          lanternMode={settings.lanternModeEnabled}
          goalMet={goalMet}
          sedentaryDraft={rainOn}
          candleName={settings.candleName}
          maxWaxLayers={maxWaxLayers}
        />
      </Pressable>

      {/* Realistic Metallic Pocket Lighter Button (shown when unlit or sleeping) */}
      {showLighter && (snapshot.state === 'UNLIT_MORNING' || snapshot.state === 'NIGHT_SLEEP') && (
        <View style={[styles.lighterContainer, { marginBottom: Math.max(88, insets.bottom + 76) }]}>
          <Pressable
            style={({ pressed }) => [
              styles.lighterDevice,
              pressed && { transform: [{ scale: 0.94 }, { translateY: 2 }] },
            ]}
            onPress={() => {
              onDismissCoach?.();
              onStrikeLighter();
            }}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Strike pocket lighter to ignite your candle"
          >
            <Canvas style={styles.lighterCanvas}>
              {/* Open hinged metal lid */}
              <RoundedRect x={6} y={4} width={22} height={24} r={5}>
                <LinearGradient
                  start={vec(6, 4)}
                  end={vec(28, 4)}
                  colors={['#52525B', '#D4D4D8', '#3F3F46']}
                />
              </RoundedRect>
              {/* Windguard chimney */}
              <RoundedRect x={30} y={14} width={22} height={16} r={3}>
                <LinearGradient
                  start={vec(30, 14)}
                  end={vec(52, 14)}
                  colors={['#71717A', '#E4E4E7', '#52525B']}
                />
              </RoundedRect>
              {/* Knurled brass flint wheel */}
              <Circle cx={55} cy={22} r={6} color="#F59E0B" />
              <Circle cx={55} cy={22} r={2.5} color="#78350F" />
              {/* Brushed chrome lighter body */}
              <RoundedRect x={14} y={30} width={48} height={54} r={9}>
                <LinearGradient
                  start={vec(14, 30)}
                  end={vec(62, 30)}
                  colors={['#27272A', '#71717A', '#A1A1AA', '#3F3F46', '#18181B']}
                  positions={[0, 0.25, 0.45, 0.8, 1]}
                />
              </RoundedRect>
            </Canvas>
            <Text style={styles.lighterSparkText}>Strike Lighter</Text>
          </Pressable>
          {!coachLine ? (
            <Pressable onPress={onStrikeLighter}>
              <Text style={styles.lighterHint}>Tap the lighter, or take 5 steps.</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Smoking Grace Comeback Banner (Only shown when urgent) */}
      {snapshot.state === 'SMOKING_GRACE' && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: '#FF9F43' }]}>
            Walk 350 steps before midnight, or ask for a Spark.
          </Text>
        </View>
      )}

      {/* Transient Feedback Toast */}
      {statusMessage && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: theme.primaryText }]}>{statusMessage}</Text>
        </View>
      )}

      {/* Long-Press Quick Actions Modal */}
      {showActionsSheet && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowActionsSheet(false)}
          />
          <View style={styles.quickSheet}>
          <Pressable
            style={styles.sheetBtn}
            onPress={() => {
              setShowActionsSheet(false);
              onBlowOutNight();
            }}
          >
            <Text style={styles.sheetBtnText}>Blow Out for Night</Text>
          </Pressable>
          {snapshot.state === 'GLASS_DOME' ? (
            <Pressable
              style={styles.sheetBtn}
              onPress={() => {
                setShowActionsSheet(false);
                onRemoveGlassDome();
              }}
            >
              <Text style={styles.sheetBtnText}>End rest day</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.sheetBtn}
              onPress={() => {
                setShowActionsSheet(false);
                onActivateGlassDome();
              }}
            >
              <Text style={styles.sheetBtnText}>Start a rest day</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.sheetBtn}
            onPress={() => {
              setShowActionsSheet(false);
              onShareVideo();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${DAILY_SHARE_BUTTON_TITLE}. ${shareCardsLabel}`}
          >
            <Text style={styles.sheetBtnText}>
              {DAILY_SHARE_BUTTON_TITLE} · {shareCardsLabel}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sheetBtn, styles.sheetCancel]}
            onPress={() => setShowActionsSheet(false)}
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
        </>
      )}
      <InfoModal visible={showInfoModal} onClose={() => setShowInfoModal(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
    gap: 4,
  },
  goalBarTrack: {
    width: 120,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  goalBarFill: {
    height: 3,
    borderRadius: 2,
  },
  streakBadge: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.9,
  },
  timeLeftSub: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '500',
  },
  coachLine: {
    color: '#F5F5F7',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 12,
    marginRight: 8,
  },
  lookBlock: { marginTop: 10, gap: 6 },
  lookCaption: { color: '#A1A1AA', fontSize: 12, fontWeight: '600' },
  lookRow: { gap: 8, paddingRight: 8 },
  lookChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lookDot: { width: 8, height: 8, borderRadius: 4 },
  lookName: { fontSize: 12, fontWeight: '600' },
  howItWorks: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
  sparkBtn: {
    backgroundColor: '#FF9F43',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  sparkBtnText: {
    color: '#0A0A0C',
    fontWeight: '700',
    fontSize: 13,
  },
  iconBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    alignItems: 'center',
  },
  iconBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  shareQuotaText: {
    color: '#A1A1AA',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  infoCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCircleText: {
    fontSize: 14,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  candleTouchZone: {
    flex: 1,
  },
  lighterContainer: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  lighterDevice: {
    alignItems: 'center',
    gap: 2,
  },
  lighterCanvas: {
    width: 76,
    height: 88,
  },
  lighterSparkText: {
    color: '#FF9F43',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  lighterHint: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '500',
  },
  pacePill: {
    alignSelf: 'center',
    marginBottom: 96,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  paceText: {
    fontSize: 13,
    fontWeight: '500',
  },
  quickSheet: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 12,
    gap: 8,
  },
  sheetBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  sheetBtnText: {
    color: '#F5F5F7',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetCancel: {
    backgroundColor: 'transparent',
  },
  sheetCancelText: {
    color: '#A1A1AA',
    fontSize: 14,
  },
});
