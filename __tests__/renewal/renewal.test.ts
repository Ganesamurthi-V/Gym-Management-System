import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { renewalStartDate, renewalEndDate } from '@/lib/renewal/dates'
import { memberRenewalSchema, memberDueSchema, paymentKindSchema, rejectRenewalSchema, approveRenewalSchema, isStartDateInWindow } from '@/lib/renewal/validate'

describe('renewalStartDate (mirrors the owner Renew form: starts today)', () => {
  it('expired member starts today', () => {
    expect(renewalStartDate('2026-09-01', '2026-10-27')).toBe('2026-10-27')
  })
  it('active member renewing early also starts today, like the owner form', () => {
    expect(renewalStartDate('2026-11-15', '2026-10-27')).toBe('2026-10-27')
  })
  it('member with no plan starts today', () => {
    expect(renewalStartDate(null, '2026-10-27')).toBe('2026-10-27')
  })
})

describe('renewalEndDate (mirrors calcEndDate)', () => {
  it('adds 1, 3 and 12 months', () => {
    expect(renewalEndDate('2026-10-27', 1)).toBe('2026-11-27')
    expect(renewalEndDate('2026-10-27', 3)).toBe('2027-01-27')
    expect(renewalEndDate('2026-10-27', 12)).toBe('2027-10-27')
  })
  it('clamps at month end', () => {
    expect(renewalEndDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(renewalEndDate('2028-01-31', 1)).toBe('2028-02-29')
    expect(renewalEndDate('2026-11-30', 3)).toBe('2027-02-28')
  })
  it('crosses a year boundary', () => {
    expect(renewalEndDate('2026-12-15', 1)).toBe('2027-01-15')
    expect(renewalEndDate('2026-12-31', 12)).toBe('2027-12-31')
  })
})

describe('memberRenewalSchema', () => {
  it('accepts a plan key with optional text', () => {
    const r = memberRenewalSchema.safeParse({ plan_key: '2', transaction_id: ' 123 ', notes: '' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.transaction_id).toBe('123')
      expect(r.data.notes).toBeUndefined()
    }
  })
  it('rejects bad plan keys and over-long text', () => {
    expect(memberRenewalSchema.safeParse({ plan_key: '' }).success).toBe(false)
    expect(memberRenewalSchema.safeParse({ plan_key: 'abc' }).success).toBe(false)
    expect(memberRenewalSchema.safeParse({ plan_key: null }).success).toBe(false)
    expect(memberRenewalSchema.safeParse({ plan_key: '0', transaction_id: 'x'.repeat(101) }).success).toBe(false)
    expect(memberRenewalSchema.safeParse({ plan_key: '0', notes: 'x'.repeat(501) }).success).toBe(false)
  })
  it('does not pass through a client price', () => {
    const r = memberRenewalSchema.safeParse({ plan_key: '0', amount: 1 })
    expect(r.success && 'amount' in r.data).toBe(false)
  })
})

describe('due payment schemas', () => {
  it('kind defaults to renewal and only allows renewal or due', () => {
    expect(paymentKindSchema.parse(undefined)).toBe('renewal')
    expect(paymentKindSchema.parse('due')).toBe('due')
    expect(paymentKindSchema.safeParse('refund').success).toBe(false)
  })
  it('amount is a whole positive rupee figure', () => {
    const ok = memberDueSchema.safeParse({ amount: ' 500 ', transaction_id: '', notes: 'part' })
    expect(ok.success && ok.data.amount).toBe(500)
    for (const bad of ['0', '-5', '1.5', 'abc', '', null, '10000001']) {
      expect(memberDueSchema.safeParse({ amount: bad }).success, String(bad)).toBe(false)
    }
  })
  it('does not need a plan key and limits text', () => {
    expect(memberDueSchema.safeParse({ amount: '100' }).success).toBe(true)
    expect(memberDueSchema.safeParse({ amount: '100', notes: 'x'.repeat(501) }).success).toBe(false)
  })
})

describe('isStartDateInWindow (30 days back, 365 days ahead, IST today)', () => {
  const today = '2026-10-27'
  it('accepts the edges', () => {
    expect(isStartDateInWindow('2026-09-27', today)).toBe(true)
    expect(isStartDateInWindow('2027-10-27', today)).toBe(true)
    expect(isStartDateInWindow(today, today)).toBe(true)
  })
  it('rejects outside the window', () => {
    expect(isStartDateInWindow('2026-09-26', today)).toBe(false)
    expect(isStartDateInWindow('2027-10-28', today)).toBe(false)
  })
})

describe('reject and approve schemas', () => {
  it('reason must be 3 to 300 characters', () => {
    expect(rejectRenewalSchema.safeParse({ reason: 'no' }).success).toBe(false)
    expect(rejectRenewalSchema.safeParse({ reason: 'Amount mismatch' }).success).toBe(true)
    expect(rejectRenewalSchema.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false)
  })
  it('start_date is optional and ISO shaped', () => {
    expect(approveRenewalSchema.safeParse({}).success).toBe(true)
    expect(approveRenewalSchema.safeParse({ start_date: '2026-10-27' }).success).toBe(true)
    expect(approveRenewalSchema.safeParse({ start_date: '27/10/2026' }).success).toBe(false)
  })
})

describe('renewal SQL functions (source guard)', () => {
  const read = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  const files = {
    migration: read('supabase/migrations/20261027150000_member_renewal_requests.sql'),
    schema: read('supabase-schema.sql'),
  }
  const callable = [
    ['get_member_renewal_options', '\\(\\)'],
    ['create_member_renewal_request', '\\(\\s*p_plan_key\\s+TEXT,\\s*p_proof_path\\s+TEXT,\\s*p_transaction_id\\s+TEXT DEFAULT NULL,\\s*p_notes\\s+TEXT DEFAULT NULL\\s*\\)'],
    ['approve_member_renewal_request', '\\(\\s*p_request_id UUID,\\s*p_start_date DATE,\\s*p_end_date\\s+DATE\\s*\\)'],
    ['reject_member_renewal_request', '\\(\\s*p_request_id UUID,\\s*p_reason\\s+TEXT\\s*\\)'],
  ] as const

  for (const [label, sql] of Object.entries(files)) {
    describe(label, () => {
      for (const [name, args] of callable) {
        it(`${name} is SECURITY DEFINER with search_path set, takes no gym or member id, granted to authenticated only`, () => {
          const start = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}${args}`))
          expect(start, `${name} definition`).toBeGreaterThan(-1)
          const body = sql.slice(start, sql.indexOf('\n$$;', start))
          expect(body).toContain('SECURITY DEFINER')
          expect(body).toContain("SET search_path = ''")
          expect(body).not.toMatch(/p_(gym|member)_id/)
          expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO authenticated;`))
          expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, anon;`))
          expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO (anon|public)`, 'i'))
        })
      }
      it('table has RLS, no write policies, and a private bucket without storage policies', () => {
        expect(sql).toMatch(/ALTER TABLE member_renewal_requests\s+ENABLE ROW LEVEL SECURITY/)
        expect(sql).not.toMatch(/ON (public\.)?member_renewal_requests FOR (INSERT|UPDATE|DELETE|ALL)/)
        expect(sql).toContain("'member_payment_proofs', 'member_payment_proofs', false")
        expect(sql).not.toMatch(/bucket_id = 'member_payment_proofs'/)
      })
    })
  }
})

