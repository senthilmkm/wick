import { Canvas, LinearGradient, RoundedRect, Circle, vec } from '@shopify/react-native-skia';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Candle3DCanvas } from '../components/Candle3DCanvas';
import { InfoModal } from '../components/InfoModal';
import { formatTimeLeftLabel } from '../engine/candleMath';
import { CandleSnapshot, UserSettings, WaxLayer, WickTheme } from '../types/wick';

interface FlameScreenProps {
  snapshot: CandleSnapshot;
  settings: UserSettings;
  theme: WickTheme;
  waxLayers: WaxLayer[];
  resumeTick?: number;
  windIntensity?: number;
  tiltAngle?: number;
  statusMessage?: string | null;
  onStrikeLighter: () => void;
  onShareVideo: () => void;
  onSendSpark: () => void;
  onActivateGlassDome: () => void;
  onRemoveGlassDome: () => void;
  onBlowOutNight: () => void;
  onToggleControlsVisibility: () => void;
}

export const FlameScreen: React.FC<FlameScreenProps> = ({
  snapshot,
  settings,
  theme,
  waxLayers,
  resumeTick,
  windIntensity = 0,
  tiltAngle = 0,
  statusMessage,
  onStrikeLighter,
  onShareVideo,
  onSendSpark,
  onActivateGlassDome,
  onRemoveGlassDome,
  onBlowOutNight,
  onToggleControlsVisibility,
}) => {
  const insets = useSafeAreaInsets();
  const [showPacePill, setShowPacePill] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [, setMinuteTick] = useState(0);
  const lastStepsRef = useRef(snapshot.stepsToday);
  const lastDateKeyRef = useRef(snapshot.dateKey);
  const lastStepActivityAtRef = useRef(snapshot.updatedAt || Date.now());

  useEffect(() => {
    if (
      snapshot.dateKey !== lastDateKeyRef.current ||
      snapshot.stepsToday < lastStepsRef.current ||
      snapshot.stepsToday > lastStepsRef.current
    ) {
      lastStepActivityAtRef.current = Date.now();
    }
    lastDateKeyRef.current = snapshot.dateKey;
    lastStepsRef.current = snapshot.stepsToday;
  }, [snapshot.stepsToday, snapshot.dateKey]);

  useEffect(() => {
    const timer = setInterval(() => setMinuteTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const stepsRemaining = Math.max(0, settings.dailyStepGoal - snapshot.stepsToday);
  const goalMet = stepsRemaining === 0;
  const goalRatio = Math.min(1, snapshot.stepsToday / Math.max(1, settings.dailyStepGoal));
  const walkMins = Math.max(1, Math.round(stepsRemaining / 100));
  const isSedentaryDraft =
    !goalMet &&
    snapshot.ignitedAt !== null &&
    snapshot.state !== 'NIGHT_SLEEP' &&
    snapshot.state !== 'GLASS_DOME' &&
    snapshot.state !== 'SMOKING_GRACE' &&
    snapshot.state !== 'EXTINGUISHED' &&
    Date.now() - lastStepActivityAtRef.current >= 60 * 60 * 1000;

  const needsSpark =
    snapshot.state === 'FLICKERING' ||
    snapshot.state === 'DYING_EMBER' ||
    snapshot.state === 'SMOKING_GRACE' ||
    snapshot.state === 'EXTINGUISHED';

  const handleTapCandle = () => {
    setShowPacePill((prev) => !prev);
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
            {goalMet
              ? timeLeftLabel === 'Goal reached'
                ? 'Goal reached!'
                : `Goal reached! • ${timeLeftLabel}`
              : `${stepsRemaining.toLocaleString('en-US')} to go (~${walkMins}m walk) • ${timeLeftLabel}`}
          </Text>
        </View>
        <View style={styles.topRightActions}>
          {needsSpark && (
            <Pressable style={styles.sparkBtn} onPress={onSendSpark}>
              <Text style={styles.sparkBtnText}>Ask Spark</Text>
            </Pressable>
          )}
          <Pressable style={styles.iconBtn} onPress={onShareVideo}>
            <Text style={[styles.iconBtnText, { color: theme.primaryText }]}>Share</Text>
          </Pressable>
          <Pressable
            style={styles.infoCircleBtn}
            onPress={() => setShowInfoModal(true)}
            accessible
            accessibilityRole="button"
            accessibilityLabel="How Wick works and feature guide"
          >
            <Text style={[styles.infoCircleText, { color: theme.primaryText }]}>i</Text>
          </Pressable>
        </View>
      </View>

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
          sedentaryDraft={isSedentaryDraft}
          candleName={settings.candleName}
        />
      </Pressable>

      {/* Realistic Metallic Pocket Lighter Button (shown when unlit or sleeping) */}
      {(snapshot.state === 'UNLIT_MORNING' || snapshot.state === 'NIGHT_SLEEP') && (
        <View style={[styles.lighterContainer, { marginBottom: Math.max(88, insets.bottom + 76) }]}>
          <Pressable
            style={({ pressed }) => [
              styles.lighterDevice,
              pressed && { transform: [{ scale: 0.94 }, { translateY: 2 }] },
            ]}
            onPress={onStrikeLighter}
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
          <Pressable onPress={onStrikeLighter}>
            <Text style={styles.lighterHint}>
              {snapshot.state === 'NIGHT_SLEEP'
                ? 'Tap lighter to relight'
                : 'Tap lighter or walk 5 steps to ignite'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Smoking Grace Comeback Banner (Only shown when urgent) */}
      {snapshot.state === 'SMOKING_GRACE' && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: '#FF9F43' }]}>
            Smoking • walk 350 steps or Ask Spark to rekindle
          </Text>
        </View>
      )}

      {/* Transient Feedback Toast */}
      {statusMessage && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: theme.primaryText }]}>{statusMessage}</Text>
        </View>
      )}

      {/* 1-Hour Sedentary Draft Nudge */}
      {isSedentaryDraft && !statusMessage && !showPacePill && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: '#FF9F43' }]}>
            Still for 1h — walk 100 steps to steady the flame
          </Text>
        </View>
      )}

      {/* Subtle Tap-to-Peek Pace Pill (Zero Clutter) */}
      {showPacePill && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: theme.primaryText }]}>
            {snapshot.stepsToday.toLocaleString('en-US')} steps •{' '}
            {goalMet
              ? 'Goal reached!'
              : `${stepsRemaining.toLocaleString('en-US')} left (~${walkMins}m walk)`}
          </Text>
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
              <Text style={styles.sheetBtnText}>Lift Glass Dome</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.sheetBtn}
              onPress={() => {
                setShowActionsSheet(false);
                onActivateGlassDome();
              }}
            >
              <Text style={styles.sheetBtnText}>Drop Glass Dome (24h Pause)</Text>
            </Pressable>
          )}
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
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  iconBtnText: {
    fontSize: 13,
    fontWeight: '600',
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
