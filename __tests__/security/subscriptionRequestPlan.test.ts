import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Schema string tests for the WhatsApp add-on request plumbing: the plan column
// the admin apps read, and the service-role-only approval function.
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '')
const schema = stripComments(readFileSync(join(process.cwd(), 'supabase-schema.sql'), 'utf8'))
const migration = stripComments(
  readFileSync(join(process.cwd(), 'supabase/migrations/20261026100000_subscription_request_plan.sql'), 'utf8'),
)

const fnBody = (sql: string) => {
  const start = sql.search(/CREATE OR REPLACE FUNCTION public\.approve_whatsapp_addon/i)
  expect(start).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('AS $$', start)))
}

describe('subscription_requests.plan_requested', () => {
  it('canonical table has the column with a CHECK', () => {
    const table = schema.match(/CREATE TABLE IF NOT EXISTS subscription_requests \(([\s\S]*?)\n\);/i)![1]
    expect(table).toMatch(/plan_requested\s+TEXT/i)
    expect(table).toMatch(/subscription_requests_plan_requested_check/)
    expect(table).toMatch(/plan_requested IN \('monthly', 'yearly', 'whatsapp_addon'\)/)
  })

  it('migration adds the column and constraint idempotently', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS plan_requested TEXT/i)
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS subscription_requests_plan_requested_check/i)
    expect(migration).toMatch(/ADD CONSTRAINT subscription_requests_plan_requested_check/i)
  })
})

describe.each([['canonical schema', schema], ['migration', migration]])('approve_whatsapp_addon in %s', (_n, sql) => {
  it('is a SECURITY DEFINER with a pinned empty search_path', () => {
    const body = fnBody(sql)
    expect(body).toMatch(/SECURITY DEFINER/i)
    expect(body).toMatch(/SET search_path = ''/i)
  })

  it('locks the request and rejects mismatched or non-pending requests', () => {
    const body = fnBody(sql)
    expect(body).toMatch(/FOR UPDATE/i)
    expect(body).toMatch(/request_not_found/)
    expect(body).toMatch(/request_mismatch/)
    expect(body).toMatch(/request_not_pending/)
  })

  it('is revoked from PUBLIC/anon/authenticated and granted to service_role only', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.approve_whatsapp_addon\(UUID, UUID, TEXT\)\s+FROM PUBLIC, anon, authenticated;/i,
    )
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.approve_whatsapp_addon\(UUID, UUID, TEXT\)\s+TO service_role;/i)
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.approve_whatsapp_addon[^;]*authenticated/i)
  })
})
