// Pure: turns an owner_activity_events row into the sentence the admin mobile app shows.
export type ActivityKind = 'app_open' | 'page_view' | 'action'

export interface ActivityEventInput {
  kind: ActivityKind
  path?: string | null
  label?: string | null
}

// Keys are the withAuth routeNames of the root app (read-only grep of app/**).
const ACTIONS: Record<string, string> = {
  ACCOUNT_DELETE_DATA: 'Deleted gym data',
  ACCOUNT_DELETE_DATA_REQUEST_OTP: 'Requested a code to delete gym data',
  ACCOUNT_DELETE_GYM: 'Deleted the gym',
  ACCOUNT_DELETE_REQUEST_OTP: 'Requested a code to delete the gym',
  ACCOUNT_GYM_GET: 'Opened gym settings',
  ACCOUNT_GYM_PATCH: 'Updated gym settings',
  ACCOUNT_PLANS_PUT: 'Updated membership plans',
  ACCOUNT_STATUS_GET: 'Checked account status',
  ACCOUNT_UPI_CONFIG_GET: 'Opened UPI settings',
  ATTENDANCE_CHECK: 'Marked attendance',
  ATTENDANCE_UNDO: 'Undid an attendance entry',
  DASHBOARD_DAILY_REPORT: 'Viewed the daily report',
  DASHBOARD_EXPIRING: 'Viewed expiring memberships',
  DUES_COLLECT: 'Collected a payment',
  DUES_MARK_PAID: 'Collected a payment',
  FEEDBACK_PROMPT_GET: 'Checked the feedback prompt',
  FEEDBACK_PROMPT_SHOWN: 'Saw the feedback prompt',
  GAMIFICATION_EVENTS_GET: 'Viewed member challenges',
  GAMIFICATION_EVENTS_POST: 'Created a member challenge',
  GAMIFICATION_EVENT_GIVE: 'Awarded a challenge prize',
  IMPORT_GYM_PLANS: 'Imported membership plans',
  IMPORT_LIMITS_GET: 'Checked import limits',
  IMPORT_PLAN_PRICES: 'Updated plan prices during import',
  IMPORT_CONFIRM: 'Imported members',
  INVENTORY_POST: 'Added an inventory item',
  INVENTORY_PATCH: 'Updated an inventory item',
  INVENTORY_DELETE: 'Deleted an inventory item',
  INVENTORY_SELL: 'Recorded an inventory sale',
  INVENTORY_SALE_DELETE: 'Deleted an inventory sale',
  INVENTORY_UNITS_ADD: 'Added inventory stock',
  INVENTORY_UNITS_UPDATE: 'Updated inventory stock',
  MEMBERSHIPS_POST: 'Renewed a membership',
  MEMBERS_CREATE: 'Added a member',
  MEMBERS_UPDATE: 'Edited a member',
  MEMBERS_DELETE: 'Deleted a member',
  ONBOARDING_COMPLETE: 'Finished gym setup',
  PAYMENTS_COLLECT: 'Collected a payment',
  PROGRAMS_ASSIGN: 'Assigned a program to members',
  PROGRAMS_UNASSIGN: 'Unassigned a program from members',
  SUBSCRIPTION_REQUEST: 'Sent a subscription payment request',
  SUPPORT_CLEAR: 'Cleared a support message',
  SUPPORT_TICKET: 'Sent a support message',
  MEMBERS_API_GET: 'Viewed members',
  MEMBERS_API_POST: 'Added a member',
  MEMBERS_BULK_DELETE: 'Deleted several members',
  MEMBERS_BULK_PATCH: 'Updated several members',
  MEMBERS_CHECK_NUMBER: 'Checked a member number',
  MEMBERS_FIX_DUPLICATES: 'Fixed duplicate members',
  MEMBERS_NEXT_NUMBER: 'Got the next member number',
  MEMBER_APP_BLOCKED: 'Updated blocked member app users',
  MEMBER_APP_GAMIFICATION: 'Updated member app rewards settings',
  MEMBER_APP_INVITE: 'Invited a member to the app',
  MEMBER_APP_INVITE_ALL: 'Invited all members to the app',
  NOTICES_CREATE: 'Posted a gym notice',
  NOTICES_UPDATE: 'Edited a gym notice',
  NOTICES_DELETE: 'Deleted a gym notice',
  PAYMENTS_API_GET: 'Viewed payments',
  PAYMENTS_API_POST: 'Collected a payment',
  PLANS_PUT: 'Updated membership plans',
  PROGRAMS_API_GET: 'Viewed programs',
  PROGRAMS_API_POST: 'Saved a program',
  PROGRAMS_API_DELETE: 'Deleted a program',
  RENEWAL_REQUEST_APPROVE: 'Approved a renewal request',
  RENEWAL_REQUEST_PROOF: 'Viewed a renewal payment proof',
  RENEWAL_REQUEST_PROOF_FILE: 'Viewed a renewal payment proof',
  RENEWAL_REQUEST_REJECT: 'Rejected a renewal request',
  SUBSCRIPTION_FREE_POST: 'Started the free plan',
  SUBSCRIPTION_SYNC_GET: 'Refreshed subscription status',
  SUPPORT_SYNC: 'Opened support',
  SUPPORT_UNREAD_COUNT: 'Checked support replies',
  TOURS_GET: 'Opened a guided tour',
  TOURS_POST: 'Finished a guided tour step',
  WHATSAPP_AUTOMATION_DUE_CLEARED: 'Sent a dues cleared message',
  WHATSAPP_AUTOMATION_IMPORT_BATCH: 'Sent welcome messages after import',
  WHATSAPP_AUTOMATION_RENEWAL: 'Sent a renewal message',
  WHATSAPP_AUTOMATION_WELCOME: 'Sent a welcome message',
  WHATSAPP_SEND: 'Sent a WhatsApp message',
}

const PAGES: Record<string, string> = {
  dashboard: 'Dashboard', members: 'Members', payments: 'Payments', import: 'Import',
  attendance: 'Attendance', inventory: 'Inventory', programs: 'Programs', plans: 'Plans',
  reports: 'Reports', settings: 'Settings', support: 'Support', notices: 'Notices',
  whatsapp: 'WhatsApp', 'member-app': 'Member App', dues: 'Dues', expenses: 'Expenses',
}

const SINGULAR: Record<string, string> = { members: 'a member', programs: 'a program', inventory: 'an item' }

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function describePath(path: string | null | undefined): string {
  const segs = (path ?? '').split('?')[0].split('/').filter(Boolean)
  const rest = segs[0] === 'owner' ? segs.slice(1) : segs
  if (rest.length === 0) return 'Viewed a page'
  const last = rest[rest.length - 1]
  if (last.startsWith(':') && rest.length >= 2) {
    const parent = rest[rest.length - 2]
    return `Viewed ${SINGULAR[parent] ?? `a ${parent.replace(/s$/, '').replace(/-/g, ' ')}`}`
  }
  const name = PAGES[last] ?? capitalise(last.replace(/[-_]/g, ' '))
  return `Viewed ${name}`
}

export function describeActivity(event: ActivityEventInput): string {
  if (event.kind === 'app_open') return 'Opened the app'
  if (event.kind === 'page_view') return describePath(event.path)
  const label = (event.label ?? '').trim()
  if (!label) return 'Performed an action'
  if (ACTIONS[label]) return ACTIONS[label]
  return capitalise(label.toLowerCase().replace(/[_\s]+/g, ' ').trim())
}

export const KNOWN_ACTION_LABELS = Object.keys(ACTIONS)
