import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';

type Level = 'info' | 'warning' | 'critical';

// Fixed light values: the owner app is light, so the preview must not follow this app's dark theme.
const LEVEL_COLORS: Record<Level, { bg: string; border: string; text: string }> = {
  info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E3A8A' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  critical: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
};

type Props = { message: string; level: Level; linkLabel?: string; hasLink: boolean };

export function AnnouncementPreview({ message, level, linkLabel, hasLink }: Props) {
  const c = LEVEL_COLORS[level];
  const empty = !message.trim();
  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>How owners will see it</Text>
      <View style={styles.page}>
        <View style={[styles.strip, { backgroundColor: c.bg, borderColor: c.border }]}>
          <Text style={[styles.text, empty ? styles.placeholder : { color: c.text }]}>
            {empty ? 'Your message appears here' : message}
            {hasLink && !empty ? (
              <Text style={styles.link}>{'  '}{linkLabel?.trim() || 'Learn more'}</Text>
            ) : null}
          </Text>
          {level !== 'critical' && <Feather name="x" size={14} color={c.text} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  caption: { fontSize: 12, color: Colors.textMuted },
  page: { backgroundColor: '#F8FAFC', borderRadius: Radius.md, padding: Spacing.md },
  strip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderWidth: 1, borderRadius: Radius.sm,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
  placeholder: { color: '#94A3B8' },
  link: { textDecorationLine: 'underline', fontWeight: '600' },
});
