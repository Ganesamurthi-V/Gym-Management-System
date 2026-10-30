/**
 * Everything the AI draft writer is allowed to say about GymFlow.
 *
 * It is the only source of truth in the prompt: the model is told to answer from this and
 * from nothing else, and to hand anything outside it to a person. So a fact missing here
 * becomes a holding reply, never an invented answer.
 *
 * Every line is taken from what the website already states (landing-page:
 * src/components/Pricing.tsx, FAQ.tsx, BentoFeatures.tsx and public/llms.txt). When the
 * site changes, change this file in the same commit, or drafts will quote old prices. Rupee prices are deliberately NOT stored here (they live in
 * platform_settings and change); the text sends customers to the pricing page instead.
 *
 * Kept short on purpose (about 1,000 tokens): it is sent with every draft, and Groq's free
 * plan allows only 8K tokens a minute per model. Facts that rarely come up in support mail
 * stay out of it.
 */
export const SUPPORT_KNOWLEDGE = `
GymFlow is all-in-one gym management software for independent single-location gyms in India. Web: www.gymflow.sbs. App: app.gymflow.sbs. Member app: members open it in a browser on their phone (no app store needed).

PRICING (Indian rupees only; every paid plan includes every feature, unlimited members and unlimited WhatsApp messages; no per-member charge, no setup fee):
- Monthly plan (billed every month) and Yearly plan (billed once for 12 months, cheaper than twelve monthly payments)
- Do not quote a rupee amount: current prices are shown on the pricing page at www.gymflow.sbs and on the Payments page in GymFlow; point the customer there
There is a 14-day free trial with every feature unlocked and no credit card needed. After the trial an owner can move to the free forever plan instead of paying: up to 50 members in total, no member app, and WhatsApp messaging only with the paid WhatsApp add-on (also priced on the Payments page, billed for 30 days). The monthly and yearly plans have unlimited members, WhatsApp and the member app.

HOW TO START AND PAY: sign up at app.gymflow.sbs and go through the setup wizard (gym name, membership plans, pricing, WhatsApp details); it autosaves. To activate a paid plan: 1) pay with any UPI app, net banking or card, 2) open the Payments page in GymFlow and attach the payment screenshot, 3) GymFlow verifies it and switches the account on shortly after. Payments are verified manually, so no card is kept on file and nothing is charged automatically.

WHAT IT DOES: member management (records, search, plans), payments and dues (cash, UPI, card; reminders for pending dues), attendance (self-service kiosk by member ID, daily log), dashboard with live stats, reports and analytics (revenue, plan distribution, joining and expiry trends, downloadable PDF reports), a member app (digital card with QR, attendance, membership details, workouts, progress, rewards), CSV/Excel import and export, priority support.

WHATSAPP: built in and unlimited at no extra cost. It sends welcome messages, membership renewal reminders before a plan expires, and payment-due alerts every 3 days while a due is pending.

IMPORTING MEMBERS: upload a CSV or Excel file; GymFlow matches the column headings to its fields (even misspelt plan names are grouped) and shows a preview. Nothing is saved until the owner confirms. A few hundred members usually take under 15 minutes.

DATA: each gym's records are isolated and reachable only from that gym's own account. Encrypted in transit, backed up regularly, never shared with other gyms or sold.

SUPPORT: WhatsApp, phone and email, with priority support included in the plan. Email support@gymflow.sbs. Phone and WhatsApp +91 93848 86895.

NOT OFFERED (never claim these): no free plan other than the free forever plan described above, no public API or marketplace, no third-party integration catalogue, no multi-location or franchise tooling, no hardware sold or required (no turnstiles, biometric readers or scanners). Do not state customer counts, ratings, uptime figures, discounts, refunds, or delivery dates.
`.trim()
