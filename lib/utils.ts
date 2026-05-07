import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { addDays, addMonths, addYears, differenceInDays, format, isAfter, isBefore, parseISO } from 'date-fns'
import type { MemberStatus, Plan } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPlanDuration(plan: Plan): number {
  switch (plan) {
    case 'monthly': return 1
    case 'quarterly': return 3
    case 'annual': return 12
    case 'custom': return 1
  }
}

export function calcEndDate(startDate: string, plan: Plan, customMonths?: number): string {
  const start = parseISO(startDate)
  const months = plan === 'custom' ? (customMonths ?? 1) : getPlanDuration(plan)
  const end = addMonths(start, months)
  return format(end, 'yyyy-MM-dd')
}

export function getMemberStatus(endDate: string): MemberStatus {
  const today = new Date()
  const end = parseISO(endDate)
  const daysLeft = differenceInDays(end, today)

  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 7) return 'expiring'
  return 'active'
}

export function getDaysRemaining(endDate: string): number {
  const today = new Date()
  const end = parseISO(endDate)
  return differenceInDays(end, today)
}

export function formatDate(date: string): string {
  return format(parseISO(date), 'dd MMM yyyy')
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function buildWhatsAppLink(phone: string, memberName: string, endDate: string): string {
  const message = encodeURIComponent(
    `Hi ${memberName}! 🏋️ Your gym membership expires on ${formatDate(endDate)}. Please renew to continue your fitness journey. Contact us to renew.`
  )
  const cleanPhone = phone.replace(/\D/g, '')
  const withCountryCode = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`
  return `https://wa.me/${withCountryCode}?text=${message}`
}

export const PLAN_LABELS: Record<Plan, string> = {
  monthly: 'Monthly (1 month)',
  quarterly: 'Quarterly (3 months)',
  annual: 'Annual (12 months)',
  custom: 'Custom',
}

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
}
