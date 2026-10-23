# Signup phone verification by WhatsApp code (archived)

## What it was

New owners proved they controlled their mobile number at signup: `/auth/verify-phone` asked for the number, the
server sent a 6-digit code over WhatsApp (`/api/auth/phone/request-otp`), the owner typed it
(`/api/auth/phone/verify`), and finalize-registration / onboarding refused to create a gym until
`owner_verified_phones` had a row for the user. Codes lived in Redis (`lib/auth/phone-otp.ts`).

## Why it was archived

Meta rejected both the Authentication and the Utility code templates, and SMS needs a paid DLT registration.
The mobile number is now just required and saved (`POST /api/auth/phone/save`, user metadata `mobile_number`),
with no verification; one number may belong to several owner accounts.

## How to restore

Move each file back to its original path (the layout here mirrors the repo root):

| Archived file | Original path |
|---|---|
| `app/api/auth/phone/request-otp/route.ts` | same path under the repo root |
| `app/api/auth/phone/verify/route.ts` | same |
| `app/api/auth/phone/status/route.ts` | same |
| `lib/auth/phone-otp.ts` | same |
| `app/auth/verify-phone/page.tsx` | same |
| `__tests__/auth/phoneOtp.test.ts` | same |
| `__tests__/auth/phoneVerifyRoute.test.ts` | same |

Then:

1. Re-add the WhatsApp code from `whatsapp-template-snippets.md` (`sendAuthOtp`, TemplateId, templateSpec,
   payload builder, validator branches, `markPhoneLeadVerified`) and the env var `WHATSAPP_OTP_TEMPLATE`
   (`owner_verification` default, or `owner_verification_utility`).
2. Put the `owner_verified_phones` lookup back into `finalize-registration` and `onboarding/complete`
   (403 `PHONE_NOT_VERIFIED`), and point the UI at `/auth/verify-phone` again.
3. Meta template contract for `owner_verification`: category Authentication, language English, copy-code
   button, body `{{1}}` = the code, and a url-type button at index 0 carrying the same code.

## Database

Left in place on purpose, nothing to run: table `owner_verified_phones`, function
`mark_owner_phone_lead_verified`, migrations `20261022120000` and `20261022170000`.

This folder is never imported by app code and is outside typecheck and tests.
