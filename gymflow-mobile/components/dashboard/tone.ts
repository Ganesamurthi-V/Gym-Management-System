import type { ThemeColors } from '@/lib/theme/tokens';

/** Semantic accent shared by MetricCards, badges and screens. neutral = the original greyscale look. */
export type Tone = 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'sky' | 'neutral';

// Full class strings so NativeWind can see them at build time.
export const TONE_TILE: Record<Tone, string> = {
  blue: 'bg-primary/10 border-primary/20',
  emerald: 'bg-success/10 border-success/20',
  amber: 'bg-warning/10 border-warning/20',
  red: 'bg-destructive/10 border-destructive/20',
  violet: 'bg-violet/10 border-violet/20',
  sky: 'bg-info/10 border-info/20',
  neutral: 'bg-muted border-border',
};

export const TONE_TEXT: Record<Tone, string> = {
  blue: 'text-primary',
  emerald: 'text-success',
  amber: 'text-warning',
  red: 'text-destructive',
  violet: 'text-violet',
  sky: 'text-info',
  neutral: 'text-foreground',
};

export const TONE_BAR: Record<Tone, string> = {
  blue: 'bg-primary',
  emerald: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
  violet: 'bg-violet',
  sky: 'bg-info',
  neutral: 'bg-foreground',
};

export function toneColor(tone: Tone, colors: ThemeColors): string {
  switch (tone) {
    case 'blue': return colors.primary;
    case 'emerald': return colors.success;
    case 'amber': return colors.warning;
    case 'red': return colors.destructive;
    case 'violet': return colors.violet;
    case 'sky': return colors.info;
    default: return colors.mutedForeground;
  }
}
