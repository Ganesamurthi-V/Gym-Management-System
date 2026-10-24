import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  row: null as any,
  error: null as any,
  cacheThrows: false,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: state.error }) }),
      }),
    }),
  }),
}))
// Pass-through cache: always a miss, runs the fetcher.
vi.mock('@/lib/cache', () => ({
  cacheWrapper: async (_k: string, _t: number, fn: () => Promise<unknown>) => {
    if (state.cacheThrows) throw new Error('redis down')
    return fn()
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/api/withAuth', () => ({
  withAuth: (_n: string, h: any) => (req: any) =>
    h(req, {
      gym: { id: 'g1' },
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ single: async () => ({ data: { name: 'G', is_active: true }, error: null }) }),
          }),
        }),
      },
    }),
}))

import {
  safeAnnouncementLink,
  shouldShowAnnouncement,
  type Announcement,
} from '@/lib/announcement-shared'
import { getActiveAnnouncement } from '@/lib/announcement'

const a = (over: Partial<Announcement> = {}): Announcement => ({
  message: 'Maintenance tonight',
  level: 'info',
  link_url: null,
  link_label: null,
  version: 3,
  ...over,
})

describe('shouldShowAnnouncement', () => {
  it('hides when null or blank', () => {
    expect(shouldShowAnnouncement(null, null)).toBe(false)
    expect(shouldShowAnnouncement(a({ message: '   ' }), null)).toBe(false)
  })
  it('shows info and warning until that version is dismissed', () => {
    for (const level of ['info', 'warning'] as const) {
      expect(shouldShowAnnouncement(a({ level }), null)).toBe(true)
      expect(shouldShowAnnouncement(a({ level }), 3)).toBe(false)
      expect(shouldShowAnnouncement(a({ level, version: 4 }), 3)).toBe(true)
    }
  })
  it('never hides critical', () => {
    expect(shouldShowAnnouncement(a({ level: 'critical' }), 3)).toBe(true)
  })
})

describe('safeAnnouncementLink', () => {
  it('accepts https', () => {
    expect(safeAnnouncementLink('https://status.gymflow.sbs/x')).toBe('https://status.gymflow.sbs/x')
  })
  it.each(['http://a.com', 'javascript:alert(1)', 'data:text/html,x', '//x.com', '/relative', '', 123, null, undefined])(
    'rejects %s',
    v => expect(safeAnnouncementLink(v)).toBeNull(),
  )
  it('rejects over 300 chars', () => {
    expect(safeAnnouncementLink('https://a.com/' + 'x'.repeat(300))).toBeNull()
  })
})

describe('getActiveAnnouncement', () => {
  beforeEach(() => {
    state.row = null
    state.error = null
    state.cacheThrows = false
  })
  const row = { message: 'Hi', level: 'warning', link_url: null, link_label: null, is_active: true, version: 2 }

  it('returns the row when active', async () => {
    state.row = row
    expect(await getActiveAnnouncement()).toEqual({
      message: 'Hi', level: 'warning', link_url: null, link_label: null, version: 2,
    })
  })
  it('returns null when inactive, blank, missing or on error', async () => {
    state.row = { ...row, is_active: false }
    expect(await getActiveAnnouncement()).toBeNull()
    state.row = { ...row, message: '  ' }
    expect(await getActiveAnnouncement()).toBeNull()
    state.row = null
    expect(await getActiveAnnouncement()).toBeNull()
    state.row = row
    state.error = { message: 'boom' }
    expect(await getActiveAnnouncement()).toBeNull()
  })
  it('returns null instead of throwing when the cache layer throws', async () => {
    state.cacheThrows = true
    expect(await getActiveAnnouncement()).toBeNull()
  })
})

describe('GET /api/account/status', () => {
  it('includes announcement and stays 200 with null when lookup fails', async () => {
    const { GET } = await import('@/app/api/account/status/route')
    state.error = null
    state.cacheThrows = false
    state.row = { message: 'Hi', level: 'info', link_url: null, link_label: null, is_active: true, version: 1 }
    const ok = await (GET as any)({})
    expect((await ok.json()).announcement.version).toBe(1)

    state.cacheThrows = true
    const res = await (GET as any)({})
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.announcement).toBeNull()
    expect(json.data.name).toBe('G')
  })
})
