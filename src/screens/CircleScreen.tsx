import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveSparkRescue, FriendCandle, WickTheme } from '../types/wick';

const PAIR_STEPS = [
  {
    step: '1. Sign in to iCloud (Both Phones)',
    body: 'Make sure both you and your friend are signed in to iCloud in iPhone Settings.',
  },
  {
    step: '2. Send Your Invite',
    body: 'Tap "+ Pair Widget". Wick sends an iCloud link. Both phones need to be signed in to iCloud.',
  },
  {
    step: '3. Pair Both Ways',
    body: 'When your friend taps your link, they see your candle. Have them tap "+ Pair Widget" and send their link back so you see theirs too!',
  },
  {
    step: '4. Add the Lock Screen Widget',
    body: 'Add the Wick widget from the lock screen. After a friend accepts your iCloud invite, that widget shows their candle. With nobody paired, it shows yours.',
  },
  {
    step: '5. Nudge & Ask for Spark (500 Steps)',
    body: 'Tap Nudge to cheer a paired friend inside Wick. If your flame is low, tap Ask for Spark. A paired friend sees the rescue in Circle. Someone who is not paired yet gets an iCloud link.',
  },
];

interface CircleScreenProps {
  friends: FriendCandle[];
  activeRescue: ActiveSparkRescue | null;
  theme: WickTheme;
  onInviteFriend: () => void;
  canAskSpark: boolean;
  onSendSpark: () => void;
  onNudgeFriend?: (friend: FriendCandle) => void;
  onDismissRescue?: () => void;
  onRemoveFriend?: (friendId: string) => void;
}

export const CircleScreen: React.FC<CircleScreenProps> = ({
  friends,
  activeRescue,
  theme,
  onInviteFriend,
  canAskSpark,
  onSendSpark,
  onNudgeFriend,
  onDismissRescue,
  onRemoveFriend,
}) => {
  const insets = useSafeAreaInsets();
  const [infoVisible, setInfoVisible] = useState(false);

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

      {canAskSpark ? (
        <View style={styles.sparkAskCard}>
          <View style={styles.sparkAskInfo}>
            <Text style={[styles.sparkAskTitle, { color: theme.primaryText }]}>
              Ask a Friend for Spark
            </Text>
            <Text style={styles.sparkAskBody}>
              A paired friend sees this in Wick and can walk 500 steps. If you are not paired yet, Wick opens an iCloud link you can send.
            </Text>
          </View>
          <Pressable
            style={styles.sparkAskBtn}
            onPress={onSendSpark}
            accessibilityRole="button"
            accessibilityLabel="Ask for Spark 500 steps"
          >
            <Text style={styles.sparkAskBtnText}>Ask for Spark (500 Steps)</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.sparkWaiting}>
          Ask for Spark appears when your flame is flickering, an ember, smoking, or out.
        </Text>
      )}

      {activeRescue && (
        <View style={styles.rescueCard}>
          <View style={styles.rescueHeader}>
            <Text style={styles.rescueTitle}>
              {activeRescue.completed
                ? `Rescued ${activeRescue.senderName}'s Wick!`
                : `Rescuing ${activeRescue.senderName}'s Wick`}
            </Text>
            {activeRescue.completed && onDismissRescue && (
              <Pressable onPress={onDismissRescue}>
                <Text style={styles.rescueDone}>Done</Text>
              </Pressable>
            )}
          </View>
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
            Pair through iCloud. The lock screen widget then shows their candle. The round widget keeps your streak.
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
              <Pressable
                style={styles.sparkSmallBtn}
                onPress={() => (onNudgeFriend ? onNudgeFriend(friend) : onSendSpark())}
              >
                <Text style={styles.sparkSmallText}>Nudge</Text>
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
  sparkAskCard: {
    backgroundColor: 'rgba(255, 159, 67, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 67, 0.25)',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  sparkAskInfo: { gap: 3 },
  sparkAskTitle: { fontSize: 15, fontWeight: '700' },
  sparkAskBody: { color: '#D4D4D8', fontSize: 12, lineHeight: 17 },
  sparkWaiting: { color: '#A1A1AA', fontSize: 13, lineHeight: 18 },
  sparkAskBtn: {
    backgroundColor: '#FF9F43',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sparkAskBtnText: { color: '#0A0A0C', fontSize: 13, fontWeight: '700' },
  rescueCard: {
    backgroundColor: 'rgba(255,159,67,0.18)',
    borderRadius: 16,
    padding: 16,
  },
  rescueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rescueTitle: { color: '#FF9F43', fontWeight: '700', fontSize: 15 },
  rescueDone: { color: '#F5F5F7', fontWeight: '700', fontSize: 13 },
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
