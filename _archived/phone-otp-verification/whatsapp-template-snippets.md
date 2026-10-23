# WhatsApp code removed from the active tree

Everything below existed only for the signup phone code. Paste each block back into the named file to restore.
All other templates are unaffected.

## types/whatsapp.ts

TemplateId union members:

```ts
  /** Meta AUTHENTICATION template: signup phone-ownership code. Not owner-facing. */
  | 'owner_verification'
  /** Same code as a Meta UTILITY template (body only, no copy-code button). Chosen with WHATSAPP_OTP_TEMPLATE. */
  | 'owner_verification_utility'
```

TemplateContext field:

```ts
  /** owner_verification: the 6-digit code, sent as body {{1}} and the copy-code button. */
  otpCode?: string
```

## services/whatsapp/templateSpec.ts

Type changes (after removal they were `'image'` and `'url'` only):

```ts
export type HeaderKind = 'image' | 'none'
export type ButtonKind = 'url' | 'copy_code'
```

TEMPLATE_SPECS entries:

```ts
  // Authentication template: header-less, body is the code, button is Meta's copy-code
  // button (sent over the wire as a url-type button carrying the same code).
  owner_verification: {
    name: 'owner_verification',
    language: 'en',
    header: 'none',
    body: ['otpCode'],
    button: 'copy_code',
  },
  // The same signup code as a UTILITY template: header-less, one body variable, no button.
  // Used only when WHATSAPP_OTP_TEMPLATE=owner_verification_utility (see sendAuthOtp).
  owner_verification_utility: {
    name: 'owner_verification_utility',
    language: 'en',
    header: 'none',
    body: ['otpCode'],
  },
```

## services/whatsapp/graph.ts

```ts
/**
 * Send the signup phone-verification code. Sent inline (never queued) and WITHOUT gymId on
 * purpose: no gym exists yet, so the per-gym WhatsApp switch cannot apply. gymName and
 * memberName are unused by this template.
 *
 * Which approved Meta template carries the code is a setting, not a code change:
 * WHATSAPP_OTP_TEMPLATE = 'owner_verification' (Authentication, default) or
 * 'owner_verification_utility' (Utility). Read per call so switching needs only a redeploy.
 */
export async function sendAuthOtp(phone: string, code: string): Promise<SendResult> {
  const templateId = process.env.WHATSAPP_OTP_TEMPLATE === 'owner_verification_utility'
    ? 'owner_verification_utility'
    : 'owner_verification'
  return sendTemplate(templateId, { phone, gymName: '', memberName: '', otpCode: code })
}
```

buildTemplatePayload entries:

```ts
    owner_verification: {
      ...base,
      template: {
        name: 'owner_verification',
        language: { code: 'en' },
        // Authentication template: no header. The code goes in the body and again in the
        // copy-code button (Meta requires both, sent as a url-type button at index 0).
        components: [
          { type: 'body', parameters: [txt(ctx.otpCode ?? '')] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [txt(ctx.otpCode ?? '')] },
        ],
      },
    },

    owner_verification_utility: {
      ...base,
      template: {
        name: 'owner_verification_utility',
        language: { code: 'en' },
        // Utility template: no header and no button, the code is the only body variable.
        components: [{ type: 'body', parameters: [txt(ctx.otpCode ?? '')] }],
      },
    },
```

## services/whatsapp/validateTemplate.ts

Inserted after the `spec.header === 'image'` block and before the `spec.button === 'url'` block:

```ts
  if (spec.header === 'none' && header) {
    errors.push('this template has no header but a header component was sent.')
  }

  // ── Button (copy code): same wire shape as a URL button, parameter is the code ──
  if (spec.button === 'copy_code') {
    const button = findComponent(p, 'button')
    if (!button) {
      errors.push('copy-code button component is required but was not sent.')
    } else {
      const first = (button.parameters ?? [])[0] as any
      if (first?.type !== 'text') {
        errors.push(`copy-code button parameter must be text (got type "${first?.type}").`)
      } else if (!isMeaningful(first?.text)) {
        errors.push('copy-code button parameter (code) is null, undefined, or empty.')
      }
    }
  }
```

## lib/auth/phone-leads.ts

