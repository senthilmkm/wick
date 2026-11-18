import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { EntitlementState } from '../types/wick';

export type PaywallReason = 'theme' | 'friend' | 'video' | 'pdf' | 'ledger' | 'general';

interface PaywallModalProps {
  visible: boolean;
  reason: PaywallReason;
  entitlement: EntitlementState;
  onStartPro: () => void;
  onRestorePurchases: () => void;
  onClose: () => void;
}

const REASON_TITLES: Record<PaywallReason, string> = {
  theme: 'Unlock All 6 Moody Themes',
  friend: 'Unlock Unlimited Circle Friends',
  video: 'Weekly Free Export Used',
  pdf: 'Unlock PDF Wax Ledger Reports',
  ledger: 'Unlock Full Day 100+ Wax History',
  general: 'Keep Your Wick Burning Brighter',
};

export const PaywallModal: React.FC<PaywallModalProps> = ({
  visible,
  reason,
  entitlement,
  onStartPro,
  onRestorePurchases,
  onClose,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.badge}>WICK PRO</Text>
          <Text style={styles.title}>{REASON_TITLES[reason]}</Text>
          <Text style={styles.body}>
            Get all 6 background themes, unlimited Multiplayer Lock Screen Widgets, watermark-free
            3s Story videos, PDF Wax Ledger exports, full streak history, and 1 bonus Glass Dome
            every month.
          </Text>

          <Pressable style={styles.primaryBtn} onPress={onStartPro}>
            <Text style={styles.primaryText}>
              {entitlement.isEligibleForIntroTrial
                ? 'Start 7-Day Free Trial • Then $14.99/yr'
                : 'Subscribe to Wick Pro • $14.99/yr'}
            </Text>
          </Pressable>

          <View style={styles.footerRow}>
            <Pressable onPress={onRestorePurchases}>
              <Text style={styles.linkText}>Restore Purchases</Text>
            </Pressable>
            <Pressable onPress={onClose}>
              <Text style={styles.linkText}>Not Now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#121216',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  badge: {
    color: '#FF9F43',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  title: {
    color: '#F5F5F7',
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    color: '#A1A1AA',
    fontSize: 14,
    lineHeight: 21,
  },
  primaryBtn: {
    backgroundColor: '#FF9F43',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryText: {
    color: '#0A0A0C',
    fontSize: 15,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  linkText: {
    color: '#A1A1AA',
    fontSize: 13,
  },
});
