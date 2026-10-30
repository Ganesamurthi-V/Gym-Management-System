import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchGymActivity, type ActivityEvent, type ActivityKind } from '@/lib/api';
import { groupByDay, formatTime } from '@/lib/activity-format';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GymActivity'>;
type Filter = 'all' | ActivityKind;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'app_open', label: 'Opens' },
  { key: 'page_view', label: 'Pages' },
  { key: 'action', label: 'Actions' },
];

const KIND_META: Record<ActivityKind, { icon: string; color: string; bg: string }> = {
  app_open: { icon: 'log-in', color: Colors.emerald, bg: Colors.emeraldBg },
  page_view: { icon: 'file-text', color: Colors.sky, bg: Colors.skyBg },
  action: { icon: 'zap', color: Colors.amber, bg: Colors.amberBg },
};

export default function GymActivityScreen({ route, navigation }: Props) {
  const { gymId, gymName } = route.params;
  const insets = useSafeAreaInsets();
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
    <View style={styles.footer}>
      {loadingMore && <ActivityIndicator color={Colors.indigo} />}
      <Text style={styles.footerNote}>Activity is kept for 15 days</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.chips}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.indigo} size="large" /></View>
      ) : error && events.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={32} color={Colors.red} />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            onPress={() => { setLoading(true); loadFirst(filter); }}
            accessibilityRole="button"
          >
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={e => e.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.indigo} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderSectionHeader={({ section }) => (
            <Text style={styles.dayHeader}>{section.label}</Text>
          )}
          renderItem={({ item }) => {
            const meta = KIND_META[item.kind];
            return (
              <View style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: meta.bg }]}>
                  <Feather name={meta.icon as any} size={14} color={meta.color} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <View style={styles.subRow}>
                    {item.kind === 'page_view' && item.path ? (
                      <Text style={styles.subText} numberOfLines={1}>{item.path}</Text>
                    ) : null}
                    {item.platform ? (
                      <View style={styles.platformChip}>
                        <Text style={styles.platformText}>{item.platform}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="activity" size={32} color={Colors.textMuted} />
              <Text style={styles.stateText}>No activity in the last 15 days</Text>
            </View>
          }
          ListFooterComponent={footer}
        />
      )}
      {error && events.length > 0 ? <Text style={styles.inlineError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  chips: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg },
  chip: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  chipActive: { backgroundColor: Colors.indigoBg, borderColor: Colors.indigoBorder },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.indigo },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xxxl },
  stateText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  retry: { fontSize: 14, fontWeight: '700', color: Colors.indigo },
  dayHeader: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.5, backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  iconBox: { width: 30, height: 30, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, color: Colors.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  subText: { flexShrink: 1, fontSize: 11, color: Colors.textMuted },
  platformChip: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.sm,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  platformText: { fontSize: 10, color: Colors.textSecondary },
  time: { fontSize: 12, color: Colors.textSecondary },
  footer: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xl },
  footerNote: { fontSize: 11, color: Colors.textMuted },
  inlineError: { fontSize: 12, color: Colors.red, textAlign: 'center', padding: Spacing.sm },
});
