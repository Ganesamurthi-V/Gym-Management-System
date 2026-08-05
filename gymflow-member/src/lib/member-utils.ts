/**
 * lib/member-utils.ts
 *
 * Pure formatting helpers — no server-only imports.
 * Safe to use in both Server Components and 'use client' components.
 */

const PLAN_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly (3 Months)',
  annual: 'Annual (12 Months)',
}

export function formatPlan(plan: string): string {
  return PLAN_LABELS[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}
