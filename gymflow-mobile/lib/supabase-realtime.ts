/**
 * Supabase Realtime client for the admin mobile app.
 *
 * This client is used ONLY for real-time subscriptions (postgres_changes).
 * All REST API calls still go through the admin API via `apiClient` (axios).
 *
 * We use the anon key which is safe for read subscriptions — Supabase RLS
 * and postgres_changes filters handle row-level access control.
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

// Fallback values (in case env vars are missing during dev)
const supabaseUrl = SUPABASE_URL || 'https://lrzacwfypnsnjqyhidpn.supabase.co';
const supabaseAnonKey = SUPABASE_ANON_KEY || '';

let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseRealtimeClient() {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Admin mobile uses its own JWT — don't let Supabase manage auth
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return _client;
}
