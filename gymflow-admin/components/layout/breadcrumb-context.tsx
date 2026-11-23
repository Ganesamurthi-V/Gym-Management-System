'use client'

import { createContext, useContext, useEffect, useState } from 'react'

// Detail pages (a gym, an AWS resource) know their own name, the header does not. A page
// renders <BreadcrumbLabel label="..." /> and the header shows it as the last crumb instead
// of the raw id from the URL.
const LabelContext = createContext<{ label: string | null; setLabel: (l: string | null) => void }>({
  label: null,
  setLabel: () => {},
})

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = useState<string | null>(null)
  return <LabelContext.Provider value={{ label, setLabel }}>{children}</LabelContext.Provider>
}

export function useBreadcrumbLabel(): string | null {
  return useContext(LabelContext).label
}

export function BreadcrumbLabel({ label }: { label: string }) {
  const { setLabel } = useContext(LabelContext)
  useEffect(() => {
    setLabel(label)
    // Clear on leave so the next detail page never flashes the previous page's name.
    return () => setLabel(null)
  }, [label, setLabel])
  return null
}
