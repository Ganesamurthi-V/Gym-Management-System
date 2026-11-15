import { Text } from '@/components/ui/text';
import React from 'react';
import { View } from 'react-native';

/** Heading + muted description, with optional right-aligned actions (children). */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-1">
        <Text role="heading" aria-level={1} className="text-xl font-semibold tracking-tight">
          {title}
        </Text>
        {description ? <Text className="text-muted-foreground text-sm">{description}</Text> : null}
      </View>
      {children ? <View className="flex-row items-center gap-2">{children}</View> : null}
    </View>
  );
}
