import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';

import { CacheKeys, invalidate, peek, write } from '@/lib/cache';
import { useCachedQuery } from '@/lib/use-cached-query';
import { useAppTheme } from '@/lib/theme';
import { refreshEmailInbox, useEmailRefresher, useOpenEmailThreads } from '@/lib/email-sync';
import {
  fetchEmailThreads, deleteEmailThread, deleteAllEmailThreads, setEmailThreadStatus,
  type EmailThread, type EmailThreadStatus, type EmailThreadsResponse,
} from '@/lib/api';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { EmailRow } from '@/components/EmailRow';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { useConfirm } from '@/components/dashboard/ConfirmDialog';
import { toast } from '@/components/dashboard/Toast';
import type { TabScreenProps } from '../../navigation/types';

type Props = TabScreenProps<'Inbox'>;

/**
 * The support inbox: mail sent to support@thegymflow.in, newest activity first.
 *
 * The first page of each list comes from the shared cache, so switching to this tab paints
 * at once and a new message arrives through the single realtime subscription in
 * email-sync.ts. Older pages load on scroll and live only in this screen's state.
 */
export default function InboxScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const confirm = useConfirm();
  const [status, setStatus] = useState<EmailThreadStatus>('open');
  const [refreshing, setRefreshing] = useState(false);

  const open = useOpenEmailThreads();
  const archived = useCachedQuery<EmailThreadsResponse>({
    key: CacheKeys.emailThreads('archived'),
    fetcher: () => fetchEmailThreads('archived'),
    enabled: status === 'archived',
  });
  useEmailRefresher(archived.refresh);

  const current = status === 'open' ? open : archived;
  const first = current.data?.threads ?? [];

  // Pages beyond the first. Reset whenever the first page changes, so a refresh or a new
  // message never leaves stale older rows stacked under fresh ones.
  const [extra, setExtra] = useState<EmailThread[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtra([]);
    setCursor(current.data?.nextCursor ?? null);
  }, [current.data, status]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchEmailThreads(status, cursor);
      setExtra(prev => [...prev, ...page.threads]);
      setCursor(page.nextCursor);
    } catch {
      // Leave the cursor as it was: the next scroll to the end tries again.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, status]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await current.refresh(); } finally { setRefreshing(false); }
  }, [current]);

  const threads = [...first, ...extra];

  // The row has already slid away: remove it from the shared first-page cache (which also
  // fixes the tab's unread badge) and from any older pages held here, then tell the server.
  // A refusal puts the real list back through the refresh.
  const onDeleteOne = useCallback((t: EmailThread) => {
    const key = CacheKeys.emailThreads(status);
    const cur = peek<EmailThreadsResponse>(key)?.data;
    if (cur) {
      write<EmailThreadsResponse>(key, {
        ...cur,
        threads: cur.threads.filter(x => x.id !== t.id),
        unreadTotal: status === 'open' ? Math.max(0, cur.unreadTotal - t.unread_count) : cur.unreadTotal,
      });
    }
    setExtra(prev => prev.filter(x => x.id !== t.id));
    invalidate(CacheKeys.emailThread(t.id));
    deleteEmailThread(t.id).catch(e => {
      toast.show(`Could not delete: ${e?.message ?? 'Please try again.'}`, 'error');
      current.refresh();
    });
  }, [status, current]);

  // Swipe left: archive (from Inbox) or move back to the inbox (from Archived). The row has
  // already slid away, so it leaves this list at once; the other list is marked stale so it
  // shows the thread the next time it is opened.
  const onMoveOne = useCallback((t: EmailThread) => {
    const target: EmailThreadStatus = status === 'open' ? 'archived' : 'open';
    const key = CacheKeys.emailThreads(status);
    const cur = peek<EmailThreadsResponse>(key)?.data;
    if (cur) {
      write<EmailThreadsResponse>(key, {
        ...cur,
        threads: cur.threads.filter(x => x.id !== t.id),
        unreadTotal: status === 'open' ? Math.max(0, cur.unreadTotal - t.unread_count) : cur.unreadTotal,
      });
    }
    setExtra(prev => prev.filter(x => x.id !== t.id));
    setEmailThreadStatus(t.id, target)
      .then(() => { invalidate(CacheKeys.emailThreads(target)); refreshEmailInbox(); })
      .catch(e => {
        toast.show(`Could not move: ${e?.message ?? 'Please try again.'}`, 'error');
        current.refresh();
      });
  }, [status, current]);

  const onDeleteAll = useCallback(async () => {
    const label = status === 'open' ? 'Inbox' : 'Archived';
    const ok = await confirm({
      title: `Delete all in ${label}?`,
      description: 'Every conversation in this list is deleted for good, with its messages. It cannot be undone.',
      confirmText: 'Delete all',
      destructive: true,
    });
    if (!ok) return;
    const key = CacheKeys.emailThreads(status);
    const cur = peek<EmailThreadsResponse>(key)?.data;
    write<EmailThreadsResponse>(key, {
      threads: [], nextCursor: null, unreadTotal: status === 'open' ? 0 : (cur?.unreadTotal ?? 0),
    });
    setExtra([]);
    setCursor(null);
    deleteAllEmailThreads(status).catch(e => {
      toast.show(`Could not delete: ${e?.message ?? 'Please try again.'}`, 'error');
      current.refresh();
    });
  }, [status, current, confirm]);

  return (
    <View className="flex-1 bg-background">
      <Tabs
        value={status}
        onValueChange={v => setStatus(v === 'archived' ? 'archived' : 'open')}
        className="m-4 mb-0"
      >
        <TabsList className="w-full">
          <TabsTrigger value="open" className="flex-1">
            <Text>Inbox</Text>
          </TabsTrigger>
          <TabsTrigger value="archived" className="flex-1">
            <Text>Archived</Text>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {threads.length > 0 && (
        <View className="flex-row items-center justify-between gap-2 px-4 pt-3">
          <Text className="flex-1 text-xs text-muted-foreground">
            Swipe right to delete · left to {status === 'open' ? 'archive' : 'restore'}
          </Text>
          <Button variant="ghost" size="sm" onPress={onDeleteAll} accessibilityRole="button">
            <Icon name="trash-2" size={13} className="text-destructive" />
            <Text className="text-destructive">Delete all</Text>
          </Button>
        </View>
      )}

      <FlatList
        data={threads}
        keyExtractor={item => item.id}
        contentContainerClassName="pb-24 pt-2"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedForeground} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <SwipeToDelete
            onDelete={() => onDeleteOne(item)}
            onSwipeLeft={() => onMoveOne(item)}
            leftLabel={status === 'open' ? 'Archive' : 'Move to inbox'}
            leftIcon={status === 'open' ? 'archive' : 'inbox'}
            radius={0}
          >
            <EmailRow thread={item} onPress={() => navigation.navigate('EmailThread', { threadId: item.id })} />
          </SwipeToDelete>
        )}
        ListFooterComponent={
          loadingMore ? (
            <View className="my-4">
              <ActivityIndicator color={colors.mutedForeground} />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          current.loading ? undefined : (
            <View className="items-center gap-2 px-8 pt-20">
              <Icon name={status === 'open' ? 'inbox' : 'archive'} size={36} className="text-muted-foreground" />
              <Text className="mt-2 text-[15px] font-semibold">{status === 'open' ? 'No emails yet' : 'Nothing archived'}</Text>
              <Text className="text-center text-[13px] leading-[19px] text-muted-foreground">
                {status === 'open'
                  ? 'Mail sent to support@thegymflow.in appears here, and you can reply from the app.'
                  : 'Archived conversations are kept here. A new message from the sender brings one back.'}
              </Text>
            </View>
          )
        }
      />

      {/* Gmail's Compose button: write a new email to someone who has written to support. */}
      <Button
        className="absolute bottom-5 right-4 h-12 rounded-full px-5 shadow-lg shadow-black/20"
        onPress={() => navigation.navigate('EmailCompose')}
        accessibilityRole="button"
        accessibilityLabel="Write a new email"
      >
        <Icon name="edit-2" size={18} />
        <Text>Compose</Text>
      </Button>
    </View>
  );
}
