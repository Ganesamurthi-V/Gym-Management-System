import 'server-only'

import { createHash } from 'crypto'
import type { User } from '@supabase/supabase-js'

export const OWNER_REGISTRATION_METADATA_KEY = 'gymflow_registration'
export const OWNER_REGISTRATION_METADATA_VALUE = 'owner'
export const OWNER_REGISTRATION_INDEX_TTL_SECONDS = 365 * 24 * 60 * 60

/** Redis key for an email-to-auth-user registration index without storing PII. */
export function ownerRegistrationIndexKey(email: string): string {
  const digest = createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
  return `owner-registration:${digest}`
}

/** A server-owned marker written to app_metadata by the owner signup route. */
export function hasOwnerRegistrationMarker(user: User): boolean {
  return user.app_metadata?.[OWNER_REGISTRATION_METADATA_KEY] === OWNER_REGISTRATION_METADATA_VALUE
}

/** Member markers are checked before any owner registration fallback. */
export function hasMemberIdentityMarker(user: User): boolean {
  return user.user_metadata?.role === 'member' ||
    user.app_metadata?.role === 'member' ||
    (typeof user.user_metadata?.member_id === 'string' && user.user_metadata.member_id.length > 0)
}

/**
 * Compatibility for owner signups created before app_metadata was introduced.
 * This is never sufficient by itself: callers must first confirm there is no
 * members.auth_user_id linkage for the Auth user.
 */
export function hasLegacyOwnerSignupMetadata(user: User): boolean {
  const fullName = user.user_metadata?.full_name
  const mobileNumber = user.user_metadata?.mobile_number

  return !hasMemberIdentityMarker(user) &&
    typeof fullName === 'string' && fullName.trim().length >= 2 &&
    typeof mobileNumber === 'string' && /^\d{10}$/.test(mobileNumber)
}

export function ownerRegistrationAppMetadata(user: User): Record<string, unknown> {
  return {
    ...user.app_metadata,
    [OWNER_REGISTRATION_METADATA_KEY]: OWNER_REGISTRATION_METADATA_VALUE,
  }
}
