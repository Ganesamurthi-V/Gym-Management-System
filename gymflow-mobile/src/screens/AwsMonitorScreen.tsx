import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { RootStackParamList } from '@/src/navigation/types';
import { getAwsOverview } from '@/lib/api';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { formatBytes, formatNumber, formatUsd } from '@/lib/aws-format';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/Badge';
import { LineChart } from '@/components/charts/LineChart';
import { BarList } from '@/components/charts/BarList';
import type { AwsMonitorOverview, AwsPoint, AwsRange, AwsResourceType, AwsSectionError, AwsStatus } from '@/types/aws';

const RANGES: AwsRange[] = ['1h', '24h', '7d'];

type Variant = 'success' | 'error' | 'warning' | 'muted';
const statusVariant = (s: AwsStatus): Variant =>
  s === 'healthy' ? 'success' : s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'muted';
const statusColor = (s: AwsStatus) =>
  s === 'healthy' ? Colors.emerald : s === 'critical' ? Colors.red : s === 'warning' ? Colors.amber : Colors.textMuted;

/** Sums several series bucket by bucket (matched on timestamp) into one. */
function sumSeries(all: AwsPoint[][]): AwsPoint[] {
  const m = new Map<number, number>();
  for (const s of all) for (const p of s) m.set(p.t, (m.get(p.t) ?? 0) + p.v);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name={icon} size={14} color={Colors.indigo} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <View style={styles.errorCard}>
      <Feather name="alert-triangle" size={14} color={Colors.red} />
      <Text style={styles.errorCardText}>{message}</Text>
    </View>
  );
}

function Row({ title, sub, badge, onPress, children }: {
  title: string; sub?: string; badge?: { label: string; variant: Variant }; onPress?: () => void; children?: React.ReactNode;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowTop}>
        <View style={styles.rowTitleWrap}>
          <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="middle">{title}</Text>
          {sub ? <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {badge ? <Badge label={badge.label} variant={badge.variant} /> : null}
        {onPress ? <Feather name="chevron-right" size={16} color={Colors.textMuted} /> : null}
      </View>
      {children ? <View style={styles.rowMetrics}>{children}</View> : null}
    </Pressable>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map(i => (
        <View key={i.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: i.color }]} />
          <Text style={styles.legendText}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

function BudgetCard({ cost }: { cost: NonNullable<AwsMonitorOverview['cost']> }) {
  const b = cost.budget;
  if (!b) {
    return (
      <Section title="Budget" icon="dollar-sign">
        <Text style={styles.big}>{formatUsd(cost.monthToDateUsd)}</Text>
        <Text style={styles.muted}>Month to date. No budget configured.</Text>
      </Section>
    );
  }
  const color = statusColor(b.status);
  const armed = b.blockActionStatus === 'STANDBY';
  return (
    <Section title="Budget" icon="dollar-sign">
      <View style={styles.budgetTop}>
        <Text style={styles.big}>{formatUsd(b.actualUsd)}</Text>
        <Text style={styles.muted}>of {formatUsd(b.limitUsd)} ({b.percentUsed.toFixed(0)}%)</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { backgroundColor: color, width: `${Math.min(100, Math.max(1, b.percentUsed))}%` }]} />
      </View>
      {armed ? (
        <View style={styles.armed}>
          <Feather name="shield" size={13} color={Colors.emerald} />
          <Text style={styles.armedText}>Auto-block armed</Text>
        </View>
      ) : (
        <View style={styles.warn}>
          <Feather name="alert-triangle" size={13} color={Colors.red} />
          <Text style={styles.warnText}>
            {b.blockActionStatus ? `Auto-block status: ${b.blockActionStatus}` : 'Auto-block is not configured'}
          </Text>
        </View>
      )}
    </Section>
  );
}

