import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getAuthUser, getGymCore } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { isFreePlan, WHATSAPP_ADDON_PRICE_INR } from '@/lib/subscription-utils'

export default async function MemberAppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  // The Member App is a paid feature. Free gyms still see the page behind a blur so they know what
  // they would get; the real gate is server-side on the member-facing routes, this is only the
  // owner-facing explanation.
  const { gym } = await getGymCore(user.id)
  if (!gym || !isFreePlan(gym.plan_type)) return <>{children}</>

  // Same source the /owner/subscription page prices from, so the two never disagree.
  const { data: prices, error } = await (await createClient())
    .from('platform_settings')
    .select('price_monthly, price_yearly')
    .single()

  return (
    <div className="relative">
      {/* inert + aria-hidden: the blurred page must not be focusable or readable while locked. */}
      <div aria-hidden inert className="blur-sm select-none pointer-events-none max-h-[80vh] overflow-hidden">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-10 sm:pt-16">
        <div className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl p-6 shadow-lg text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-brand-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Upgrade to paid plan</h2>
          <p className="text-sm text-slate-500">The Member App is included with every paid plan.</p>
          {!error && prices && (
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-surface-border rounded-xl p-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly</p>
                <p className="text-xl font-black text-slate-900">₹{prices.price_monthly.toLocaleString('en-IN')}</p>
              </div>
              <div className="border border-surface-border rounded-xl p-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Yearly</p>
                <p className="text-xl font-black text-slate-900">₹{prices.price_yearly.toLocaleString('en-IN')}</p>
              </div>
            </div>
          )}
          {/* Secondary: the add-on is sold separately and does not unlock the Member App. */}
          <div className="flex items-center justify-between gap-3 border border-surface-border rounded-xl px-3 py-2 text-left">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-600">WhatsApp automation add-on</p>
              <p className="text-xs text-slate-400">₹{WHATSAPP_ADDON_PRICE_INR}/month</p>
            </div>
            <Link
              href="/owner/subscription#whatsapp-addon"
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors"
            >
              Add
            </Link>
          </div>
          {/* The UPI payment step lives on the subscription page; link to it instead of duplicating it. */}
          <Link
            href="/owner/subscription"
            className="inline-flex items-center justify-center w-full py-3 bg-brand-500 hover:bg-brand-700 text-white rounded-xl font-bold transition-colors"
          >
            Upgrade and pay with UPI
          </Link>
        </div>
      </div>
    </div>
  )
}
