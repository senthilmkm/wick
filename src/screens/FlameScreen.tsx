import { Canvas, LinearGradient, RoundedRect, Circle, vec } from '@shopify/react-native-skia';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Candle3DCanvas } from '../components/Candle3DCanvas';
import { CandleSnapshot, WaxLayer, WickTheme } from '../types/wick';

interface FlameScreenProps {
  snapshot: CandleSnapshot;
  theme: WickTheme;
  waxLayers: WaxLayer[];
  resumeTick?: number;
  statusMessage?: string | null;
  onStrikeLighter: () => void;
  onShareVideo: () => void;
  onSendSpark: () => void;
  onActivateGlassDome: () => void;
  onBlowOutNight: () => void;
  onToggleControlsVisibility: () => void;
}

export const FlameScreen: React.FC<FlameScreenProps> = ({
  snapshot,
  theme,
  waxLayers,
  resumeTick,
  statusMessage,
  onStrikeLighter,
  onShareVideo,
  onSendSpark,
  onActivateGlassDome,
  onBlowOutNight,
  onToggleControlsVisibility,
}) => {
  const [showPacePill, setShowPacePill] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);

  const needsSpark =
    snapshot.state === 'FLICKERING' ||
    snapshot.state === 'DYING_EMBER' ||
    snapshot.state === 'SMOKING_GRACE' ||
    snapshot.state === 'EXTINGUISHED';

  const handleTapCandle = () => {
    setShowPacePill((prev) => !prev);
    onToggleControlsVisibility();
  };

  return (
    <View style={styles.root}>
      {/* Top Minimal Corner Actions */}
      <View style={styles.topRow}>
        <Text style={[styles.streakBadge, { color: theme.primaryText }]}>
          Day {snapshot.streakDays}
        </Text>
        <View style={styles.topRightActions}>
          {needsSpark && (
            <Pressable style={styles.sparkBtn} onPress={onSendSpark}>
              <Text style={styles.sparkBtnText}>Send Spark</Text>
            </Pressable>
          )}
          <Pressable style={styles.iconBtn} onPress={onShareVideo}>
            <Text style={[styles.iconBtnText, { color: theme.primaryText }]}>Share</Text>
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
        />
      </Pressable>

      {/* Realistic Metallic Pocket Lighter Button (shown only when unlit) */}
      {snapshot.state === 'UNLIT_MORNING' && (
        <View style={styles.lighterContainer}>
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
          <Text style={styles.lighterHint}>Tap lighter or take 5 steps to ignite</Text>
        </View>
      )}

      {/* Smoking Grace Countdown (Only shown when urgent) */}
      {snapshot.state === 'SMOKING_GRACE' && snapshot.smokingGraceExpiresAt !== null && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: '#FF9F43' }]}>
            {Math.max(1, Math.ceil((snapshot.smokingGraceExpiresAt - Date.now()) / 60000))}m left •
            walk 350 steps or Send Spark
          </Text>
        </View>
      )}

      {/* Transient Feedback Toast */}
      {statusMessage && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: theme.primaryText }]}>{statusMessage}</Text>
        </View>
      )}

      {/* Subtle Tap-to-Peek Pace Pill (Zero Clutter) */}
      {showPacePill && (
        <View style={styles.pacePill}>
          <Text style={[styles.paceText, { color: theme.primaryText }]}>
            {snapshot.stepsToday.toLocaleString('en-US')} steps •{' '}
            {Math.round(snapshot.paceRatio * 100)}% pace
          </Text>
        </View>
      )}

      {/* Long-Press Quick Actions Modal */}
      {showActionsSheet && (
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
          <Pressable
            style={styles.sheetBtn}
            onPress={() => {
              setShowActionsSheet(false);
              onActivateGlassDome();
            }}
          >
            <Text style={styles.sheetBtnText}>Drop Glass Dome (24h Pause)</Text>
          </Pressable>
          <Pressable
            style={[styles.sheetBtn, styles.sheetCancel]}
            onPress={() => setShowActionsSheet(false)}
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}
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
  streakBadge: {
    fontSize: 15,
    fontWeight: '600',
    opacity: 0.8,
  },
  topRightActions: {
    flexDirection: 'row',
    gap: 10,
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
