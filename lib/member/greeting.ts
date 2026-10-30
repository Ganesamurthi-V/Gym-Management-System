/**
 * The home screen's time-of-day greeting. The hour is read in Asia/Kolkata, never from the server's
 * clock: between 00:00 and 05:30 IST a UTC server is still on the previous day.
 */
export function greetingForHour(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** 0-23 in India right now (or at `now`). */
export function istHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now)
  return Number(hour)
}
