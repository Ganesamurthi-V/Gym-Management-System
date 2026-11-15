import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';

type BarListProps = {
  items: { label: string; value: number }[];
  formatValue: (v: number) => string;
  color?: string;
};

export function BarList({ items, formatValue, color = Colors.indigo }: BarListProps) {
  if (items.length === 0) return <Text style={styles.empty}>No data</Text>;
  const max = Math.max(...items.map(i => i.value), 0) || 1;
  return (
    <View style={styles.list}>
      {items.map(item => (
        <View key={item.label} style={styles.item}>
          <View style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
            <Text style={styles.value}>{formatValue(item.value)}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { backgroundColor: color, width: `${Math.max(2, (item.value / max) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
  item: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  label: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  value: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  empty: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg },
});
