/**
 * Source-level guard on member-facing copy.
 *
 * The streak rules include a tolerance that is deliberately not disclosed: the
 * member app shows the streak and, while today is still open, an hourglass with
 * one fixed line. No member-facing file may describe that tolerance or promise
 * a time until which a streak holds. This reads the source rather than rendered
 * output so it also catches aria-labels, titles and comments shipped in JSX.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** Everything a member can be shown. */
const MEMBER_FACING_DIRS = ['app/m', 'components/member']

/** Whole words, so "graceful" / "gracefully" in an unrelated comment do not trip it. */
const FORBIDDEN = [/\bgrace\b/i, /\bsafe\s+until\b/i]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.(tsx?|css|mdx?)$/.test(name)) out.push(path)
  }
  return out
}

describe('member-facing copy', () => {
  const files = MEMBER_FACING_DIRS.flatMap(dir => sourceFiles(join(ROOT, dir)))

  it('finds the member app sources', () => {
    // Guards the guard: a moved folder must fail loudly, not pass on zero files.
    const names = files.map(f => relative(ROOT, f).replace(/\\/g, '/'))
    expect(names).toContain('app/m/leaderboard/LeaderboardClient.tsx')
    expect(names).toContain('components/member/StreakBadge.tsx')
  })

  it('never mentions a grace period or a "safe until" time', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, i) => {
        if (FORBIDDEN.some(re => re.test(line))) {
          offenders.push(`${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('draws the pending state only through StreakBadge and its fixed label', () => {
    // One component owns the hourglass, so the wording cannot drift per screen.
    const withHourglass = files
      .filter(f => /\bHourglass\b/.test(readFileSync(f, 'utf8')))
      .map(f => relative(ROOT, f).replace(/\\/g, '/'))
    expect(withHourglass).toEqual(['components/member/StreakBadge.tsx'])

    const badge = readFileSync(join(ROOT, 'components/member/StreakBadge.tsx'), 'utf8')
    expect(badge).toContain('STREAK_PENDING_LABEL')
  })
})
