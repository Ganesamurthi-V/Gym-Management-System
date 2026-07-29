# Changelog

All notable changes to GymFlow are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Member App Management module** (`/member-app`) — operational dashboard for the
  separate `gymflow-member/` application. Ten sections behind a tab controller:
  Overview, Portal Access, Invitations, Activity, Logins, WhatsApp Templates,
  Gamification, Analytics, Maintenance, and Settings.
  - Six-card vitals row (app status, active members, pending invitations,
    today's logins, weekly and monthly active users) pinned above the tabs.
  - Member Portal Management table with paginated rows, per-row action menu
    (enable/disable portal, send/resend invitation, suspend/reactivate, reset
    password, force logout) and bulk actions for multi-row selection.
  - Invitation pipeline and Member Activity tables with text search,
    multi-select status chips, and inclusive date-range filtering.
  - Login Overview with a five-card summary and a recent-logins table that
    derives Online status from a configurable 15-minute threshold.
  - Six Recharts visualisations (DAU, WAU, MAU, retention, average session
    duration, activation conversion) using the brand colour ramp.
  - Maintenance panel with service-health rows and confirmation-gated
    maintenance mode plus cache/retry action stubs.
  - Settings form with client-side validation for portal name, support email
    and optional URL fields; the member app URL is read-only and derived from
    the gym name.
  - Route-level skeleton, section error boundary with retry, and empty states
    for every table.
- `types/member-app.ts` — canonical types for the module, re-exported through
  `features/member-app/types/index.ts`.
- `features/member-app/services/memberAppService.ts` — every fixture behind
  typed async functions with simulated latency, so each can be replaced by a
  Supabase query without touching a component.
- `Member App` entry in `NAV_ITEMS` with a matching inline `SmartphoneIcon`.

### Changed

- `middleware.ts` — added `/member-app` to `PROTECTED_PREFIXES` so the route
  inherits the authenticated-user check and the subscription-expiry redirect.

### Notes

- The module is presentation-complete but **not backend-wired**. All reads and
  mutations resolve against the mock service layer.
- `broadcast_message` is defined as `MemberAppTemplateId` in
  `types/member-app.ts` rather than being added to the shared `TemplateId`
  union. That union backs `TEMPLATE_SPECS: Record<TemplateId, TemplateSpec>`
  and the pre-dispatch approval gate, so widening it would break the exhaustive
  record and imply Meta send approval this template does not have.
