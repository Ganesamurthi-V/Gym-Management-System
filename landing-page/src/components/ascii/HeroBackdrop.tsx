/* The hero's GradientASCII (React Bits) fed from the theme tokens, so the ramp is always Royal Blue.
   The hero is a graphite stage in both themes (.band-ink), so the field is always drawn in its dark mode: blue light rising behind the product.
   The component bakes its colours into a WebGL ramp at mount, so a theme change remounts it (key) instead of mutating settings. */
import { useEffect, useState } from 'react';
import GradientASCII from './GradientASCII';

type Ramp = { key: string; colors: string[]; font: string; phone: boolean };

function readRamp(): Ramp {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const accent = token('--accent');
  const bright = token('--band-ink-accent');
  const white = token('--band-ink-fg');
  // brand blue at the edge of the glow, a lifted blue, the pale blue of the band's own accent, then its near-white core
  const colors = [accent, `color-mix(in oklab, ${accent} 50%, ${bright})`, bright, white];
  // On a phone the hero is short, so the tall glow would sit behind every line of copy: keep it to the lower part there.
  const phone = window.matchMedia('(max-width: 767px)').matches;
  return { key: (root.classList.contains('dark') ? 'night' : 'light') + (phone ? '-phone' : ''), colors, font: token('--font-mono') || 'monospace', phone };
}

export function HeroBackdrop({ className }: { className?: string }) {
  const [ramp, setRamp] = useState<Ramp | null>(null);

  useEffect(() => {
    setRamp(readRamp());
    const watch = new MutationObserver(() => setRamp(readRamp()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => watch.disconnect();
  }, []);

  if (!ramp) return null;
  return (
    <GradientASCII
      key={ramp.key}
      className={className}
      colors={ramp.colors}
      fontFamily={ramp.font}
      shape="rise"
      characters=" =+xX0S8#@"
      cellSize={16}
      density={0.85}
      glyphOpacity={0.9}
      gradientOpacity={0.85}
      glow={0.35}
      grain={0.05}
      softness={0.8}
      scale={1.2}
      reach={ramp.phone ? 1.05 : 1.9}
      flow={0.6}
      speed={0.8}
      clickEffect="wave"
    />
  );
}
