/*
  Counter — vendored from React Bits (reactbits.dev/components/counter,
  DavidHDev/react-bits, MIT). Rolling-odometer number: each digit sits in a
  vertical strip and springs to its target place when `value` changes.

  Ported to TypeScript from the upstream .jsx: animation logic is unchanged; only
  type annotations were added so it compiles under this project's strict tsconfig
  (verbatimModuleSyntax / noUnusedParameters). Uses `motion/react`, matching
  RubberSegment, so no new dependency is introduced.
*/
import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import { MotionValue, motion, useReducedMotion, useSpring, useTransform } from 'motion/react';

interface NumberProps {
  mv: MotionValue<number>;
  number: number;
  height: number;
}

function Number({ mv, number, height }: NumberProps) {
  const y = useTransform(mv, latest => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) memo -= 10 * height;
    return memo;
  });

  const style: CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  };

  return <motion.span style={{ ...style, y }}>{number}</motion.span>;
}

interface DigitProps {
  place: number;
  value: number;
  height: number;
  digitStyle?: CSSProperties;
}

function Digit({ place, value, height, digitStyle }: DigitProps) {
  const valueRoundedToPlace = Math.floor(value / place);
  const animatedValue = useSpring(valueRoundedToPlace, { stiffness: 420, damping: 42 });

  const reduce = useReducedMotion();

  // Reduced motion: the digits jump to the new value instead of rolling.
  useEffect(() => {
    if (reduce) animatedValue.jump(valueRoundedToPlace);
    else animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace, reduce]);

  const defaultStyle: CSSProperties = {
    height,
    position: 'relative',
    width: '1ch',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div style={{ ...defaultStyle, ...digitStyle }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Number key={i} mv={animatedValue} number={i} height={height} />
      ))}
    </div>
  );
}

interface CounterProps {
  value: number;
  fontSize?: number;
  padding?: number;
  places?: number[];
  gap?: number;
  borderRadius?: number;
  horizontalPadding?: number;
  textColor?: string;
  fontWeight?: CSSProperties['fontWeight'];
  containerStyle?: CSSProperties;
  counterStyle?: CSSProperties;
  digitStyle?: CSSProperties;
}

export default function Counter({
  value,
  fontSize = 100,
  padding = 0,
  places = [100, 10, 1],
  gap = 8,
  borderRadius = 0,
  horizontalPadding = 8,
  textColor = 'var(--foreground)',
  fontWeight = 'bold',
  containerStyle,
  counterStyle,
  digitStyle,
}: CounterProps) {
  const height = fontSize + padding;

  const defaultContainerStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
  };

  const defaultCounterStyle: CSSProperties = {
    fontSize,
    display: 'flex',
    gap,
    overflow: 'hidden',
    borderRadius,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
    lineHeight: 1,
    color: textColor,
    fontWeight,
  };

  return (
    <div style={{ ...defaultContainerStyle, ...containerStyle }}>
      <div style={{ ...defaultCounterStyle, ...counterStyle }}>
        {places.map(place => (
          <Digit key={place} place={place} value={value} height={height} digitStyle={digitStyle} />
        ))}
      </div>
    </div>
  );
}
