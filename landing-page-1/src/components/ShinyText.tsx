import type { CSSProperties } from 'react';

interface ShinyTextProps {
  text: string;
  /** Freeze the sweep, keeping the gradient where it is. */
  disabled?: boolean;
  /** Seconds for the highlight to cross the word once. */
  speed?: number;
  className?: string;
  /** Base glyph colour. */
  color?: string;
  /** Colour of the highlight that sweeps through. */
  shineColor?: string;
  /** Angle of the gradient ramp, in degrees. */
  spread?: number;
  /** Sweep back and forth rather than always the same way. */
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: 'left' | 'right';
  /** Seconds spent with the highlight parked off-screen between sweeps. */
  delay?: number;
}

/**
 * A metallic sheen sweeping through a word, matching React Bits' ShinyText prop
 * for prop.
 *
 * The implementation is not theirs. Upstream drives background-position through
 * motion/react, which would have meant adding Framer Motion next to the GSAP this
 * project already uses — around 60KB for one decorative text effect — plus a
 * requestAnimationFrame callback per instance for something a CSS animation hands
 * to the compositor. Everything here is a custom property consumed by .shiny-text.
 *
 * The colour defaults differ from upstream on purpose. Its #b5b5b5 on #ffffff is a
 * dark-theme value; against this site's light background it measures about 1.9:1,
 * far below any legibility threshold. Defaulting to the accent tokens means a bare
 * <ShinyText text="..." /> is readable in both themes.
 *
 * The text stays real text — selectable, searchable, and read normally by
 * assistive tech. Only its paint is a gradient.
 */
export function ShinyText({
  text,
  disabled = false,
  speed = 2,
  className = '',
  color = 'var(--accent-text)',
  shineColor = 'var(--shine-glint)',
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  delay = 0,
}: ShinyTextProps) {
  // The hold is expressed as extra travel rather than a second keyframe: the
  // highlight needs 200% of movement to cross the word, so anything beyond that
  // is time spent off-screen. Guarded against speed 0 to avoid dividing by it.
  const holdTravel = speed > 0 ? (delay / speed) * 200 : 0;

  const style = {
    '--shine-color': color,
    '--shine-glint-local': shineColor,
    '--shine-angle': `${spread}deg`,
    '--shine-duration': `${speed + delay}s`,
    '--shine-end': `${-50 - holdTravel}%`,
    // reverse flips which side the highlight enters from; alternate is the yoyo.
    animationDirection: yoyo
      ? direction === 'left'
        ? 'alternate'
        : 'alternate-reverse'
      : direction === 'left'
        ? 'normal'
        : 'reverse',
    ...(disabled ? { animationPlayState: 'paused' as const } : null),
  } as CSSProperties;

  return (
    <span
      className={`shiny-text ${pauseOnHover ? 'shiny-text-pause-on-hover' : ''} ${className}`}
      style={style}
    >
      {text}
    </span>
  );
}

export default ShinyText;
