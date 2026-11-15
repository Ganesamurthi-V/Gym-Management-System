import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/src/navigation/types';
import { getAwsOverview } from '@/lib/api';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { formatBytes, formatMs, formatNumber, formatUsd } from '@/lib/aws-format';
import { useAppTheme } from '@/lib/theme';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { MetricCards, type MetricCardItem } from '@/components/dashboard/MetricCards';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { ListRow } from '@/components/dashboard/ListRow';
import { StatusBadge, type StatusTone } from '@/components/dashboard/StatusBadge';
import { LineChart } from '@/components/charts/LineChart';
import type { AwsMonitorOverview, AwsPoint, AwsRange, AwsResourceType, AwsSectionError } from '@/types/aws';
import { CHART_DOTS, ChartLegend, ErrorCard, RangeBar, ScrollTabs, statusTone } from './_aws/shared';

type Filter = 'all' | AwsResourceType;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'lambda', label: 'Lambda' },
  { value: 'cloudfront', label: 'CloudFront' },
  { value: 'dynamodb', label: 'DynamoDB' },
  { value: 's3', label: 'S3' },
];

type Resource = {
  type: AwsResourceType; id: string; title: string; subtitle: string; tone: StatusTone; statusText: string;
};

/** Sums several series bucket by bucket (matched on timestamp) into one. */
function sumSeries(all: AwsPoint[][]): AwsPoint[] {
  const m = new Map<number, number>();
  for (const s of all) for (const p of s) m.set(p.t, (m.get(p.t) ?? 0) + p.v);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

function buildResources(data: AwsMonitorOverview): Resource[] {
  return [
    ...data.lambda.map((f): Resource => ({
      type: 'lambda', id: f.name, title: f.name,
      subtitle: `Lambda · ${formatNumber(f.invocations)} invocations`,
      tone: statusTone(f.status), statusText: f.status,
    })),
    ...data.cloudfront.map((d): Resource => {
      const name = d.aliases[0] ?? d.domain;
      return {
        type: 'cloudfront', id: d.id, title: name,
        subtitle: `CloudFront · ${formatNumber(d.requests)} requests`,
        tone: d.enabled ? statusTone(d.status) : 'neutral', statusText: d.enabled ? d.status : 'disabled',
      };
    }),
    ...data.dynamodb.map((t): Resource => ({
      type: 'dynamodb', id: t.name, title: t.name,
      subtitle: `DynamoDB · ${formatNumber(t.throttledRequests)} throttles`,
      tone: statusTone(t.health), statusText: t.health,
    })),
    ...data.s3.map((b): Resource => ({
      type: 's3', id: b.name, title: b.name,
      subtitle: `S3 · ${formatBytes(b.sizeBytes)}`,
      tone: 'neutral', statusText: 'n/a',
    })),
  ];
}

function spendCard(cost: AwsMonitorOverview['cost']): MetricCardItem {
  const b = cost?.budget;
  if (!b) {
    return {
      icon: 'dollar-sign', label: 'Spend this month', value: formatUsd(cost?.monthToDateUsd),
      tone: 'emerald', valueTone: 'emerald',
      footnote: cost ? 'Month to date · No budget configured' : 'No cost data',
    };
  }
  const armed = b.blockActionStatus === 'STANDBY';
  const block = armed
    ? 'Auto-block armed'
    : b.blockActionStatus ? `Auto-block status: ${b.blockActionStatus}` : 'Auto-block is not configured';
  // Progress colour by budget use: emerald under 80%, amber 80-100%, red from 100%.
  const spendTone: MetricCardItem['tone'] = b.percentUsed >= 100 ? 'red' : b.percentUsed >= 80 ? 'amber' : 'emerald';
  return {
    icon: 'dollar-sign', label: 'Spend this month', value: formatUsd(b.actualUsd),
    tone: spendTone, valueTone: 'emerald',
    badge: {
      text: b.status === 'healthy' ? 'On track' : b.status === 'warning' ? 'Warning' : b.status === 'critical' ? 'Over budget' : 'Unknown',
      variant: b.status === 'critical' ? 'destructive' : b.status === 'warning' ? 'warning' : b.status === 'healthy' ? 'success' : 'outline',
    },
    footnote: `of ${formatUsd(b.limitUsd)} budget · ${block}`,
    progress: b.percentUsed,
  };
}

export default function AwsMonitorScreen() {
  const [range, setRange] = useState<AwsRange>('24h');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const updated = data
    ? new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;
  const sectionLabel: Record<AwsSectionError['section'], string> = {
    lambda: 'Lambda', cloudfront: 'CloudFront', dynamodb: 'DynamoDB', s3: 'S3', cost: 'Cost',
  };

  let metrics: MetricCardItem[] = [];
  let cfReq: AwsPoint[] = [];
  let cf5xx: AwsPoint[] = [];
  let resources: Resource[] = [];
  if (data) {
    const totalReq = data.cloudfront.reduce((a, d) => a + d.requests, 0);
    const total5xx = data.cloudfront.reduce((a, d) => a + (d.requests * d.rate5xxPct) / 100, 0);
    const lambdaErr = data.lambda.reduce((a, f) => a + f.errors, 0);
    const p95s = data.lambda
      .filter(f => f.name.toLowerCase().includes('server') && f.p95DurationMs != null)
      .map(f => f.p95DurationMs as number);
    const serverErrors = Math.round(lambdaErr + total5xx);
    const p95 = p95s.length ? Math.max(...p95s) : null;
    const p95Tone: MetricCardItem['tone'] = p95 != null && p95 > 3000 ? 'amber' : 'violet';
    const nDist = data.cloudfront.length;
    metrics = [
      spendCard(data.cost),
      {
        icon: 'globe', label: 'App requests', value: formatNumber(totalReq),
        tone: 'blue', valueTone: 'blue',
        footnote: `across ${nDist} ${nDist === 1 ? 'distribution' : 'distributions'}`,
      },
      {
        icon: 'alert-triangle', label: 'Server errors', value: formatNumber(serverErrors),
        tone: serverErrors > 0 ? 'red' : 'emerald', valueTone: serverErrors > 0 ? 'red' : 'emerald',
        footnote: 'Lambda errors + CloudFront 5xx',
      },
      {
        icon: 'clock', label: 'p95 response time', value: p95s.length ? formatMs(Math.max(...p95s)) : '—',
        tone: p95Tone, valueTone: p95Tone,
        footnote: 'Server functions',
      },
    ];
    cfReq = sumSeries(data.cloudfront.map(d => d.requestsSeries));
    cf5xx = sumSeries(data.cloudfront.map(d => d.errors5xxSeries));
    resources = buildResources(data);
  }
  const shown = filter === 'all' ? resources : resources.filter(r => r.type === filter);

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      <RangeBar range={range} onChange={setRange} updated={updated} />

      {error ? <ErrorCard message={error} /> : null}

      {data ? (
        <>
          {data.errors.map(e => (
            <ErrorCard key={e.section} message={`${sectionLabel[e.section]}: ${e.message}`} />
          ))}

          <MetricCards items={metrics} />

          <SectionCard title="Traffic" description="CloudFront requests and 5xx responses">
            <View className="gap-3">
              <LineChart
                height={150}
                formatY={formatNumber}
                series={[{ points: cfReq }, { points: cf5xx }]}
              />
              <ChartLegend items={[
                { label: 'Requests', dotClass: CHART_DOTS[0] },
                { label: '5xx', dotClass: CHART_DOTS[1] },
              ]} />
            </View>
          </SectionCard>

          <SectionCard title="Resources">
            <View className="gap-2">
              <ScrollTabs>
                <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
                  <TabsList>
                    {FILTERS.map(f => (
                      <TabsTrigger key={f.value} value={f.value}><Text>{f.label}</Text></TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </ScrollTabs>
              {shown.length === 0 ? (
                <Text className="text-muted-foreground py-2 text-sm">No resources found</Text>
              ) : shown.map((r, i) => (
                <ListRow
                  key={`${r.type}-${r.id}`}
                  title={r.title}
                  subtitle={r.subtitle}
                  right={<StatusBadge tone={r.tone}>{r.statusText}</StatusBadge>}
                  onPress={() => navigation.navigate('AwsResource', { type: r.type, id: r.id, title: r.title, range })}
                  last={i === shown.length - 1}
                />
              ))}
            </View>
          </SectionCard>
        </>
      ) : null}
    </ScrollView>
  );
}
