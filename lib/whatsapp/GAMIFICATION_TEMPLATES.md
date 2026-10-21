# Gamification WhatsApp templates: copy for Meta

Four templates to create by hand in WhatsApp Manager (Meta Business Suite → WhatsApp Manager → Message templates → Create template). Nothing is sent for any of them until you switch it on in code; see [How to enable after approval](#how-to-enable-after-approval).

This sheet mirrors `services/whatsapp/templateSpec.ts` (`TEMPLATE_SPECS` and `GAMIFICATION_TEMPLATE_COPY`). The test `__tests__/whatsapp/gamificationTemplatesDoc.test.ts` fails if a name, category, language, body or variable list here differs from the code, so change the code first and then this file.

## Before you start

- **Name:** type each template name exactly as shown (lower case, underscores).
- **Language:** `en` (English), the same as the existing templates. Not `en_US` or `en_GB`.
- **Header:** every template uses an **Image** header, like the existing ones. When WhatsApp Manager asks for a sample, upload `public/logo_landspace.png`. The code attaches that image on every send.
- **Body:** copy the text inside the box exactly, including each `{{n}}`. Do not add line breaks, emojis or extra variables.
- **Samples:** when asked for sample values, use the Example column.
- **Category:** choose the one listed. Meta may move a template from UTILITY to MARKETING on review. That changes the price per message only; the code does not depend on the category.

## gym_streak_at_risk

- **Template name:** `gym_streak_at_risk`
- **Category:** MARKETING
- **Language:** `en`
- **Header:** Image (`public/logo_landspace.png`)
- **Footer:** none
- **Buttons:** none

Body:

```text
Hi *{{1}}*! 💪 Amazing consistency! You've checked in for *{{2}}* consecutive days at *{{3}}*.

🔥 Keep your streak alive! Head to the gym today and check in to maintain your streak. Don't let your hard-earned progress break — stay consistent and keep pushing towards your fitness goals! 🚀
```

| Position | Meaning | Example |
|----------|---------|---------|
| {{1}} | Member's first name | Arjun |
| {{2}} | Current streak, in days | 5 |
| {{3}} | Gym name | Iron Temple |

- **Sent when:** in the daily morning run, to a member whose streak is 3 days or longer and who has not checked in yet today.
- **At most:** once per day per member, and only on a day the streak still needs a check-in.
- **Sent by:** `runGamificationNudges()` in `lib/whatsapp/automation.ts` (rule in `selectNudges()`, `lib/whatsapp/gamificationNudges.ts`). Template id constant: `'gym_streak_at_risk'`.

## gym_weekly_goal_reached

- **Template name:** `gym_weekly_goal_reached`
- **Category:** MARKETING
- **Language:** `en`
- **Header:** Image (`public/logo_landspace.png`)
- **Footer:** none
- **Buttons:** none

Body:

```text
🎉 Well done, {{1}}! You've attended the gym {{2}} days 🔥 in the last 7 days and achieved your weekly goal at {{3}}!

🔥 Keep up the great work! Stay consistent, keep pushing your limits, and make every workout count. See you at the gym! 🏋️
```

| Position | Meaning | Example |
|----------|---------|---------|
| {{1}} | Member's first name | Arjun |
| {{2}} | Days attended in the last 7 days | 4 |
| {{3}} | Gym name | Iron Temple |

- **Sent when:** in the daily morning run, when the member's attended days in the last 7 days have reached the gym's weekly goal (Member App → Gamification → weekly goal, default 4) and the member was at the gym yesterday or today.
- **At most:** once per calendar week (Monday to Sunday) per member.
- **Sent by:** `runGamificationNudges()` in `lib/whatsapp/automation.ts` (rule in `selectNudges()`, `lib/whatsapp/gamificationNudges.ts`). Template id constant: `'gym_weekly_goal_reached'`.

## gym_leaderboard_rank_up

- **Template name:** `gym_leaderboard_rank_up`
- **Category:** MARKETING
- **Language:** `en`
- **Header:** Image (`public/logo_landspace.png`)
- **Footer:** none
- **Buttons:** none

Body:

```text
🏆 Congratulations, *{{1}}*! You're ranked #*{{2}}* on the *{{3}}* leaderboard at *{{4}}!*

🔥 Keep showing up, stay consistent, and keep checking in to defend your spot. Can you climb even higher? 🚀
```

| Position | Meaning | Example |
|----------|---------|---------|
| {{1}} | Member's first name | Arjun |
| {{2}} | Position on the board | 1 |
| {{3}} | Board name | last 7 days |
| {{4}} | Gym name | Iron Temple |

- **Sent when:** in the daily morning run, to the member who is alone in first place on the gym's last-7-days board. Members who chose not to appear on the leaderboard are never ranked or messaged, a tie for first place messages nobody, and the board needs at least two ranked members.
- **At most:** once per 7 days per member.
- **Sent by:** `runGamificationNudges()` in `lib/whatsapp/automation.ts` (rule in `selectNudges()`, `lib/whatsapp/gamificationNudges.ts`). Template id constant: `'gym_leaderboard_rank_up'`.

## gym_prize_awarded

- **Template name:** `gym_prize_awarded`
- **Category:** MARKETING
- **Language:** `en`
- **Header:** Image (`public/logo_landspace.png`)
- **Footer:** none
- **Buttons:** none

Body:

```text
🎉 Congratulations, *{{1}}*! You've won a prize — *{{2}}*!

🏆 This reward is for your achievements during *{{3}}* at *{{4}}*.

💪 Keep up the great work! Visit your gym and contact the staff to collect your well-deserved prize. 🎁
```

| Position | Meaning | Example |
|----------|---------|---------|
| {{1}} | Member's first name | Arjun |
| {{2}} | Prize, as the owner wrote it | Free protein shaker |
| {{3}} | What the prize is for (the period label) | Last 7 days |
| {{4}} | Gym name | Iron Temple |

- **Sent when:** immediately, when the owner marks a prize as awarded. Not part of the daily run.
- **At most:** once per member, board and period, and one prize message per member per day.
- **Sent by:** `sendPrizeAwardedMessage()` in `lib/whatsapp/automation.ts`. Template id constant: `'gym_prize_awarded'`. The owner screen does not call it yet; the function's comment shows how to call it from the "Mark prize awarded" server action.

## Rules that apply to all of them

- A member receives at most **one** of the three daily messages per day. If more than one applies, the order is: streak, then weekly goal, then leaderboard.
- Nothing is sent for a gym whose WhatsApp is switched off in the admin app (Manage Subscription → WhatsApp Enabled), or whose Leaderboards switch is off (owner console → Member App → Gamification). The prize message follows the WhatsApp switch only.
- Members without a valid phone number are skipped.
- The daily messages go through the normal send queue (15 messages every 5 minutes, shared with the reminders), so on a busy morning they can arrive some time after 9:00 AM.

## How to enable after approval

1. Create the template in WhatsApp Manager from this sheet and wait until its status is **Approved**.
2. Open `config/whatsapp.ts` and add the template name to `ENABLED_GAMIFICATION_TEMPLATES`. The list is empty by default, which is why nothing is sent today:

   ```ts
   export const ENABLED_GAMIFICATION_TEMPLATES: readonly GamificationTemplateId[] = [
     'gym_streak_at_risk',
   ]
   ```

3. Deploy. The next daily run (9:00 AM IST) starts sending it. Enable the templates one at a time as each is approved; the ones left out stay off.
4. To stop a template, remove its name from the list and deploy. Messages already waiting in the queue for it are dropped, not sent.

If Meta asks you to change the wording, change `GAMIFICATION_TEMPLATE_COPY` in `services/whatsapp/templateSpec.ts` and this file to the approved text, and keep the variables in the same order. Adding, removing or reordering a variable also needs the matching change in `TEMPLATE_SPECS` and in `buildTemplatePayload()` (`services/whatsapp/graph.ts`).
