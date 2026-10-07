import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { CacheKeys, invalidate, peek, write } from '@/lib/cache';
import { useCachedQuery } from '@/lib/use-cached-query';
import { useEmailRefresher, useOpenEmailThreads } from '@/lib/email-sync';
import {
  fetchEmailThreads, deleteEmailThread, deleteAllEmailThreads,
  type EmailThread, type EmailThreadStatus, type EmailThreadsResponse,
} from '@/lib/api';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { EmailRow } from '@/components/EmailRow';
import type { TabScreenProps } from '../../navigation/types';

type Props = TabScreenProps<'Inbox'>;

/**
 * The support inbox: mail sent to support@gymflow.sbs, newest activity first.
 *
 * The first page of each list comes from the shared cache, so switching to this tab paints
 * at once and a new message arrives through the single realtime subscription in
 * email-sync.ts. Older pages load on scroll and live only in this screen's state.
 */
export default function InboxScreen({ navigation }: Props) {
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
      Alert.alert('Could not delete', e?.message ?? 'Please try again.');
      void current.refresh();
    });
  }, [status, current]);

  const onDeleteAll = useCallback(() => {
    const label = status === 'open' ? 'Inbox' : 'Archived';
    Alert.alert(
      `Delete all in ${label}?`,
      'Every conversation in this list is deleted for good, with its messages. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            const key = CacheKeys.emailThreads(status);
            const cur = peek<EmailThreadsResponse>(key)?.data;
            write<EmailThreadsResponse>(key, {
              threads: [], nextCursor: null, unreadTotal: status === 'open' ? 0 : (cur?.unreadTotal ?? 0),
            });
            setExtra([]);
            setCursor(null);
            deleteAllEmailThreads(status).catch(e => {
              Alert.alert('Could not delete', e?.message ?? 'Please try again.');
              void current.refresh();
            });
          },
        },
      ],
    );
  }, [status, current]);

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {(['open', 'archived'] as const).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.tab, status === s && styles.tabActive]}
            onPress={() => setStatus(s)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: status === s }}
          >
            <Text style={[styles.tabText, status === s && styles.tabTextActive]}>
              {s === 'open' ? 'Inbox' : 'Archived'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {threads.length > 0 && (
        <View style={styles.toolbar}>
          <Text style={styles.hint}>Swipe right to delete</Text>
          <TouchableOpacity style={styles.deleteAllBtn} onPress={onDeleteAll} activeOpacity={0.75} accessibilityRole="button">
            <Feather name="trash-2" size={13} color={Colors.red} />
            <Text style={styles.deleteAllText}>Delete all</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={threads}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.indigo} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <SwipeToDelete onDelete={() => onDeleteOne(item)} radius={0}>
            <EmailRow thread={item} onPress={() => navigation.navigate('EmailThread', { threadId: item.id })} />
          </SwipeToDelete>
        )}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.indigo} style={{ marginVertical: Spacing.lg }} /> : null}
        ListEmptyComponent={
          current.loading ? null : (
            <View style={styles.empty}>
              <Feather name={status === 'open' ? 'inbox' : 'archive'} size={36} color={Colors.bgCardBorder} />
              <Text style={styles.emptyTitle}>{status === 'open' ? 'No emails yet' : 'Nothing archived'}</Text>
              <Text style={styles.emptyText}>
                {status === 'open'
                  ? 'Mail sent to support@gymflow.sbs appears here, and you can reply from the app.'
                  : 'Archived conversations are kept here. A new message from the sender brings one back.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  tabs: {
    flexDirection: 'row', margin: Spacing.lg, marginBottom: 0, padding: 3,
    backgroundColor: Colors.bgCard, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.full },
  tabActive: { backgroundColor: Colors.indigoBg },
  tabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: Colors.indigo },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  hint: { fontSize: 11, color: Colors.textMuted },
  deleteAllBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  deleteAllText: { fontSize: 12, fontWeight: '700', color: Colors.red },
  list: { paddingTop: Spacing.sm, paddingBottom: Spacing.xxxl },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: Spacing.xxxl, gap: Spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.sm },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
