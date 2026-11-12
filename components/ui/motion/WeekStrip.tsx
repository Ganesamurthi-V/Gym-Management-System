import { cn } from '@/lib/utils'

type WeekDay = { key: string; weekday: string; day: string; state: 'done' | 'today' | 'upcoming' | 'missed' }

const STATE_CLASS: Record<WeekDay['state'], string> = {
  done: 'bg-brand-500 text-white',
  today: 'border-2 border-brand-500 bg-surface text-slate-900',
  upcoming: 'bg-slate-100 text-slate-400',
  missed: 'bg-slate-100 text-slate-400',
}

const STATE_LABEL: Record<WeekDay['state'], string> = {
  done: 'attended',
  today: 'today',
  upcoming: 'upcoming',
  missed: 'missed',
}

export function WeekStrip({ days, className }: Readonly<{ days: ReadonlyArray<WeekDay>; className?: string }>) {
  return (
    <ul className={cn('grid grid-cols-7 gap-1.5', className)}>
      {days.map((d) => (
        <li
          key={d.key}
          aria-label={`${d.weekday} ${d.day}, ${STATE_LABEL[d.state]}`}
          className={cn('flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl py-2', STATE_CLASS[d.state])}
        >
          <span className="text-[0.625rem] font-medium leading-none opacity-80">{d.weekday}</span>
          <span className="text-sm font-semibold leading-none tabular-nums">{d.day}</span>
        </li>
      ))}
    </ul>
  )
}
