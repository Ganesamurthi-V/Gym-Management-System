import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchGyms, type Gym } from '@/lib/api';
import { GymRow } from '@/components/GymRow';

export default function GymsScreen() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchGyms();
      setGyms(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load gyms');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = search.trim()
    ? gyms.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : gyms;

  return (
    <View style={styles.root}>
      {/* Stats bar */}
      <View style={styles.statsBar}>
        <Feather name="activity" size={14} color={Colors.indigo} />
        <Text style={styles.statsText}>{gyms.length} total gyms</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={15} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search gyms by name..."
          placeholderTextColor={Colors.textMuted}
        />
        {search.length > 0 && (
          <Feather
            name="x"
            size={15}
            color={Colors.textMuted}
            onPress={() => setSearch('')}
          />
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
              onPress={() => router.push(`/gyms/${item.id}`)}
            />
          )}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: Spacing.lg,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    paddingVertical: Spacing.md,
  },
  errorBanner: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.redBg,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  errorText: { fontSize: 13, color: Colors.red },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: {
    backgroundColor: Colors.bgCard,
    marginHorizontal: Spacing.lg,
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
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
