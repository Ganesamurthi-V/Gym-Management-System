/**
 * Supabase Realtime client for the admin mobile app.
 *
 * This anonymous client receives only payload-free public broadcast
 * invalidations. Admin mobile uses a separate API JWT, not Supabase Auth, so it
 * must not consume global postgres_changes or trust broadcast payloads as data.
 * Every event causes a debounced re-fetch through the authenticated admin API.
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
