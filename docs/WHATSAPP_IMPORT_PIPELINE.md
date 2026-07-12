# Feature: WhatsApp Support for Imported Members (Notifications Only)

## Objective

Members imported via Excel/CSV should behave exactly like manually created members **except** they must **NOT** receive the `_gymflow_welcome_member` template automatically or manually through the import workflow.

Imported members should immediately become eligible for all future automated WhatsApp notifications and reminders based on their membership data.

---

# Expected Behaviour

After importing:

Excel/CSV
        │
        ▼
Validate Data
        │
        ▼
Normalize Data
        │
        ▼
Insert into members table
        │
        ▼
Import Complete
        │
        ▼
Member participates in all future automations

No welcome message should ever be queued during or immediately after import.

---

# Import Rules

Imported members must be stored in the normal `members` table.

Do not create a separate table for imported members.

The import process should populate all required fields, including:

- member_id
- full_name
- phone_number
- membership_plan
- join_date
- expiry_date
- birthday
- gym_id
- member_status

---

# Phone Number Validation

During import:

- Validate every phone number.
- Convert numbers into E.164 format.
- Mark invalid numbers as `INVALID_NUMBER`.
- Only members with valid numbers should receive future WhatsApp notifications.

Example:

```
9876543210

↓

919876543210
```

---

# No Welcome Message

This is a strict rule.

Do NOT send `_gymflow_welcome_member` after importing members.

Reason:

Imported members are existing gym members, not newly registered members.

Sending a welcome message after import would create confusion.

Even if the import contains 500 members:

```
Imported Successfully

500 Members
```

No welcome messages should be created.

No queue entries should be generated.

---

# Future Automations

Imported members must automatically receive future scheduled notifications whenever they become eligible.

Supported templates:

- membership_expiry_reminder
- membership_expired
- membership_renewed
- payment_due_reminder
- _birthday_wishes

These templates should work exactly as they do for manually created members.

No special logic should exist for imported members.

---

# Automation Examples

## Membership Expiry Reminder

If

Days Remaining <= configured reminder days

↓

Send

membership_expiry_reminder

---

## Membership Expired

If

Expiry Date < Today

↓

Send

membership_expired

---

## Birthday

If

Birthday == Today

↓

Send

_birthday_wishes

---

## Payment Due

If

Outstanding Amount > 0

↓

Follow the existing reminder schedule.

---

## Membership Renewed

When the gym owner renews an imported member's membership inside GymFlow,

↓

Send

membership_renewed

This should behave exactly like a manually added member.

---

# Manual WhatsApp Messaging

Imported members should appear in the normal Members list.

The gym owner can manually select them and send supported notification templates if required.

However, `_gymflow_welcome_member` should not be available for imported members.

---

# Template Validation

Before every WhatsApp send:

- Verify template exists.
- Verify template is approved.
- Verify variable count.
- Verify variable order.
- Verify required header image.
- Verify all variables are populated.
- Verify phone number is valid.

If validation fails:

- Do not send the message.
- Log the reason.

---

# Architecture Rules

- Imported members must use the same `members` table.
- Do not create separate messaging logic for imported members.
- Reuse the existing WhatsApp queue and outbox system.
- Never send WhatsApp messages directly from the frontend.
- All automated notifications must go through the existing queue.
- Imported members become part of the normal notification system immediately after import.
- Never queue or send `_gymflow_welcome_member` as part of the import process.
- `_gymflow_welcome_member` should only be sent when a brand-new member is created directly inside GymFlow.