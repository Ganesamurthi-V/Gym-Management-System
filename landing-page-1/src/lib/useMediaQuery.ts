import { useCallback, useSyncExternalStore } from 'react';

/**
 * Reads a media query and stays subscribed to it.
 *
 * useSyncExternalStore rather than useState + useEffect: matchMedia is exactly
 * the external store this hook is built for. React reads the snapshot during
 * render, so the first paint is already correct, and there is no setState in an
 * effect kicking off a second render behind it.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