```ts
export async function markPhoneLeadVerified(phoneE164: string, userId: string): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('mark_owner_phone_lead_verified', {
      p_phone: phoneE164,
      p_user_id: userId,
    })
    if (error) logger.error('phone lead verify mark failed', { phone: maskIndianMobile(phoneE164), reason: error.message })
  } catch (err) {
    logger.error('phone lead verify mark threw', { phone: maskIndianMobile(phoneE164), reason: err instanceof Error ? err.message : 'unknown' })
  }
}
```

## __tests__/whatsapp/validateTemplate.test.ts

`otpCode: '123456',` in the shared full context, `'owner_verification'` and `'owner_verification_utility'` in `ALL_TEMPLATES`, and:

```ts
describe('owner_verification (authentication template)', () => {
  const otp = { phone: '9876543210', gymName: '', memberName: '', otpCode: '123456' }

  it('builds body + button with the code and NO header', () => {
    const payload = buildTemplatePayload('owner_verification', otp) as any
    const types = payload.template.components.map((c: any) => c.type)
    expect(types).toEqual(['body', 'button'])
    expect(payload.template.components[0].parameters).toEqual([{ type: 'text', text: '123456' }])
    expect(payload.template.components[1]).toEqual({
      type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }],
    })
  })

  it('accepts a valid payload with empty gymName/memberName', () => {
    const result = validateTemplatePayload('owner_verification', buildTemplatePayload('owner_verification', otp))
    expect(result.errors).toEqual([])
  })

  it.each([undefined, '', '   '])('rejects a missing/blank code (%j)', code => {
    const payload = buildTemplatePayload('owner_verification', { ...otp, otpCode: code })
    const result = validateTemplatePayload('owner_verification', payload)
    expect(result.valid).toBe(false)
  })

  it('rejects a payload that carries a header', () => {
    const payload = buildTemplatePayload('owner_verification', otp) as any
    payload.template.components.unshift({ type: 'header', parameters: [{ type: 'image', image: { link: 'x' } }] })
    expect(validateTemplatePayload('owner_verification', payload).valid).toBe(false)
  })

  it('rejects a payload without the copy-code button', () => {
    const payload = buildTemplatePayload('owner_verification', otp) as any
    payload.template.components = payload.template.components.filter((c: any) => c.type !== 'button')
    expect(validateTemplatePayload('owner_verification', payload).valid).toBe(false)
  })

  it('leaves existing templates with their image header', () => {
    const payload = buildTemplatePayload('membership_renewed', full) as any
    expect(payload.template.components[0].type).toBe('header')
  })
})

describe('owner_verification_utility (utility template)', () => {
  const otp = { phone: '9876543210', gymName: '', memberName: '', otpCode: '123456' }

  it('builds a body-only payload with the code and NO header and NO button', () => {
    const payload = buildTemplatePayload('owner_verification_utility', otp) as any
    expect(payload.template.name).toBe('owner_verification_utility')
    expect(payload.template.components.map((c: any) => c.type)).toEqual(['body'])
    expect(payload.template.components[0].parameters).toEqual([{ type: 'text', text: '123456' }])
  })

  it('accepts a valid payload', () => {
    const result = validateTemplatePayload('owner_verification_utility', buildTemplatePayload('owner_verification_utility', otp))
    expect(result.errors).toEqual([])
  })

  it.each([undefined, '', '   '])('rejects a missing/blank code (%j)', code => {
    const payload = buildTemplatePayload('owner_verification_utility', { ...otp, otpCode: code })
    expect(validateTemplatePayload('owner_verification_utility', payload).valid).toBe(false)
  })
})
```

## __tests__/whatsapp/templatePayload.test.ts

```ts
describe('buildTemplatePayload — owner_verification', () => {
  it('has no header and carries the code in body and button', () => {
    const payload = buildTemplatePayload('owner_verification', { ...base, otpCode: '042817' }) as any
    expect(payload.template.name).toBe('owner_verification')
    expect(payload.template.language.code).toBe('en')
    expect(payload.template.components.some((c: any) => c.type === 'header')).toBe(false)
    expect(bodyTexts(payload)).toEqual(['042817'])
    const button = payload.template.components.find((c: any) => c.type === 'button')
    expect(button).toEqual({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '042817' }] })
  })
})
```
