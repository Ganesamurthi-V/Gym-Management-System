/**
 * Gym notices: a short message the owner posts for their members (holiday timings, a new batch, a closure).
 * Members see the active ones on the home screen of the member app. Table: gym_notices.
 *
 * Not the same as lib/announcement.ts, which is the platform admin's banner to gym OWNERS.
 */

export type NoticeKind = 'info' | 'holiday' | 'batch' | 'closure' | 'offer'

export const NOTICE_KINDS: readonly NoticeKind[] = ['info', 'holiday', 'batch', 'closure', 'offer']

export const NOTICE_LIMITS = {
  titleMin: 3,
  titleMax: 80,
  bodyMin: 3,
  bodyMax: 500,
  /** Active notices a gym can have at once. */
  maxActive: 20,
  /** How many a member sees on the home screen. */
  homeShown: 3,
} as const

export interface GymNotice {
  id: string
  kind: NoticeKind
  title: string
  /** Plain text. Line breaks are kept; never rendered as HTML. */
  body: string
  /** Last day (YYYY-MM-DD, India date) the notice is shown, or null for no end date. */
  expiresOn: string | null
  isActive: boolean
  createdAt: string
}

export type NoticeErrorCode =
  | 'VALIDATION_ERROR'
  | 'TOO_MANY'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
