/**
 * Unit tests for the pure nudge selection (lib/whatsapp/gamificationNudges.ts):
 * who gets which gamification message this morning, the per-template caps, and the
 * one-message-per-member-per-day priority. No database, no mocks.
 */

import { describe, it, expect } from 'vitest'
import {
  selectNudges,
  soleWeeklyLeader,
  isoWeekLabel,
  hasSendablePhone,
  nudgeCycleKeys,
  NUDGE_PRIORITY,
  type NudgeLogRow,
  type NudgeMember,
  type NudgeTemplateId,
} from '@/lib/whatsapp/gamificationNudges'

/** Monday 12 Oct 2026, 09:00 IST: when the daily cron runs. */
const NOW = '2026-10-12T03:30:00.000Z'
const TODAY = '2026-10-12'

/** Attendance on the given October 2026 days, each saved at 10:00 IST that day. */
function oct(...days: number[]) {
  return days.map(d => {
    const date = `2026-10-${String(d).padStart(2, '0')}`
    return { date, createdAt: `${date}T04:30:00.000Z` }
  })
}

function member(id: string, days: number[], overrides: Partial<NudgeMember> = {}): NudgeMember {
  return { id, name: `${id} Kumar`, phone: '9876543210', showOnLeaderboard: true, attendance: oct(...days), ...overrides }
}

const all = () => true
const only = (...templates: NudgeTemplateId[]) => (t: NudgeTemplateId) => templates.includes(t)

function select(
  members: NudgeMember[],
  opts: { isEnabled?: (t: NudgeTemplateId) => boolean; history?: NudgeLogRow[]; goal?: number; now?: string } = {},
) {
  return selectNudges({
    members,
    weeklyGoalDays: opts.goal ?? 4,
    isEnabled: opts.isEnabled ?? all,
    history: opts.history ?? [],
    now: opts.now ?? NOW,
  })
}

describe('helpers', () => {
  it('isoWeekLabel follows ISO-8601 (Monday start, week 1 holds 4 January)', () => {
    expect(isoWeekLabel('2026-10-12')).toBe('2026-W42') // a Monday
    expect(isoWeekLabel('2026-10-18')).toBe('2026-W42') // the Sunday of that week
    expect(isoWeekLabel('2026-10-19')).toBe('2026-W43')
    expect(isoWeekLabel('2026-01-01')).toBe('2026-W01')
    expect(isoWeekLabel('2027-01-01')).toBe('2026-W53') // a Friday: still last year's week
    expect(isoWeekLabel('2024-12-30')).toBe('2025-W01')
  })

  it('hasSendablePhone needs at least 10 digits', () => {
    expect(hasSendablePhone('98765 43210')).toBe(true)
    expect(hasSendablePhone('12345')).toBe(false)
    expect(hasSendablePhone('INVALID_NUMBER')).toBe(false)
    expect(hasSendablePhone(null)).toBe(false)
  })

  it('priority order is streak, weekly goal, rank', () => {
    expect(NUDGE_PRIORITY).toEqual(['gym_streak_at_risk', 'gym_weekly_goal_reached', 'gym_leaderboard_rank_up'])
  })
})

describe('nothing enabled', () => {
  it('selects nothing, whatever the members did', () => {
    expect(select([member('a', [8, 9, 10, 11]), member('b', [11])], { isEnabled: () => false })).toEqual([])
  })
})

