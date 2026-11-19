import {
  BlurMask,
  Canvas,
  Circle,
  LinearGradient,
  Path,
  RadialGradient,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
}

interface FlameFlavor {
  id: string;
  label: string;
  pace: string;
  color: string;
  glow: string;
  intensity: number;
  isNight?: boolean;
  isSmoking?: boolean;
  desc: string;
}

const FLAME_FLAVORS: FlameFlavor[] = [
  {
    id: 'blazing',
    label: 'Blazing',
    pace: '100%+ pace',
    color: '#FFF6D6',
    glow: '#FF9E2C',
    intensity: 1,
    desc: 'Tall white-gold flame with wide warm room light when you are on or ahead of pace.',
  },
  {
    id: 'steady',
    label: 'Steady',
    pace: '80% – 99%',
    color: '#FF9E2C',
    glow: '#FF8C24',
    intensity: 0.7,
    desc: 'Calm, cozy amber-orange flame burning smoothly.',
  },
  {
    id: 'flickering',
    label: 'Flickering',
    pace: '50% – 79%',
    color: '#E85D04',
    glow: '#E85D04',
    intensity: 0.45,
    desc: 'Smaller, swaying orange flame signaling it is time for a short walk.',
  },
  {
    id: 'ember',
    label: 'Dying Ember',
    pace: '25% – 49%',
    color: '#9D0208',
    glow: '#9D0208',
    intensity: 0.22,
    desc: 'Tiny crimson ember with dim light—walk a few minutes to brighten back up.',
  },
  {
    id: 'smoking',
    label: 'Smoking Grace',
    pace: '< 25% pace',
    color: '#52525B',
    glow: '#DC2626',
    intensity: 0,
    isSmoking: true,
    desc: 'Flame is out with a glowing red wick and smoke. Walk 350 steps before midnight to rekindle.',
  },
  {
    id: 'night',
    label: 'Night Mode',
    pace: 'Bedtime',
    color: '#7CC6FE',
    glow: '#7CC6FE',
    intensity: 0.35,
    isNight: true,
    desc: 'Lunar-blue nightlight that freezes decay while you sleep and hardens your wax streak.',
  },
];

const GUIDE_ITEMS = [
  {
    title: '1. Morning Ignition',
    body: 'Tap the pocket lighter or take your first 5 steps of the day to strike the match and light your candle.',
  },
  {
    title: '2. Tap & Long-Press Controls',
    body: 'Tap the candle anytime to peek your live step count and pace %. Long-press the candle to Blow Out for Night or Drop a Glass Dome.',
  },
  {
    title: '3. Evening Comeback (Smoking Grace)',
    body: 'Busy day? Your candle stays in Smoking Grace until midnight—walk 350 brisk steps (or get a friend’s Spark) to reignite without losing your streak.',
  },
  {
    title: '4. Night Mode & Wax Streaks',
    body: 'Blow out your candle at bedtime (or enable iOS Sleep Focus Sync) to freeze decay. Every completed day cools into a permanent colored wax band in your Wax Ledger.',
  },
  {
    title: '5. Glass Dome (24h Rest Pause)',
    body: 'Sick or traveling? Spend 300g of earned wax (or an owned Glass Dome) to freeze your candle for 24 hours with zero streak loss.',
  },
  {
    title: '6. 500-Step Spark Rescue & Circle',
    body: 'Tap Send Spark to text a friend a rescue link. When they walk 500 steps for you, your candle reignites. Use Circle to invite friends and export Wax Ledger PDFs.',
  },
  {
    title: '7. 100% Local-First Privacy',
    body: 'All Apple Health steps, themes, and streak logs stay privately on your iPhone—no accounts, no cloud health storage.',
  },
];

