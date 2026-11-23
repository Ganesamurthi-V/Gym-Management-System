import { Text } from '@/components/ui/text';
import { TONE_TEXT, type Tone } from '@/components/dashboard/tone';
import { cn } from '@/lib/utils';
import React from 'react';
import { View } from 'react-native';

/** Label (muted, left) and value (right, wraps) rows. */
export function DetailList({ items }: { items: { label: string; value: string; /** Colours the value. Default neutral. */ tone?: Tone }[] }) {
  return (
    <View className="gap-3">
      {items.map(item => (
        <View key={item.label} className="flex-row items-start justify-between gap-4">
          <Text className="text-muted-foreground text-sm">{item.label}</Text>
          <Text className={cn('flex-1 text-right text-sm font-medium', item.tone && TONE_TEXT[item.tone])}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}
