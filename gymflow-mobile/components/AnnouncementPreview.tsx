import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

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
    <View className="gap-2">
      <Text className="text-muted-foreground text-xs">How owners will see it</Text>
      {/* Mini page: the banner is a full-width bar above everything, like the owner console. */}
      <View style={styles.page}>
        <View style={[styles.strip, { backgroundColor: c.bg, borderColor: c.border }]}>
          <Text style={[styles.text, { color: empty ? '#94A3B8' : c.text }]}>
            {empty ? 'Your message appears here' : message}
            {hasLink && !empty ? (
              <Text style={[styles.text, styles.link, { color: c.text }]}>{' '}{linkLabel?.trim() || 'Learn more'}</Text>
            ) : null}
            {!empty && after ? ` ${after}` : ''}
          </Text>
          {/* Absolute so the centered text is not pushed off-centre by the X. */}
          {level !== 'critical' && (
            <View style={styles.close}>
              <Icon name="x" size={14} color={c.text} />
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
  page: { backgroundColor: '#F8FAFC', borderRadius: 8, overflow: 'hidden' },
  strip: {
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingVertical: 8,
    borderBottomWidth: 1,
  },
  text: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  link: { textDecorationLine: 'underline', fontWeight: '600' },
  close: { position: 'absolute', right: 8, top: 0, bottom: 0, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  headerDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#E2E8F0' },
  headerBar: { height: 8, width: '40%', borderRadius: 4, backgroundColor: '#E2E8F0' },
});
