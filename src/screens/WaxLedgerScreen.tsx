import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildWeeklyRecapSummary,
  CANDLE_MOOD_COLORS,
  deriveWaxLayerSpec,
  getLocalDateKey,
} from '../engine/candleMath';
import { getVisibleLedgerLimit } from '../engine/trialGuard';
import { CandleMood, EntitlementState, WaxLayer, WickTheme } from '../types/wick';

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
  todayMood?: CandleMood;
  todayDateKey?: string;
  candleName?: string;
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
  todayMood,
  todayDateKey = getLocalDateKey(new Date()),
  candleName,
  theme,
  entitlement,
  onExportPdf,
  onUpgradePro,
}) => {
  const insets = useSafeAreaInsets();
  const [showRecap, setShowRecap] = useState(false);
  const limit = getVisibleLedgerLimit(entitlement);
  const visibleLayers = [...layers].reverse().slice(0, limit);
  const todaySpec = deriveWaxLayerSpec(todaySteps, dailyStepGoal);
  const nextMilestone = MILESTONES.find((m) => streakDays < m.days) ?? MILESTONES[MILESTONES.length - 1];
  const milestonePct = Math.min(100, Math.round((streakDays / nextMilestone.days) * 100));
  const recap = buildWeeklyRecapSummary(layers, todaySteps, dailyStepGoal, todayDateKey, todayMood);
  const titlePrefix = candleName?.trim() ? candleName.trim().toUpperCase() : 'WICK';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(56, insets.top + 16),
          paddingBottom: Math.max(120, insets.bottom + 96),
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.primaryText }]}>
            {candleName?.trim() ? `${candleName.trim()} • Wax Ledger` : 'Wax Ledger'}
          </Text>
          <Text style={styles.subtitle}>
            {streakDays} day streak • {waxGrams}g wax earned
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.weekBtn} onPress={() => setShowRecap(true)}>
            <Text style={styles.weekBtnText}>Week</Text>
          </Pressable>
          <Pressable
            style={[styles.pdfBtn, { backgroundColor: theme.accent }]}
            onPress={entitlement.isPro ? onExportPdf : onUpgradePro}
          >
            <Text style={styles.pdfBtnText}>{entitlement.isPro ? 'PDF' : 'Pro PDF'}</Text>
          </Pressable>
        </View>
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
        <View style={styles.badgeRow}>
          {MILESTONES.map((m) => {
            const earned = streakDays >= m.days;
            return (
              <View
                key={m.days}
                style={[
                  styles.milestoneBadge,
                  earned && { borderColor: m.color, backgroundColor: `${m.color}22` },
                ]}
              >
                <View
                  style={[
                    styles.badgeDot,
                    { backgroundColor: earned ? m.color : '#52525B' },
                  ]}
                />
                <Text
                  style={[
                    styles.badgeText,
                    { color: earned ? m.color : '#71717A' },
                  ]}
                >
                  {m.days}d {m.label.replace(' Band', '')}
                </Text>
              </View>
            );
          })}
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
              <Text style={[styles.layerDate, { color: theme.primaryText }]}>
                {layer.mood ? `${layer.date} • ${layer.mood}` : layer.date}
              </Text>
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

      <Modal
        visible={showRecap}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRecap(false)}
      >
        <View style={styles.recapBackdrop}>
          <View style={styles.recapCard}>
            <View style={styles.recapGlow} />
            <Text style={styles.recapBadge}>{titlePrefix} • WEEK IN WAX</Text>
            <Text style={styles.recapDates}>{recap.dateRangeLabel}</Text>

            <View style={styles.ribbonRow}>
              {recap.bands.map((band) => (
                <View
                  key={band.dateKey}
                  style={[
                    styles.ribbonSegment,
                    { backgroundColor: band.colorHex, opacity: band.lit ? 1 : 0.35 },
                  ]}
                />
              ))}
            </View>

            <View style={styles.recapStatsRow}>
              <View style={styles.recapStatBox}>
                <Text style={styles.recapStatVal}>
                  {recap.totalSteps.toLocaleString('en-US')}
                </Text>
                <Text style={styles.recapStatLabel}>Steps</Text>
              </View>
              <View style={styles.recapStatBox}>
                <Text style={styles.recapStatVal}>{recap.daysLit} / 7</Text>
                <Text style={styles.recapStatLabel}>Days Lit</Text>
              </View>
              <View style={styles.recapStatBox}>
                <View style={styles.recapMoodRow}>
                  {recap.topMood && (
                    <View
                      style={[
                        styles.recapMoodDot,
                        { backgroundColor: CANDLE_MOOD_COLORS[recap.topMood] },
                      ]}
                    />
                  )}
                  <Text style={styles.recapStatVal}>{recap.topMood ?? '—'}</Text>
                </View>
                <Text style={styles.recapStatLabel}>Top Mood</Text>
              </View>
            </View>

            <Pressable
              style={[styles.recapShareBtn, { backgroundColor: theme.accent }]}
              onPress={() => {
                void Share.share({
                  title: `${titlePrefix} • Week in Wax`,
                  message: `${titlePrefix} (${recap.dateRangeLabel}): ${recap.totalSteps.toLocaleString(
                    'en-US'
                  )} steps • ${recap.daysLit}/7 days lit${
                    recap.topMood ? ` • Top mood: ${recap.topMood}` : ''
                  } — Keep your wick lit!`,
                }).catch(() => {});
              }}
            >
              <Text style={styles.recapShareText}>Share Week</Text>
            </Pressable>
            <Pressable style={styles.recapDoneBtn} onPress={() => setShowRecap(false)}>
              <Text style={styles.recapDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  weekBtnText: { color: '#F5F5F7', fontWeight: '600', fontSize: 13 },
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  milestoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,159,67,0.12)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  recapBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  recapCard: {
    backgroundColor: '#121216',
    borderRadius: 24,
    padding: 24,
    gap: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,159,67,0.22)',
  },
  recapGlow: {
    position: 'absolute',
    top: -40,
    left: '20%',
    right: '20%',
    height: 100,
    borderRadius: 60,
    backgroundColor: 'rgba(255,159,67,0.16)',
  },
  recapBadge: { color: '#FF9F43', fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  recapDates: { color: '#A1A1AA', fontSize: 13, marginTop: -10 },
  ribbonRow: { flexDirection: 'row', gap: 6, height: 14, marginVertical: 4 },
  ribbonSegment: { flex: 1, borderRadius: 4 },
  recapStatsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  recapStatBox: { alignItems: 'center', flex: 1, gap: 4 },
  recapStatVal: { color: '#F5F5F7', fontSize: 17, fontWeight: '700' },
  recapStatLabel: { color: '#71717A', fontSize: 12 },
  recapMoodRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recapMoodDot: { width: 10, height: 10, borderRadius: 5 },
  recapShareBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  recapShareText: { color: '#0A0A0C', fontSize: 15, fontWeight: '700' },
  recapDoneBtn: { alignItems: 'center', paddingVertical: 6 },
  recapDoneText: { color: '#A1A1AA', fontSize: 13 },
});
