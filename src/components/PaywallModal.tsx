import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EntitlementState } from '../types/wick';

const PRIVACY_URL = 'https://senthilmkm.github.io/wick/privacy.html';
const TERMS_URL = 'https://senthilmkm.github.io/wick/terms.html';
const SUPPORT_URL = 'https://senthilmkm.github.io/wick/support.html';

export type PaywallReason = 'theme' | 'friend' | 'video' | 'pdf' | 'ledger' | 'dome' | 'general';

interface PaywallModalProps {
  visible: boolean;
  reason: PaywallReason;
  entitlement: EntitlementState;
  priceLabel?: string | null;
  onStartPro: () => void | Promise<void>;
  onRestorePurchases: () => void | Promise<void>;
  onClose: () => void;
}

const REASON_TITLES: Record<PaywallReason, string> = {
  theme: 'Unlock All 6 Moody Themes',
  friend: 'Unlock Unlimited Circle Friends',
  video: 'Weekly Free Export Used',
  pdf: 'Unlock PDF Wax Ledger Reports',
  ledger: 'Unlock Full Day 100+ Wax History',
  dome: 'Unlock Glass Domes (24h Pause)',
  general: 'Keep Your Wick Burning Brighter',
};

export const PaywallModal: React.FC<PaywallModalProps> = ({
  visible,
  reason,
  priceLabel,
  onStartPro,
  onRestorePurchases,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setBusy(false);
    }
  }, [visible]);

  const ctaText = busy
    ? 'Processing...'
    : priceLabel
      ? `Unlock Wick Pro • ${priceLabel}`
      : 'Unlock Wick Pro Forever';

  const handleAction = async (fn: () => void | Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(32, insets.bottom + 16), maxHeight: '88%' }]}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          <Text style={styles.badge}>WICK PRO • LIFETIME</Text>
          <Text style={styles.title}>{REASON_TITLES[reason]}</Text>
          <Text style={styles.body}>
            One-time purchase to unlock all 6 background themes, unlimited Multiplayer Lock Screen
            Widgets, unlimited daily streak shares, PDF Wax Ledger exports, full streak history, and
            Glass Domes forever.
          </Text>

          <Pressable
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => void handleAction(onStartPro)}
          >
            <Text style={styles.primaryText}>{ctaText}</Text>
          </Pressable>

          <View style={styles.footerRow}>
            <Pressable disabled={busy} onPress={() => void handleAction(onRestorePurchases)}>
              <Text style={styles.linkText}>Restore Purchases</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={onClose}>
              <Text style={styles.linkText}>Not Now</Text>
            </Pressable>
          </View>

          <View style={styles.legalRow}>
            <Pressable onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => {})}>
              <Text style={styles.legalText}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.legalDot}>•</Text>
            <Pressable onPress={() => void Linking.openURL(TERMS_URL).catch(() => {})}>
              <Text style={styles.legalText}>Terms of Use</Text>
            </Pressable>
            <Text style={styles.legalDot}>•</Text>
            <Pressable onPress={() => void Linking.openURL(SUPPORT_URL).catch(() => {})}>
              <Text style={styles.legalText}>Support</Text>
            </Pressable>
          </View>
          </ScrollView>
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
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  legalText: {
    color: '#71717A',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: '#71717A',
    fontSize: 12,
  },
});
