# Feature: WhatsApp Messaging for Imported Members

## Objective

Implement a robust WhatsApp messaging workflow for members imported via Excel/CSV so they behave exactly like members created manually. Once imported, there should be **no distinction** between imported and manually created members for messaging, reminders, renewals, or automation.

---

# Current Problem

Currently, members imported from Excel are simply inserted into the database. However, the application does not provide a proper workflow for sending WhatsApp template messages to these imported members.

The goal is to allow gym owners to safely send WhatsApp messages after importing members while preventing accidental spam.

---

# Expected Workflow

```
Import Excel/CSV
        │
        ▼
Validate Data
        │
        ▼
Normalize Data
        │
        ▼
Insert Members
        │
        ▼
Import Completed
        │
        ▼
Show Import Summary
        │
        ▼
Gym Owner chooses:
    • Send Welcome Messages
    • Skip
```

---

# Step 1 — Import Members

The import process should continue working as it does today.

Each imported member should be inserted into the normal members table.

There should never be a separate "Imported Members" table.

Example:

```
members
-------
id
member_id
full_name
phone_number
membership_plan
join_date
expiry_date
gym_id
status
...
```

After insertion, imported members should behave exactly like manually created members.

---

# Step 2 — Phone Number Validation

During import:

Validate every phone number.

Convert all numbers into E.164 format.

Example

```
9876543210

↓

919876543210
```

If invalid:

```
whatsapp_status = INVALID_NUMBER
```

Otherwise

```
whatsapp_status = ACTIVE
```

Never attempt to send messages to invalid numbers.

---

# Step 3 — Import Summary Screen

After import completes, display a detailed summary.

Example:

----------------------------------------

Import Successful

✔ Total Rows : 450

✔ Imported : 432

⚠ Duplicate Members : 8

❌ Invalid Phone Numbers : 10

----------------------------------------

WhatsApp

Send Welcome Message to imported members?

( ) Yes

( ) No

----------------------------------------

If the user chooses "No"

Import finishes.

No WhatsApp messages are sent.

---

# Step 4 — Send Welcome Messages

If the gym owner selects

```
Send Welcome Messages
```

The system should NOT send all messages immediately.

Instead,

Create one WhatsApp job for each eligible member.

Example

```
Member 1
↓

Queue

Member 2
↓

Queue

Member 3
↓

Queue
```

The existing WhatsApp queue/outbox system should process them one by one.

Never send hundreds of requests simultaneously.

---

# Step 5 — Eligible Members

Only members meeting ALL conditions should receive messages.

Required conditions:

• Active membership

• Valid phone number

• whatsapp_status = ACTIVE

• Not already sent

• Not opted out

---

# Step 6 — Prevent Duplicate Messages

If welcome message already sent

Do NOT send again.

Maintain a log.

Example

```
member_notifications

id

member_id

template_name

sent_at

status
```

Before sending

Check

```
Does

member_id

+

_gymflow_welcome_member

already exist?

YES

↓

Skip
```

---

# Step 7 — Bulk Messaging Screen

Create a new page.

Title

```
Imported Members
```

Display

```
☑ Select All

☑ Ravi

☑ Kumar

☑ Priya

☐ Arun

☑ Mano

...
```

Right side

```
Template

▼

_gymflow_welcome_member
```

Below

```
Selected

327 Members
```

Buttons

```
Preview

Send

Cancel
```

---

# Step 8 — Message Preview

Before sending,

show a preview.

Example

```
Header Image

Hi Ganesh!

Your membership has been successfully activated.

Member ID

GF001

Membership Plan

Premium

Start Date

26/07/2026

Powered by Gym Flow
```

The preview should use actual member data.

---

# Step 9 — Queue Processing

The sender should never call WhatsApp directly from the UI.

Instead

```
User clicks Send

↓

Insert jobs into Outbox

↓

Background Worker

↓

Validate

↓

Send Template

↓

Save Response

↓

Update Status
```

Reuse the existing outbox publisher and recovery jobs.

---

# Step 10 — Failed Messages

If WhatsApp returns an error

Store

```
FAILED

Reason

Retry Count

Meta Error Code
```

Example

```
132012

Template mismatch
```

Allow retry.

---

# Step 11 — Future Automation

After import,

the member should automatically participate in all scheduled automations.

No extra code should be written specifically for imported members.

Imported members should receive:

• membership_expiry_reminder

• membership_expired

• payment_due_reminder

• _birthday_wishes

• membership_renewed

Exactly the same as manually added members.

---

# Step 12 — Manual Bulk Messaging

Add another page

```
Members

↓

Bulk Actions

↓

Send WhatsApp
```

The owner can

Filter

```
Membership Plan

Expiry Soon

Birthday Today

Payment Due

Imported This Week

Custom Selection
```

Choose Template

```
membership_renewed

membership_expiry_reminder

payment_due_reminder

membership_expired

_birthday_wishes

_gymflow_welcome_member
```

The system should automatically validate that the selected template receives the correct variables.

---

# Step 13 — Template Validation

Before every send:

Verify:

✅ Template exists

✅ Approved

✅ Variable count matches

✅ Variable order matches

✅ Header image included

✅ Body variables populated

✅ Phone number valid

If validation fails,

Do not send.

Log the error.

---

# Step 14 — Activity Logs

Maintain complete logs.

Example

```
26 Jul

Imported

432 Members

26 Jul

Queued

432 Welcome Messages

26 Jul

Sent

428

26 Jul

Failed

4

Reason

Invalid Number
```

---

# Step 15 — User Experience

The owner should always know:

• How many members were imported

• How many are eligible for WhatsApp

• How many were queued

• How many were delivered

• How many failed

• Why they failed

Display progress while sending.

Example

```
Sending Messages...

██████████░░░░░

258 / 432

60%
```

---

# Architecture Rules

- Never create separate logic for imported members.
- Imported members must use the same members table.
- Reuse the existing WhatsApp queue and outbox system.
- Never send messages synchronously from the frontend.
- Always queue messages.
- Always validate template names and variables before sending.
- Prevent duplicate template sends unless explicitly allowed.
- Keep all message history for auditing and retries.