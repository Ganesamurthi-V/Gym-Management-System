'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * TanStack Query provider for the member PWA.
 *
 * The client is created inside `useState` so each browser tab gets exactly one
 * instance that survives re-renders, and so it is never shared across requests
 * during SSR (which would leak one user's cache into another's response).
 */
export function QueryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is considered fresh for 2 minutes: switching tabs within
            // that window reads straight from memory with no network request.
            staleTime: 2 * 60 * 1000,
            // Keep it in memory for 10 minutes after the last component
            // unmounts, so returning to a tab is instant rather than refetching.
            gcTime: 10 * 60 * 1000,
            // Tab switches must not trigger a refetch — that is the exact
            // behaviour we are trying to eliminate.
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
