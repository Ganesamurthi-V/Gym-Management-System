/**
 * WhatsApp Cloud API Webhook Validation Schemas
 * 
 * Zod schemas for runtime validation of all webhook payloads.
 * Strict validation with graceful handling of unknown fields.
 */

import { z } from 'zod'

// ─── Metadata Schema ─────────────────────────────────────────────────────────

const metadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
})

// ─── Contact Schema ──────────────────────────────────────────────────────────

// Meta now sends contacts without `profile` (and with a business-scoped `user_id`), so only the
// shape is checked, not the presence of a name. Readers must tolerate every field being absent.
const contactSchema = z.object({
  profile: z.object({
    name: z.string().optional(),
  }).passthrough().optional(),
  wa_id: z.string().optional(),
  user_id: z.string().optional(),
}).passthrough()

// ─── Message Schemas ─────────────────────────────────────────────────────────

const messageContextSchema = z.object({
  from: z.string(),
  id: z.string(),
  forwarded: z.boolean().optional(),
  frequently_forwarded: z.boolean().optional(),
})

const textMessageSchema = z.object({
  body: z.string(),
})

const mediaMessageSchema = z.object({
  id: z.string().optional(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  caption: z.string().optional(),
})

const documentMessageSchema = mediaMessageSchema.extend({
  filename: z.string().optional(),
})

const locationMessageSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
})

const contactMessageSchema = z.object({
  name: z.object({
    formatted_name: z.string(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
  phones: z.array(z.object({
    phone: z.string(),
    type: z.string().optional(),
  })).optional(),
  emails: z.array(z.object({
    email: z.string(),
    type: z.string().optional(),
  })).optional(),
})

const interactiveMessageSchema = z.object({
  type: z.enum(['button_reply', 'list_reply']),
  button_reply: z.object({
    id: z.string(),
    title: z.string(),
  }).optional(),
  list_reply: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
  }).optional(),
})

const buttonMessageSchema = z.object({
  text: z.string(),
  payload: z.string(),
})

const orderMessageSchema = z.object({
  catalog_id: z.string(),
  product_items: z.array(z.object({
    product_retailer_id: z.string(),
    quantity: z.number(),
    item_price: z.number(),
    currency: z.string(),
  })),
  text: z.string().optional(),
})

const systemMessageSchema = z.object({
  body: z.string(),
  type: z.string(),
  identity: z.string().optional(),
  wa_id: z.string().optional(),
  customer: z.string().optional(),
})

const reactionMessageSchema = z.object({
  message_id: z.string(),
  emoji: z.string(),
})

const identitySchema = z.object({
  acknowledged: z.boolean(),
  created_timestamp: z.string(),
  hash: z.string(),
})

const referralSchema = z.object({
  source_url: z.string(),
  source_id: z.string(),
  source_type: z.string(),
  headline: z.string().optional(),
  body: z.string().optional(),
  media_type: z.string().optional(),
  image_url: z.string().optional(),
  video_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
})

const errorPayloadSchema = z.object({
  code: z.number(),
  title: z.string().optional(),
  message: z.string().optional(),
  error_data: z.object({
    details: z.string().optional(),
  }).passthrough().optional(),
  href: z.string().optional(),
}).passthrough()

// Main message schema with all possible message types
const messageSchema = z.object({
  // `from` is absent on some current events (e.g. type 'unsupported'), which carry from_user_id.
  from: z.string().optional(),
  from_user_id: z.string().optional(),
  unsupported: z.unknown().optional(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(), // Allow any string, we'll handle unknown types gracefully
  context: messageContextSchema.optional(),
  text: textMessageSchema.optional(),
  image: mediaMessageSchema.optional(),
  video: mediaMessageSchema.optional(),
  audio: mediaMessageSchema.optional(),
  document: documentMessageSchema.optional(),
  sticker: mediaMessageSchema.optional(),
  location: locationMessageSchema.optional(),
  contacts: z.array(contactMessageSchema).optional(),
  interactive: interactiveMessageSchema.optional(),
  button: buttonMessageSchema.optional(),
  order: orderMessageSchema.optional(),
  system: systemMessageSchema.optional(),
  reaction: reactionMessageSchema.optional(),
  errors: z.array(errorPayloadSchema).optional(),
  identity: identitySchema.optional(),
  referral: referralSchema.optional(),
}).passthrough() // Allow unknown fields for future message types

// ─── Status Schemas ──────────────────────────────────────────────────────────

const conversationSchema = z.object({
  id: z.string(),
  origin: z.object({
    type: z.string(),
  }),
  expiration_timestamp: z.string().optional(),
})

const pricingSchema = z.object({
  type: z.string().optional(),
  billable: z.boolean().optional(),
  pricing_model: z.string().optional(),
  category: z.string().optional(),
}).passthrough()

const statusSchema = z.object({
  id: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed', 'deleted']),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  recipient_user_id: z.string().optional(),
  conversation: conversationSchema.optional(),
  pricing: pricingSchema.optional(),
  errors: z.array(errorPayloadSchema).optional(),
  biz_opaque_callback_data: z.string().optional(),
}).passthrough()

// ─── Webhook Value Schema ────────────────────────────────────────────────────

export const webhookValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: metadataSchema,
  contacts: z.array(contactSchema).optional(),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
  errors: z.array(errorPayloadSchema).optional(),
}).passthrough()

// ─── Main Webhook Payload Schema ─────────────────────────────────────────────

export const webhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: webhookValueSchema,
      field: z.string(),
    }).passthrough()),
  }).passthrough()),
}).passthrough()

// ─── Generic envelope (every field type) ─────────────────────────────────────

/**
 * Meta delivers many field types to this endpoint (messages, account_update,
 * message_template_status_update, phone_number_name_update, ...). Only `messages` has the strict
 * value schema above; everything else just has to be a well-formed envelope so it can be
 * acknowledged with 200 and Meta stops retrying it.
 */
export const webhookEnvelopeSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      field: z.string(),
      value: z.object({}).passthrough(),
    }).passthrough()),
  }).passthrough()),
}).passthrough()

/** Paths and messages only, never values (payloads contain personal data). */
export function summariseIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.slice(0, 5)
    .map(i => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('; ')
}

// ─── Webhook Verification Schema ─────────────────────────────────────────────

export const webhookVerificationSchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
})

// ─── Type Exports ────────────────────────────────────────────────────────────

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>
export type WebhookVerification = z.infer<typeof webhookVerificationSchema>
export type WebhookMessage = z.infer<typeof messageSchema>
export type WebhookStatus = z.infer<typeof statusSchema>
