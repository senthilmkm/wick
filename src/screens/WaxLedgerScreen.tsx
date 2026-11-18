import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getVisibleLedgerLimit } from '../engine/trialGuard';
import { EntitlementState, WaxLayer, WickTheme } from '../types/wick';

interface WaxLedgerScreenProps {
  layers: WaxLayer[];
  streakDays: number;
  waxGrams: number;
  theme: WickTheme;
  entitlement: EntitlementState;
  onExportPdf: () => void;
  onUpgradePro: () => void;
}

export const WaxLedgerScreen: React.FC<WaxLedgerScreenProps> = ({
  layers,
  streakDays,
  waxGrams,
  theme,
  entitlement,
  onExportPdf,
  onUpgradePro,
}) => {
  const limit = getVisibleLedgerLimit(entitlement);
  const visibleLayers = [...layers].reverse().slice(0, limit);

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
});
