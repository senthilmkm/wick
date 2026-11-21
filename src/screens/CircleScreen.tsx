import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FirstHint } from '../components/FirstHint';
import { candleStateLabel, CIRCLE_EMPTY_BODY, CIRCLE_INVITE_SENT_BODY } from '../engine/firstRunCopy';
import { ActiveSparkRescue, FriendCandle, WickTheme } from '../types/wick';

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
  hint?: string | null;
  onDismissHint?: () => void;
  inviteSent?: boolean;
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
  hint = null,
  onDismissHint,
  inviteSent = false,
}) => {
  const insets = useSafeAreaInsets();

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
            <Text style={styles.inviteText}>Invite</Text>
          </Pressable>
        </View>
      </View>

      {hint && onDismissHint ? <FirstHint text={hint} onDismiss={onDismissHint} /> : null}

      {canAskSpark ? (
        <View style={styles.sparkAskCard}>
          <View style={styles.sparkAskInfo}>
            <Text style={[styles.sparkAskTitle, { color: theme.primaryText }]}>Ask for Spark</Text>
            <Text style={styles.sparkAskBody}>
              {friends.length > 0 ? 'They walk 500 steps.' : 'This opens a text.'}
            </Text>
          </View>
          <Pressable
            style={styles.sparkAskBtn}
            onPress={onSendSpark}
            accessibilityRole="button"
            accessibilityLabel="Ask for Spark"
          >
            <Text style={styles.sparkAskBtnText}>Ask for Spark</Text>
          </Pressable>
        </View>
      ) : null}

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
            Walk with one friend
          </Text>
          <Text style={styles.emptyBody}>{inviteSent ? CIRCLE_INVITE_SENT_BODY : CIRCLE_EMPTY_BODY}</Text>
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
                  {candleStateLabel(friend.state)} • {friend.streakDays}d streak
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
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: { color: '#F5F5F7', fontSize: 13, fontWeight: '600' },
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
