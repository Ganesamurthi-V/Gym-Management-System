import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Badge } from './Badge';
import type { Gym } from '@/lib/api';

type GymRowProps = {
  gym: Gym;
  onPress: () => void;
};

export function GymRow({ gym, onPress }: GymRowProps) {
  const joinDate = new Date(gym.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconBox}>
        <Feather name="activity" size={16} color={Colors.indigo} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{gym.name}</Text>
        <View style={styles.meta}>
          <Feather name="users" size={11} color={Colors.textMuted} />
          <Text style={styles.metaText}>{gym.memberCount} members</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.metaText}>{joinDate}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Badge
          label={gym.is_active ? 'Active' : 'Banned'}
          variant={gym.is_active ? 'success' : 'error'}
        />
        <Feather name="chevron-right" size={16} color={Colors.textMuted} style={styles.arrow} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgCardBorder,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.indigoBg,
    borderWidth: 1,
    borderColor: Colors.indigoBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  dot: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  arrow: {
    marginLeft: 2,
  },
});
