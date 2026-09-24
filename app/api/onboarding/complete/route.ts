import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

interface MembershipPlan {
  planName: string
  category: 'strength' | 'cardio' | 'both'
  duration: 'monthly' | 'quarterly' | 'annual' | 'custom'
  price: number
  joiningFee: number
  hasDiscount: boolean
  discountPercent: number
  hasFreezeOption: boolean
  customDurationMonths?: number
}

type DatabaseError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

type OnboardingRequest = {
  gymId: string | null
  gymName: string
  gymType: string
  branchCount: number
  address: string
  openingYear: number
  phone: string
  city: string
  plans: MembershipPlan[]
}

type ValidationResult =
  | { ok: true; data: OnboardingRequest }
  | { ok: false; message: string }

const log = logger.child({ component: 'ONBOARDING_COMPLETE' })
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const GYM_TYPES = new Set(['Gym', 'Fitness Center', 'CrossFit', 'Yoga Studio', 'Martial Arts', 'Other'])

function errorResponse(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json(
    { success: false, error: { code, message, retryable } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length <= maxLength ? trimmed : null
}

function validateRequest(raw: unknown): ValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, message: 'We could not read your setup details. Please refresh the page and try again.' }
  }

  const gymName = optionalString(raw.gymName, 100)
  if (gymName === null || gymName.length < 2) {
    return { ok: false, message: 'Enter a gym name with at least 2 characters.' }
  }

  const gymIdValue = raw.gymId
  const gymId = typeof gymIdValue === 'string' && gymIdValue.trim() ? gymIdValue.trim() : null
  if (gymId && !UUID_PATTERN.test(gymId)) {
    return { ok: false, message: 'Your gym setup link is no longer valid. Refresh the page and try again.' }
  }

  const gymType = optionalString(raw.gymType, 40)
  if (gymType === null || !GYM_TYPES.has(gymType || 'Gym')) {
    return { ok: false, message: 'Choose a valid gym type.' }
  }

  const branchCount = Number(raw.branchCount ?? 1)
  if (!Number.isInteger(branchCount) || branchCount < 1 || branchCount > 100) {
    return { ok: false, message: 'Number of branches must be between 1 and 100.' }
  }

  const openingYear = Number(raw.openingYear ?? new Date().getFullYear())
  const latestOpeningYear = new Date().getFullYear() + 1
  if (!Number.isInteger(openingYear) || openingYear < 1900 || openingYear > latestOpeningYear) {
    return { ok: false, message: `Opening year must be between 1900 and ${latestOpeningYear}.` }
  }

  const phone = optionalString(raw.phone, 20)
  if (phone === null || (phone !== '' && !/^\d{10}$/.test(phone))) {
    return { ok: false, message: 'Enter a valid 10-digit phone number, or leave the phone field empty.' }
  }

  const city = optionalString(raw.city, 200)
  if (city === null) {
    return { ok: false, message: 'City is too long. Choose a shorter city name and try again.' }
  }

  const address = optionalString(raw.address, 500)
  if (address === null) {
    return { ok: false, message: 'Address is too long. Keep it under 500 characters.' }
  }

  if (raw.plans !== undefined && !Array.isArray(raw.plans)) {
    return { ok: false, message: 'Your membership plans could not be read. Go back to Membership Plans and try again.' }
  }

  const plans = (raw.plans ?? []) as MembershipPlan[]
  if (plans.length > 50) {
    return { ok: false, message: 'You can add up to 50 membership plans during setup.' }
  }

  return {
    ok: true,
    data: {
      gymId,
      gymName,
      gymType: gymType || 'Gym',
      branchCount,
      address,
      openingYear,
      phone,
      city,
      plans,
    },
  }
}

/**
 * PostgREST rejects the whole write before touching the row when a submitted column is not
 * present in its schema cache. Older GymFlow databases store city and phone only inside
 * onboarding_data, so those mirrors are optional compatibility writes rather than grounds
 * to block the owner from completing setup.
 */
function isMissingContactColumn(error: DatabaseError | null): boolean {
  if (!error) return false
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  const namesContactColumn = text.includes("'city'") || text.includes('"city"') ||
    text.includes("'phone'") || text.includes('"phone"')
  return namesContactColumn && (error.code === 'PGRST204' || text.includes('schema cache'))
}

function databaseErrorDetails(error: DatabaseError | null) {
  return {
    code: error?.code ?? 'UNKNOWN',
    error: error?.message ?? 'Database returned no row and no error',
    details: error?.details,
    hint: error?.hint,
  }
}

