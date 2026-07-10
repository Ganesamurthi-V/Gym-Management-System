import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchEventLogs, type SentryEvent } from '@/lib/api';
import { LogRow } from '@/components/LogRow';

export default function LogsScreen() {
  const [events, setEvents] = useState<SentryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchEventLogs();
      setEvents(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load event logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.indigo} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Stats */}
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={Colors.indigo}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="file-text" size={36} color={Colors.bgCardBorder} />
            <Text style={styles.emptyText}>
              No events found or check Sentry API config
            </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.indigoBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.indigoBorder,
  },
  statsText: { fontSize: 12, color: Colors.indigo, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    margin: Spacing.lg,
    backgroundColor: Colors.amberBg,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  errorText: { fontSize: 12, color: Colors.amber, flex: 1 },
  list: { flex: 1 },
  listContent: {
    backgroundColor: Colors.bgCard,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    overflow: 'hidden',
    paddingBottom: Spacing.xxxl,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
