import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { ActiveSparkRescue, FriendCandle, WickTheme } from '../types/wick';

const PAIR_STEPS = [
  {
    step: '1. Sign in to iCloud',
    body: 'Make sure both you and your friend are signed in to iCloud in iPhone Settings.',
  },
  {
    step: '2. Send an Invite',
    body: 'Tap "+ Pair Widget" and send the link to your friend via Messages or AirDrop.',
  },
  {
    step: '3. Friend Taps the Link',
    body: 'When they open the link, their iPhone opens Wick and pairs their candle to your Circle.',
  },
  {
    step: '4. Add the Lock Screen Widget',
    body: 'Long-press your iPhone Lock Screen -> Customize -> Add Widgets -> Wick to see live candle status.',
  },
  {
    step: '5. Send a Spark Rescue',
    body: 'If a friend’s flame is fading, tap "Spark" and walk 500 steps to help reignite their candle.',
  },
];

interface CircleScreenProps {
  friends: FriendCandle[];
  activeRescue: ActiveSparkRescue | null;
  theme: WickTheme;
  onInviteFriend: () => void;
  onSendSpark: () => void;
  onRemoveFriend?: (friendId: string) => void;
}

export const CircleScreen: React.FC<CircleScreenProps> = ({
  friends,
  activeRescue,
  theme,
  onInviteFriend,
  onSendSpark,
  onRemoveFriend,
}) => {
  const [infoVisible, setInfoVisible] = useState(false);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.primaryText }]}>Circle</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.inviteBtn, { backgroundColor: theme.accent }]}
            onPress={onInviteFriend}
          >
            <Text style={styles.inviteText}>+ Pair Widget</Text>
          </Pressable>
          <Pressable
            style={styles.infoBtn}
            onPress={() => setInfoVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="How Pair Widget works"
          >
            <Text style={styles.infoBtnText}>i</Text>
          </Pressable>
        </View>
      </View>

      {activeRescue && (
        <View style={styles.rescueCard}>
          <Text style={styles.rescueTitle}>
            Rescuing {activeRescue.senderName}&apos;s Wick
          </Text>
          <Text style={styles.rescueProgress}>
            {activeRescue.stepsWalked} / {activeRescue.stepsRequired} steps
          </Text>
        </View>
      )}

      {friends.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: theme.primaryText }]}>
            Multiplayer Lock Screen Widgets
          </Text>
          <Text style={styles.emptyBody}>
            Pair a partner or friend via iCloud Share to keep their candle on your iOS Lock Screen.
          </Text>
        </View>
      ) : (
        friends.map((friend) => {
          const confirmRemove = () => {
            if (!onRemoveFriend) {
              return;
            }
            Alert.alert(
              'Remove Friend?',
              `Remove ${friend.displayName} from your Circle?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onRemoveFriend(friend.id) },
              ]
            );
          };

          const row = (
            <View style={styles.friendRow}>
              <View>
                <Text style={[styles.friendName, { color: theme.primaryText }]}>
                  {friend.displayName}
                </Text>
                <Text style={styles.friendMeta}>
                  {friend.state.toLowerCase().replace('_', ' ')} • {friend.streakDays}d streak
                </Text>
              </View>
              <Pressable style={styles.sparkSmallBtn} onPress={onSendSpark}>
                <Text style={styles.sparkSmallText}>Spark</Text>
              </Pressable>
            </View>
          );

          if (!onRemoveFriend) {
            return <View key={friend.id}>{row}</View>;
          }

          return (
            <Swipeable
              key={friend.id}
              overshootRight={false}
              renderRightActions={() => (
                <Pressable style={styles.deleteAction} onPress={confirmRemove}>
                  <Text style={styles.deleteActionText}>Delete</Text>
                </Pressable>
              )}
            >
              {row}
            </Swipeable>
          );
        })
      )}

      <Modal
        visible={infoVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>How Pair Widget Works</Text>
              <Pressable onPress={() => setInfoVisible(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Share your live candle with a partner or friend in 5 simple steps:
            </Text>
            <ScrollView style={styles.stepsList} contentContainerStyle={styles.stepsContent}>
              {PAIR_STEPS.map((item) => (
                <View key={item.step} style={styles.stepCard}>
                  <Text style={styles.stepTitle}>{item.step}</Text>
                  <Text style={styles.stepBody}>{item.body}</Text>
                </View>
              ))}
            </ScrollView>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  inviteText: { color: '#0A0A0C', fontWeight: '700', fontSize: 13 },
  infoBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: { color: '#F5F5F7', fontSize: 14, fontWeight: '700', fontStyle: 'italic' },
  rescueCard: {
    backgroundColor: 'rgba(255,159,67,0.18)',
    borderRadius: 16,
    padding: 16,
  },
  rescueTitle: { color: '#FF9F43', fontWeight: '700', fontSize: 15 },
  rescueProgress: { color: '#F5F5F7', fontSize: 14, marginTop: 4 },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyBody: { color: '#A1A1AA', fontSize: 13, lineHeight: 19 },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
  },
  friendName: { fontSize: 16, fontWeight: '600' },
  friendMeta: { color: '#A1A1AA', fontSize: 13, marginTop: 2 },
  sparkSmallBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  sparkSmallText: { color: '#FF9F43', fontWeight: '600', fontSize: 13 },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderRadius: 14,
    marginLeft: 8,
  },
  deleteActionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#121216',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { color: '#F5F5F7', fontSize: 20, fontWeight: '700' },
  modalClose: { color: '#FF9F43', fontSize: 15, fontWeight: '600' },
  modalSubtitle: { color: '#A1A1AA', fontSize: 13, lineHeight: 19 },
  stepsList: { flexGrow: 0 },
  stepsContent: { gap: 10 },
  stepCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  stepTitle: { color: '#FF9F43', fontSize: 14, fontWeight: '700' },
  stepBody: { color: '#D4D4D8', fontSize: 13, lineHeight: 19 },
});
