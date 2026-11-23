import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cssInterop } from 'nativewind';
import * as React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

type IconProps = {
  /** Feather glyph name, e.g. "chevron-down". */
  name: string;
  size?: number;
  /** Raw colour; wins over className text colour. */
  color?: string;
  className?: string;
  'aria-hidden'?: boolean;
};

type IconImplProps = {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: StyleProp<TextStyle>;
};

function IconImpl({ name, size, color }: IconImplProps) {
  return <Feather name={name} size={size} color={color} />;
}

// className -> style; size-N maps to the `size` prop and text-* to the `color` prop,
// the same trick the Reusables lucide Icon uses.
cssInterop(IconImpl, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      height: 'size',
      width: 'size',
      color: 'color',
    },
  },
});

/**
 * Feather icon with NativeWind className support (replaces the lucide Icon from Reusables).
 * Inherits text colour from the surrounding TextClassContext (button, badge...).
 *
 * <Icon name="sun" size={16} className="text-muted-foreground" />
 */
function Icon({ name, className, size = 14, color }: IconProps) {
  const textClass = React.useContext(TextClassContext);
  return (
    <IconImpl
      name={name}
      className={cn('text-foreground', textClass, className)}
      size={size}
      color={color}
    />
  );
}

export { Icon };
export type { IconProps };
