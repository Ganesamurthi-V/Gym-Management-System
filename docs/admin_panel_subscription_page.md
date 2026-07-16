# GymFlow Admin Mobile App - Manage Subscription Screen

## Overview

Redesign the **Manage Subscription** screen in the GymFlow Admin Mobile App into a professional, information-rich subscription management dashboard.

The goal is to allow administrators to perform **all subscription-related tasks from a single screen** without navigating to multiple pages.

Maintain the existing **GymFlow dark theme**, rounded cards, modern spacing, and Material Design 3 principles.

---

# Objectives

- Minimize navigation
- Reduce manual work
- Display all important subscription information
- Allow quick subscription management
- Provide complete subscription history
- Improve admin productivity

---

# Screen Layout

```
App Bar
│
├── Gym Information
│
├── Subscription Status
│
├── Trial Information (Only during trial)
│
├── Quick Subscription Actions
│
├── Subscription Dates
│
├── Payment Information
│
├── Pending Renewal Request
│
├── Usage Statistics
│
├── Activity Timeline
│
├── Admin Notes
│
├── Internal Flags
│
├── Renewal History
│
├── Security Information
│
├── Danger Zone
│
└── Sticky Save Button
```

---

# 1. Gym Information Card

Display:

- Gym Logo
- Gym Name
- Owner Name
- Gym ID
- Phone Number
- Registered Email
- Created Date

Example

```
🏋️ Test Fitness

Owner
Ganesh V

Gym ID
GF-1023

Phone
+91 9876543210

Email
owner@test.com

Joined
12 Jan 2026
```

Read Only.

---

# 2. Subscription Status Card

Display

- Current Status
- Current Plan
- Started Date
- Expiry Date
- Remaining Days

Example

```
🟢 Active

Monthly Plan

Started
15 Jul 2026

Expires
15 Aug 2026

28 Days Remaining
```

Status Colors

- 🟢 Active
- 🟡 Trial
- 🔴 Expired

---

# 3. Trial Information Card

Visible only if

```
subscription_status == trial
```

Display

- Trial Started
- Trial Ends
- Remaining Days

Buttons

- +3 Days
- +7 Days
- +14 Days
- Custom

Updating trial should immediately recalculate the expiry date.

---

# 4. Quick Subscription Actions

Display large action buttons.

Buttons

- Activate Monthly
- Activate Yearly
- Activate Lifetime
- Extend Trial
- Expire Now
- Deactivate
- Reset Trial

Every action must show a confirmation dialog.

Example

```
Activate Monthly Subscription?

This will activate a Monthly subscription
starting today.

Cancel

Confirm
```

---

# 5. Subscription Dates

Instead of editable text fields, use date cards.

Display

```
Subscription Started

15 Jul 2026

[ Change ]
```

```
Subscription Ends

15 Aug 2026

[ Change ]
```

Use Date Picker.

---

# 6. Payment Information

Display

- Last Payment Amount
- Payment Method
- Transaction ID
- Payment Date
- Payment Status

If screenshot exists

Show

```
View Screenshot
```

Open fullscreen preview.

---

# 7. Pending Renewal Request

If payment proof exists

Display

```
Pending Verification

Submitted
Today

11:20 AM

Transaction ID

XXXXXXXXXX
```

Buttons

- Approve
- Reject

Reject should require entering a rejection reason.

Approving should immediately activate the selected subscription.

---

# 8. Customer Usage Statistics

Display

- Total Members
- Today's Attendance
- Total Attendance
- Payments Recorded
- Total Revenue
- WhatsApp Messages Sent
- Reports Generated
- Storage Used

Example

```
Members
245

Revenue
₹3,24,000

Attendance
18,942

WhatsApp
2,483 Messages
```

---

# 9. Activity Timeline

Display complete subscription history.

Example

```
Today

Activated Monthly Plan

────────────────

Yesterday

Payment Screenshot Uploaded

────────────────

15 Jul

Trial Expired

────────────────

1 Jul

Trial Started

────────────────

28 Jun

Gym Registered
```

Each item should contain

- Date
- Time
- Action
- Admin/User

Newest first.

---

# 10. Admin Notes

Allow admins to save notes.

Example

```
Customer requested
7-day extension.

Will renew next week.

VIP customer.
```

Buttons

- Edit
- Save

---

# 11. Internal Flags

Display switches.

- VIP Customer
- Payment Verified
- WhatsApp Enabled
- Priority Support
- Auto Renewal Eligible
- Lifetime Offer

Admin Only.

---

# 12. Renewal History

Display previous subscriptions.

Example

```
Trial

1 Jul
↓

15 Jul

Expired

────────────────

Monthly

16 Jul
↓

16 Aug

Completed

────────────────

Yearly

17 Aug

Active
```

Newest first.

---

# 13. Security Information

Display

- Registered Email
- Last Login
- Last Active
- Registered Devices
- Mobile App Version

Read Only.

---

# 14. Danger Zone

Place at the bottom.

Red Card.

Buttons

- Delete Gym
- Disable Login
- Reset Trial
- Clear Subscription
- Ban Account

Every action requires confirmation.

---

# 15. Floating Action Button

Display FAB.

Menu

- Activate Monthly
- Approve Payment
- Extend Trial
- Call Customer
- WhatsApp Customer

---

# 16. Sticky Bottom Bar

Replace the normal Save button.

Display only when changes exist.

Buttons

```
Cancel

Save Changes
```

Always visible while editing.

---

# UI Improvements

Use

- Rounded Cards
- Better spacing
- Material Design 3
- Consistent shadows
- Color-coded badges
- Section dividers
- Proper typography hierarchy
- Icons for every section

Use chips for

- Trial
- Monthly
- Yearly
- Lifetime

Display remaining days as colorful badges.

Examples

- 🟢 28 Days Left
- 🟡 5 Days Left
- 🔴 Expired

---

# Backend Requirements

Create APIs for

- Get Subscription
- Update Subscription
- Activate Monthly
- Activate Yearly
- Activate Lifetime
- Extend Trial
- Expire Subscription
- Reset Trial
- Approve Payment
- Reject Payment
- Save Notes
- Get Usage Statistics
- Get Timeline
- Get Renewal History
- Delete Gym
- Disable Login

All endpoints must

- Require authentication
- Verify admin permissions
- Record audit logs

---

# Audit Log

Every subscription action must generate a history record.

Store

- Gym ID
- Previous Status
- New Status
- Previous Plan
- New Plan
- Previous Expiry
- New Expiry
- Action
- Performed By
- Timestamp
- Notes

Example

```
2026-07-16

Admin

Ganesh

Activated Monthly Subscription

Previous

Trial

Current

Monthly

Expiry

16 Aug 2026
```

---

# Performance

- Load everything in one request where possible.
- Lazy-load activity history.
- Show skeleton loaders.
- Display proper empty states.
- Cache non-changing data.

---

# Final Goal

The administrator should be able to:

- View complete subscription details.
- Manage trial and paid plans.
- Approve or reject payment proofs.
- Extend subscriptions.
- View payment information.
- Monitor customer usage.
- Read and write internal notes.
- Review the full subscription timeline.
- Perform all subscription-related operations from a single screen with minimal navigation.