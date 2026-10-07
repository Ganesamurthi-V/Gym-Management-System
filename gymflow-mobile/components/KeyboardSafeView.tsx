import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View, type KeyboardEvent, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = ViewProps & {
  /**
   * Also keep the content clear of the phone's bottom edge (gesture bar, home indicator)
   * when the keyboard is closed. For screens or sheets whose last element sits at the bottom.
   */
  safeBottom?: boolean;
};

/**
 * Keeps whatever is typed in an input above the keyboard.
 *
 * Why not KeyboardAvoidingView: on Android it depends on the window resizing for the
 * keyboard (adjustResize), and that stopped happening once the app targeted Android 15,
 * which draws edge to edge. The keyboard then simply covers the bottom of the screen, which
 * is the "text hides behind the keyboard" problem.
 *
 * This measures instead of assuming. When the keyboard opens it works out how far the
 * keyboard overlaps this view and pads the bottom by exactly that. If the system already
 * resized the window, the overlap is zero and nothing is added, so it is correct on every
 * Android version and on iOS, and it never pads twice.
 */
export function KeyboardSafeView({ children, style, safeBottom = false, ...rest }: Props) {
  const ref = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      const keyboardTop = e.endCoordinates.screenY;
      // One frame later, so a window that resized itself has finished before we measure.
      requestAnimationFrame(() => {
        ref.current?.measureInWindow((_x, y, _w, h) => {
          setOverlap(Math.max(0, Math.round(y + h - keyboardTop)));
        });
      });
    };
    const onHide = () => setOverlap(0);

    const subs = [Keyboard.addListener(showEvent, onShow), Keyboard.addListener(hideEvent, onHide)];
    return () => subs.forEach(s => s.remove());
  }, []);

  const paddingBottom = overlap > 0 ? overlap : safeBottom ? insets.bottom : 0;

  // One view, with the caller's layout (a centred dialog, a bottom sheet) kept as given: the
  // padding goes on the same view, and padding never changes the frame that is measured.
  return (
    <View ref={ref} collapsable={false} style={[{ flex: 1 }, style, { paddingBottom }]} {...rest}>
      {children}
    </View>
  );
}
