// Single JS-side copy of the shadcn neutral tokens. global.css holds the same values as HSL
// channels for NativeWind classes; keep the two in sync (global.css is the visual source of truth,
// which was converted from gymflow-admin/app/globals.css). Use these hex values only where a class
// cannot reach: SVG strokes, navigation theme, StatusBar, icon colour props.

export type Scheme = 'light' | 'dark';

type Channels = Record<string, string>;

// "H S% L%" exactly as written in global.css.
const LIGHT: Channels = {
  background: '0 0% 100%',
  foreground: '0 0% 3.9%',
  card: '0 0% 100%',
  cardForeground: '0 0% 3.9%',
  popover: '0 0% 100%',
  popoverForeground: '0 0% 3.9%',
  primary: '221 83% 53%',
  primaryForeground: '0 0% 100%',
  secondary: '0 0% 96.1%',
  secondaryForeground: '0 0% 9.1%',
  muted: '0 0% 96.1%',
  mutedForeground: '0 0% 45.2%',
  accent: '0 0% 96.1%',
  accentForeground: '0 0% 9.1%',
  destructive: '357 100% 45.3%',
  border: '0 0% 89.8%',
  input: '0 0% 89.8%',
  ring: '0 0% 63%',
  chart1: '211 91.1% 53.7%',
  chart2: '359 86.1% 60.5%',
  chart3: '40 88.1% 49.7%',
  chart4: '157 79.2% 39.3%',
  chart5: '260 75.3% 64%',
  success: '160 84% 32%',
  successForeground: '0 0% 100%',
  warning: '32 95% 40%',
  warningForeground: '0 0% 100%',
  info: '199 89% 38%',
  infoForeground: '0 0% 100%',
  violet: '262 83% 52%',
};

const DARK: Channels = {
  background: '0 0% 3.9%',
  foreground: '0 0% 98%',
  card: '0 0% 9.1%',
  cardForeground: '0 0% 98%',
  popover: '0 0% 9.1%',
  popoverForeground: '0 0% 98%',
  primary: '217 91% 60%',
  primaryForeground: '0 0% 100%',
  secondary: '0 0% 14.9%',
  secondaryForeground: '0 0% 98%',
  muted: '0 0% 14.9%',
  mutedForeground: '0 0% 63%',
  accent: '0 0% 14.9%',
  accentForeground: '0 0% 98%',
  destructive: '359 100% 69.6%',
  border: '0 0% 13.5%',
  input: '0 0% 18.3%',
  ring: '0 0% 45.2%',
  chart1: '213 100% 66.2%',
  chart2: '359 99.4% 69.3%',
  chart3: '40 91.6% 60.4%',
  chart4: '154 57.3% 51.6%',
  chart5: '257 94.4% 75.4%',
  success: '158 64% 52%',
  successForeground: '0 0% 9.1%',
  warning: '43 96% 56%',
  warningForeground: '0 0% 9.1%',
  info: '199 89% 60%',
  infoForeground: '0 0% 9.1%',
  violet: '258 90% 70%',
};

function hslToHex(channels: string): string {
  const [h, s, l] = channels.split(' ').map(p => parseFloat(p));
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function build(channels: Channels) {
  const out: Record<string, string> = {};
  for (const key of Object.keys(channels)) out[key] = hslToHex(channels[key]);
  return out as Record<keyof typeof LIGHT, string>;
}

export const themeColors = {
  light: build(LIGHT),
  dark: build(DARK),
};

export type ThemeColors = typeof themeColors.light;

// Status dots: same hues as the success / warning / destructive / info tokens (light scheme).
export const statusColors = {
  emerald: themeColors.light.success,
  amber: themeColors.light.warning,
  red: themeColors.light.destructive,
  sky: themeColors.light.info,
};
