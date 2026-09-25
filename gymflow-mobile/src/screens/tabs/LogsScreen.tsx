import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchEventLogs, type SentryEvent } from '@/lib/api';
import { LogRow } from '@/components/LogRow';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';

export default function LogsScreen() {
  const [refreshing, setRefreshing] = useState(false);

  /*
    Longest TTL of any screen. This endpoint proxies Sentry events, which is the
    slowest thing the admin API does, and an event feed does not need to be
    second-accurate — pull-to-refresh is there when it does. Two minutes keeps tab
    switches free and still surfaces new events promptly.
  */
  const { data, loading, error, refresh } = useCachedQuery<SentryEvent[]>({
    key: CacheKeys.logs,
    fetcher: fetchEventLogs,
    ttlMs: 120_000,
  });
  const events = data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.indigo} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.statsBar}>
        <Feather name="file-text" size={14} color={Colors.indigo} />
        <Text style={styles.statsText}>{events.length} latest events</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={13} color={Colors.amber} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={events}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <LogRow event={item} />}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.indigo} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="file-text" size={36} color={Colors.bgCardBorder} />
            <Text style={styles.emptyText}>No events found or check Sentry API config</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  statsBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    backgroundColor: Colors.indigoBg, borderBottomWidth: 1, borderBottomColor: Colors.indigoBorder,
  },
  statsText: { fontSize: 12, color: Colors.indigo, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    margin: Spacing.lg, backgroundColor: Colors.amberBg,
    borderRadius: Radius.sm, padding: Spacing.md,
  },
  errorText: { fontSize: 12, color: Colors.amber, flex: 1 },
  list: { flex: 1 },
  listContent: {
    backgroundColor: Colors.bgCard, marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.bgCardBorder,
    overflow: 'hidden', paddingBottom: Spacing.xxxl,
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl * 2, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
