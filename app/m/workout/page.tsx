import { Dumbbell, History } from 'lucide-react'
import { getWorkoutPageData } from '@/lib/member/member-data'
import { startPageTimer } from '@/lib/perf'
import { getLastWeights } from '@/lib/member/progress-data'
import { cookies } from 'next/headers'
import { MY_PROGRAM_COOKIE } from '@/lib/member/todays-workout'
import { MemberTopBar, TopBarButton } from '@/components/member/MemberTopBar'
import WorkoutClient from './WorkoutClient'

export default async function WorkoutPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const done = startPageTimer('workout')
  const { program: openProgramId } = await searchParams
  const myProgramId = (await cookies()).get(MY_PROGRAM_COOKIE)?.value

  const [data, lastWeights] = await Promise.all([getWorkoutPageData(), getLastWeights()])
  if (!data) {
    done()
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }
  const { gym, member, programs } = data

  done()

  return (
    <>
      <MemberTopBar
        variant="root"
        title="Workout"
        subtitle={gym.name}
        memberName={member.name}
        actions={
          <TopBarButton href="/m/progress/workouts" label="Workout history">
            <History aria-hidden="true" className="h-5 w-5" />
          </TopBarButton>
        }
      />
      <div className="page-container pb-6 pt-2">

      {programs.length === 0 ? (
        <div className="tile flex flex-col items-center py-12 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-orange-50">
            <Dumbbell className="h-7 w-7 text-orange-400" />
          </div>
          <p className="text-sm font-bold text-slate-700">No programs assigned yet</p>
          <p className="mt-1 text-xs text-slate-400">Your gym will assign workout programs to you soon.</p>
        </div>
      ) : (
        <WorkoutClient programs={programs} lastWeights={lastWeights} openProgramId={openProgramId} myProgramId={myProgramId} />
      )}

      </div>
    </>
  )
}
