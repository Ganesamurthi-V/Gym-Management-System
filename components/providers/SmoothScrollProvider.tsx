'use client'

import { ReactLenis } from 'lenis/react'
import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (pathname?.startsWith('/import')) {
    return <>{children}</>
  }

  return (
    <ReactLenis root options={{ 
      lerp: 0.1, 
      duration: 1.5, 
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
      infinite: false,
    }}>
      {children}
    </ReactLenis>
  )
}
