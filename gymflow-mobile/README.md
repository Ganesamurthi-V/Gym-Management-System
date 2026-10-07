# GymFlow Admin — Mobile App

React Native 0.75 app (plain Metro, **no Expo**) for the GymFlow super-admin panel.
Talks to the `gymflow-admin` Next.js backend and receives lock-screen push notifications
via Firebase Cloud Messaging.

## Stack

| Layer | Package |
|---|---|
| Navigation | `@react-navigation/native` + native-stack + bottom-tabs |
| HTTP | `axios` (Bearer token interceptor) |
| Push | `@react-native-firebase/app` + `/messaging`, `@notifee/react-native` |
| Realtime | `@supabase/supabase-js` (payload-free broadcast hints only) |
| Icons | `react-native-vector-icons/Feather` |
| Storage | `@react-native-async-storage/async-storage` |
| Safe area | `react-native-safe-area-context` |
| Env | `react-native-dotenv` (`@env` imports) |
| Polyfills | `react-native-url-polyfill`, `text-encoding` |
| Bundler | Metro (`@react-native/metro-config`) |

## Project layout

```
gymflow-mobile/
├── index.js                  # Polyfills FIRST, then FCM background handler, then AppRegistry
├── polyfills.js              # URL + TextEncoder/TextDecoder globals (Hermes lacks them)
├── app.json                  # RN app name config
├── babel.config.js           # @react-native/babel-preset + module-resolver + dotenv
├── metro.config.js           # @react-native/metro-config
├── tsconfig.json             # @react-native/typescript-config + paths
│
├── android/
│   └── app/
│       ├── google-services.json   # Firebase config — GITIGNORED, add manually
│       └── build.gradle           # google-services plugin + firebase-bom
│
├── src/
│   ├── App.tsx               # Auth gate, navigator, push init, deep-link routing
│   ├── navigation/
│   │   └── types.ts          # RootStackParamList, TabParamList
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── GymDetailScreen.tsx
│       ├── GymSubscriptionScreen.tsx   # Tabs + Owner Feedback card
│       ├── NotificationsScreen.tsx     # In-app notification centre
│       └── tabs/
│           ├── DashboardScreen.tsx
│           ├── GymsScreen.tsx
│           ├── LogsScreen.tsx
│           └── SupportScreen.tsx       # Tickets + feedback (star ratings)
│
├── components/
│   ├── AdminButton.tsx
│   ├── AdminInput.tsx
│   ├── Badge.tsx
│   ├── GymRow.tsx
│   ├── LogRow.tsx
│   ├── NotificationBell.tsx  # Header bell + unread badge
│   ├── StatCard.tsx
│   └── TicketCard.tsx        # Renders stars when type === 'feedback'
│
├── constants/
│   └── theme.ts              # Colors, Fonts, Spacing, Radius
│
└── lib/
    ├── api/
    │   ├── index.ts          # Barrel — re-exports every *.api module
    │   ├── client.ts         # axios instance, base URL, Bearer interceptor
    │   ├── error-handler.ts  # parseApiError
    │   ├── auth.api.ts
    │   ├── dashboard.api.ts
    │   ├── gyms.api.ts
    │   ├── logs.api.ts
    │   ├── notifications.api.ts   # List/mark-read + register/unregister push token
    │   ├── subscription.api.ts
    │   └── support.api.ts         # Tickets, feedback (fetchGymFeedback)
    ├── auth.ts               # AsyncStorage token helpers
    ├── cache.ts              # Stale-while-revalidate cache + AsyncStorage persistence
    ├── push.ts               # FCM permissions, token lifecycle, listeners, deep links
    ├── supabase-realtime.ts  # Anon client for broadcast hints only
    ├── use-cached-query.ts   # Cache-first screen data (focus-aware)
    └── use-realtime-invalidation.ts  # Subscribes to admin:* invalidation hints
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env.local` in `gymflow-mobile/` (the path configured for
`react-native-dotenv` in `babel.config.js`) and fill it in:

```bash
ADMIN_API_BASE=http://192.168.x.x:3001     # dev only; release builds force production
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
```

`lib/api/client.ts` only honours `ADMIN_API_BASE` when `__DEV__` is true — release builds
always use `https://admin.gymflow.sbs`, so a stale localhost value cannot ship.

> **Running your own deployment?** Two values in the code point at gymflow.sbs and must be
> changed for a release build: `defaultBaseUrl` in `lib/api/client.ts` (your admin panel's
> URL) and the fallback Supabase URL in `lib/supabase-realtime.ts`. These values are compiled
> into the app, so keep them public ones only: never a service-role key.

### 3. Firebase / push notifications

