/**
 * lib/whatsapp/sender.ts
 *
 * Thin re-export shim — keeps all existing call sites working unchanged.
 *
 * The real implementation lives in services/whatsapp/graph.ts.
 * Every outbound call routes through the GymFlow reverse proxy:
 *   https://graph.gymflow.sbs/api/graph → https://graph.facebook.com
 */

export type { TemplateId, TemplateContext, SendResult } from '@/types/whatsapp'
export { sendTemplate as sendWhatsAppTemplate } from '@/services/whatsapp/graph'
