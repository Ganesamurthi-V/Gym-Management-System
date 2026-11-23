import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastKind = 'success' | 'error';
type ToastState = { id: number; message: string; kind: ToastKind } | null;

const DURATION_MS = 3000;

// Module-level store so `toast.show` works from anywhere (handlers, non-component code).
let current: ToastState = null;
let nextId = 1;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(t: ToastState) => void>();

function emit(t: ToastState) {
  current = t;
  listeners.forEach(l => l(t));
}

export const toast = {
  show(message: string, kind: ToastKind = 'success') {
    if (hideTimer) clearTimeout(hideTimer);
    emit({ id: nextId++, message, kind });
    hideTimer = setTimeout(() => emit(null), DURATION_MS);
  },
};

/** Hook form, for components that prefer it: const { show } = useToast(). */
export function useToast() {
  return toast;
}

/** Mount once near the app root, inside SafeAreaProvider. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ToastState>(current);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  if (!state) return null;
  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 items-center px-4"
      style={{ bottom: insets.bottom + 72 }}>
      <Animated.View
        key={state.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(150)}
        className={cn(
          'bg-popover border-border max-w-full flex-row items-center gap-2 rounded-full border px-4 py-2.5 shadow-md shadow-black/10',
        )}>
        <Icon
          name={state.kind === 'success' ? 'check-circle' : 'alert-circle'}
          size={16}
          className={state.kind === 'success' ? 'text-success' : 'text-destructive'}
        />
        <Text className="text-popover-foreground shrink text-sm font-medium">{state.message}</Text>
      </Animated.View>
    </View>
  );
}
