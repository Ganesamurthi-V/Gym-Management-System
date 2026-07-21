import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Badge } from './Badge';
import type { SupportTicket } from '@/lib/api';

type TicketCardProps = {
  ticket: SupportTicket;
  onResolve?: () => void;
};

const typeVariant = (type: string): 'error' | 'warning' | 'info' => {
  if (type === 'high_priority') return 'error';
  if (type === 'bug') return 'warning';
  return 'info';
};

export function TicketCard({ ticket, onResolve }: TicketCardProps) {
  const isOpen = ticket.status === 'open';
  return (
    <View style={[styles.card, !isOpen && styles.resolvedCard]}>
      <View style={styles.header}>
        <View style={styles.badges}>
          <Badge
            label={ticket.type.replace('_', ' ')}
            variant={typeVariant(ticket.type)}
          />
          <Badge
            label={ticket.status}
            variant={isOpen ? 'success' : 'muted'}
          />
        </View>
        <Text style={styles.time}>
          {new Date(ticket.created_at).toLocaleDateString('en-IN')}
        </Text>
      </View>

      <Text style={[styles.subject, !isOpen && styles.resolvedText]}>
        {ticket.subject}
      </Text>
      <Text style={styles.gymName}>From: {ticket.gyms?.name}</Text>

      <View style={[styles.messageBox, !isOpen && styles.resolvedMsg]}>
        <Text style={styles.messageText}>{ticket.message}</Text>
      </View>

      {isOpen && onResolve && (
        <TouchableOpacity style={styles.resolveBtn} onPress={onResolve} activeOpacity={0.75}>
          <Feather name="check-circle" size={14} color={Colors.emerald} />
          <Text style={styles.resolveBtnText}>Resolve</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  resolvedCard: {
    opacity: 0.65,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  time: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  subject: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  resolvedText: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  gymName: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  messageBox: {
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    padding: Spacing.md,
  },
  resolvedMsg: {
    opacity: 0.5,
  },
  messageText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.emeraldBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.emeraldBorder,
  },
  resolveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.emerald,
  },
});
