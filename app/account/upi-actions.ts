'use server'

import { createClient } from '@/lib/supabase/server'

export interface UPIConfig {
  id: string
  gym_id: string
  upi_id: string
  merchant_name: string
  merchant_code: string | null
  currency: string
  raw_params: Record<string, string>
  created_at: string
  updated_at: string
}

/**
 * Fetch the UPI merchant config for the authenticated user's gym.
 * Returns null if not configured yet.
 */
export async function getUPIConfig(): Promise<UPIConfig | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', session.user.id)
    .single()
  if (!gym) return null

  const { data } = await supabase
    .from('gym_upi_config')
    .select('*')
    .eq('gym_id', gym.id)
    .single()

  return (data as UPIConfig) ?? null
}

/**
 * Save (upsert) the UPI merchant config for the authenticated user's gym.
 * Called after the gym owner uploads/scans their UPI QR code and it's parsed.
 */
export async function saveUPIConfig(params: {
  upiId: string
  merchantName: string
  merchantCode?: string | null
  currency?: string
  rawParams: Record<string, string>
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { success: false, error: 'Unauthorized' }

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', session.user.id)
    .single()
  if (!gym) return { success: false, error: 'Gym not found' }

  const row = {
    gym_id: gym.id,
    upi_id: params.upiId,
    merchant_name: params.merchantName,
    merchant_code: params.merchantCode ?? null,
    currency: params.currency ?? 'INR',
    raw_params: params.rawParams,
    updated_at: new Date().toISOString(),
  }

  // Upsert: insert if not exists, update if exists (keyed by gym_id unique constraint)
  const { error } = await supabase
    .from('gym_upi_config')
    .upsert(row, { onConflict: 'gym_id' })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Delete the UPI merchant config (if the gym owner wants to remove it).
 */
export async function deleteUPIConfig(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { success: false, error: 'Unauthorized' }

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', session.user.id)
    .single()
  if (!gym) return { success: false, error: 'Gym not found' }

  const { error } = await supabase
    .from('gym_upi_config')
    .delete()
    .eq('gym_id', gym.id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
