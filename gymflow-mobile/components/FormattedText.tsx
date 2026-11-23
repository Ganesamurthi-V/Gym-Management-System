import React from 'react';
import { Linking, View, type TextStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { parseBlocks } from '@/lib/email-markup';

/**
 * The editor's markup drawn as styled text: bold, italic, underline, links and lists. Used
 * for the composer's Preview, so what is typed as **bold** can be checked as bold before it
 * is sent.
 */
export function FormattedText({ markup, style }: { markup: string; style?: TextStyle }) {
  const blocks = parseBlocks(markup);

  return (
    <View className="gap-0.5">
      {blocks.map((b, i) => {
        const text = (
          <Text className="text-[15px] leading-[22px]" style={style} selectable>
            {b.runs.map((r, j) => (
              <Text
                key={j}
                onPress={r.href ? () => { Linking.openURL(r.href as string); } : undefined}
                className={cn(
                  'text-[15px] leading-[22px]',
                  r.bold && 'font-extrabold',
                  r.italic && 'italic',
                  (r.underline || r.href) && 'underline',
                  r.href && 'text-primary',
                )}
              >
                {r.text}
              </Text>
            ))}
          </Text>
        );
        if (b.kind === 'p') return b.runs.length === 1 && b.runs[0].text === '' ? <View key={i} className="h-2.5" /> : <View key={i}>{text}</View>;
        return (
          <View key={i} className="flex-row gap-2 pl-2">
            <Text className="w-[22px] text-[15px] leading-[22px] text-muted-foreground">{b.kind === 'bullet' ? '•' : `${b.index}.`}</Text>
            <View className="flex-1">{text}</View>
          </View>
        );
      })}
    </View>
  );
}
