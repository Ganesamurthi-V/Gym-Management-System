/**
 * WhatsApp Webhook Tests
 * 
 * Unit and integration tests for webhook handler.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as crypto from 'crypto'

// The webhook route persists logs / processes events through Supabase + Redis.
// Those IO boundaries are exercised by their own tests — here we stub them so the
// route's request-handling logic (verification, signature, schema) is tested in
// isolation without a live database.
vi.mock('@/repositories/whatsapp/whatsappRepository', () => ({
  saveWebhookLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/whatsapp/messageProcessor', () => ({
  processMessages: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/whatsapp/statusProcessor', () => ({
  processStatuses: vi.fn().mockResolvedValue(undefined),
}))

import { GET, POST } from '@/app/api/whatsapp/webhook/route'

// Mock environment variables
beforeEach(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token_32_characters_long_12345'
  process.env.WHATSAPP_APP_SECRET = 'test_app_secret_32_characters_long_123456'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789'
  process.env.WHATSAPP_ACCESS_TOKEN = 'test_access_token'
})

// ═══════════════════════════════════════════════════════════════════════════
// Webhook Verification Tests (GET)
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/whatsapp/webhook - Verification', () => {
  it('should verify webhook with valid token', async () => {
    const url = new URL('http://localhost:3000/api/whatsapp/webhook')
    url.searchParams.set('hub.mode', 'subscribe')
    url.searchParams.set('hub.verify_token', 'test_verify_token_32_characters_long_12345')
    url.searchParams.set('hub.challenge', 'test_challenge_123')

    const req = new NextRequest(url)
    const response = await GET(req)

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toBe('test_challenge_123')
  })

  it('should reject webhook with invalid token', async () => {
    const url = new URL('http://localhost:3000/api/whatsapp/webhook')
    url.searchParams.set('hub.mode', 'subscribe')
    url.searchParams.set('hub.verify_token', 'wrong_token')
    url.searchParams.set('hub.challenge', 'test_challenge_123')

    const req = new NextRequest(url)
    const response = await GET(req)

    expect(response.status).toBe(403)
  })

  it('should reject webhook with missing parameters', async () => {
    const url = new URL('http://localhost:3000/api/whatsapp/webhook')
    url.searchParams.set('hub.mode', 'subscribe')
    // Missing verify_token and challenge

    const req = new NextRequest(url)
    const response = await GET(req)

    expect(response.status).toBe(403)
  })

  it('should reject webhook with invalid mode', async () => {
    const url = new URL('http://localhost:3000/api/whatsapp/webhook')
    url.searchParams.set('hub.mode', 'invalid')
    url.searchParams.set('hub.verify_token', 'test_verify_token_32_characters_long_12345')
    url.searchParams.set('hub.challenge', 'test_challenge_123')

    const req = new NextRequest(url)
    const response = await GET(req)

    expect(response.status).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Signature Verification Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/whatsapp/webhook - Signature Verification', () => {
  function generateSignature(body: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex')
  }

  it('should accept webhook with valid signature', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [],
    }
    const body = JSON.stringify(payload)
    const signature = generateSignature(body, 'test_app_secret_32_characters_long_123456')

    const req = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`,
      },
      body,
    })

    const response = await POST(req)
    expect(response.status).toBe(200)
  })

  it('should reject webhook with invalid signature', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [],
    }
    const body = JSON.stringify(payload)

    const req = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=invalid_signature',
      },
      body,
    })

    const response = await POST(req)
    expect(response.status).toBe(401)
  })

  it('should reject webhook with missing signature', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [],
    }
    const body = JSON.stringify(payload)

    const req = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    })

    const response = await POST(req)
    expect(response.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Schema Validation Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/whatsapp/webhook - Schema Validation', () => {
  function createSignedRequest(payload: unknown): NextRequest {
    const body = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha256', 'test_app_secret_32_characters_long_123456')
      .update(body)
      .digest('hex')

    return new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`,
      },
      body,
    })
  }

  it('should accept valid text message webhook', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '123',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+1234567890',
              phone_number_id: '123456789',
            },
            messages: [{
              from: '1234567890',
              id: 'wamid.test123',
              timestamp: '1234567890',
              type: 'text',
              text: {
                body: 'Hello!',
              },
            }],
          },
          field: 'messages',
        }],
      }],
    }

    const req = createSignedRequest(payload)
    const response = await POST(req)
    expect(response.status).toBe(200)
  })

  it('should reject invalid payload structure', async () => {
    const payload = {
      invalid: 'structure',
    }

    const req = createSignedRequest(payload)
    const response = await POST(req)
    expect(response.status).toBe(400)
  })

  it('should accept status update webhook', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '123',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+1234567890',
              phone_number_id: '123456789',
            },
            statuses: [{
              id: 'wamid.test123',
              status: 'delivered',
              timestamp: '1234567890',
              recipient_id: '1234567890',
            }],
          },
          field: 'messages',
        }],
      }],
    }

    const req = createSignedRequest(payload)
    const response = await POST(req)
    expect(response.status).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Message Type Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/whatsapp/webhook - Message Types', () => {
  function createSignedRequest(payload: unknown): NextRequest {
    const body = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha256', 'test_app_secret_32_characters_long_123456')
      .update(body)
      .digest('hex')

    return new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`,
      },
      body,
    })
  }

  it('should handle image message', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '123',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+1234567890',
              phone_number_id: '123456789',
            },
            messages: [{
              from: '1234567890',
              id: 'wamid.test123',
              timestamp: '1234567890',
              type: 'image',
              image: {
                id: 'media123',
                mime_type: 'image/jpeg',
                caption: 'Check this out!',
              },
            }],
          },
          field: 'messages',
        }],
      }],
    }

    const req = createSignedRequest(payload)
    const response = await POST(req)
    expect(response.status).toBe(200)
  })

  it('should handle location message', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '123',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+1234567890',
              phone_number_id: '123456789',
            },
            messages: [{
              from: '1234567890',
              id: 'wamid.test123',
              timestamp: '1234567890',
              type: 'location',
              location: {
                latitude: 37.7749,
                longitude: -122.4194,
                name: 'San Francisco',
                address: '123 Market St',
              },
            }],
          },
          field: 'messages',
        }],
      }],
    }

    const req = createSignedRequest(payload)
    const response = await POST(req)
    expect(response.status).toBe(200)
  })

  it('should handle interactive button reply', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '123',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+1234567890',
              phone_number_id: '123456789',
            },
            messages: [{
              from: '1234567890',
              id: 'wamid.test123',
              timestamp: '1234567890',
              type: 'interactive',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'button_1',
                  title: 'Yes',
                },
              },
            }],
          },
          field: 'messages',
        }],
      }],
    }

    const req = createSignedRequest(payload)
    const response = await POST(req)
    expect(response.status).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Error Handling Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/whatsapp/webhook - Error Handling', () => {
  it('should handle malformed JSON gracefully', async () => {
    // Sign the (malformed) body so it passes signature verification and actually
    // reaches the JSON-parse path this test is exercising.
    const body = 'invalid json {'
    const signature = crypto
      .createHmac('sha256', 'test_app_secret_32_characters_long_123456')
      .update(body)
      .digest('hex')

    const req = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`,
      },
      body,
    })

    const response = await POST(req)
    expect(response.status).toBe(400)
  })

  it('should return 200 for unknown message types', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '123',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+1234567890',
              phone_number_id: '123456789',
            },
            messages: [{
              from: '1234567890',
              id: 'wamid.test123',
              timestamp: '1234567890',
              type: 'unknown_future_type',
            }],
          },
          field: 'messages',
        }],
      }],
    }

    const body = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha256', 'test_app_secret_32_characters_long_123456')
      .update(body)
      .digest('hex')

    const req = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`,
      },
      body,
    })

    const response = await POST(req)
    // Should not crash, should return 200
    expect(response.status).toBe(200)
  })
})
