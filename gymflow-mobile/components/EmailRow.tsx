import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { EmailThread } from '@/lib/api';

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

type Props = { thread: EmailThread; onPress: () => void };

/** One conversation in the inbox list. Unread threads get the indigo tint and a count. */
export function EmailRow({ thread, onPress }: Props) {
  const unread = thread.unread_count > 0;
  const who = thread.counterparty_name || thread.counterparty_email;

  return (
    <TouchableOpacity
      style={[styles.card, unread && styles.cardUnread]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? `${thread.unread_count} unread. ` : ''}${who}. ${thread.subject}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{who.trim().charAt(0).toUpperCase() || '?'}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.who, unread && styles.whoUnread]} numberOfLines={1}>{who}</Text>
          <Text style={styles.time}>{timeAgo(thread.last_message_at)}</Text>
        </View>
        <Text style={[styles.subject, unread && styles.subjectUnread]} numberOfLines={1}>
          {thread.subject}
        </Text>
        <View style={styles.bottomRow}>
          <Text style={styles.snippet} numberOfLines={1}>
            {thread.last_direction === 'outbound' ? 'You: ' : ''}
            {thread.snippet || ' '}
          </Text>
          {thread.gyms?.name ? (
            <View style={styles.gymTag}>
              <Feather name="home" size={10} color={Colors.sky} />
              <Text style={styles.gymTagText} numberOfLines={1}>{thread.gyms.name}</Text>
            </View>
          ) : null}
          {unread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{thread.unread_count > 9 ? '9+' : thread.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.lg,
  },
  cardUnread: { borderColor: Colors.indigoBorder, backgroundColor: Colors.indigoBg },
  avatar: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.purpleBg, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.purple, fontWeight: '800', fontSize: 15 },
  body: { flex: 1, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  who: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  whoUnread: { color: Colors.textPrimary, fontWeight: '800' },
  time: { fontSize: 11, color: Colors.textMuted },
  subject: { fontSize: 13, color: Colors.textSecondary },
  subjectUnread: { color: Colors.textPrimary, fontWeight: '700' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  snippet: { flex: 1, fontSize: 12, color: Colors.textMuted },
  gymTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110,
    paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.skyBg,
  },
  gymTagText: { fontSize: 10, fontWeight: '700', color: Colors.sky },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: Colors.indigo, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
});