describe('gym_streak_at_risk', () => {
  const streakOnly = { isEnabled: only('gym_streak_at_risk') }

  it('nudges a 3-day streak that still needs today', () => {
    const picks = select([member('a', [9, 10, 11])], streakOnly)
    expect(picks).toEqual([{
      memberId: 'a',
      memberName: 'a Kumar',
      phone: '9876543210',
      template: 'gym_streak_at_risk',
      cycleKey: 'gym_streak_at_risk:a:2026-10-11',
      triggerDate: TODAY,
      context: { streakDays: 3 },
    }])
  })

  it('does not nudge a streak shorter than 3 days', () => {
    expect(select([member('a', [10, 11])], streakOnly)).toEqual([])
  })

  it('does not nudge a member who already checked in today', () => {
    expect(select([member('a', [9, 10, 11, 12])], streakOnly)).toEqual([])
  })

  it('does not nudge a streak that has already ended', () => {
    expect(select([member('a', [7, 8, 9])], streakOnly)).toEqual([])
  })

  it('counts two check-ins on one day as one day', () => {
    const rows = [...oct(9, 10, 11), { date: '2026-10-11', createdAt: '2026-10-11T13:00:00.000Z' }]
    const picks = select([member('a', [], { attendance: rows })], streakOnly)
    expect(picks[0].context.streakDays).toBe(3)
  })

  it('is sent at most once per streak-day', () => {
    const history: NudgeLogRow[] = [{
      memberId: 'a',
      templateName: 'gym_streak_at_risk',
      cycleKey: nudgeCycleKeys.streakAtRisk('a', '2026-10-11'),
      sentAt: '2026-10-11T15:00:00.000Z', // not "today", so only the cycle key can stop it
    }]
    expect(select([member('a', [9, 10, 11])], { ...streakOnly, history })).toEqual([])
  })

  it('skips a member with no usable phone number', () => {
    expect(select([member('a', [9, 10, 11], { phone: '123' })], streakOnly)).toEqual([])
    expect(select([member('a', [9, 10, 11], { phone: null })], streakOnly)).toEqual([])
  })
})

describe('gym_weekly_goal_reached', () => {
  const goalOnly = { isEnabled: only('gym_weekly_goal_reached') }

  it('fires when the days in the last 7 days reach the goal, the morning after a visit', () => {
    const picks = select([member('a', [6, 8, 10, 11])], goalOnly)
    expect(picks).toHaveLength(1)
    expect(picks[0]).toMatchObject({
      template: 'gym_weekly_goal_reached',
      cycleKey: 'gym_weekly_goal_reached:a:2026-W42',
      context: { daysAttended: 4 },
    })
  })

  it('does not fire below the goal', () => {
    expect(select([member('a', [8, 10, 11])], goalOnly)).toEqual([])
  })

  it('uses the gym\'s own goal', () => {
    expect(select([member('a', [10, 11])], { ...goalOnly, goal: 2 })).toHaveLength(1)
    expect(select([member('a', [6, 8, 10, 11])], { ...goalOnly, goal: 5 })).toEqual([])
  })

  it('ignores days older than the last 7 days', () => {
    // 5 October is outside the window that ends on the 12th (6..12).
    expect(select([member('a', [5, 8, 10, 11])], goalOnly)).toEqual([])
  })

  it('does not fire days after the member last came in', () => {
    expect(select([member('a', [6, 7, 8, 9])], goalOnly)).toEqual([])
  })

  it('fires once per ISO week', () => {
    const wednesday = '2026-10-14T03:30:00.000Z'
    const history: NudgeLogRow[] = [{
      memberId: 'a',
      templateName: 'gym_weekly_goal_reached',
      cycleKey: nudgeCycleKeys.weeklyGoal('a', '2026-W42'),
      sentAt: '2026-10-12T03:31:00.000Z',
    }]
    const m = member('a', [8, 10, 11, 12, 13])
    expect(select([m], { ...goalOnly, now: wednesday, history })).toEqual([])
    // the following Monday is a new ISO week
    const nextMonday = '2026-10-19T03:30:00.000Z'
    const again = select([member('a', [14, 15, 16, 18])], { ...goalOnly, now: nextMonday, history })
    expect(again.map(p => p.cycleKey)).toEqual(['gym_weekly_goal_reached:a:2026-W43'])
  })
})

