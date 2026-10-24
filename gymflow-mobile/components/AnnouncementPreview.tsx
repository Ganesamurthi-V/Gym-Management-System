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

type Props = { message: string; messageAfter?: string; level: Level; linkLabel?: string; hasLink: boolean };

export function AnnouncementPreview({ message, messageAfter, level, linkLabel, hasLink }: Props) {
  const c = LEVEL_COLORS[level];
  const empty = !message.trim();
  const after = messageAfter?.trim();
  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>How owners will see it</Text>
      {/* Mini page: the banner is a full-width bar above everything, like the owner console. */}
      <View style={styles.page}>
        <View style={[styles.strip, { backgroundColor: c.bg, borderColor: c.border }]}>
          <Text style={[styles.text, empty ? styles.placeholder : { color: c.text }]}>
            {empty ? 'Your message appears here' : message}
            {hasLink && !empty ? (
              <Text style={styles.link}>{' '}{linkLabel?.trim() || 'Learn more'}</Text>
            ) : null}
            {!empty && after ? ` ${after}` : ''}
          </Text>
          {/* Absolute so the centered text is not pushed off-centre by the X. */}
          {level !== 'critical' && (
            <View style={styles.close}>
              <Feather name="x" size={14} color={c.text} />
            </View>
          )}
        </View>
        <View style={styles.header}>
          <View style={styles.headerDot} />
          <View style={styles.headerBar} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  caption: { fontSize: 12, color: Colors.textMuted },
  page: { backgroundColor: '#F8FAFC', borderRadius: Radius.md, overflow: 'hidden' },
  strip: {
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  text: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  placeholder: { color: '#94A3B8' },
  link: { textDecorationLine: 'underline', fontWeight: '600' },
  close: { position: 'absolute', right: Spacing.sm, top: 0, bottom: 0, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  headerDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#E2E8F0' },
  headerBar: { height: 8, width: '40%', borderRadius: 4, backgroundColor: '#E2E8F0' },
});
