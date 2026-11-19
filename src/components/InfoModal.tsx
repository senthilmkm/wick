import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
}

const GUIDE_ITEMS = [
  {
    title: '1. Morning Ignition',
    body: 'Tap the pocket lighter or take your first 5 steps of the day to strike the match and light your candle.',
  },
  {
    title: '2. Living Flame & Pace',
    body: 'Your candle burns bright white-gold when you are on pace with your daily step goal. Sitting still too long causes it to shrink, flicker, and dim to a crimson ember.',
  },
  {
    title: '3. Tap & Long-Press Controls',
    body: 'Tap the candle anytime to peek your live step count and pace %. Long-press the candle to Blow Out for Night or Drop a Glass Dome.',
  },
  {
    title: '4. 60-Min Smoking Grace',
    body: 'If your flame goes out, it enters a 60-minute smoking window. Walk 350 brisk steps—or receive a friend’s Spark—to reignite without breaking your streak.',
  },
  {
    title: '5. Night Mode & Wax Streaks',
    body: 'Blow out your candle at bedtime (or enable iOS Sleep Focus Sync) to freeze decay. Every completed day cools into a permanent colored wax band in your Wax Ledger.',
  },
  {
    title: '6. Glass Dome (24h Rest Pause)',
    body: 'Sick or traveling? Spend 300g of earned wax (or an owned Glass Dome) to freeze your candle for 24 hours with zero streak loss.',
  },
  {
    title: '7. 500-Step Spark Rescue & Circle',
    body: 'Tap Send Spark to text a friend a rescue link. When they walk 500 steps for you, your candle reignites. Use Circle to invite friends and export Wax Ledger PDFs.',
  },
  {
    title: '8. 100% Local-First Privacy',
    body: 'All Apple Health steps, themes, and streak logs stay privately on your iPhone—no accounts, no cloud health storage.',
  },
];

export const InfoModal: React.FC<InfoModalProps> = ({ visible, onClose }) => {
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
    maxHeight: '82%',
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
