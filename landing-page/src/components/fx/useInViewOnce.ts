// Thin once-only in-view hook, plus a fine-pointer check, shared by the fx kit.
import { useEffect, useState, type RefObject } from 'react'
import { useInView } from 'motion/react'

export function useInViewOnce(ref: RefObject<Element | null>, margin = '-10% 0px'): boolean {
  return useInView(ref, { once: true, margin: margin as `${number}px ${number}px` })
}

/** True only on hover-capable, fine-pointer devices (never touch). */
export function usePointerFine(): boolean {
  const [fine, setFine] = useState(false)
  useEffect(() => {
    setFine(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])
  return fine
}
