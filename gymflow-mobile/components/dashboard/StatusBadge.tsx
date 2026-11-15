import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import React from 'react';
import { View } from 'react-native';

export type StatusTone =
  | 'healthy'
  | 'success'
  | 'warning'
  | 'critical'
  | 'error'
  | 'info'
  | 'primary'
  | 'violet'
  | 'unknown'
  | 'neutral';

const DOT: Record<StatusTone, string> = {
  healthy: 'bg-success',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  error: 'bg-destructive',
  info: 'bg-info',
  primary: 'bg-primary',
  violet: 'bg-violet',
  unknown: 'bg-muted-foreground',
  neutral: 'bg-muted-foreground',
};

const VARIANT: Record<StatusTone, 'success' | 'warning' | 'destructive' | 'info' | 'primarySoft' | 'violet' | 'outline'> = {
  healthy: 'success',
  success: 'success',
  warning: 'warning',
  critical: 'destructive',
  error: 'destructive',
  info: 'info',
  primary: 'primarySoft',
  violet: 'violet',
  unknown: 'outline',
  neutral: 'outline',
};

const TEXT: Record<StatusTone, string> = {
  healthy: 'text-success',
  success: 'text-success',
  warning: 'text-warning',
  critical: 'text-destructive',
  error: 'text-destructive',
  info: 'text-info',
  primary: 'text-primary',
  violet: 'text-violet',
  unknown: 'text-muted-foreground',
  neutral: 'text-muted-foreground',
};

/** Tinted badge (coloured text on a faint tint) with a status dot; same look as the web StatusBadge. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <Badge variant={VARIANT[tone]} className={cn('gap-1.5 px-1.5', VARIANT[tone] === 'destructive' && 'bg-destructive/10 border-destructive/20')}>
      <View accessibilityElementsHidden className={cn('size-1.5 rounded-full', DOT[tone])} />
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text className={cn('text-xs font-medium', TEXT[tone])}>{children}</Text>
      ) : (
        children
      )}
    </Badge>
  );
}