export const InfoModal: React.FC<InfoModalProps> = ({ visible, onClose }) => {
  const [selectedId, setSelectedId] = useState<string>('blazing');
  const flavor = FLAME_FLAVORS.find((f) => f.id === selectedId) ?? FLAME_FLAVORS[0];

  const miniFlamePath = useMemo(() => {
    const h = 14 + flavor.intensity * 30;
    const w = 9 + flavor.intensity * 12;
    const cx = 40;
    const baseY = 58;
    const p = Skia.Path.Make();
    p.moveTo(cx, baseY - h);
    p.cubicTo(cx + w * 0.55, baseY - h * 0.55, cx + w * 0.72, baseY - h * 0.14, cx, baseY);
    p.cubicTo(cx - w * 0.72, baseY - h * 0.14, cx - w * 0.55, baseY - h * 0.55, cx, baseY - h);
    p.close();
    return p;
  }, [flavor.intensity]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>How Wick Works</Text>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {/* Interactive Candle Flame Flavors Preview */}
            <View style={styles.flavorCard}>
              <Text style={styles.flavorHeader}>Tap to preview candle flavors by pace %</Text>
              <Text style={styles.paceExplainer}>
                Pace % compares your steps so far today against where you should be between your Wake
                and Sleep hours.
              </Text>
              <View style={styles.previewRow}>
                <Canvas style={styles.miniCanvas}>
                  {flavor.intensity > 0 ? (
                    <>
                      <Circle cx={40} cy={42} r={34}>
                        <RadialGradient
                          c={vec(40, 42)}
                          r={34}
                          colors={[`${flavor.glow}66`, 'transparent']}
                        />
                        <BlurMask blur={8} style="normal" />
                      </Circle>
                      <Path
                        path={miniFlamePath}
                        color={flavor.isNight ? '#38BDF8' : '#FF7A18'}
                        opacity={0.45}
                      >
                        <BlurMask blur={6} style="normal" />
                      </Path>
                      <Path path={miniFlamePath}>
                        <LinearGradient
                          start={vec(40, 14)}
                          end={vec(40, 58)}
                          colors={
                            flavor.isNight
                              ? ['#E0F2FE', '#7CC6FE', '#0284C7']
                              : ['#FFFBE6', '#FFB703', flavor.color]
                          }
                        />
                      </Path>
                    </>
                  ) : (
                    <>
                      <Circle cx={40} cy={42} r={8} color="rgba(161,161,170,0.45)">
                        <BlurMask blur={6} style="normal" />
                      </Circle>
                      <Circle cx={40} cy={56} r={3} color="#FF6B1A" />
                    </>
                  )}
                </Canvas>
                <View style={styles.flavorInfo}>
                  <Text style={styles.flavorTitle}>
                    {flavor.label} • {flavor.pace}
                  </Text>
                  <Text style={styles.itemBody}>{flavor.desc}</Text>
                </View>
              </View>
              <View style={styles.chipRow}>
                {FLAME_FLAVORS.map((item) => {
                  const active = item.id === flavor.id;
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setSelectedId(item.id)}
                    >
                      <View style={[styles.chipDot, { backgroundColor: item.glow }]} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {GUIDE_ITEMS.map((item) => (
              <View key={item.title} style={styles.card}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemBody}>{item.body}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: '#121216',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#F5F5F7',
    fontSize: 22,
    fontWeight: '700',
  },
  closeBtn: {
    backgroundColor: 'rgba(255,159,67,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  closeText: {
    color: '#FF9F43',
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    gap: 10,
    paddingBottom: 16,
  },
  flavorCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,159,67,0.22)',
  },
  flavorHeader: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  paceExplainer: {
    color: '#D4D4D8',
    fontSize: 13,
    lineHeight: 18,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  miniCanvas: {
    width: 80,
    height: 70,
    backgroundColor: '#0A0A0C',
    borderRadius: 12,
  },
  flavorInfo: {
    flex: 1,
    gap: 4,
  },
  flavorTitle: {
    color: '#FF9F43',
    fontSize: 15,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  chipActive: {
    backgroundColor: 'rgba(255,159,67,0.2)',
    borderWidth: 1,
    borderColor: '#FF9F43',
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    color: '#D4D4D8',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FF9F43',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  itemTitle: {
    color: '#FF9F43',
    fontSize: 14,
    fontWeight: '700',
  },
  itemBody: {
    color: '#D4D4D8',
    fontSize: 13,
    lineHeight: 19,
  },
});