- Create a Firebase project and add an **Android app** with package name
  `com.gymflowAdminMobile`
- Download `google-services.json` → place at `android/app/google-services.json`
  (gitignored; restrict the API key to the package + SHA-1 in Google Cloud Console)
- iOS: add an iOS app and upload an APNs Auth Key (needs a paid Apple Developer account)

The Gradle side is already wired: the `com.google.gms.google-services` plugin, the Firebase
BoM, `POST_NOTIFICATIONS` permission, and the `admin-alerts` default channel meta-data.

Server-side credentials (`FIREBASE_*`, `CRON_SECRET`) live in the `gymflow-admin`
environment — see the root README.

### 4. iOS — link vector icons

In `ios/Podfile` add (inside the target block if not already present):

```ruby
pod 'RNVectorIcons', :path => '../node_modules/react-native-vector-icons'
```

Then:

```bash
cd ios && pod install && cd ..
```

Also add to `ios/<AppName>/Info.plist`:

```xml
<key>UIAppFonts</key>
<array>
  <string>Feather.ttf</string>
</array>
```

### 5. Android — link vector icons

Already applied in `android/app/build.gradle`:

```gradle
apply from: "../../node_modules/react-native-vector-icons/fonts.gradle"
```

### 6. Run

```bash
npm run android      # or: npm run ios
```

After adding or upgrading native modules, a JS reload is not enough — do a full rebuild,
and reset the bundler cache when polyfills or env vars change:

```bash
npx react-native start --reset-cache
```

## Auth flow

A single admin password acts as the Bearer token. `LoginScreen` POSTs it to `/api/auth`;
on success the password itself is stored in AsyncStorage as the token, matching the
backend's `verifyRequestAuth` check (`bearer === ADMIN_PANEL_SECRET`). There is no
per-admin identity, which is why push tokens are keyed per **device**.

## Push notifications

| App state | Who renders the notification |
|---|---|
| Background | Android/iOS, via FCM and the `admin-alerts` channel |
| Quit | Android/iOS, via FCM (handler registered in `index.js`) |
| Foreground | Notifee (`onMessage` in `lib/push.ts`) — FCM does not draw one |

- `initPushNotifications()` runs once the admin is signed in: creates the channel, requests
  permission, then registers the FCM token with `POST /api/push/register-token`.
- Permission is requested **per platform** — Notifee on Android (the only thing that
  actually prompts for `POST_NOTIFICATIONS` on 13+), `requestPermission` on iOS.
- `onTokenRefresh` re-registers rotated tokens; without it a device silently stops
  receiving push.
- Sign-out calls `unregisterPushDevice()` **before** clearing the auth token, so a
  signed-out phone stops receiving admin alerts.
- Tapping a notification deep-links to the relevant gym, including from a cold start
  (the handler retries until the navigator is ready and the session is confirmed).

## Email: Gmail-style inbox and composer

- **Inbox** (`InboxScreen`, `EmailRow`): coloured sender circles, bold unread, swipe right to delete.
- **Conversation** (`EmailThreadScreen`): full-width message cards, older ones folded, a Reply button.
- **Composer** (`EmailComposeScreen`): To / Subject, formatting bar (bold, italic, underline,
  bullets, numbers, link), Preview, and attachments (up to 5 files, 3 MB each, 4 MB in total).
- Formatting is written as markers (`**bold**`, `_italic_`, `++underline++`, `[text](url)`) by
  `lib/email-markup.ts`; `gymflow-admin/lib/email-format.ts` turns the same markers into the
  HTML email. Keep the two grammars in step.
- Attachments need the native `react-native-document-picker`: rebuild the app after pulling.

## Notes

- **No Expo dependencies** — all screens live under `src/screens/`.
- **`polyfills.js` must stay the first import in `index.js`.** Hermes has no
  `TextEncoder`/`TextDecoder`, which `@supabase/realtime-js` needs to encode broadcast
  frames; loading it later throws `Property 'TextDecoder' doesn't exist` on every
  websocket heartbeat.
- **Use the RN Firebase modular API** (`getMessaging(getApp())` + standalone functions).
  The namespaced `messaging()` form is deprecated in v21+ and logs a warning on every call.
- Realtime carries **no data** — `admin:*` broadcasts are payload-free hints; every event
  triggers a debounced re-fetch through the authenticated admin API.
- Screens read through `useCachedQuery` so navigation paints from cache instead of a
  spinner. `NotificationBell` deliberately avoids it: that hook uses `useFocusEffect`,
  which needs a screen navigation context the header does not have.
- Path alias `@/` maps to the project root (configured in babel + tsconfig).

## License

[GNU AGPL v3.0](../LICENSE), the same as the rest of the repository.
