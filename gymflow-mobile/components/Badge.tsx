import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'muted';

const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  success: { bg: Colors.emeraldBg, text: Colors.emerald, border: Colors.emeraldBorder },
  error: { bg: Colors.redBg, text: Colors.red, border: Colors.redBorder },
  warning: { bg: Colors.amberBg, text: Colors.amber, border: Colors.amberBorder },
  info: { bg: Colors.indigoBg, text: Colors.indigo, border: Colors.indigoBorder },
  muted: { bg: 'rgba(71,85,105,0.15)', text: Colors.textMuted, border: 'rgba(71,85,105,0.3)' },
};

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  dot?: boolean;
};

export function Badge({ label, variant = 'info', dot = false }: BadgeProps) {
  const s = variantStyles[variant];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      {dot && <View style={[styles.dot, { backgroundColor: s.text }]} />}
      <Text style={[styles.label, { color: s.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