describe('due payment migration and schema (source guard)', () => {
  const read = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  const files = {
    migration: read('supabase/migrations/20261027170000_member_due_payment_requests.sql'),
    schema: read('supabase-schema.sql'),
  }
  const callable = [
    ['create_member_due_payment_request', '\\(\\s*p_amount\\s+INTEGER,\\s*p_proof_path\\s+TEXT,\\s*p_transaction_id\\s+TEXT DEFAULT NULL,\\s*p_notes\\s+TEXT DEFAULT NULL\\s*\\)'],
    ['approve_member_due_payment_request', '\\(\\s*p_request_id UUID\\s*\\)'],
    ['approve_member_renewal_request', '\\(\\s*p_request_id UUID,\\s*p_start_date DATE,\\s*p_end_date\\s+DATE\\s*\\)'],
  ] as const

  for (const [label, sql] of Object.entries(files)) {
    describe(label, () => {
      const body = (name: string, args: string) => {
        const start = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}${args}`))
        expect(start, `${name} definition`).toBeGreaterThan(-1)
        return sql.slice(start, sql.indexOf('\n$$;', start))
      }
      for (const [name, args] of callable) {
        it(`${name} is SECURITY DEFINER with search_path set, takes no gym or member id, authenticated only`, () => {
          const b = body(name, args)
          expect(b).toContain('SECURITY DEFINER')
          expect(b).toContain("SET search_path = ''")
          expect(b).not.toMatch(/p_(gym|member)_id/)
          expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO authenticated;`))
          expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, anon;`))
          expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO (anon|public)`, 'i'))
        })
      }
      it('approve-renewal filters on request_type = renewal; approve-due on due', () => {
        expect(body(callable[2][0], callable[2][1])).toContain("r.request_type = 'renewal'")
        expect(body(callable[1][0], callable[1][1])).toContain("r.request_type = 'due'")
      })
      it('allows one pending request per member and type, and locks the member row on approve-due', () => {
        expect(sql).toMatch(/uq_member_renewal_requests_one_pending_per_type\s+ON (public\.)?member_renewal_requests \(member_id, request_type\) WHERE status = 'pending'/)
        expect(body(callable[1][0], callable[1][1])).toMatch(/FROM public\.members m[\s\S]*FOR UPDATE;/)
      })
    })
  }
})
