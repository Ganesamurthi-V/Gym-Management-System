import React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { StatusBadge, type StatusTone } from '@/components/dashboard/StatusBadge';
import { cn } from '@/lib/utils';
import type { SupportTicket } from '@/lib/api';

type TicketCardProps = {
  ticket: SupportTicket;
  onResolve?: () => void;
};

const typeTone = (type: string): StatusTone => {
  if (type === 'high_priority') return 'error';
  if (type === 'bug') return 'warning';
  if (type === 'feedback') return 'info';
  return 'info';
};

function StarRow({ rating }: { rating: number }) {
  return (
    <View className="ml-0.5 flex-row gap-px">
      {[1, 2, 3, 4, 5].map(n => (
        <Icon
          key={n}
          name="star"
          size={13}
          className={n <= rating ? 'text-warning' : 'text-muted-foreground'}
        />
      ))}
    </View>
  );
}

export function TicketCard({ ticket, onResolve }: TicketCardProps) {
  const isOpen = ticket.status === 'open';
  const isFeedback = ticket.type === 'feedback';
  return (
    <Card className={cn('gap-3 px-4 py-4', !isOpen && 'opacity-70')}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 flex-row flex-wrap items-center gap-1.5">
          <StatusBadge tone={typeTone(ticket.type)}>{ticket.type.replace('_', ' ')}</StatusBadge>
          <StatusBadge tone={isOpen ? 'warning' : 'success'}>{ticket.status}</StatusBadge>
          {isFeedback && ticket.rating != null && <StarRow rating={ticket.rating} />}
        </View>
        <Text className="text-xs text-muted-foreground">
          {new Date(ticket.created_at).toLocaleDateString('en-IN')}
        </Text>
      </View>

      <View className="gap-0.5">
        <Text className={cn('text-base font-semibold', !isOpen && 'line-through')}>{ticket.subject}</Text>
        <Text className="text-xs text-muted-foreground">From: {ticket.gyms?.name}</Text>
      </View>

      <View className="rounded-md border border-border bg-muted p-3">
        <Text className="text-sm leading-5 text-muted-foreground">{ticket.message}</Text>
      </View>

      {isOpen && onResolve && (
        <Button variant="outline" size="sm" className="self-end" onPress={onResolve}>
          <Icon name="check-circle" size={14} />
          <Text>Resolve</Text>
        </Button>
      )}
    </Card>
  );
}
