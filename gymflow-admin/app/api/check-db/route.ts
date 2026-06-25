import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Missing env' })
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  const { data, error } = await supabase.from('support_tickets').select('*').limit(5)
  
  return NextResponse.json({ data, error })
}
