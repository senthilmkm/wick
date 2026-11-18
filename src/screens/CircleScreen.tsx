import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActiveSparkRescue, FriendCandle, WickTheme } from '../types/wick';

interface CircleScreenProps {
  friends: FriendCandle[];
  activeRescue: ActiveSparkRescue | null;
  theme: WickTheme;
  onInviteFriend: () => void;
  onSendSpark: () => void;
}

export const CircleScreen: React.FC<CircleScreenProps> = ({
  friends,
  activeRescue,
  theme,
  onInviteFriend,
  onSendSpark,
}) => {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.primaryText }]}>Circle</Text>
        <Pressable
          style={[styles.inviteBtn, { backgroundColor: theme.accent }]}
          onPress={onInviteFriend}
        >
          <Text style={styles.inviteText}>+ Pair Widget</Text>
        </Pressable>
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
        friends.map((friend) => (
          <View key={friend.id} style={styles.friendRow}>
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
        ))
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
  inviteBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  inviteText: { color: '#0A0A0C', fontWeight: '700', fontSize: 13 },
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
});
