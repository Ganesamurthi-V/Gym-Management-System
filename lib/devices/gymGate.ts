import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gymMayUseBiometric, biometricDeviceLimit } from '@/lib/subscription-utils'

/**
 * Plan gate for the device-facing routes (punches, commands). Read fresh on every call, never cached:
 * it is access-control state. A device of a Free, lapsed or deactivated gym is answered like an
 * unregistered one, so it drops its punches instead of retrying forever; the device, its links and its
 * history stay in the database and work again once the gym is on a paid plan.
 *
 * A trial is served only on its first device(s) by creation order, up to the plan limit. The database
 * trigger already stops a trial from registering more; this covers a gym that arrives on a trial with
 * extra devices already saved (an admin moving a paid gym back to trial), so they stay saved but idle.
 * Throws on a query error so the route answers 5xx and the device keeps its buffer.
 */
export async function deviceGymMayUseBiometric(db: SupabaseClient, gymId: string, deviceId: string): Promise<boolean> {
  const { data: gym, error } = await db
    .from('gyms')
    .select('plan_type, is_active, subscription_status, trial_ends_at, subscription_ends_at')
    .eq('id', gymId)
    .maybeSingle()
  if (error) throw new Error(`device gym plan lookup failed: ${error.message}`)
  if (!gymMayUseBiometric(gym)) return false
  if (gym?.plan_type !== 'trial') return true

  const { data: first, error: firstError } = await db
    .from('attendance_devices')
    .select('id')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: true })
    .limit(biometricDeviceLimit('trial'))
  if (firstError) throw new Error(`device order lookup failed: ${firstError.message}`)
  return (first ?? []).some(d => d.id === deviceId)
}
