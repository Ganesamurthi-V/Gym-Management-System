import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, SectionList, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchGymActivity, type ActivityEvent, type ActivityKind } from '@/lib/api';
import { groupByDay, formatTime } from '@/lib/activity-format';
import { useAppTheme } from '@/lib/theme';
import { TONE_TILE, toneColor, type Tone } from '@/components/dashboard/tone';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { ListRow } from '@/components/dashboard/ListRow';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GymActivity'>;
type Filter = 'all' | ActivityKind;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'app_open', label: 'Opens' },
  { key: 'page_view', label: 'Pages' },
  { key: 'action', label: 'Actions' },
];

const KIND_ICON: Record<ActivityKind, string> = {
  app_open: 'log-in',
  page_view: 'file-text',
  action: 'zap',
};

const KIND_TONE: Record<ActivityKind, Tone> = {
  app_open: 'blue',
  page_view: 'sky',
  action: 'violet',
};

export default function GymActivityScreen({ route, navigation }: Props) {
  const { gymId, gymName } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow response for a previous filter overwriting the current one.
  const requestId = useRef(0);

  useEffect(() => {
    navigation.setOptions({ headerTitle: gymName ? `Activity - ${gymName}` : 'Activity' });
  }, [navigation, gymName]);

  const loadFirst = useCallback(async (f: Filter) => {
    const id = ++requestId.current;
    setError(null);
    try {
      const res = await fetchGymActivity(gymId, { kind: f });
      if (id !== requestId.current) return;
      setEvents(res.events);
      setNextBefore(res.nextBefore);
    } catch (e: any) {
      if (id !== requestId.current) return;
      setError(e?.message ?? 'Failed to load activity');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [gymId]);

  useEffect(() => {
    setLoading(true);
    setEvents([]);
    setNextBefore(null);
    loadFirst(filter);
  }, [filter, loadFirst]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadFirst(filter); } finally { setRefreshing(false); }
  }, [filter, loadFirst]);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore || loading || error) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const res = await fetchGymActivity(gymId, { kind: filter, before: nextBefore });
      if (id !== requestId.current) return;
      setEvents(prev => {
        const seen = new Set(prev.map(e => e.id));
        return [...prev, ...res.events.filter(e => !seen.has(e.id))];
      });
      setNextBefore(res.nextBefore);
    } catch (e: any) {
      if (id === requestId.current) setError(e?.message ?? 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [gymId, filter, nextBefore, loadingMore, loading, error]);

  const sections = groupByDay(events);

  const footer = (
    <View className="items-center gap-3 p-6">
      {loadingMore && <ActivityIndicator color={colors.mutedForeground} />}
      <Text className="text-muted-foreground text-xs">Activity is kept for 15 days</Text>
    </View>
  );

  return (
    <View className="bg-background flex-1">
      <View className="p-4">
        <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
          <TabsList>
            {FILTERS.map(f => (
              <TabsTrigger key={f.key} value={f.key}>
                <Text>{f.label}</Text>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.mutedForeground} size="large" />
        </View>
      ) : error && events.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 p-12">
          <Icon name="alert-circle" size={32} className="text-destructive" />
          <Text className="text-muted-foreground text-center text-sm">{error}</Text>
          <Button
            variant="outline"
            onPress={() => { setLoading(true); loadFirst(filter); }}
          >
            <Text>Retry</Text>
          </Button>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={e => e.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedForeground} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderSectionHeader={({ section }) => (
            <Text className="bg-background text-muted-foreground px-4 py-2 text-xs font-semibold uppercase tracking-wide">
              {section.label}
            </Text>
          )}
          renderItem={({ item, index, section }) => (
            <View className="px-4">
              <ListRow
                last={index === section.data.length - 1}
                title={item.title}
                subtitle={item.kind === 'page_view' && item.path ? item.path : undefined}
                left={
                  <View className={cn('size-8 items-center justify-center rounded-lg border', TONE_TILE[KIND_TONE[item.kind]])}>
                    <Icon name={KIND_ICON[item.kind]} size={14} color={toneColor(KIND_TONE[item.kind], colors)} />
                  </View>
                }
                right={
                  <View className="items-end gap-1">
                    <Text className="text-muted-foreground text-xs">{formatTime(item.createdAt)}</Text>
                    {item.platform ? (
                      <Badge variant="outline">
                        <Text>{item.platform}</Text>
                      </Badge>
                    ) : null}
                  </View>
                }
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center gap-3 p-12">
              <Icon name="activity" size={32} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-center text-sm">No activity in the last 15 days</Text>
            </View>
          }
          ListFooterComponent={footer}
        />
      )}
      {error && events.length > 0 ? (
        <Text className="text-destructive p-2 text-center text-xs">{error}</Text>
      ) : null}
    </View>
  );
}
