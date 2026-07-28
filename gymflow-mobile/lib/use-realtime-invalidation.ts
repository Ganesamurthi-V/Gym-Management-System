import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSupabaseRealtimeClient } from '@/lib/supabase-realtime';

export type RealtimeConnectionState = 'disabled' | 'connecting' | 'connected' | 'error';

type Options = {
  channelName: string;
  onInvalidate: () => void | Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
};

/**
 * Receives payload-free Supabase broadcast hints, then converges through the
 * authenticated admin API. Broadcast payloads are never trusted as app data.
 */
export function useRealtimeInvalidation({
  channelName,
  onInvalidate,
  enabled = true,
  debounceMs = 1_500,
}: Options) {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(
    enabled ? 'connecting' : 'disabled',
  );
  const callbackRef = useRef(onInvalidate);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  callbackRef.current = onInvalidate;

  useEffect(() => {
    if (!enabled) {
      setConnectionState('disabled');
      return;
    }

    const supabase = getSupabaseRealtimeClient();
    let cancelled = false;

    const invoke = async () => {
      timerRef.current = null;
      if (cancelled) return;

      try {
        await callbackRef.current();
        retryCountRef.current = 0;
      } catch {
        if (cancelled || retryCountRef.current >= 4) return;
        const retryDelay = Math.min(30_000, 1_000 * (2 ** retryCountRef.current));
        retryCountRef.current += 1;
        timerRef.current = setTimeout(() => { void invoke(); }, retryDelay);
      }
    };

    const schedule = () => {
      if (cancelled || timerRef.current) return;
      retryCountRef.current = 0;
      timerRef.current = setTimeout(() => { void invoke(); }, debounceMs);
    };

    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'invalidate' }, schedule)
      .subscribe((status: string) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
          schedule();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionState('error');
        } else if (status === 'CLOSED') {
          setConnectionState('connecting');
        }
      });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule();
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [channelName, debounceMs, enabled]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
  };
}
