import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 * 
 * Simple health check endpoint for UptimeRobot, Better Stack, etc.
 * Verifies that the Next.js edge/server is running and Supabase responds.
 */
export async function GET() {
  try {
    const startTime = performance.now()
    
    // We use the supabase-js client directly with the anon key just to check connectivity.
    // No RLS bypass required for a ping.
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ status: 'unhealthy', error: 'Missing environment variables' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Lightweight connectivity check — query the gyms table with a limit of 1.
    // Even if it returns a 401/RLS error, it means the DB is up and responding.
    const { error } = await supabase.from('gyms').select('id').limit(1)

    // PGRST116 (0 rows) or PGRST301 (RLS) means the DB is perfectly healthy and rejected us normally.
    // If it's a 5XX error, the connection failed.
    const isHealthy = !error || ['PGRST116', 'PGRST301'].includes(error.code)

    const durationMs = Math.round(performance.now() - startTime)

    if (isHealthy) {
      return NextResponse.json({ 
        status: 'healthy',
        database: 'connected',
        latency_ms: durationMs,
        timestamp: new Date().toISOString()
      }, { status: 200 })
    } else {
      console.error('Health check failed:', error)
      return NextResponse.json({ 
        status: 'unhealthy',
        database: 'error',
        error: error?.code ?? 'DB_ERROR',  // code only — never expose raw Supabase error objects
        timestamp: new Date().toISOString()
      }, { status: 503 })
    }
  } catch (err: unknown) {
    console.error('Fatal health check error:', err)
    return NextResponse.json({ 
      status: 'unhealthy',
      error: (err instanceof Error ? err.message : String(err)),
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
