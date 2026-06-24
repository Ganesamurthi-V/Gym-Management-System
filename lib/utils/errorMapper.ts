/**
 * Centralized utility to map common Supabase database errors to HTTP status codes and user-friendly messages.
 */
export function mapSupabaseError(error: { code: string; message: string }) {
  if (error.code === 'PGRST116') return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' }
  if (error.code === '23505') return { status: 409, code: 'CONFLICT', message: 'Record already exists' }
  if (error.code === '23503') return { status: 400, code: 'FOREIGN_KEY_VIOLATION', message: 'Invalid reference' }
  if (error.code === '42501') return { status: 403, code: 'FORBIDDEN', message: 'Unauthorized' }
  if (error.code === '22P02') return { status: 400, code: 'INVALID_FORMAT', message: 'Invalid data format provided' }
  return { status: 500, code: 'DATABASE_ERROR', message: error.message || 'An unexpected database error occurred' }
}
