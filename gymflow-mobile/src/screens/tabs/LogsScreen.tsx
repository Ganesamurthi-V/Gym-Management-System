import React, { useState, useCallback } from 'react';
import { View, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { fetchEventLogs, type SentryEvent } from '@/lib/api';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { useAppTheme } from '@/lib/theme';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ListRow } from '@/components/dashboard/ListRow';
import { StatusBadge, type StatusTone } from '@/components/dashboard/StatusBadge';

function levelTone(level: string): StatusTone {
  if (level === 'error' || level === 'fatal') return 'error';
  if (level === 'warning') return 'warning';
  return 'info';
}

export default function LogsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useAppTheme();

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
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator color={colors.mutedForeground} size="large" />
      </View>
    );
  }

  return (
    <View className="bg-background flex-1">
      <View className="px-4 pb-2 pt-4">
        <Text className="text-muted-foreground text-sm">{events.length} latest events</Text>
      </View>

      {error && (
        <Card className="mx-4 mb-2 flex-row items-center gap-2 px-4 py-3">
          <Icon name="alert-triangle" size={14} className="text-warning" />
          <Text className="flex-1 text-sm">{error}</Text>
        </Card>
      )}

      <FlatList
        data={events}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => {
          const page = item.tags?.find(t => t.key === 'page')?.value ?? 'unknown';
          const when = new Date(item.dateCreated).toLocaleString('en-IN');
          return (
            <View className="px-4">
              <ListRow
                last={index === events.length - 1}
                title={item.title}
                subtitle={`${item.culprit ? `${item.culprit}\n` : ''}${page} · ${when}`}
                right={<StatusBadge tone={levelTone(item.level)}>{item.level}</StatusBadge>}
              />
            </View>
          );
        }}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedForeground} />
        }
        ListEmptyComponent={
          <View className="items-center justify-center gap-3 p-12">
            <Icon name="file-text" size={36} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-center text-sm">
              No events found or check Sentry API config
            </Text>
          </View>
        }
      />
    </View>
  );
}
