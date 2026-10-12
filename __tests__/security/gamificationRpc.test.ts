/**
 * Source-level guard for the gamification RPCs in supabase-schema.sql.
 *
 * The defect this pins: `get_member_gamification(p_member_id UUID)` and
 * `get_gym_leaderboard(p_gym_id UUID, p_limit INT)` were SECURITY DEFINER and
 * trusted the id they were handed, so any signed-in user could read another
 * gym's members by passing its id with the public anon key.
 *
 * The fix is structural — the functions accept no id at all and resolve the
 * caller from auth.uid(). That is easy to undo by accident ("just add a
 * p_member_id for the owner page"), so these tests fail if an id parameter
 * comes back. They read the SQL text; nothing is executed against a database.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { DAY_ROLLOVER_GRACE_HOURS, IST_TIME_ZONE, XP_PER_LEVEL } from '@/lib/gamification/constants'

const read = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

const SCHEMA = read('supabase-schema.sql')
const MIGRATION = read('supabase/migrations/20261012120000_gamification.sql')

/** The CREATE FUNCTION statement for `name`, from its header to the closing `$$;`. */
function functionSource(sql: string, name: string): { args: string; full: string } {
  const header = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(([^)]*)\\)`, 'g')
  const matches = [...sql.matchAll(header)]
  expect(matches, `${name} must be defined exactly once`).toHaveLength(1)
  const start = matches[0].index!
  const end = sql.indexOf('\n$$;', start)
  expect(end, `${name} has no closing $$;`).toBeGreaterThan(start)
  return { args: matches[0][1], full: sql.slice(start, end + 4) }
}

/** Callable by any signed-in user, so each must identify the caller itself. */
const CALLER_RESOLVED_RPCS = [
  'get_member_gamification',
  'get_gym_leaderboard',
  'set_leaderboard_visibility',
  'record_member_achievements',
] as const

describe('gamification RPCs resolve the caller, never a passed id', () => {
  for (const name of CALLER_RESOLVED_RPCS) {
    describe(name, () => {
      const fn = functionSource(SCHEMA, name)

      it('takes no gym or member id parameter', () => {
        expect(fn.args).not.toMatch(/\bUUID\b/i)
        expect(fn.args).not.toMatch(/gym_id|member_id|user_id|owner_id/i)
      })

      it('identifies the caller with auth.uid()', () => {
        expect(fn.full).toContain('auth.uid()')
      })

      it('is SECURITY DEFINER with a pinned search_path', () => {
        expect(fn.full).toMatch(/SECURITY DEFINER/)
        expect(fn.full).toMatch(/SET search_path = /)
      })
    })
  }

  it('get_member_gamification takes no arguments at all', () => {
    expect(functionSource(SCHEMA, 'get_member_gamification').args.trim()).toBe('')
  })

  it('get_gym_leaderboard takes only a board and a limit', () => {
    const args = functionSource(SCHEMA, 'get_gym_leaderboard').args
    const names = args.split(',').map(a => a.trim().split(/\s+/)[0])
    expect(names).toEqual(['p_board', 'p_limit'])
  })

  it('the read-only RPCs are STABLE', () => {
    expect(functionSource(SCHEMA, 'get_member_gamification').full).toMatch(/\nSTABLE\n/)
    expect(functionSource(SCHEMA, 'get_gym_leaderboard').full).toMatch(/\nSTABLE\n/)
  })
})

describe('the leaky signatures are gone', () => {
  it('no definition or grant of the old (UUID) signatures remains', () => {
    for (const sql of [SCHEMA, MIGRATION]) {
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_member_gamification\(p_member_id/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_gym_leaderboard\(p_gym_id/)
      expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.get_member_gamification\(UUID\)/)
      expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.get_gym_leaderboard\(UUID, INT\)/)
    }
  })

  it('both files drop the old signatures, so no overload survives an upgrade', () => {
    for (const sql of [SCHEMA, MIGRATION]) {
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.get_member_gamification(UUID);')
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.get_gym_leaderboard(UUID, INT);')
    }
  })
})

describe('privileges', () => {
  it('the RPCs are closed to anon and granted to authenticated', () => {
    const signatures = [
      'get_member_gamification()',
      'get_gym_leaderboard(TEXT, INT)',
      'set_leaderboard_visibility(BOOLEAN)',
      'record_member_achievements(TEXT[])',
    ]
    for (const sql of [SCHEMA, MIGRATION]) {
      for (const sig of signatures) {
        const escaped = sig.replace(/[()[\]]/g, '\\$&')
        expect(sql, sig).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped}\\s+FROM PUBLIC, anon;`))
        expect(sql, sig).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped}\\s+TO authenticated;`))
      }
    }
  })

  it('members get no policy on the settings table (they read through the RPC)', () => {
    const policies = [...SCHEMA.matchAll(/CREATE POLICY "([^"]+)"\s+ON gym_gamification_settings/g)].map(m => m[1])
    expect(policies).toHaveLength(3)
    for (const name of policies) expect(name).toMatch(/^Owner can /)
  })

  it('member_achievements has no client write policy', () => {
    const verbs = [...SCHEMA.matchAll(/ON public\.member_achievements FOR (\w+)/g)].map(m => m[1])
    expect(verbs.length).toBeGreaterThan(0)
    expect(new Set(verbs)).toEqual(new Set(['SELECT']))
  })
})

describe('what a member caller may see on the board', () => {
  const board = functionSource(SCHEMA, 'get_gym_leaderboard').full

  it('returns nothing to members when the gym switched leaderboards off', () => {
    expect(board).toMatch(/IF NOT v_is_owner AND NOT v_enabled THEN\s+RETURN;/)
  })

  it('hides opted-out members from everyone but themselves and the owner', () => {
    expect(board).toContain('(v_is_owner OR v.visible OR v.me)')
  })

  it('masks names and withholds other members\' ids', () => {
    expect(board).toContain('public.gamification_mask_name(r.nm)')
    expect(board).toContain('CASE WHEN v_is_owner OR r.me THEN r.mid ELSE NULL END')
  })

  it('never selects contact columns', () => {
    expect(board).not.toMatch(/\bphone\b|\bemail\b|emergency_|medical_notes|date_of_birth/)
  })
})

describe('migration and canonical schema describe the same functions', () => {
  const names = [
    ...CALLER_RESOLVED_RPCS,
    'gamification_day_factor',
    'gamification_mask_name',
    'guard_member_leaderboard_visibility',
  ]
  for (const name of names) {
    it(`${name} is identical in both files`, () => {
      expect(functionSource(MIGRATION, name).full).toBe(functionSource(SCHEMA, name).full)
    })
  }
})

describe('SQL constants match lib/gamification/constants.ts', () => {
  const member = functionSource(SCHEMA, 'get_member_gamification').full
  const board = functionSource(SCHEMA, 'get_gym_leaderboard').full

  it('uses the IST time zone, never the UTC CURRENT_DATE', () => {
    for (const fn of [member, board]) {
      expect(fn).toContain(`AT TIME ZONE '${IST_TIME_ZONE}'`)
      expect(fn).not.toMatch(/CURRENT_DATE/)
    }
  })

  it('uses the same day-rollover tolerance', () => {
    const hh = String(DAY_ROLLOVER_GRACE_HOURS).padStart(2, '0')
    for (const fn of [member, board]) {
      expect(fn).toContain(`INTERVAL '${DAY_ROLLOVER_GRACE_HOURS} hours'`)
      expect(fn).toContain(`TIME '${hh}:00'`)
    }
  })

  it('uses the same XP per level', () => {
    expect(member).toMatch(new RegExp(`'level_xp_per_level',\\s+${XP_PER_LEVEL},`))
  })
})
