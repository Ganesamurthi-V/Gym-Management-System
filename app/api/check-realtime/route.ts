import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Missing env' })
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  const { data, error } = await supabase.rpc('query_pg_pub')
  // We can't do raw sql easily via JS unless we use a custom RPC or Prisma.
  // Instead, let's just run an RPC we can define right now.
  
  return NextResponse.json({ data, error })
}
