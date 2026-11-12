import { MemberTopBar } from '@/components/member/MemberTopBar'
import { getRenewalPageData } from '@/lib/member/renewal-data'
import PayDueClient from './PayDueClient'

export default async function PayDuePage() {
  const data = await getRenewalPageData()
  // Null also means a plan-blocked member: render nothing; the layout shows the notice.
  if (!data) return null

  return (
    <>
      <MemberTopBar variant="sub" title="Pay dues" backHref="/m/membership" />
      <div className="page-container pb-6 pt-2">
        <p className="mb-4 text-xs text-slate-500">{data.options.gymName}</p>
      <PayDueClient data={data} />
      </div>
    </>
  )
}
