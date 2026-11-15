import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '@/lib/theme';

type BarListProps = {
  items: { label: string; value: number }[];
  formatValue: (v: number) => string;
  color?: string;
};

export function BarList({ items, formatValue, color }: BarListProps) {
  const { colors } = useAppTheme();
  const fillColor = color ?? colors.chart1;
  if (items.length === 0) return <Text style={[styles.empty, { color: colors.mutedForeground }]}>No data</Text>;
  const max = Math.max(...items.map(i => i.value), 0) || 1;
  return (
    <View style={styles.list}>
      {items.map(item => (
        <View key={item.label} style={styles.item}>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>{item.label}</Text>
            <Text style={[styles.value, { color: colors.foreground }]}>{formatValue(item.value)}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.muted }]}>
            <View style={[styles.fill, { backgroundColor: fillColor, width: `${Math.max(2, (item.value / max) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  item: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  label: { flex: 1, fontSize: 12 },
  value: { fontSize: 12, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  empty: { fontSize: 12, textAlign: 'center', padding: 16 },
});
