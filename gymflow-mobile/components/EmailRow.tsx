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

// Mail apps colour each sender's circle so a list is easy to scan. The colour is derived from
// the address, so the same sender is always the same colour.
const AVATAR_COLORS = ['#ef4444', '#f97316', '#d97706', '#16a34a', '#0d9488', '#0284c7', '#4f46e5', '#9333ea', '#db2777'];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function Avatar({ name, seed, size = 40 }: { name: string; seed: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(seed) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
}

type Props = { thread: EmailThread; onPress: () => void };

/**
 * One conversation in the inbox, laid out like Gmail: a coloured sender circle, the sender
 * and time on the first line, the subject on the second, the start of the message on the
 * third. Unread conversations are bold, as in Gmail.
 */
export function EmailRow({ thread, onPress }: Props) {
  const unread = thread.unread_count > 0;
  const who = thread.counterparty_name || thread.counterparty_email;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? `${thread.unread_count} unread. ` : ''}${who}. ${thread.subject}`}
    >
      <Avatar name={who} seed={thread.counterparty_email} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.who, unread && styles.bold]} numberOfLines={1}>{who}</Text>
          <Text style={[styles.time, unread && styles.timeUnread]}>{timeAgo(thread.last_message_at)}</Text>
        </View>

        <View style={styles.midRow}>
          <Text style={[styles.subject, unread && styles.bold]} numberOfLines={1}>{thread.subject}</Text>
          {unread && thread.unread_count > 1 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{thread.unread_count > 9 ? '9+' : thread.unread_count}</Text>
            </View>
          )}
        </View>

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
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.bgCardBorder,
  },
  avatar: { alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarText: { color: '#fff', fontWeight: '700' },
  body: { flex: 1, gap: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  who: { flex: 1, fontSize: 15, color: Colors.textSecondary },
  bold: { color: Colors.textPrimary, fontWeight: '800' },
  time: { fontSize: 12, color: Colors.textMuted },
  timeUnread: { color: Colors.textPrimary, fontWeight: '700' },
  midRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  subject: { flex: 1, fontSize: 14, color: Colors.textSecondary },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  snippet: { flex: 1, fontSize: 13, color: Colors.textMuted },
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
