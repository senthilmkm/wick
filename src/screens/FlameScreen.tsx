import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Candle3DCanvas } from '../components/Candle3DCanvas';
import { CandleSnapshot, WaxLayer, WickTheme } from '../types/wick';

interface FlameScreenProps {
  snapshot: CandleSnapshot;
  theme: WickTheme;
  waxLayers: WaxLayer[];
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
        <Candle3DCanvas snapshot={snapshot} theme={theme} waxLayers={waxLayers} />
      </Pressable>

      {/* Pocket Lighter Button (shown only when unlit for zero-friction ignition) */}
      {snapshot.state === 'UNLIT_MORNING' && (
        <View style={styles.lighterContainer}>
          <Pressable
            style={styles.lighterDevice}
            onPress={onStrikeLighter}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Strike pocket lighter to ignite your candle"
          >
            <View style={styles.lighterCap} />
            <View style={styles.lighterWheel} />
            <View style={styles.lighterBody}>
              <Text style={styles.lighterSparkText}>Strike</Text>
            </View>
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
  },
  lighterCap: {
    width: 24,
    height: 10,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: '#A1A1AA',
    borderBottomWidth: 1,
    borderBottomColor: '#52525B',
  },
  lighterWheel: {
    width: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF9F43',
    marginVertical: 1,
  },
  lighterBody: {
    width: 44,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lighterSparkText: {
    color: '#FF9F43',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
