import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Single place that activates/deactivates a gym. Flipping gyms.is_active alone
 * left the owner able to keep signing in (the /gyms/[gymId]/status route did
 * exactly that), so the owner's auth user is banned/unbanned in the same step.
 * `extra` carries additional gyms columns (e.g. login_disabled) written in the same update.
 * Throws on any DB/auth error; returns false when the gym does not exist.
 */
export async function setGymActive(supabase: SupabaseClient, gymId: string, active: boolean, extra: Record<string, unknown> = {}): Promise<boolean> {
  const { data: gym, error: gymErr } = await supabase.from('gyms').select('owner_id').eq('id', gymId).single()
  if (gymErr || !gym) return false

  const { error: updateErr } = await supabase.from('gyms').update({ is_active: active, ...extra }).eq('id', gymId)
  if (updateErr) throw updateErr

  const { error: banErr } = await supabase.auth.admin.updateUserById(gym.owner_id, {
    ban_duration: active ? 'none' : '876000h',
  })
  if (banErr) throw banErr
  return true
}
