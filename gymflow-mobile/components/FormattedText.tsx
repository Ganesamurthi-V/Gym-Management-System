import React from 'react';
import { Linking, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { parseBlocks } from '@/lib/email-markup';

/**
 * The editor's markup drawn as styled text: bold, italic, underline, links and lists. Used
 * for the composer's Preview, so what is typed as **bold** can be checked as bold before it
 * is sent.
 */
export function FormattedText({ markup, style }: { markup: string; style?: TextStyle }) {
  const blocks = parseBlocks(markup);

  return (
    <View style={styles.wrap}>
      {blocks.map((b, i) => {
        const text = (
          <Text style={[styles.text, style]} selectable>
            {b.runs.map((r, j) => (
              <Text
                key={j}
                onPress={r.href ? () => { void Linking.openURL(r.href as string); } : undefined}
                style={[
                  r.bold && styles.bold,
                  r.italic && styles.italic,
                  (r.underline || r.href) && styles.underline,
                  r.href && styles.link,
                ]}
              >
                {r.text}
              </Text>
            ))}
          </Text>
        );
        if (b.kind === 'p') return b.runs.length === 1 && b.runs[0].text === '' ? <View key={i} style={styles.gap} /> : <View key={i}>{text}</View>;
        return (
          <View key={i} style={styles.listRow}>
            <Text style={[styles.text, styles.marker]}>{b.kind === 'bullet' ? '•' : `${b.index}.`}</Text>
            <View style={styles.listText}>{text}</View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  text: { fontSize: 15, lineHeight: 22, color: Colors.textPrimary },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  link: { color: Colors.sky },
  gap: { height: 10 },
  listRow: { flexDirection: 'row', gap: Spacing.sm, paddingLeft: Spacing.sm },
  marker: { width: 22, color: Colors.textSecondary },
  listText: { flex: 1 },
});
