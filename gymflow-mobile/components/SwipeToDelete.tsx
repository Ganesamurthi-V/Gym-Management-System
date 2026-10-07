import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

import { Colors, Radius } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  /** Called once the row has slid out and collapsed. Remove the item from the list here. */
  onDelete: () => void;
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
export function SwipeToDelete({ children, onDelete, disabled, radius = Radius.lg }: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const collapse = useRef(new Animated.Value(1)).current;
  const widthRef = useRef(0);
  const [height, setHeight] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);

  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const pan = useMemo(() => {
    const springBack = () =>
      Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();

    const dismiss = () => {
      setLeaving(true);
      Animated.timing(x, { toValue: widthRef.current || 400, duration: 180, useNativeDriver: false }).start(() => {
        Animated.timing(collapse, { toValue: 0, duration: 170, useNativeDriver: false }).start(() => {
          onDeleteRef.current();
        });
      });
    };

    return PanResponder.create({
      // Not the capture phase: a child that wants the touch (a tap) still gets it first.
      onMoveShouldSetPanResponder: (_e, g) =>
        !disabled && g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      // Once swiping, do not let the list's scroll view steal the gesture halfway.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        const far = g.dx > widthRef.current * DISTANCE_RATIO;
        const flick = g.vx > FLICK_VELOCITY && g.dx > 60;
        if (far || flick) dismiss();
        else springBack();
      },
      onPanResponderTerminate: springBack,
    });
  }, [x, collapse, disabled]);

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
      {/* Revealed behind the row as it slides right. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.behind, { borderRadius: radius, opacity: x.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' }) }]}
      >
        <Feather name="trash-2" size={18} color={Colors.red} />
        <Text style={styles.behindText}>Delete</Text>
      </Animated.View>

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
});
