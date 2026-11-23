import React from 'react';
import { ScrollView, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import type { StatusTone } from '@/components/dashboard/StatusBadge';
import type { AwsRange, AwsStatus } from '@/types/aws';

export const RANGES: AwsRange[] = ['1h', '24h', '7d'];

export const statusTone = (s: AwsStatus): StatusTone => s;

/** Range chips (1h / 24h / 7d) with the "Updated hh:mm" stamp on the right. */
export function RangeBar({ range, onChange, updated }: {
  range: AwsRange; onChange: (r: AwsRange) => void; updated: string | null;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Tabs value={range} onValueChange={v => onChange(v as AwsRange)}>
        <TabsList>
          {RANGES.map(r => (
            <TabsTrigger key={r} value={r}><Text>{r}</Text></TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {updated ? <Text className="text-muted-foreground text-xs">Updated {updated}</Text> : null}
    </View>
  );
}

/** Inline destructive-tone card for a failed section. */
export function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-destructive/40 bg-destructive/10 flex-row items-start gap-2 px-4 py-3 shadow-none">
      <Icon name="alert-triangle" size={14} className="text-destructive mt-0.5" />
      <Text className="text-destructive flex-1 text-sm">{message}</Text>
    </Card>
  );
}

export type LegendItem = { label: string; dotClass: string };

/** Small series legend under a chart. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <View className="flex-row flex-wrap gap-4">
      {items.map(i => (
        <View key={i.label} className="flex-row items-center gap-1.5">
          <View className={`size-2 rounded-full ${i.dotClass}`} />
          <Text className="text-muted-foreground text-xs">{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

export const CHART_DOTS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];

/** Horizontally scrollable tab strip for filters that may not fit 360dp. */
export function ScrollTabs({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}
