import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import React from 'react';
import { Pressable, View } from 'react-native';

/**
 * Divider-separated list row. Every row draws a bottom border; pass `last` on the final
 * row to drop it (native has no `last:` variant).
 */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  destructive,
  last,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  const content = (
    <View className={cn('flex-row items-center gap-3 py-3', !last && 'border-border border-b')}>
      {left ? <View className="shrink-0">{left}</View> : null}
      <View className="flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className={cn('text-sm font-medium', destructive && 'text-destructive')}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} className="text-muted-foreground text-xs">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View className="shrink-0">{right}</View> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:bg-accent">
      {content}
    </Pressable>
  );
}
