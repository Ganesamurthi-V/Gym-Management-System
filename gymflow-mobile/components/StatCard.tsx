import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  iconName?: string;
  accentColor?: string;
  accentBg?: string;
};

export function StatCard({ label, value, sub, accentColor = Colors.indigo, accentBg = Colors.indigoBg }: StatCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconContainer, { backgroundColor: accentBg }]}>
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {sub && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    padding: Spacing.lg,
    minWidth: '45%',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
