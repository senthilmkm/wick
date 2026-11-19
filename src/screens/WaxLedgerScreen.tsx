import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { deriveWaxLayerSpec } from '../engine/candleMath';
import { getVisibleLedgerLimit } from '../engine/trialGuard';
import { EntitlementState, WaxLayer, WickTheme } from '../types/wick';

const MILESTONES = [
  { days: 7, label: 'Bronze Band', color: '#CD7F32' },
  { days: 14, label: 'Silver Band', color: '#CBD5E1' },
  { days: 30, label: 'Gold Band', color: '#FBBF24' },
  { days: 100, label: 'Diamond Band', color: '#7CC6FE' },
];

interface WaxLedgerScreenProps {
  layers: WaxLayer[];
  streakDays: number;
  waxGrams: number;
  todaySteps?: number;
  dailyStepGoal?: number;
  theme: WickTheme;
  entitlement: EntitlementState;
  onExportPdf: () => void;
  onUpgradePro: () => void;
}

export const WaxLedgerScreen: React.FC<WaxLedgerScreenProps> = ({
  layers,
  streakDays,
  waxGrams,
  todaySteps = 0,
  dailyStepGoal = 8000,
  theme,
  entitlement,
  onExportPdf,
  onUpgradePro,
}) => {
  const limit = getVisibleLedgerLimit(entitlement);
  const visibleLayers = [...layers].reverse().slice(0, limit);
  const todaySpec = deriveWaxLayerSpec(todaySteps, dailyStepGoal);
  const nextMilestone = MILESTONES.find((m) => streakDays < m.days) ?? MILESTONES[MILESTONES.length - 1];
  const milestonePct = Math.min(100, Math.round((streakDays / nextMilestone.days) * 100));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.primaryText }]}>Wax Ledger</Text>
          <Text style={styles.subtitle}>
            {streakDays} day streak • {waxGrams}g wax earned
          </Text>
        </View>
        <Pressable
          style={[styles.pdfBtn, { backgroundColor: theme.accent }]}
          onPress={entitlement.isPro ? onExportPdf : onUpgradePro}
        >
          <Text style={styles.pdfBtnText}>{entitlement.isPro ? 'PDF' : 'Pro PDF'}</Text>
        </Pressable>
      </View>

      {/* Streak Milestone Progress */}
      <View style={styles.milestoneCard}>
        <View style={styles.milestoneTop}>
          <Text style={[styles.milestoneLabel, { color: nextMilestone.color }]}>
            Next Milestone: {nextMilestone.label} ({nextMilestone.days}d)
          </Text>
          <Text style={styles.milestoneCount}>
            {streakDays} / {nextMilestone.days}d
          </Text>
        </View>
        <View style={styles.milestoneTrack}>
          <View
            style={[
              styles.milestoneFill,
              { width: `${milestonePct}%`, backgroundColor: nextMilestone.color },
            ]}
          />
        </View>
      </View>

      {/* Today's In-Progress Wax Band */}
      <View style={styles.todayRow}>
        <View style={[styles.swatch, { backgroundColor: todaySpec.colorHex }]} />
        <View style={styles.layerInfo}>
          <Text style={[styles.layerDate, { color: theme.primaryText }]}>Today (In Progress)</Text>
          <Text style={styles.layerMeta}>
            {todaySteps.toLocaleString('en-US')} / {dailyStepGoal.toLocaleString('en-US')} steps • +
            {todaySpec.waxGramsEarned}g at midnight
          </Text>
        </View>
        <Text style={styles.thickness}>{todaySpec.thicknessMm.toFixed(1)}mm</Text>
      </View>

      {visibleLayers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: theme.primaryText }]}>
            Complete your first day to harden your first wax band.
          </Text>
        </View>
      ) : (
        visibleLayers.map((layer) => (
          <View key={layer.id} style={styles.layerRow}>
            <View style={[styles.swatch, { backgroundColor: layer.colorHex }]} />
            <View style={styles.layerInfo}>
              <Text style={[styles.layerDate, { color: theme.primaryText }]}>{layer.date}</Text>
              <Text style={styles.layerMeta}>
                {layer.stepsAchieved.toLocaleString('en-US')} /{' '}
                {layer.stepGoal.toLocaleString('en-US')} steps
              </Text>
            </View>
            <Text style={styles.thickness}>{layer.thicknessMm.toFixed(1)}mm</Text>
          </View>
        ))
      )}

      {!entitlement.isPro && layers.length > limit && (
        <Pressable style={styles.upgradeBanner} onPress={onUpgradePro}>
          <Text style={styles.upgradeText}>
            Unlock full Day 100+ Wax Ledger with Wick Pro
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 120, gap: 12 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#A1A1AA', fontSize: 14, marginTop: 2 },
  pdfBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  pdfBtnText: { color: '#0A0A0C', fontWeight: '700', fontSize: 13 },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
  },
  emptyText: { fontSize: 14, opacity: 0.8 },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  layerInfo: { flex: 1 },
  layerDate: { fontSize: 15, fontWeight: '600' },
  layerMeta: { color: '#A1A1AA', fontSize: 13, marginTop: 2 },
  thickness: { color: '#A1A1AA', fontSize: 13, fontWeight: '600' },
  upgradeBanner: {
    backgroundColor: 'rgba(255,159,67,0.16)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  upgradeText: { color: '#FF9F43', fontWeight: '600', fontSize: 14 },
  milestoneCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  milestoneTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  milestoneLabel: { fontSize: 13, fontWeight: '700' },
  milestoneCount: { color: '#A1A1AA', fontSize: 12, fontWeight: '600' },
  milestoneTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  milestoneFill: { height: 4, borderRadius: 2 },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,159,67,0.12)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
});
