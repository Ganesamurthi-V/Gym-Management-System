// Shared motion constants for the member PWA. Only transform/opacity are animated
// (low-end phones on 4G); components in `components/ui/motion` consume these.
export const spring = { type: 'spring', stiffness: 380, damping: 30 } as const
export const PRESS_SCALE = 0.97
