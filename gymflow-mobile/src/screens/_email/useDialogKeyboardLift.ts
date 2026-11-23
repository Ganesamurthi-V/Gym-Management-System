import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Platform, View, type KeyboardEvent } from 'react-native';

/** Room the kit DialogContent keeps below its inner view (p-6). */
const DIALOG_PAD = 24;

/**
 * Keeps a kit Dialog's card above the on-screen keyboard.
 *
 * The kit Dialog centres its card in a full-window overlay, so on Android 15 (edge to edge,
 * no window resize) the keyboard covers the lower inputs. Same idea as KeyboardSafeView:
 * measure how far the keyboard overlaps the card and lift it by exactly that, so it adds
 * nothing when the system already resized the window.
 *
 * Attach `ref` to the first child inside DialogContent and spread `style` on DialogContent.
 */
export function useDialogKeyboardLift(open: boolean) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const lift = useRef(0);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (!open) {
      lift.current = 0;
      setShift(0);
      return;
    }

    const measure = (keyboardTop: number) => {
      // One frame later, so a window that resized itself has finished before we measure.
      requestAnimationFrame(() => {
        ref.current?.measureInWindow((_x, y, _w, h) => {
          // y already includes the current lift; take it out to get the resting position.
          const overlap = Math.max(0, Math.round(y + h + DIALOG_PAD + lift.current - keyboardTop));
          lift.current = overlap;
          setShift(overlap);
        });
      });
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [
      Keyboard.addListener(showEvent, (e: KeyboardEvent) => measure(e.endCoordinates.screenY)),
      Keyboard.addListener(hideEvent, () => {
        lift.current = 0;
        setShift(0);
      }),
    ];
    // Opened while the keyboard is already up (e.g. from the editor): no event will come.
    const current = Keyboard.metrics();
    if (current) measure(current.screenY);
    return () => subs.forEach(s => s.remove());
  }, [open]);

  return { ref, style: { transform: [{ translateY: -shift }] } };
}
