import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import React from 'react';
import { View } from 'react-native';

/** The one place screens put grouped content: titled Card with optional description and action. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('gap-4 py-4', className)}>
      {title || description || action ? (
        <CardHeader className="flex-row items-start justify-between gap-3 px-4">
          <View className="flex-1 gap-1">
            {title ? <CardTitle className="text-base">{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </View>
          {action ? <View className="flex-row items-center gap-2">{action}</View> : null}
        </CardHeader>
      ) : null}
      {children ? <CardContent className="px-4">{children}</CardContent> : null}
    </Card>
  );
}
