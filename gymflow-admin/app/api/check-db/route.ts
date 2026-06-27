import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyRequestAuth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Missing env' })
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  const { data, error } = await supabase.from('support_tickets').select('*').limit(5)
  
  return NextResponse.json({ data, error })
}
