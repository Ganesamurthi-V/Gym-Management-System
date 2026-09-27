import React, { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

import { Colors } from '@/constants/theme';
import { CacheKeys, hydrate, peek, revalidate, subscribe } from '@/lib/cache';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import { fetchNotifications, type NotificationsResponse } from '@/lib/api';

/**
 * Unread count for the header bell.
 *
 * Deliberately does NOT use useCachedQuery: that hook calls useFocusEffect, which
 * needs a screen's navigation context, and this component is rendered as a
 * navigator `headerRight` — outside it. That combination throws and takes down the
 * header of every tab. This reads the same cache key directly instead, so the
 * badge and the Notifications screen still stay in lockstep.
 */
function useUnreadCount() {
  const key = CacheKeys.notifications;
  const [data, setData] = useState<NotificationsResponse | undefined>(
    () => peek<NotificationsResponse>(key)?.data,
  );

  // Re-render whenever anything writes this key (the screen marking items read).
  useEffect(() => subscribe(key, () => setData(peek<NotificationsResponse>(key)?.data)), [key]);

  const refresh = useCallback(async () => {
    try {
      await revalidate(key, fetchNotifications);
    } catch {
      // Keep the last known badge; a failed refresh must not clear it.
    }
  }, [key]);

  useEffect(() => {
    // Adopt any value from a previous run, then correct it from the network.
    void hydrate(key).finally(() => { void refresh(); });
  }, [key, refresh]);

  return { data, refresh };
}

/**
 * Header bell with an unread badge. Shares the notifications cache key with the
 * Notifications screen, so opening the screen and marking items read updates the
 * badge here without any extra fetch.
 */
export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { data, refresh } = useUnreadCount();

  useRealtimeInvalidation({
    channelName: 'admin:notifications',
    onInvalidate: refresh,
    refetchOnSubscribe: false,
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
