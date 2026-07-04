/**
 * WhatsApp Cloud API Configuration
 * 
 * Environment variable validation and configuration loading.
 * Validates all required credentials on startup.
 */

import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════════
// Environment Schema
// ═══════════════════════════════════════════════════════════════════════════

const whatsappEnvSchema = z.object({
  // Webhook configuration
  WHATSAPP_VERIFY_TOKEN: z.string().min(32, 'Verify token must be at least 32 characters'),
  WHATSAPP_APP_SECRET: z.string().min(32, 'App secret must be at least 32 characters'),
  
  // WhatsApp Business Platform credentials
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, 'Phone number ID is required'),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1, 'Access token is required'),
  
  // Optional configuration
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_BASE_URL: z.string().url().default('https://graph.facebook.com'),
})

export type WhatsAppEnv = z.infer<typeof whatsappEnvSchema>

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Loading
// ═══════════════════════════════════════════════════════════════════════════

let cachedConfig: WhatsAppEnv | null = null
let configError: Error | null = null

/**
 * Load and validate WhatsApp configuration from environment variables
 * 
 * Validates on first call and caches the result.
 * Throws if validation fails.
 */
export function getWhatsAppConfig(): WhatsAppEnv {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig
  }

  // If we already tried and failed, throw the same error
  if (configError) {
    throw configError
  }

  try {
    // Extract environment variables
    const env = {
      WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
      WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
      WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION,
      WHATSAPP_BASE_URL: process.env.WHATSAPP_BASE_URL,
    }

    // Validate
    const validated = whatsappEnvSchema.parse(env)

    // Cache and return
    cachedConfig = validated
    return validated
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `WhatsApp configuration validation failed:\n${error.errors
        .map(e => `  - ${e.path.join('.')}: ${e.message}`)
        .join('\n')}`
      
      configError = new Error(errorMessage)
      throw configError
    }
    
    configError = error as Error
    throw configError
  }
}

/**
 * Check if WhatsApp is configured (without throwing)
 * 
 * Useful for conditional features.
 */
export function isWhatsAppConfigured(): boolean {
  try {
    getWhatsAppConfig()
    return true
  } catch {
    return false
  }
}

/**
 * Validate configuration on server startup
 * 
 * Call this during app initialization to fail fast.
 */
export function validateWhatsAppConfig(): void {
  try {
    const config = getWhatsAppConfig()
    console.log('✅ WhatsApp configuration validated')
    console.log(`   Phone Number ID: ${config.WHATSAPP_PHONE_NUMBER_ID}`)
    console.log(`   API Version: ${config.WHATSAPP_API_VERSION}`)
  } catch (error) {
    console.error('❌ WhatsApp configuration validation failed')
    console.error(error instanceof Error ? error.message : String(error))
    
    // In production, fail hard
    if (process.env.NODE_ENV === 'production') {
      throw error
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API URLs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get WhatsApp API base URL
 */
export function getWhatsAppApiUrl(): string {
  const config = getWhatsAppConfig()
  return `${config.WHATSAPP_BASE_URL}/${config.WHATSAPP_API_VERSION}`
}

/**
 * Get URL for sending messages
 */
export function getWhatsAppMessagesUrl(): string {
  const config = getWhatsAppConfig()
  return `${getWhatsAppApiUrl()}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`
}

/**
 * Get URL for downloading media
 */
export function getWhatsAppMediaUrl(mediaId: string): string {
  return `${getWhatsAppApiUrl()}/${mediaId}`
}

// ═══════════════════════════════════════════════════════════════════════════
// Security
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get authorization header for WhatsApp API requests
 */
export function getWhatsAppAuthHeader(): { Authorization: string } {
  const config = getWhatsAppConfig()
  return {
    Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
  }
}

/**
 * Redact sensitive values for logging
 */
export function redactConfig(config: WhatsAppEnv): Record<string, string> {
  return {
    WHATSAPP_VERIFY_TOKEN: '***REDACTED***',
    WHATSAPP_APP_SECRET: '***REDACTED***',
    WHATSAPP_PHONE_NUMBER_ID: config.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN: `${config.WHATSAPP_ACCESS_TOKEN.slice(0, 10)}...***REDACTED***`,
    WHATSAPP_API_VERSION: config.WHATSAPP_API_VERSION,
    WHATSAPP_BASE_URL: config.WHATSAPP_BASE_URL,
  }
}
