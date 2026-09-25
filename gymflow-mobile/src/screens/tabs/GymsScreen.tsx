import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchGyms, type Gym } from '@/lib/api';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { GymRow } from '@/components/GymRow';
import type { RootStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/** Module-level constant so the "no data yet" case keeps a stable identity. */
const EMPTY_GYMS: Gym[] = [];

export default function GymsScreen() {
  const navigation = useNavigation<NavProp>();
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
    <View style={styles.root}>
      <View style={styles.statsBar}>
        <Feather name="activity" size={14} color={Colors.indigo} />
        <Text style={styles.statsText}>{gyms.length} total gyms</Text>
      </View>

      <View style={styles.searchContainer}>
        <Feather name="search" size={15} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search gyms by name..."
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Feather name="x" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.indigo} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <GymRow
              gym={item}
              onPress={() => navigation.navigate('GymDetail', { gymId: item.id })}
            />
          )}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Windowing limits: the gym list grows with every signup, and the
          // defaults render far more rows than a phone screen needs.
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.indigo} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="activity" size={36} color={Colors.bgCardBorder} />
              <Text style={styles.emptyText}>
                {search ? `No gyms match "${search}"` : 'No gyms registered yet'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  statsBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    backgroundColor: Colors.indigoBg, borderBottomWidth: 1, borderBottomColor: Colors.indigoBorder,
  },
  statsText: { fontSize: 12, color: Colors.indigo, fontWeight: '600' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', margin: Spacing.lg,
    backgroundColor: Colors.bgInput, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.bgCardBorder,
    paddingHorizontal: Spacing.md, gap: Spacing.sm,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, paddingVertical: Spacing.md },
  errorBanner: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.redBg,
    borderRadius: Radius.sm, padding: Spacing.md,
  },
  errorText: { fontSize: 13, color: Colors.red },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: {
    backgroundColor: Colors.bgCard, marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.bgCardBorder,
    overflow: 'hidden', paddingBottom: Spacing.xxxl,
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl * 2, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
