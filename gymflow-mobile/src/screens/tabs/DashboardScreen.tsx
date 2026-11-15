import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchDashboardStats, type DashboardStats } from '@/lib/api';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { useAppTheme } from '@/lib/theme';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { ListRow } from '@/components/dashboard/ListRow';
import { StatusBadge, type StatusTone } from '@/components/dashboard/StatusBadge';
import type { RootStackParamList } from '../../navigation/types';

function messageTone(type: string): StatusTone {
  if (type === 'error') return 'error';
  if (type === 'warning') return 'warning';
  if (type === 'success') return 'success';
  return 'info';
}

function EmptyState({ icon, text }: { icon?: string; text: string }) {
  return (
    <View className="items-center justify-center gap-2 py-6">
      {icon ? <Icon name={icon} size={24} className="text-muted-foreground" /> : null}
      <Text className="text-muted-foreground text-sm">{text}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useAppTheme();

  const { data: stats, loading, error, refresh } = useCachedQuery<DashboardStats>({
    key: CacheKeys.dashboard,
    fetcher: fetchDashboardStats,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  // Recomputed per render but cheap, and it must not be memoised across a date
  // rollover while the app sits open overnight.
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Only a true cold miss blocks. With anything cached the screen renders its real
  // content immediately and the refresh happens behind it, so returning to this tab
  // no longer costs a spinner.
  if (loading) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator color={colors.mutedForeground} size="large" />
      </View>
    );
  }

  const errorCount = stats?.errorCount ?? 0;
  const warningCount = stats?.warningCount ?? 0;
  const recentErrors = (stats?.recentErrors ?? []).slice(0, 5);
  const recentMessages = stats?.recentMessages ?? [];

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedForeground} />
      }
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-muted-foreground flex-1 text-xs">{today}</Text>
        <StatusBadge tone="healthy">System Online</StatusBadge>
      </View>

      {error && (
        <Card className="flex-row items-center gap-2 px-4 py-3">
          <Icon name="alert-triangle" size={14} className="text-warning" />
          <Text className="flex-1 text-sm">{error}</Text>
        </Card>
      )}

      <MetricCards
        items={[
          { icon: 'activity', label: 'Total Gyms', value: String(stats?.gymCount ?? '—') },
          { icon: 'users', label: 'Total Members', value: String(stats?.memberCount ?? '—') },
          { icon: 'check-circle', label: "Today's Check-ins", value: String(stats?.attendanceToday ?? '—') },
          { icon: 'alert-circle', label: 'Open Errors', value: String(errorCount), footnote: 'Sentry', tone: errorCount > 0 ? 'red' : 'emerald', valueTone: errorCount > 0 ? 'red' : 'emerald' },
          { icon: 'alert-triangle', label: 'Warnings', value: String(warningCount), footnote: 'Sentry', tone: warningCount > 0 ? 'amber' : 'neutral', valueTone: warningCount > 0 ? 'amber' : 'neutral' },
          { icon: 'send', label: 'Msgs Sent', value: String(stats?.recentMessages?.length ?? 0), footnote: 'Recent', tone: 'violet', valueTone: 'violet' },
        ]}
      />

      <SectionCard>
        <ListRow
          last
          title="AWS Monitor"
          subtitle="Lambda, CloudFront, DynamoDB, S3 and cost"
          left={
            <View className="bg-muted border-border size-8 items-center justify-center rounded-lg border">
              <Icon name="cloud" size={16} className="text-muted-foreground" />
            </View>
          }
          right={<Icon name="chevron-right" size={18} className="text-muted-foreground" />}
          onPress={() => navigation.navigate('AwsMonitor')}
        />
      </SectionCard>

      <SectionCard title="Recent Errors">
        {recentErrors.length === 0 ? (
          <EmptyState icon="shield" text="No open errors" />
        ) : (
          recentErrors.map((e, i) => (
            <ListRow
              key={e.id}
              last={i === recentErrors.length - 1}
              title={e.title}
              subtitle={`${e.culprit}\n${new Date(e.lastSeen).toLocaleString('en-IN')}`}
              right={<StatusBadge tone="error">{`${e.count} events`}</StatusBadge>}
            />
          ))
        )}
      </SectionCard>

      <SectionCard title="Recent Messages Sent">
        {recentMessages.length === 0 ? (
          <EmptyState text="No messages sent yet" />
        ) : (
          recentMessages.map((m, i) => (
            <ListRow
              key={m.id}
              last={i === recentMessages.length - 1}
              title={m.subject}
              subtitle={`${m.gym?.name ?? 'Unknown gym'}\n${new Date(m.created_at).toLocaleString('en-IN')}`}
              right={<StatusBadge tone={messageTone(m.type)}>{m.type}</StatusBadge>}
            />
          ))
        )}
      </SectionCard>
    </ScrollView>
  );
}
