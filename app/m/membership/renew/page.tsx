import { MemberTopBar } from '@/components/member/MemberTopBar'
import { getRenewalPageData } from '@/lib/member/renewal-data'
import RenewClient from './RenewClient'

export default async function RenewPage() {
  const data = await getRenewalPageData()
  // Null also means a plan-blocked member: render nothing; the layout shows the notice.
  if (!data) return null

  return (
    <>
      <MemberTopBar variant="sub" title="Renew membership" backHref="/m/membership" />
      <div className="page-container pb-6 pt-2">
        <p className="mb-4 text-xs text-slate-500">{data.options.gymName}</p>
      <RenewClient data={data} />
      </div>
    </>
  )
}
