import type { StatusTone } from '@/components/dashboard/StatusBadge';

// Pure helpers moved verbatim from GymSubscriptionScreen (no behaviour change).

export function fmtDate(iso?: string | null, fallback = '—'): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtDateTime(iso?: string | null, fallback = '—'): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCurrency(amount?: number | null): string {
  if (amount == null) return '₹0';
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded));
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${sign}₹${grouped}`;
}

/*
  The SaaS tiers an admin can approve/activate, with the duration shown in confirm
  dialogs. No prices: they live in platform_settings and change, so dialogs use the
  pending request's expected_amount_inr (and omit the amount when it is null).
  'lifetime' is granted rather than sold, so it carries no duration line.
*/
export type ApprovablePlan = 'monthly' | 'yearly' | 'lifetime' | 'whatsapp_addon';
const PLAN_DETAILS: Record<ApprovablePlan, { label: string; days?: number }> = {
  monthly: { label: 'Monthly', days: 30 },
  yearly: { label: 'Yearly', days: 365 },
  lifetime: { label: 'Lifetime' },
  whatsapp_addon: { label: 'WhatsApp add-on', days: 30 },
};

/*
  Which product a pending payment is for. The stored plan_requested is authoritative
  (the server approves from it too); older requests fall back to the
  "Intended Plan: X" line in the notes. Only a genuinely absent value (legacy
  request) falls back to monthly. An add-on or any unrecognised non-empty value must
  never be shown or confirmed as a Monthly plan, so those return null and the
  caller refuses to approve blind.
*/
export function resolveRequestedPlan(req: { plan_requested?: string | null; notes?: string | null }): ApprovablePlan | null {
  const m = req.notes?.match(/Intended Plan:\s*([A-Z_]+)/i);
  const raw = (req.plan_requested || m?.[1] || '').toLowerCase().trim();
  if (!raw) return 'monthly';
  if (raw === 'yearly' || raw === 'lifetime' || raw === 'monthly') return raw;
  if (raw.replace(/_/g, '').includes('addon')) return 'whatsapp_addon';
  return null;
}

/** "the Yearly plan for 365 days (for ₹N)": the human phrase for a confirm dialog. */
function planPhrase(plan: ApprovablePlan, amount?: number | null): string {
  const d = PLAN_DETAILS[plan];
  const forAmount = amount != null ? ` (for ${formatCurrency(amount)})` : '';
  if (plan === 'lifetime') return 'the Lifetime plan (permanent access)';
  if (plan === 'whatsapp_addon') return `WhatsApp automation for ${d.days} days${forAmount}`;
  return `the ${d.label} plan for ${d.days} days${forAmount}`;
}

/** Confirm-dialog sentence; the add-on is not a plan, so it gets its own wording. */
export function approveMessage(plan: ApprovablePlan, gymName: string, amount?: number | null): string {
  if (plan === 'whatsapp_addon') return `Activate ${planPhrase(plan, amount)} for ${gymName}? Their subscription plan is not changed.`;
  return `Approve the payment for ${gymName} and activate ${planPhrase(plan, amount)}?`;
}

/** Status dot tone for the subscription status badge (was getStatusColor). */
export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'active': return 'success';
    case 'expiring':
    case 'trial':
    case 'suspended': return 'warning';
    case 'expired':
    case 'cancelled': return 'critical';
    default: return 'neutral';
  }
}

/** Activity-log event colour name from the API mapped to a status tone. */
export function eventTone(color: string): StatusTone {
  switch (color) {
    case 'emerald':
    case 'green': return 'success';
    case 'red': return 'critical';
    case 'amber': return 'warning';
    case 'indigo':
    case 'sky': return 'info';
    default: return 'neutral';
  }
}

/** `e.message ?? fallback` for an unknown caught value. */
export function errMsg(e: unknown, fallback: string): string {
  return (e as { message?: string } | null)?.message ?? fallback;
}
