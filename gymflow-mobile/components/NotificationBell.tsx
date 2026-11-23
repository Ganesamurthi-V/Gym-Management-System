import React, { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
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
    hydrate(key).finally(() => { refresh(); });
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
      className="mr-2 p-1"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Icon name="bell" size={18} className="text-muted-foreground" />
      {unread > 0 && (
        <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 px-1 py-0">
          <Text className="text-[10px] font-bold leading-none">{unread > 99 ? '99+' : unread}</Text>
        </Badge>
      )}
    </TouchableOpacity>
  );
}
