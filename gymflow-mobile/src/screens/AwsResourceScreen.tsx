import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { getAwsResourceDetail } from '@/lib/api';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { formatBytes, formatMs, formatNumber, formatPercent } from '@/lib/aws-format';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/Badge';
import { LineChart } from '@/components/charts/LineChart';
import type { RootStackScreenProps } from '@/src/navigation/types';
import type { AwsRange, AwsResourceDetail, AwsStatus } from '@/types/aws';

const RANGES: AwsRange[] = ['1h', '24h', '7d'];
const SERIES_COLORS = [Colors.indigo, Colors.red, Colors.sky, Colors.amber, Colors.emerald, Colors.purple];
const STAT_ACCENTS = [
  { c: Colors.indigo, bg: Colors.indigoBg },
  { c: Colors.sky, bg: Colors.skyBg },
  { c: Colors.emerald, bg: Colors.emeraldBg },
  { c: Colors.amber, bg: Colors.amberBg },
  { c: Colors.purple, bg: Colors.purpleBg },
];

type Variant = 'success' | 'error' | 'warning' | 'muted';
const statusVariant = (s: AwsStatus): Variant =>
  s === 'healthy' ? 'success' : s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'muted';

function unitFormatter(unit: AwsResourceDetail['charts'][number]['unit']): (v: number) => string {
  switch (unit) {
    case 'ms': return formatMs;
    case 'percent': return formatPercent;
    case 'bytes': return formatBytes;
    default: return formatNumber;
  }
}

const time = (t: number) =>
  new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}><Text style={styles.cardTitle}>{title}</Text></View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export default function AwsResourceScreen({ route }: RootStackScreenProps<'AwsResource'>) {
  const { type, id } = route.params;
  const [range, setRange] = useState<AwsRange>(route.params.range);
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refresh } = useCachedQuery<AwsResourceDetail>({
    key: CacheKeys.awsResource(type, id, range),
    fetcher: () => getAwsResourceDetail(type, id, range),
  });

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

  const notFound = !data && !!error && /not found|404|no longer exist/i.test(error);
  const updated = data
    ? new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.indigo} />}
    >
      {data && (
        <View style={styles.head}>
          <Text style={styles.subtitle} numberOfLines={2}>{data.subtitle}</Text>
          <Badge label={data.status} variant={statusVariant(data.status)} />
        </View>
      )}

      <View style={styles.rangeRow}>
        {RANGES.map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.chip, r === range && styles.chipActive]}
            onPress={() => setRange(r)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, r === range && styles.chipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
        {updated && <Text style={styles.updated}>Updated {updated}</Text>}
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Feather name="alert-triangle" size={14} color={Colors.red} />
          <Text style={styles.errorCardText}>{notFound ? 'This resource no longer exists' : error}</Text>
        </View>
      )}

      {data && (
        <>
          {data.stats.length > 0 && (
            <View style={styles.statsGrid}>
              {Array.from({ length: Math.ceil(data.stats.length / 2) }, (_, i) => data.stats.slice(i * 2, i * 2 + 2)).map((pair, i) => (
                <View key={i} style={styles.statsRow}>
                  {pair.map((s, j) => {
                    const a = STAT_ACCENTS[(i * 2 + j) % STAT_ACCENTS.length];
                    return <StatCard key={s.label} label={s.label} value={s.value} accentColor={a.c} accentBg={a.bg} />;
                  })}
                  {pair.length === 1 && <View style={styles.statSpacer} />}
                </View>
              ))}
            </View>
          )}

          {data.charts.map(ch => {
            const fmt = unitFormatter(ch.unit);
            const items = ch.series.map((s, i) => ({ label: s.label, color: SERIES_COLORS[i % SERIES_COLORS.length], points: s.points }));
            return (
              <Card key={ch.key} title={ch.title}>
                <LineChart height={150} formatY={fmt} filled={items.length === 1} series={items} />
                <View style={styles.legend}>
                  {items.map(i => (
                    <View key={i.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: i.color }]} />
                      <Text style={styles.legendText}>{i.label}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            );
          })}

          {data.properties.length > 0 && (
            <Card title="Properties">
              {data.properties.map((p, i) => (
                <View key={`${p.label}-${i}`} style={[styles.propRow, i > 0 && styles.propDivider]}>
                  <Text style={styles.propLabel}>{p.label}</Text>
                  <Text style={styles.propValue}>{p.value}</Text>
                </View>
              ))}
            </Card>
          )}

          {data.type === 'lambda' && (
            <Card title="Recent errors and warnings">
              {data.recentLogs.length === 0 ? (
                <Text style={styles.muted}>No errors or warnings in this period</Text>
              ) : [...data.recentLogs].sort((a, b) => b.t - a.t).map((l, i) => (
                <View key={`${l.t}-${i}`} style={[styles.logRow, i > 0 && styles.propDivider]}>
                  <Text style={styles.logTime}>{time(l.t)}</Text>
                  <Text style={styles.logMsg}>{l.message}</Text>
                </View>
              ))}
            </Card>
          )}

          {data.errors.map((e, i) => (
            <View key={i} style={styles.note}>
              <Feather name="alert-circle" size={12} color={Colors.red} />
              <Text style={styles.noteText}>{e}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
  centered: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  subtitle: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.bgCardBorder, backgroundColor: Colors.bgCard,
  },
  chipActive: { backgroundColor: Colors.indigoBg, borderColor: Colors.indigoBorder },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.indigo },
  updated: { marginLeft: 'auto', fontSize: 11, color: Colors.textMuted },
  statsGrid: { gap: Spacing.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statSpacer: { flex: 1 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  cardBody: { padding: Spacing.lg, gap: Spacing.md },
  muted: { fontSize: 12, color: Colors.textMuted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textSecondary },
  propRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.lg },
  propDivider: { borderTopWidth: 1, borderTopColor: Colors.bgCardBorder, paddingTop: Spacing.md },
  propLabel: { fontSize: 12, color: Colors.textMuted },
  propValue: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  logRow: { gap: 2 },
  logTime: { fontSize: 11, color: Colors.textMuted },
  logMsg: { fontSize: 11, color: Colors.textPrimary, fontFamily: Fonts.mono },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md,
    backgroundColor: Colors.redBg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.redBorder,
  },
  errorCardText: { flex: 1, fontSize: 13, color: Colors.red },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  noteText: { flex: 1, fontSize: 11, color: Colors.red },
});
