const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const KEY_PREFIX = 'gymflow-member:login:'

type AttemptState = {
  attempts: number
  lockedUntil: number
}

async function storageKey(email: string) {
  const normalized = email.trim().toLowerCase()
  const data = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${KEY_PREFIX}${hash.slice(0, 24)}`
}

async function readState(email: string): Promise<AttemptState> {
  if (typeof window === 'undefined' || !email.trim()) return { attempts: 0, lockedUntil: 0 }

  const raw = localStorage.getItem(await storageKey(email))
  if (!raw) return { attempts: 0, lockedUntil: 0 }

  try {
    const state = JSON.parse(raw) as AttemptState
    if (state.lockedUntil > 0 && state.lockedUntil <= Date.now()) {
      localStorage.removeItem(await storageKey(email))
      return { attempts: 0, lockedUntil: 0 }
    }
    return state
  } catch {
    localStorage.removeItem(await storageKey(email))
    return { attempts: 0, lockedUntil: 0 }
  }
}

async function writeState(email: string, state: AttemptState) {
  localStorage.setItem(await storageKey(email), JSON.stringify(state))
}

export async function getLoginThrottle(email: string) {
  const state = await readState(email)
  return {
    attempts: state.attempts,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - state.attempts),
    remainingMs: Math.max(0, state.lockedUntil - Date.now()),
    isLocked: state.lockedUntil > Date.now(),
  }
}

export async function recordLoginFailure(email: string) {
  const current = await readState(email)
  const attempts = current.attempts + 1
  const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0
  await writeState(email, { attempts, lockedUntil })
  return getLoginThrottle(email)
}

export async function clearLoginFailures(email: string) {
  if (typeof window === 'undefined' || !email.trim()) return
  localStorage.removeItem(await storageKey(email))
}