function getPlanPrices(plans: MembershipPlan[]) {
  const byDuration = (duration: MembershipPlan['duration']) => plans.find((plan) => plan.duration === duration)
  return {
    monthly: byDuration('monthly')?.price ?? 1500,
    quarterly: byDuration('quarterly')?.price ?? 4000,
    annual: byDuration('annual')?.price ?? 10000,
    joining_fee_monthly: byDuration('monthly')?.joiningFee ?? 0,
    joining_fee_quarterly: byDuration('quarterly')?.joiningFee ?? 0,
    joining_fee_annual: byDuration('annual')?.joiningFee ?? 0,
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse(
        'UNAUTHORIZED',
        'Your session has expired. Sign in again to finish setting up your gym.',
        401,
      )
    }

    const { allowed } = await checkRateLimit(user.id, '/api/onboarding/complete', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return errorResponse(
        'RATE_LIMITED',
        'Too many setup attempts. Wait a minute, then try again.',
        429,
        true,
      )
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return errorResponse(
        'INVALID_REQUEST',
        'We could not read your setup details. Refresh the page and try again.',
        400,
      )
    }

    const validation = validateRequest(rawBody)
    if (!validation.ok) {
      return errorResponse('VALIDATION_ERROR', validation.message, 400)
    }

    const {
      gymId,
      gymName,
      gymType,
      branchCount,
      address,
      openingYear,
      phone,
      city,
      plans,
    } = validation.data

    const onboardingData = {
      gymType,
      branchCount,
      address,
      openingYear,
      city,
      phone,
      plans,
      completedAt: new Date().toISOString(),
    }

    /*
      Resolve by owner when gymId is absent. This makes the endpoint idempotent after a
      partial failure: if a first attempt created the gym but failed later while syncing
      prices, retrying updates that same gym instead of attempting a duplicate insert.
    */
    let targetGymId = gymId
    if (!targetGymId) {
      const { data: existingGym, error: lookupError } = await supabase
        .from('gyms')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

      if (lookupError) {
        log.error('Could not resolve gym during onboarding', databaseErrorDetails(lookupError))
        return errorResponse(
          'DATABASE_ERROR',
          'We could not load your gym details right now. Please try again.',
          500,
          true,
        )
      }
      targetGymId = existingGym?.id ?? null
    }

    if (targetGymId) {
      const coreUpdate = {
        name: gymName,
        onboarding_completed: true,
        onboarding_data: onboardingData,
      }

      const updateWithContact = await supabase
        .from('gyms')
        .update({ ...coreUpdate, phone: phone || null, city: city || null })
        .eq('id', targetGymId)
        .eq('owner_id', user.id)
        .select('id')
        .maybeSingle()

      let updatedGym = updateWithContact.data
      let updateError = updateWithContact.error

      if (isMissingContactColumn(updateError)) {
        /*
          Keep setup working while the migration reaches every environment. The contact
          values are still persisted in onboarding_data, which is the canonical fallback
          used for existing gyms. We log the internal cause but do not show PostgREST's
          schema-cache wording to the owner.
        */
        log.warn('Contact columns unavailable; saving onboarding data without mirrors', {
          code: updateError?.code,
          missingColumns: 'city_or_phone',
        })

        const fallbackUpdate = await supabase
          .from('gyms')
          .update(coreUpdate)
          .eq('id', targetGymId)
          .eq('owner_id', user.id)
          .select('id')
          .maybeSingle()

        updatedGym = fallbackUpdate.data
        updateError = fallbackUpdate.error
      }

      if (updateError) {
        log.error('Could not save onboarding details', databaseErrorDetails(updateError))
        return errorResponse(
          'DATABASE_ERROR',
          'We could not save your gym setup right now. Your details are still on this device—please try again.',
          500,
          true,
        )
      }

      if (!updatedGym) {
        log.warn('Onboarding update matched no gym', { userId: user.id, hasGymId: Boolean(targetGymId) })
        return errorResponse(
          'GYM_NOT_FOUND',
          'We could not find this gym on your account. Refresh the page and try again.',
          404,
        )
      }
    } else {
      const parsedTrialDays = Number.parseInt(process.env.TRIAL_DURATION_DAYS ?? '14', 10)
      const trialDays = Number.isFinite(parsedTrialDays) && parsedTrialDays > 0 ? parsedTrialDays : 14
      const now = new Date()
      const trialEndsAt = new Date(now)
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays)

      const coreInsert = {
        name: gymName,
        owner_id: user.id,
        onboarding_completed: true,
        onboarding_data: onboardingData,
        subscription_status: 'trial',
        plan_type: 'trial',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
      }

      const insertWithContact = await supabase
        .from('gyms')
        .insert({ ...coreInsert, phone: phone || null, city: city || null })
        .select('id')
        .single()

      let newGym = insertWithContact.data
      let insertError = insertWithContact.error

      if (isMissingContactColumn(insertError)) {
        log.warn('Contact columns unavailable; creating gym without mirrors', {
          code: insertError?.code,
          missingColumns: 'city_or_phone',
        })

        const fallbackInsert = await supabase
          .from('gyms')
          .insert(coreInsert)
          .select('id')
          .single()

        newGym = fallbackInsert.data
        insertError = fallbackInsert.error
      }

      if (insertError || !newGym) {
        log.error('Could not create gym during onboarding', databaseErrorDetails(insertError))
        return errorResponse(
          'DATABASE_ERROR',
          'We could not create your gym right now. Your details are still on this device—please try again.',
          500,
          true,
        )
      }

      targetGymId = newGym.id
    }

    if (plans.length > 0 && targetGymId) {
      const { error: planError } = await supabase.from('gym_plan_prices').upsert(
        {
          gym_id: targetGymId,
          ...getPlanPrices(plans),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'gym_id' },
      )

      if (planError) {
        log.error('Gym saved but plan prices could not be synchronized', databaseErrorDetails(planError))
        return errorResponse(
          'PLAN_SYNC_ERROR',
          'Your gym details were saved, but we could not save your membership prices. Please try again.',
          500,
          true,
        )
      }
    }

    try {
      const { invalidateGymIdentityCache } = await import('@/lib/cache')
      await invalidateGymIdentityCache(user.id)
    } catch (cacheError) {
      // The database write is complete. A failed cache invalidation must not make the owner
      // repeat setup; the cache will expire and the explicit dashboard navigation refreshes.
      log.warn('Onboarding saved but gym cache invalidation failed', {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      })
    }

    return NextResponse.json(
      { success: true, data: { gymId: targetGymId } },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error: unknown) {
    log.error('Unexpected onboarding completion error', error)
    return errorResponse(
      'INTERNAL_ERROR',
      'Something went wrong while finishing your setup. Your details are still on this device—please try again.',
      500,
      true,
    )
  }
}
