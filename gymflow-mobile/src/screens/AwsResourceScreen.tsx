import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { Fonts } from '@/constants/theme';
import { getAwsResourceDetail } from '@/lib/api';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { formatBytes, formatMs, formatNumber, formatPercent } from '@/lib/aws-format';
import { useAppTheme } from '@/lib/theme';
import { Text } from '@/components/ui/text';
import { MetricCards, type MetricCardItem } from '@/components/dashboard/MetricCards';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { DetailList } from '@/components/dashboard/DetailList';
import type { Tone } from '@/components/dashboard/tone';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { LineChart } from '@/components/charts/LineChart';
import type { RootStackScreenProps } from '@/src/navigation/types';
import type { AwsRange, AwsResourceDetail, AwsResourceType } from '@/types/aws';
import { CHART_DOTS, ChartLegend, ErrorCard, RangeBar, statusTone } from './_aws/shared';

// Which stats and charts the lean page shows per type (labels / keys come from gymflow-admin/lib/aws/detail.ts).
const STAT_LABELS: Record<AwsResourceType, string[]> = {
  lambda: ['Invocations', 'Errors', 'Error rate', 'p95 duration'],
  cloudfront: ['Requests', 'Data out', '4xx rate', '5xx rate'],
  dynamodb: ['Items', 'Size', 'Throttles'],
  s3: ['Size', 'Objects'],
};
const CHART_KEYS: Record<AwsResourceType, string[]> = {
  lambda: ['invocations', 'duration'],
  cloudfront: ['requests', 'errors'],
  dynamodb: ['consumed', 'throttles'],
  s3: ['size', 'objects'],
};
const STAT_ICONS: Record<string, string> = {
  Invocations: 'zap', Errors: 'alert-triangle', 'Error rate': 'percent', 'p95 duration': 'clock',
  Requests: 'globe', 'Data out': 'download-cloud', '4xx rate': 'alert-circle', '5xx rate': 'alert-triangle',
  Items: 'list', Size: 'hard-drive', Throttles: 'activity', Objects: 'box',
};

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

// Problem counters go red when above zero; throughput blue; latency violet; capacity sky.
function statTone(label: string, value: string): Tone {
  const n = parseFloat(value.replace(/,/g, ''));
  if (['Errors', 'Throttles', 'Error rate', '5xx rate', '4xx rate'].includes(label)) {
    return Number.isFinite(n) && n > 0 ? (label === '4xx rate' ? 'amber' : 'red') : 'emerald';
  }
  if (label === 'p95 duration') return 'violet';
  if (label === 'Invocations' || label === 'Requests' || label === 'Data out') return 'blue';
  return 'sky';
}

function logLevel(message: string): { word: string; className: string } | null {
  const m = /(ERROR|WARN(?:ING)?)/i.exec(message);
  if (!m) return null;
  return { word: m[0], className: m[0].toUpperCase().startsWith('WARN') ? 'text-warning' : 'text-destructive' };
}

function pickStats(data: AwsResourceDetail): MetricCardItem[] {
  const wanted = STAT_LABELS[data.type].map(l => data.stats.find(s => s.label === l)).filter(s => !!s);
  const picked = wanted.length > 0 ? wanted : data.stats.slice(0, 4);
  return picked.slice(0, 4).map(s => {
    const tone = statTone(s.label, s.value);
    return { icon: STAT_ICONS[s.label] ?? 'bar-chart-2', label: s.label, value: s.value, tone, valueTone: tone };
  });
}

function pickCharts(data: AwsResourceDetail): AwsResourceDetail['charts'] {
  const wanted = CHART_KEYS[data.type].map(k => data.charts.find(c => c.key === k)).filter(c => !!c);
  return (wanted.length > 0 ? wanted : data.charts).slice(0, 2);
}

export default function AwsResourceScreen({ route }: RootStackScreenProps<'AwsResource'>) {
  const { type, id } = route.params;
  const [range, setRange] = useState<AwsRange>(route.params.range);
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useAppTheme();

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
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const notFound = !data && !!error && /not found|404|no longer exist/i.test(error);
  const updated = data
    ? new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      {data ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-muted-foreground flex-1 text-sm" numberOfLines={2}>{data.subtitle}</Text>
          <StatusBadge tone={statusTone(data.status)}>{data.status}</StatusBadge>
        </View>
      ) : null}

      <RangeBar range={range} onChange={setRange} updated={updated} />

      {error ? <ErrorCard message={notFound ? 'This resource no longer exists' : error} /> : null}

      {data ? (
        <>
          {data.stats.length > 0 ? <MetricCards items={pickStats(data)} /> : null}

          {pickCharts(data).map(ch => {
            const dots = ch.series.map((s, i) => ({ label: s.label, dotClass: CHART_DOTS[i % CHART_DOTS.length] }));
            return (
              <SectionCard key={ch.key} title={ch.title}>
                <View className="gap-3">
                  <LineChart
                    height={150}
                    formatY={unitFormatter(ch.unit)}
                    filled={ch.series.length === 1}
                    series={ch.series.map(s => ({ points: s.points }))}
                  />
                  <ChartLegend items={dots} />
                </View>
              </SectionCard>
            );
          })}

          {data.properties.length > 0 ? (
            <SectionCard title="Details">
              <DetailList items={data.properties.slice(0, 6)} />
            </SectionCard>
          ) : null}

          {data.type === 'lambda' ? (
            <SectionCard title="Recent errors and warnings">
              {data.recentLogs.length === 0 ? (
                <Text className="text-muted-foreground text-sm">No errors or warnings in this window</Text>
              ) : (
                <View className="gap-3">
                  {[...data.recentLogs].sort((a, b) => b.t - a.t).map((l, i) => (
                    <View key={`${l.t}-${i}`} className="gap-0.5">
                      <Text className="text-muted-foreground text-xs">{time(l.t)}</Text>
                      <Text className="text-xs" style={{ fontFamily: Fonts.mono }}>
                        {(() => {
                          const lv = logLevel(l.message);
                          if (!lv) return l.message;
                          const at = l.message.indexOf(lv.word);
                          return (
                            <>
                              {l.message.slice(0, at)}
                              <Text className={`text-xs font-semibold ${lv.className}`} style={{ fontFamily: Fonts.mono }}>{lv.word}</Text>
                              {l.message.slice(at + lv.word.length)}
                            </>
                          );
                        })()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>
          ) : null}

          {data.errors.map((e, i) => <ErrorCard key={i} message={e} />)}
        </>
      ) : null}
    </ScrollView>
  );
}
