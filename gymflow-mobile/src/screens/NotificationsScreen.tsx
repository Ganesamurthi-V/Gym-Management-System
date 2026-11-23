import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ListRow } from '@/components/dashboard/ListRow';
import { useConfirm } from '@/components/dashboard/ConfirmDialog';
import { toast } from '@/components/dashboard/Toast';
import { CacheKeys, peek, write } from '@/lib/cache';
import { useCachedQuery } from '@/lib/use-cached-query';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  deleteNotification, deleteAllNotifications,
  type AdminNotification, type NotificationsResponse,
} from '@/lib/api';
import { TONE_TILE, toneColor, type Tone } from '@/components/dashboard/tone';
import { cn } from '@/lib/utils';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TYPE_ICON: Record<AdminNotification['type'], string> = {
  ticket: 'life-buoy',
  feedback: 'star',
  payment_request: 'credit-card',
  new_gym: 'home',
  email: 'mail',
  alert: 'alert-triangle',
};

const TYPE_TONE: Record<AdminNotification['type'], Tone> = {
  ticket: 'amber',
  feedback: 'amber',
  payment_request: 'emerald',
  new_gym: 'blue',
  email: 'sky',
  alert: 'red',
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
  const { colors } = useAppTheme();
  const confirm = useConfirm();

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
    if (n.type === 'email' && n.entity_id) {
      navigation.navigate('EmailThread', { threadId: n.entity_id });
    } else if (n.gym_id) {
      navigation.navigate('GymDetail', { gymId: n.gym_id });
    }
  }, [navigation, refresh]);

  const onMarkAll = useCallback(() => {
    markAllNotificationsRead().then(refresh).catch(() => {});
  }, [refresh]);

  const hasUnread = notifications.some(n => !n.is_read);

  // The row has already slid away, so drop it from the shared cache straight away (the bell's
  // unread badge reads the same cache) and tell the server. If the server refuses, the
  // refresh puts the real list back.
  const onDeleteOne = useCallback((n: AdminNotification) => {
    const cur = peek<NotificationsResponse>(CacheKeys.notifications)?.data;
    if (cur) {
      write<NotificationsResponse>(CacheKeys.notifications, {
        notifications: cur.notifications.filter(x => x.id !== n.id),
        unread: Math.max(0, cur.unread - (n.is_read ? 0 : 1)),
      });
    }
    deleteNotification(n.id).catch(e => {
      toast.show(e?.message ?? 'Could not delete. Please try again.', 'error');
      refresh();
    });
  }, [refresh]);

  const onDeleteAll = useCallback(async () => {
    const ok = await confirm({
      title: 'Delete all notifications?',
      description: 'This clears the whole list. It cannot be undone.',
      confirmText: 'Delete all',
      destructive: true,
    });
    if (!ok) return;
    write<NotificationsResponse>(CacheKeys.notifications, { notifications: [], unread: 0 });
    deleteAllNotifications().catch(e => {
      toast.show(e?.message ?? 'Could not delete. Please try again.', 'error');
      refresh();
    });
  }, [confirm, refresh]);

  return (
    <View className="bg-background flex-1">
      {notifications.length > 0 && (
        <View className="flex-row items-center justify-between px-4 py-2">
          <Text className="text-muted-foreground text-xs">Swipe right to delete</Text>
          <View className="flex-row items-center gap-1">
            {hasUnread && (
              <Button variant="ghost" size="sm" onPress={onMarkAll}>
                <Icon name="check-circle" size={13} />
                <Text>Mark all read</Text>
              </Button>
            )}
            <Button variant="ghost" size="sm" onPress={onDeleteAll} accessibilityRole="button">
              <Icon name="trash-2" size={13} className="text-destructive" />
              <Text className="text-destructive">Delete all</Text>
            </Button>
          </View>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        contentContainerClassName="pb-10"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <SwipeToDelete radius={0} onDelete={() => onDeleteOne(item)}>
            <View className="bg-background px-4">
              <ListRow
                title={item.title}
                subtitle={item.body}
                onPress={() => openItem(item)}
                left={
                  <View className={cn('size-9 items-center justify-center rounded-lg border', TONE_TILE[TYPE_TONE[item.type] ?? 'neutral'])}>
                    <Icon
                      name={TYPE_ICON[item.type] ?? 'bell'}
                      size={16}
                      color={toneColor(TYPE_TONE[item.type] ?? 'neutral', colors)}
                    />
                  </View>
                }
                right={
                  <View className="items-end gap-1.5">
                    {!item.is_read ? <View className="bg-primary size-2 rounded-full" /> : <View className="size-2" />}
                    <Text className="text-muted-foreground text-xs">{timeAgo(item.created_at)}</Text>
                  </View>
                }
              />
            </View>
          </SwipeToDelete>
        )}
        ListEmptyComponent={
          loading ? undefined : (
            <View className="items-center justify-center gap-3 py-16">
              <Icon name="bell-off" size={36} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm">No notifications yet.</Text>
            </View>
          )
        }
      />
    </View>
  );
}
