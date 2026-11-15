import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { TONE_BAR, TONE_TEXT, TONE_TILE, toneColor, type Tone } from '@/components/dashboard/tone';
import { useAppTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import React from 'react';
import { Pressable, View } from 'react-native';

export interface MetricCardItem {
  icon: string; // Feather name
  label: string;
  value: string;
  badge?: { text: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'primarySoft' | 'violet' };
  footnote?: string;
  /** 0-100, renders a Progress bar */
  progress?: number;
  /** Tints the icon tile, icon and progress bar. Default neutral. */
  tone?: Tone;
  /** Colours the big number. Default neutral. */
  valueTone?: Tone;
  onPress?: () => void;
}

const GAP = 12;

function MetricCard({ item }: { item: MetricCardItem }) {
  const { icon, label, value, badge, footnote, progress, tone = 'neutral', valueTone = 'neutral' } = item;
  const { colors } = useAppTheme();
  const card = (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-2 px-4">
        <View className={cn('size-7 items-center justify-center rounded-lg border', TONE_TILE[tone])}>
          <Icon name={icon} size={16} color={toneColor(tone, colors)} />
        </View>
        <CardDescription numberOfLines={1}>{label}</CardDescription>
      </CardHeader>
      <CardContent className="gap-1 px-4">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className={cn('text-2xl font-medium leading-none tabular-nums', valueTone !== 'neutral' && TONE_TEXT[valueTone])}>{value}</Text>
          {badge ? (
            <Badge variant={badge.variant}>
              <Text>{badge.text}</Text>
            </Badge>
          ) : null}
        </View>
        {progress !== undefined ? (
          <Progress value={Math.min(100, Math.max(0, progress))} className="my-1" indicatorClassName={TONE_BAR[tone]} />
        ) : null}
        {footnote ? <Text className="text-muted-foreground text-sm">{footnote}</Text> : null}
      </CardContent>
    </Card>
  );
  if (!item.onPress) return card;
  return (
    <Pressable
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      className="active:opacity-80">
      {card}
    </Pressable>
  );
}

/**
 * Always 2 columns. Widths are percentages of the real container: a pixel width computed from
 * onLayout overshot inside padded cards, so the second column wrapped under the first.
 * Web counterpart: dashboard/metric-cards.tsx.
 */
export function MetricCards({ items }: { items: MetricCardItem[] }) {
  return (
    <View className="flex-row flex-wrap justify-between" style={{ rowGap: GAP }}>
      {items.map(item => (
        <View key={item.label} style={{ width: '48%' }}>
          <MetricCard item={item} />
        </View>
      ))}
    </View>
  );
}
