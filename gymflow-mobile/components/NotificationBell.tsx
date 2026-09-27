import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

import { Colors } from '@/constants/theme';
import { CacheKeys } from '@/lib/cache';
import { useCachedQuery } from '@/lib/use-cached-query';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import { fetchNotifications, type NotificationsResponse } from '@/lib/api';

/**
 * Header bell with an unread badge. Shares the notifications cache key with the
 * Notifications screen, so opening the screen and marking items read updates the
 * badge here without any extra fetch.
 */
export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { data, refresh } = useCachedQuery<NotificationsResponse>({
    key: CacheKeys.notifications,
    fetcher: fetchNotifications,
  });

  useRealtimeInvalidation({
    channelName: 'admin:notifications',
    onInvalidate: refresh,
    refetchOnSubscribe: true,
  });

  const unread = data?.unread ?? 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.btn}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Feather name="bell" size={18} color={Colors.textMuted} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { marginRight: 8, padding: 4 },
  badge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
});
