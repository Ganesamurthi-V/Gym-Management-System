import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { CacheKeys } from '@/lib/cache';
import { useCachedQuery } from '@/lib/use-cached-query';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  type AdminNotification, type NotificationsResponse,
} from '@/lib/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TYPE_META: Record<AdminNotification['type'], { icon: string; color: string }> = {
  ticket: { icon: 'life-buoy', color: Colors.sky },
  feedback: { icon: 'star', color: Colors.amber },
  payment_request: { icon: 'credit-card', color: Colors.emerald },
  new_gym: { icon: 'home', color: Colors.indigo },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, refresh } = useCachedQuery<NotificationsResponse>({
    key: CacheKeys.notifications,
    fetcher: fetchNotifications,
  });
  const notifications = data?.notifications ?? [];

  useRealtimeInvalidation({
    channelName: 'admin:notifications',
    onInvalidate: refresh,
    refetchOnSubscribe: false,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  const openItem = useCallback(async (n: AdminNotification) => {
    // Mark read optimistically, then deep-link to the relevant gym.
    if (!n.is_read) {
      markNotificationRead(n.id).then(refresh).catch(() => {});
    }
    if (n.gym_id) {
      navigation.navigate('GymDetail', { gymId: n.gym_id });
    }
  }, [navigation, refresh]);

  const onMarkAll = useCallback(() => {
    markAllNotificationsRead().then(refresh).catch(() => {});
  }, [refresh]);

  const hasUnread = notifications.some(n => !n.is_read);

  return (
    <View style={styles.root}>
      {hasUnread && (
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.markAllBtn} onPress={onMarkAll} activeOpacity={0.75}>
            <Feather name="check-circle" size={13} color={Colors.indigo} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.indigo} />
        }
        renderItem={({ item }) => {
          const meta = TYPE_META[item.type] ?? { icon: 'bell', color: Colors.textSecondary };
          return (
            <TouchableOpacity
              style={[styles.card, !item.is_read && styles.cardUnread]}
              onPress={() => openItem(item)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconWrap, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
                <Feather name={meta.icon as any} size={16} color={meta.color} />
              </View>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  {!item.is_read && <View style={styles.dot} />}
                </View>
                <Text style={styles.message} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Feather name="bell-off" size={36} color={Colors.bgCardBorder} />
              <Text style={styles.emptyText}>No notifications yet.</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.md },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  markAllText: { fontSize: 12, fontWeight: '700', color: Colors.indigo },
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxxl },
  card: {
    flexDirection: 'row', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.lg,
  },
  cardUnread: { borderColor: Colors.indigoBorder, backgroundColor: Colors.indigoBg },
  iconWrap: {
    width: 38, height: 38, borderRadius: Radius.md,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.indigo },
  message: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  time: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingVertical: 64 },
  emptyText: { fontSize: 13, color: Colors.textMuted },
});
