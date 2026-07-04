/**
 * WhatsApp Webhook Idempotency
 * 
 * Prevents duplicate processing of webhook events.
 * Meta may retry webhooks if they don't receive a 200 response quickly.
 */

import { getRedisClient } from '@/lib/redis'

const IDEMPOTENCY_TTL_SECONDS = 86400 // 24 hours
const IDEMPOTENCY_KEY_PREFIX = 'whatsapp:idempotency:'

/**
 * Check if an event has already been processed
 * 
 * @param eventId - Unique event identifier (message ID, status ID, etc.)
 * @param eventType - Event type for namespacing
 * @returns true if event was already processed
 */
export async function isEventProcessed(
  eventId: string,
  eventType: 'message' | 'status'
): Promise<boolean> {
  const redis = getRedisClient()
  
  if (!redis) {
    // If Redis is unavailable, allow processing but log warning
    console.warn('Redis unavailable - idempotency check skipped for event:', eventId)
    return false
  }

  try {
    const key = `${IDEMPOTENCY_KEY_PREFIX}${eventType}:${eventId}`
    const exists = await redis.exists(key)
    return exists === 1
  } catch (error) {
    // If Redis operation fails, log but allow processing
    console.error('Idempotency check failed:', error)
    return false
  }
}

/**
 * Mark an event as processed
 * 
 * @param eventId - Unique event identifier
 * @param eventType - Event type for namespacing
 */
export async function markEventProcessed(
  eventId: string,
  eventType: 'message' | 'status'
): Promise<void> {
  const redis = getRedisClient()
  
  if (!redis) {
    console.warn('Redis unavailable - idempotency mark skipped for event:', eventId)
    return
  }

  try {
    const key = `${IDEMPOTENCY_KEY_PREFIX}${eventType}:${eventId}`
    // Store timestamp as value for debugging
    await redis.setex(key, IDEMPOTENCY_TTL_SECONDS, new Date().toISOString())
  } catch (error) {
    // Log error but don't throw - processing should continue
    console.error('Failed to mark event as processed:', error)
  }
}

/**
 * Check and mark an event in a single atomic operation
 * 
 * @param eventId - Unique event identifier
 * @param eventType - Event type for namespacing
 * @returns true if event is new and was marked, false if already processed
 */
export async function checkAndMarkEvent(
  eventId: string,
  eventType: 'message' | 'status'
): Promise<boolean> {
  const redis = getRedisClient()
  
  if (!redis) {
    console.warn('Redis unavailable - idempotency check/mark skipped for event:', eventId)
    return true // Allow processing
  }

  try {
    const key = `${IDEMPOTENCY_KEY_PREFIX}${eventType}:${eventId}`
    
    // Use SET NX EX for atomic check-and-set
    const result = await redis.set(
      key,
      new Date().toISOString(),
      {
        nx: true, // Only set if key doesn't exist
        ex: IDEMPOTENCY_TTL_SECONDS,
      }
    )
    
    // Result will be 'OK' if set was successful (key didn't exist)
    // Result will be null if key already existed
    return result === 'OK'
  } catch (error) {
    console.error('Atomic idempotency check failed:', error)
    return true // Allow processing on error
  }
}

/**
 * Clear idempotency cache for an event (for testing/debugging)
 * 
 * @param eventId - Unique event identifier
 * @param eventType - Event type for namespacing
 */
export async function clearEventIdempotency(
  eventId: string,
  eventType: 'message' | 'status'
): Promise<void> {
  const redis = getRedisClient()
  
  if (!redis) {
    return
  }

  try {
    const key = `${IDEMPOTENCY_KEY_PREFIX}${eventType}:${eventId}`
    await redis.del(key)
  } catch (error) {
    console.error('Failed to clear idempotency:', error)
  }
}
