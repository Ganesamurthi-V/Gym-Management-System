import React, { useState, useCallback, useMemo } from 'react';
import { View, FlatList, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchGyms, type Gym } from '@/lib/api';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { useAppTheme } from '@/lib/theme';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ListRow } from '@/components/dashboard/ListRow';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import type { RootStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/** Module-level constant so the "no data yet" case keeps a stable identity. */
const EMPTY_GYMS: Gym[] = [];

function formatJoinDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function GymsScreen() {
  const navigation = useNavigation<NavProp>();
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refresh } = useCachedQuery<Gym[]>({
    key: CacheKeys.gyms,
    fetcher: fetchGyms,
  });
  // Stable empty fallback. `data ?? []` would allocate a fresh array on every
  // render, which changes the identity useMemo below depends on and makes the
  // memo useless — the exact thing the memo was added to avoid.
  const gyms = data ?? EMPTY_GYMS;

  // Realtime hints still force a refresh, but no longer fire a duplicate request
  // on mount — the focus revalidation already covers that (see refetchOnSubscribe).
  useRealtimeInvalidation({
    channelName: 'admin:gyms',
    onInvalidate: refresh,
    refetchOnSubscribe: false,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  // Memoised so typing in the search box does not re-filter the whole list on
  // every keystroke for an unchanged dataset.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? gyms.filter(g => g.name.toLowerCase().includes(q)) : gyms;
  }, [gyms, search]);

  return (
    <View className="bg-background flex-1">
      <View className="gap-3 p-4 pb-2">
        <Text className="text-muted-foreground text-sm">{gyms.length} total gyms</Text>
        <View className="justify-center">
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Search gyms by name..."
            returnKeyType="search"
            autoCorrect={false}
            className="pr-10"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              className="absolute right-3"
            >
              <Icon name="x" size={16} className="text-muted-foreground" />
            </Pressable>
          )}
        </View>
      </View>

      {error && (
        <Card className="mx-4 mb-2 px-4 py-3">
          <Text className="text-destructive text-sm">{error}</Text>
        </Card>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.mutedForeground} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <View className="px-4">
              <ListRow
                last={index === filtered.length - 1}
                title={item.name}
                subtitle={`${item.memberCount} members · ${formatJoinDate(item.created_at)}`}
                left={
                  <View className="bg-muted border-border size-9 items-center justify-center rounded-lg border">
                    <Icon name="activity" size={16} className="text-muted-foreground" />
                  </View>
                }
                right={
                  <View className="flex-row items-center gap-2">
                    <StatusBadge tone={item.is_active ? 'success' : 'error'}>
                      {item.is_active ? 'Active' : 'Banned'}
                    </StatusBadge>
                    <Icon name="chevron-right" size={16} className="text-muted-foreground" />
                  </View>
                }
                onPress={() => navigation.navigate('GymDetail', { gymId: item.id })}
              />
            </View>
          )}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Windowing limits: the gym list grows with every signup, and the
          // defaults render far more rows than a phone screen needs.
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedForeground} />
          }
          ListEmptyComponent={
            <View className="items-center justify-center gap-3 p-12">
              <Icon name="activity" size={36} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-center text-sm">
                {search ? `No gyms match "${search}"` : 'No gyms registered yet'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
