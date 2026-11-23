import React from 'react';
import { Pressable, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { EmailThread } from '@/lib/api';
import { SenderAvatar } from '@/src/screens/_email/SenderAvatar';

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

/**
 * One conversation in the inbox, laid out like Gmail: a sender circle, the sender and time on
 * the first line, the subject on the second, the start of the message on the third. Unread
 * conversations are bold and carry a primary dot, as in Gmail.
 */
export function EmailRow({ thread, onPress }: Props) {
  const unread = thread.unread_count > 0;
  const who = thread.counterparty_name || thread.counterparty_email;

  return (
    <Pressable
      className="flex-row items-start gap-3 border-b-hairline border-border bg-background px-4 py-3 active:bg-accent"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? `${thread.unread_count} unread. ` : ''}${who}. ${thread.subject}`}
    >
      <View className="mt-0.5">
        <SenderAvatar name={who} />
      </View>

      <View className="flex-1 gap-px">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className={cn('flex-1 text-[15px]', unread ? 'font-extrabold' : 'text-muted-foreground')}
            numberOfLines={1}
          >
            {who}
          </Text>
          {unread && <View className="size-2 rounded-full bg-primary" />}
          <Text className={cn('text-xs', unread ? 'font-bold' : 'text-muted-foreground')}>
            {timeAgo(thread.last_message_at)}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <Text
            className={cn('flex-1 text-sm', unread ? 'font-extrabold' : 'text-muted-foreground')}
            numberOfLines={1}
          >
            {thread.subject}
          </Text>
          {unread && thread.unread_count > 1 && (
            <Badge className="min-w-[18px] px-1.5 py-0">
              <Text>{thread.unread_count > 9 ? '9+' : thread.unread_count}</Text>
            </Badge>
          )}
        </View>

        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-[13px] text-muted-foreground" numberOfLines={1}>
            {thread.last_direction === 'outbound' ? 'You: ' : ''}
            {thread.snippet || ' '}
          </Text>
          {thread.gyms?.name ? (
            <Badge variant="outline" className="max-w-[110px] gap-1">
              <Icon name="home" size={10} className="text-muted-foreground" />
              <Text className="shrink text-[10px] text-muted-foreground" numberOfLines={1}>
                {thread.gyms.name}
              </Text>
            </Badge>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