export default function AwsMonitorScreen() {
  const [range, setRange] = useState<AwsRange>('24h');
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const open = (type: AwsResourceType, id: string, title: string) => () =>
    navigation.navigate('AwsResource', { type, id, title, range });

  const { data, loading, error, refresh } = useCachedQuery<AwsMonitorOverview>({
    key: CacheKeys.awsOverview(range),
    fetcher: () => getAwsOverview(range),
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

  const errFor = (s: AwsSectionError['section']) => data?.errors.find(e => e.section === s);
  const updated = data
    ? new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  const lambdaInv = data ? sumSeries(data.lambda.map(f => f.invocationsSeries)) : [];
  const lambdaErr = data ? sumSeries(data.lambda.map(f => f.errorsSeries)) : [];
  const cfReq = data ? sumSeries(data.cloudfront.map(d => d.requestsSeries)) : [];

  const totalInv = data?.lambda.reduce((a, f) => a + f.invocations, 0) ?? 0;
  const totalErr = data?.lambda.reduce((a, f) => a + f.errors, 0) ?? 0;
  const totalReq = data?.cloudfront.reduce((a, d) => a + d.requests, 0) ?? 0;
  const total5xx = data?.cloudfront.reduce((a, d) => a + (d.requests * d.rate5xxPct) / 100, 0) ?? 0;
  const throttles = data?.dynamodb.reduce((a, t) => a + t.throttledRequests, 0) ?? 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.indigo} />}
    >
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
          <Text style={styles.errorCardText}>{error}</Text>
        </View>
      )}

      {data && (
        <>
          {data.cost ? <BudgetCard cost={data.cost} /> : errFor('cost') && (
            <Section title="Budget" icon="dollar-sign"><SectionError message={errFor('cost')!.message} /></Section>
          )}

          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <StatCard label="Lambda invocations" value={formatNumber(totalInv)} accentColor={Colors.indigo} accentBg={Colors.indigoBg} />
              <StatCard label="Lambda errors" value={formatNumber(totalErr)} accentColor={Colors.red} accentBg={Colors.redBg} />
            </View>
            <View style={styles.statsRow}>
              <StatCard label="CloudFront requests" value={formatNumber(totalReq)} accentColor={Colors.sky} accentBg={Colors.skyBg} />
              <StatCard label="CloudFront 5xx" value={formatNumber(total5xx)} accentColor={Colors.amber} accentBg={Colors.amberBg} />
            </View>
            <View style={styles.statsRow}>
              <StatCard label="DynamoDB throttles" value={formatNumber(throttles)} accentColor={Colors.purple} accentBg={Colors.purpleBg} />
              <StatCard label="Forecast" value={formatUsd(data.cost?.forecastUsd)} sub="This month" accentColor={Colors.emerald} accentBg={Colors.emeraldBg} />
            </View>
          </View>

          <Section title="Lambda" icon="zap">
            {errFor('lambda') ? <SectionError message={errFor('lambda')!.message} /> : (
              <>
                <LineChart
                  height={150}
                  formatY={formatNumber}
                  series={[
                    { color: Colors.indigo, points: lambdaInv },
                    { color: Colors.red, points: lambdaErr },
                  ]}
                />
                <Legend items={[{ color: Colors.indigo, label: 'Invocations' }, { color: Colors.red, label: 'Errors' }]} />
                {data.lambda.length === 0 && <Text style={styles.muted}>No functions found</Text>}
                {data.lambda.map(f => (
                  <Row key={f.name} title={f.name} badge={{ label: f.status, variant: statusVariant(f.status) }} onPress={open('lambda', f.name, f.name)}>
                    <Metric label="Invocations" value={formatNumber(f.invocations)} />
                    <Metric label="Error %" value={`${f.errorRatePct.toFixed(1)}%`} color={f.errors > 0 ? Colors.red : undefined} />
                    <Metric label="p95" value={f.p95DurationMs == null ? '—' : `${Math.round(f.p95DurationMs)} ms`} />
                  </Row>
                ))}
              </>
            )}
          </Section>

          <Section title="CloudFront" icon="globe">
            {errFor('cloudfront') ? <SectionError message={errFor('cloudfront')!.message} /> : (
              <>
                <LineChart height={150} filled formatY={formatNumber} series={[{ color: Colors.sky, points: cfReq }]} />
                {data.cloudfront.length === 0 && <Text style={styles.muted}>No distributions found</Text>}
                {data.cloudfront.map(d => (
                  <Row
                    key={d.id}
                    title={d.aliases[0] ?? d.domain}
                    onPress={open('cloudfront', d.id, d.aliases[0] ?? d.domain)}
                    badge={{ label: d.enabled ? d.status : 'disabled', variant: d.enabled ? statusVariant(d.status) : 'muted' }}
                  >
                    <Metric label="Requests" value={formatNumber(d.requests)} />
                    <Metric label="4xx" value={`${d.rate4xxPct.toFixed(1)}%`} />
                    <Metric label="5xx" value={`${d.rate5xxPct.toFixed(1)}%`} color={d.rate5xxPct > 0 ? Colors.red : undefined} />
                    <Metric label="Data" value={formatBytes(d.bytesDownloaded)} />
                  </Row>
                ))}
              </>
            )}
          </Section>

          <Section title="DynamoDB" icon="database">
            {errFor('dynamodb') ? <SectionError message={errFor('dynamodb')!.message} /> : (
              <>
                {data.dynamodb.length === 0 && <Text style={styles.muted}>No tables found</Text>}
                {data.dynamodb.map(t => (
                  <Row key={t.name} title={t.name} badge={{ label: t.health, variant: statusVariant(t.health) }} onPress={open('dynamodb', t.name, t.name)}>
                    <Metric label="Items" value={formatNumber(t.itemCount)} />
                    <Metric label="Size" value={formatBytes(t.sizeBytes)} />
                    <Metric label="Throttled" value={formatNumber(t.throttledRequests)} color={t.throttledRequests > 0 ? Colors.amber : undefined} />
                  </Row>
                ))}
              </>
            )}
          </Section>

          <Section title="S3" icon="hard-drive">
            {errFor('s3') ? <SectionError message={errFor('s3')!.message} /> : (
              <>
                {data.s3.length === 0 && <Text style={styles.muted}>No buckets found</Text>}
                {data.s3.map(b => (
                  <Row key={b.name} title={b.name} onPress={open('s3', b.name, b.name)}>
                    <Metric label="Size" value={formatBytes(b.sizeBytes)} />
                    <Metric label="Objects" value={formatNumber(b.objectCount)} />
                  </Row>
                ))}
              </>
            )}
          </Section>

          <Section title="Cost" icon="trending-up">
            {errFor('cost') ? <SectionError message={errFor('cost')!.message} /> : data.cost ? (
              <>
                <Text style={styles.subTitle}>By service (month to date)</Text>
                <BarList
                  items={data.cost.byService.map(s => ({ label: s.service, value: s.amountUsd }))}
                  formatValue={formatUsd}
                />
                <Text style={[styles.subTitle, { marginTop: Spacing.md }]}>Daily cost</Text>
                <LineChart height={150} filled formatY={formatUsd} series={[{ color: Colors.emerald, points: data.cost.dailySeries }]} />
              </>
            ) : <Text style={styles.muted}>No cost data</Text>}
          </Section>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
  centered: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
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
  section: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  sectionBody: { padding: Spacing.lg, gap: Spacing.md },
  subTitle: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  muted: { fontSize: 12, color: Colors.textMuted },
  big: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  budgetTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  armed: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  armedText: { fontSize: 12, color: Colors.emerald, fontWeight: '600' },
  warn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: Spacing.sm,
    backgroundColor: Colors.redBg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.redBorder,
  },
  warnText: { fontSize: 12, color: Colors.red, fontWeight: '600', flex: 1 },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md,
    backgroundColor: Colors.redBg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.redBorder,
  },
  errorCardText: { flex: 1, fontSize: 13, color: Colors.red },
  legend: { flexDirection: 'row', gap: Spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textSecondary },
  row: { paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.bgCardBorder, gap: Spacing.sm },
  rowPressed: { opacity: 0.6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  rowTitleWrap: { flex: 1 },
  rowTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  rowSub: { fontSize: 11, color: Colors.textMuted },
  rowMetrics: { flexDirection: 'row', gap: Spacing.lg },
  metric: { gap: 1 },
  metricValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  metricLabel: { fontSize: 10, color: Colors.textMuted },
});
