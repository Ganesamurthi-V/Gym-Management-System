/**
 * services/whatsapp/validateTemplate.ts
 *
 * Runtime enforcement of the WhatsApp template verification rules.
 *
 * Given a built messages-API payload (from buildTemplatePayload) and the
 * template it claims to be, this asserts the payload EXACTLY matches the
 * approved template contract in templateSpec.ts:
 *
 *   - template name matches the approved name exactly
 *   - language code matches
 *   - body variable COUNT matches (no missing, no extra)
 *   - every body variable is a non-empty text parameter
 *     (rejects null / undefined / '' / 'undefined' / 'null')
 *   - header format matches:
 *       'image'       → a header component whose first param is a non-empty image
 *       'static-none' → no header component at all
 *
 * The send path calls this BEFORE dispatching. On any failure the API call is
 * skipped and a clear, structured error is returned.
 */

import type { TemplateId } from '@/types/whatsapp'
import { TEMPLATE_SPECS, type TemplateSpec } from './templateSpec'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

interface Component {
  type?: string
  parameters?: unknown[]
}

/** A value that is present and, when a string, non-empty & not a null-ish sentinel. */
function isMeaningful(text: unknown): text is string {
  if (typeof text !== 'string') return false
  const trimmed = text.trim()
  return trimmed !== '' && trimmed !== 'undefined' && trimmed !== 'null'
}

function findComponent(payload: any, type: string): Component | undefined {
  const components = payload?.template?.components
  if (!Array.isArray(components)) return undefined
  return components.find((c: Component) => c?.type === type)
}

/**
 * Validate a built template payload against its approved spec.
 *
 * @param templateId - The template the payload is meant to be.
 * @param payload    - The messages-API body produced by buildTemplatePayload.
 */
export function validateTemplatePayload(
  templateId: TemplateId,
  payload: unknown,
): ValidationResult {
  const errors: string[] = []
  const spec: TemplateSpec | undefined = TEMPLATE_SPECS[templateId]

  if (!spec) {
    return { valid: false, errors: [`Unknown template: "${templateId}" is not an approved template.`] }
  }

  const p = payload as any

  // ── Envelope ────────────────────────────────────────────────────────────────
  if (p?.messaging_product !== 'whatsapp') {
    errors.push(`messaging_product must be "whatsapp" (got "${p?.messaging_product}").`)
  }
  if (p?.type !== 'template') {
    errors.push(`message type must be "template" (got "${p?.type}").`)
  }
  if (!isMeaningful(p?.to)) {
    errors.push('recipient "to" is missing or empty.')
  }

  // ── Template name & language ─────────────────────────────────────────────────
  const name = p?.template?.name
  if (name !== spec.name) {
    errors.push(`template name mismatch: expected "${spec.name}", received "${name}".`)
  }
  const lang = p?.template?.language?.code
  if (lang !== spec.language) {
    errors.push(`language mismatch: expected "${spec.language}", received "${lang}".`)
  }

  // ── Body variables (count + order slot presence + non-empty) ─────────────────
  const body = findComponent(p, 'body')
  const bodyParams = Array.isArray(body?.parameters) ? body!.parameters! : []
  const received = bodyParams.map((param: any) => param?.text)

  if (bodyParams.length !== spec.body.length) {
    errors.push(
      `body variable count mismatch: expected ${spec.body.length} ` +
      `[${spec.body.join(', ')}], received ${bodyParams.length} [${received.join(', ')}].`,
    )
  }

  bodyParams.forEach((param: any, i: number) => {
    const label = spec.body[i] ?? `extra#${i + 1}`
    if (param?.type !== 'text') {
      errors.push(`body {{${i + 1}}} (${label}) must be a text parameter (got type "${param?.type}").`)
    }
    if (!isMeaningful(param?.text)) {
      errors.push(`body {{${i + 1}}} (${label}) is null, undefined, or empty.`)
    }
  })

  // ── Header ───────────────────────────────────────────────────────────────────
  // All approved templates carry an image header — it must be present.
  const header = findComponent(p, 'header')

  if (spec.header === 'image') {
    if (!header) {
      errors.push('header image is required but no header component was sent.')
    } else {
      const first = (header.parameters ?? [])[0] as any
      if (first?.type !== 'image') {
        errors.push(`header must be an image parameter (got type "${first?.type}").`)
      } else if (!isMeaningful(first?.image?.link)) {
        errors.push('header image link is missing or empty.')
      }
    }
  }

  // ── Button (dynamic URL) ────────────────────────────────────────────────────
  if (spec.button === 'url') {
    const button = findComponent(p, 'button')
    if (!button) {
      errors.push('URL button component is required but was not sent.')
    } else {
      const first = (button.parameters ?? [])[0] as any
      if (first?.type !== 'text') {
        errors.push(`URL button parameter must be text (got type "${first?.type}").`)
      } else if (!isMeaningful(first?.text)) {
        errors.push('URL button parameter (token) is null, undefined, or empty.')
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Build a single human-readable error string from a failed validation, including
 * the template name, the expected vs received variables, and each violation.
 */
export function formatValidationError(templateId: TemplateId, result: ValidationResult): string {
  const spec = TEMPLATE_SPECS[templateId]
  const expected = spec ? `[${spec.body.join(', ')}]` : '(unknown template)'
  return (
    `WhatsApp template validation failed for "${templateId}". ` +
    `Expected body variables ${expected}. Issues: ${result.errors.join(' ')}`
  )
}
