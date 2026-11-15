import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getAuthUser, getGymCore } from '@/lib/dal'
import { planAllowsBiometric } from '@/lib/subscription-utils'
import { getPlatformPrices } from '@/lib/platformPrices'

export default async function BiometricLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  // Biometric attendance is a trial and paid feature. Free gyms still see the page behind a blur, with
  // the devices and links they set up during the trial: nothing is deleted, so it all works again after
  // an upgrade. The real gate is server-side (the biometric actions and the device routes); this is only
  // the owner-facing explanation. Same pattern as app/owner/member-app/layout.tsx.
  const { gym } = await getGymCore(user.id)
  if (!gym || planAllowsBiometric(gym.plan_type)) return <>{children}</>

  // Same source the /owner/subscription page prices from, so the two never disagree.
  // null (read failed) hides the prices rather than showing a wrong number.
  const prices = await getPlatformPrices()

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
          <p className="text-sm text-slate-500">
            Biometric attendance is included with every paid plan. Your devices and linked members are saved and will work again as soon as you upgrade.
          </p>
          {prices && (
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-surface-border rounded-xl p-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly</p>
                <p className="text-xl font-black text-slate-900">₹{prices.priceMonthly.toLocaleString('en-IN')}</p>
              </div>
              <div className="border border-surface-border rounded-xl p-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Yearly</p>
                <p className="text-xl font-black text-slate-900">₹{prices.priceYearly.toLocaleString('en-IN')}</p>
              </div>
            </div>
          )}
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