describe('gym_leaderboard_rank_up', () => {
  const rankOnly = { isEnabled: only('gym_leaderboard_rank_up') }

  it('messages the member who is alone at #1 of the last-7-days board', () => {
    const picks = select([member('a', [7, 8, 10]), member('b', [8, 9, 10, 11]), member('c', [])], rankOnly)
    expect(picks).toEqual([{
      memberId: 'b',
      memberName: 'b Kumar',
      phone: '9876543210',
      template: 'gym_leaderboard_rank_up',
      cycleKey: 'gym_leaderboard_rank_up:b:2026-10-12',
      triggerDate: TODAY,
      context: { rank: 1, boardName: 'last 7 days' },
    }])
  })

  it('messages nobody on a tie for first place', () => {
    expect(select([member('a', [9, 10, 11]), member('b', [8, 9, 10])], rankOnly)).toEqual([])
  })

  it('needs at least two ranked members', () => {
    expect(select([member('a', [9, 10, 11]), member('b', [])], rankOnly)).toEqual([])
  })

  it('never ranks or messages a member who opted out of the leaderboard', () => {
    const optedOut = member('a', [7, 8, 9, 10, 11], { showOnLeaderboard: false })
    // a is hidden, so b (3 days) leads c (1 day)
    const picks = select([optedOut, member('b', [9, 10, 11]), member('c', [11])], rankOnly)
    expect(picks.map(p => p.memberId)).toEqual(['b'])
  })

  it('is sent at most once per 7 days', () => {
    const members = [member('a', [9, 10, 11]), member('b', [11])]
    const sentOn = (day: string): NudgeLogRow[] => [{
      memberId: 'a', templateName: 'gym_leaderboard_rank_up', cycleKey: `gym_leaderboard_rank_up:a:${day}`, sentAt: `${day}T03:31:00.000Z`,
    }]
    expect(select(members, { ...rankOnly, history: sentOn('2026-10-06') })).toEqual([]) // 6 days ago
    expect(select(members, { ...rankOnly, history: sentOn('2026-10-05') })).toHaveLength(1) // 7 days ago
  })

  it('a leader with no phone is still the leader: the runner-up is not messaged instead', () => {
    expect(select([member('a', [9, 10, 11], { phone: null }), member('b', [11])], rankOnly)).toEqual([])
  })

  it('soleWeeklyLeader ignores members with no attended day', () => {
    expect(soleWeeklyLeader([{ id: 'a', days: 2, visible: true }, { id: 'b', days: 0, visible: true }])).toBeNull()
    expect(soleWeeklyLeader([{ id: 'a', days: 2, visible: true }, { id: 'b', days: 1, visible: true }])).toBe('a')
  })
})

describe('one message per member per day', () => {
  // Streak of 4 that needs today, weekly goal of 4 reached, and alone at #1.
  const star = () => member('a', [8, 9, 10, 11])
  const other = () => member('b', [11])

  it('picks the streak message when all three apply', () => {
    const picks = select([star(), other()])
    expect(picks.map(p => [p.memberId, p.template])).toEqual([['a', 'gym_streak_at_risk']])
  })

  it('falls to the weekly goal when the streak template is not enabled', () => {
    const picks = select([star(), other()], { isEnabled: only('gym_weekly_goal_reached', 'gym_leaderboard_rank_up') })
    expect(picks.map(p => p.template)).toEqual(['gym_weekly_goal_reached'])
  })

  it('falls to the rank message when only that one is enabled', () => {
    const picks = select([star(), other()], { isEnabled: only('gym_leaderboard_rank_up') })
    expect(picks.map(p => p.template)).toEqual(['gym_leaderboard_rank_up'])
  })

  it('selects nothing more for a member who already got any gamification message today', () => {
    for (const templateName of NUDGE_PRIORITY) {
      const history: NudgeLogRow[] = [{ memberId: 'a', templateName, cycleKey: 'whatever', sentAt: '2026-10-12T03:31:00.000Z' }]
      expect(select([star(), other()], { history })).toEqual([])
    }
  })

  it('a reminder or birthday message today does not block a nudge', () => {
    const history: NudgeLogRow[] = [{ memberId: 'a', templateName: 'payment_due_reminder', cycleKey: 'x', sentAt: '2026-10-12T03:31:00.000Z' }]
    expect(select([star(), other()], { history })).toHaveLength(1)
  })

  it('different members each get their own message', () => {
    const picks = select([member('a', [9, 10, 11]), member('b', [5, 6, 8, 10, 11]), member('c', [11])], { goal: 4 })
    expect(picks.map(p => [p.memberId, p.template])).toEqual([
      ['a', 'gym_streak_at_risk'],
      ['b', 'gym_weekly_goal_reached'],
    ])
  })

  it('is deterministic: the same inputs give the same picks', () => {
    const run = () => select([star(), other(), member('c', [6, 8, 10, 11])])
    expect(run()).toEqual(run())
  })
})
