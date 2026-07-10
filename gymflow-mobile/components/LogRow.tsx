import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { SentryEvent } from '@/lib/api';

type LogRowProps = {
  event: SentryEvent;
};

function getLevelStyle(level: string) {
  if (level === 'error' || level === 'fatal') {
    return { bg: Colors.redBg, color: Colors.red, icon: 'alert-circle' as const };
  }
  if (level === 'warning') {
    return { bg: Colors.amberBg, color: Colors.amber, icon: 'alert-triangle' as const };
  }
  return { bg: 'rgba(71,85,105,0.15)', color: Colors.textMuted, icon: 'info' as const };
}

export function LogRow({ event }: LogRowProps) {
  const levelStyle = getLevelStyle(event.level);
  const page = event.tags?.find(t => t.key === 'page')?.value ?? 'unknown';

  return (
    <View style={styles.row}>
      <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
        <Feather name={levelStyle.icon} size={11} color={levelStyle.color} />
        <Text style={[styles.levelText, { color: levelStyle.color }]}>
          {event.level}
        </Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        {event.culprit && (
          <Text style={styles.culprit} numberOfLines={1}>{event.culprit}</Text>
        )}
        <View style={styles.meta}>
          <View style={styles.pageTag}>
            <Text style={styles.pageTagText}>{page}</Text>
          </View>
          <Text style={styles.time}>
            {new Date(event.dateCreated).toLocaleString('en-IN')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgCardBorder,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    minWidth: 70,
    justifyContent: 'center',
  },
  levelText: {
    fontSize: 10,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  culprit: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  pageTag: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pageTagText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: 'Courier',
  },
  time: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});
