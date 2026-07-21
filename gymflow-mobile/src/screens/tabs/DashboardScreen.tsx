import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchDashboardStats, type DashboardStats } from '@/lib/api';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/Badge';

function ErrorRow({ error }: { error: DashboardStats['recentErrors'][0] }) {
  return (
    <View style={styles.errorRow}>
      <View style={styles.errorContent}>
        <Text style={styles.errorTitle} numberOfLines={1}>{error.title}</Text>
        <Text style={styles.errorCulprit} numberOfLines={1}>{error.culprit}</Text>
        <View style={styles.errorMeta}>
          <Text style={styles.errorMetaText}>{new Date(error.lastSeen).toLocaleString('en-IN')}</Text>
          <Text style={styles.errorMetaDot}>·</Text>
          <Text style={styles.errorMetaText}>{error.count} events</Text>
        </View>
      </View>
    </View>
  );
}

function MessageRow({ msg }: { msg: DashboardStats['recentMessages'][0] }) {
  const typeVariant = (type: string): 'error' | 'warning' | 'success' | 'info' => {
    if (type === 'error') return 'error';
    if (type === 'warning') return 'warning';
    if (type === 'success') return 'success';
    return 'info';
  };
  return (
    <View style={styles.msgRow}>
      <View style={styles.msgContent}>
        <Text style={styles.msgSubject} numberOfLines={1}>{msg.subject}</Text>
        <Text style={styles.msgGym}>{msg.gym?.name ?? 'Unknown gym'}</Text>
        <Text style={styles.msgTime}>{new Date(msg.created_at).toLocaleString('en-IN')}</Text>
      </View>
      <Badge label={msg.type} variant={typeVariant(msg.type)} />
    </View>
  );
}

export default function DashboardScreen() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether we already have data so focus-refetches don't blank the screen
  const hasDataRef = React.useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!hasDataRef.current) setLoading(true);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
      hasDataRef.current = true;
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.indigo} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.indigo} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.dateText}>{today}</Text>
        <View style={styles.onlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>System Online</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={14} color={Colors.amber} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatCard label="Total Gyms" value={stats?.gymCount ?? '—'} accentColor={Colors.indigo} accentBg={Colors.indigoBg} />
          <StatCard label="Total Members" value={stats?.memberCount ?? '—'} accentColor={Colors.sky} accentBg={Colors.skyBg} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Today's Check-ins" value={stats?.attendanceToday ?? '—'} accentColor={Colors.emerald} accentBg={Colors.emeraldBg} />
          <StatCard label="Open Errors" value={stats?.errorCount ?? 0} sub="Sentry" accentColor={Colors.red} accentBg={Colors.redBg} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Warnings" value={stats?.warningCount ?? 0} sub="Sentry" accentColor={Colors.amber} accentBg={Colors.amberBg} />
          <StatCard label="Msgs Sent" value={stats?.recentMessages?.length ?? 0} sub="Recent" accentColor={Colors.purple} accentBg={Colors.purpleBg} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Feather name="alert-circle" size={14} color={Colors.red} />
            <Text style={styles.sectionTitle}>Recent Errors</Text>
          </View>
        </View>
        {(stats?.recentErrors ?? []).length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="shield" size={28} color={Colors.emerald} />
            <Text style={styles.emptyStateText}>No open errors 🎉</Text>
          </View>
        ) : (
          (stats?.recentErrors ?? []).slice(0, 5).map(e => <ErrorRow key={e.id} error={e} />)
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Feather name="send" size={14} color={Colors.indigo} />
            <Text style={styles.sectionTitle}>Recent Messages Sent</Text>
          </View>
        </View>
        {(stats?.recentMessages ?? []).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No messages sent yet</Text>
          </View>
        ) : (
          (stats?.recentMessages ?? []).map(m => <MessageRow key={m.id} msg={m} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, gap: Spacing.xl, paddingBottom: Spacing.xxxl },
  centered: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: 12, color: Colors.textMuted },
  onlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.emeraldBg, borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.emeraldBorder,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.emerald },
  onlineText: { fontSize: 11, color: Colors.emerald, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.amberBg, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.amberBorder,
  },
  errorBannerText: { fontSize: 13, color: Colors.amber, flex: 1 },
  statsGrid: { gap: Spacing.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  section: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl, gap: Spacing.sm },
  emptyStateText: { fontSize: 13, color: Colors.textMuted },
  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  errorContent: { flex: 1, gap: 2 },
  errorTitle: { fontSize: 12, color: Colors.red, fontWeight: '600' },
  errorCulprit: { fontSize: 11, color: Colors.textMuted },
  errorMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  errorMetaText: { fontSize: 10, color: Colors.textMuted },
  errorMetaDot: { fontSize: 10, color: Colors.textMuted },
  msgRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  msgContent: { flex: 1, gap: 2 },
  msgSubject: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  msgGym: { fontSize: 11, color: Colors.textSecondary },
  msgTime: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
});
