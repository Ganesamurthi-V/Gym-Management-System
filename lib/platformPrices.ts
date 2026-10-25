import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type PlatformPrices = {
  priceMonthly: number
  priceYearly: number
  whatsappAddonPriceInr: number
}

/**
 * The prices an owner sees and pays, read from platform_settings (the single row the admin app
 * edits), so the paywall, the member-app overlay and the add-on banner cannot disagree with what
 * the database later checks the payment against (subscription_requests.expected_amount_inr).
 *
 * Returns null on any error or malformed row. Callers hide prices then instead of showing a
 * guessed number: a wrong price next to a UPI QR is worse than no price. cache() shares one read
 * per request when a layout and its page both ask.
 */
export const getPlatformPrices = cache(async (): Promise<PlatformPrices | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('platform_settings')
    .select('price_monthly, price_yearly, whatsapp_addon_price_inr')
    .single()

  if (error || !data) return null

  const priceMonthly = Number(data.price_monthly)
  const priceYearly = Number(data.price_yearly)
  const whatsappAddonPriceInr = Number(data.whatsapp_addon_price_inr)
  if (![priceMonthly, priceYearly, whatsappAddonPriceInr].every(n => Number.isFinite(n) && n > 0)) return null

  return { priceMonthly, priceYearly, whatsappAddonPriceInr }
})
