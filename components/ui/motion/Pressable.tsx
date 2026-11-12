'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { PRESS_SCALE, spring } from '@/lib/motion'

export function Pressable({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <motion.div whileTap={{ scale: PRESS_SCALE }} transition={spring} className={className}>
      {children}
    </motion.div>
  )
}
