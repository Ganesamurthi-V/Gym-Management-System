import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

import { Colors, Radius } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  /** Swipe right. Called once the row has slid out and collapsed: remove the item here. */
  onDelete: () => void;
  /**
   * Swipe left (optional). The same motion the other way, for a second action such as
   * archive. Without it, the row only moves to the right.
   */
  onSwipeLeft?: () => void;
  /**
   * 'dismiss' (default): the row slides away and the gap closes, for a list item that is
   * removed. 'action': the row springs back and the callback runs, for a screen that decides
   * itself what happens next (a confirmation, then leaving the screen).
   */
  mode?: 'dismiss' | 'action';
  /** Mode for the left swipe when it should differ from the right one (defaults to `mode`). */
  leftMode?: 'dismiss' | 'action';
  leftLabel?: string;
  leftIcon?: string;
  leftColor?: string;
  leftBg?: string;
  disabled?: boolean;
  /** Corner radius of the row being wrapped, so the red hint behind it matches. */
  radius?: number;
};

/** A swipe must travel this share of the row's width, or be a quick flick, to delete. */
const DISTANCE_RATIO = 0.35;
const FLICK_VELOCITY = 0.9;

/**
 * Wraps a list row so it can be deleted by swiping it to the right.
 *
 * Built on the core PanResponder and Animated rather than a gesture library, so it needs no
 * new native module and no rebuild of the app. It only claims a touch that is moving
 * clearly sideways, so vertical scrolling and taps on the row are left alone.
 *
 * Release past the threshold: the row slides off to the right, the gap closes, then
 * onDelete runs. Release short of it: the row springs back.
 */
export function SwipeToDelete({
  children, onDelete, onSwipeLeft, leftLabel = 'Archive', leftIcon = 'archive',
  leftColor = Colors.indigo, leftBg = Colors.indigoBg, disabled, radius = Radius.lg, mode = 'dismiss', leftMode,
}: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const collapse = useRef(new Animated.Value(1)).current;
  const widthRef = useRef(0);
  const [height, setHeight] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);

  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onLeftRef = useRef(onSwipeLeft);
  onLeftRef.current = onSwipeLeft;
  const hasLeft = !!onSwipeLeft;

  const pan = useMemo(() => {
    const springBack = () =>
      Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();

    // Slide the row off in the swipe's direction, close the gap, then run the action.
    const dismiss = (dir: 1 | -1) => {
      if ((dir === 1 ? mode : (leftMode ?? mode)) === 'action') {
        // Nothing leaves the screen yet: return the row, then let the caller decide.
        springBack();
        if (dir === 1) onDeleteRef.current();
        else onLeftRef.current?.();
        return;
      }
      setLeaving(true);
      Animated.timing(x, { toValue: dir * (widthRef.current || 400), duration: 180, useNativeDriver: false }).start(() => {
        Animated.timing(collapse, { toValue: 0, duration: 170, useNativeDriver: false }).start(() => {
          if (dir === 1) onDeleteRef.current();
          else onLeftRef.current?.();
        });
      });
    };

    return PanResponder.create({
      // Capture phase, and only for a drag that is clearly sideways: the row's own tap target
      // would otherwise keep the touch and the swipe would do nothing. A plain tap has no
      // movement, so it still reaches the row, and vertical scrolling is left to the list.
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        !disabled &&
        (g.dx > 10 || (hasLeft && g.dx < -10)) &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      // Once swiping, do not let the list's scroll view steal the gesture halfway.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => x.setValue(hasLeft ? g.dx : Math.max(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        const far = Math.abs(g.dx) > widthRef.current * DISTANCE_RATIO;
        const flick = Math.abs(g.vx) > FLICK_VELOCITY && Math.abs(g.dx) > 60;
        if (far || flick) dismiss(g.dx > 0 ? 1 : -1);
        else springBack();
      },
      onPanResponderTerminate: springBack,
    });
  }, [x, collapse, disabled, hasLeft, mode, leftMode]);

  const animatedHeight =
    height === null ? undefined : collapse.interpolate({ inputRange: [0, 1], outputRange: [0, height] });

  return (
    <Animated.View
      // Height is only pinned while the row is closing; otherwise the row sizes itself, so a
      // title that wraps or a refreshed row is never clipped to an old measurement.
      style={[styles.wrap, { borderRadius: radius }, leaving && animatedHeight && { height: animatedHeight }, { opacity: collapse }]}
      onLayout={e => {
        widthRef.current = e.nativeEvent.layout.width;
        // Measure only while the row is at full size, so the collapse has a start value.
        if (!leaving) setHeight(e.nativeEvent.layout.height);
      }}
    >
      {/* Revealed behind the row as it slides right: delete, on the left edge. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.behind, { borderRadius: radius, opacity: x.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' }) }]}
      >
        <Feather name="trash-2" size={18} color={Colors.red} />
        <Text style={styles.behindText}>Delete</Text>
      </Animated.View>

      {/* Revealed as it slides left: the second action, on the right edge. */}
      {hasLeft && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.behind, styles.behindLeft,
            {
              borderRadius: radius, backgroundColor: leftBg, borderColor: leftColor + '55',
              opacity: x.interpolate({ inputRange: [-24, 0], outputRange: [1, 0], extrapolate: 'clamp' }),
            },
          ]}
        >
          <Text style={[styles.behindText, { color: leftColor }]}>{leftLabel}</Text>
          <Feather name={leftIcon as any} size={18} color={leftColor} />
        </Animated.View>
      )}

      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderRadius: Radius.lg },
  behind: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 20,
    borderRadius: Radius.lg,
    backgroundColor: Colors.redBg,
    borderWidth: 1,
    borderColor: Colors.redBorder,
  },
  behindText: { fontSize: 13, fontWeight: '800', color: Colors.red },
  behindLeft: { justifyContent: 'flex-end', paddingLeft: 0, paddingRight: 20 },
});
