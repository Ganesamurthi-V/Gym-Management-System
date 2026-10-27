'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PushDeviceState } from '@/types/push'
import { disablePush, enablePush, getPushState } from './client'

/** Device push state plus enable/disable actions that keep it in sync. `state` is null until detected. */
export function usePushState(publicKey: string) {
  const [state, setState] = useState<PushDeviceState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getPushState().then(s => { if (live) setState(s) }).catch(() => { if (live) setState('unsupported') })
    return () => { live = false }
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    const result = await enablePush(publicKey)
    if (!result.ok) setError(result.message)
    setState(await getPushState())
    setBusy(false)
  }, [publicKey])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await disablePush()
    } catch {
      setError('Turned off on this phone, but we could not update the server.')
    }
    setState(await getPushState())
    setBusy(false)
  }, [])

  return { state, busy, error, enable, disable }
}
