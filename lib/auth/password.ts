/**
 * lib/auth/password.ts
 *
 * Single definition of GymFlow's password strength rules.
 *
 * These rules are enforced in three places — the client-side criteria list on
 * /auth/setup-password, the self-service change-password endpoint, and the admin
 * reset-password endpoint. Keeping them in one pure module means the three can
 * never drift apart and accept different passwords.
 *
 * Pure functions only, so this is safe to import from client components, Route
 * Handlers, and Edge code alike.
 */

/** Upper bound on password length. bcrypt truncates past 72 bytes; 128 is a
 *  generous cap that still blocks megabyte-sized payloads from reaching hashing. */
export const PASSWORD_MAX_LENGTH = 128

/** Lower bound on password length. */
export const PASSWORD_MIN_LENGTH = 8

/**
 * Returns a human-readable problem with the password, or `null` if it passes.
 *
 * Returning the first failure (rather than a list) matches the existing
 * behaviour of the admin reset endpoint.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  }
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter'
  if (!/\d/.test(password)) return 'Password must contain at least one digit'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character'
  return null
}
