# GymFlow Admin: mobile app

The admin app for the GymFlow super-admin panel. It is a bare React Native app (plain Metro, **no
Expo**). It talks to the [`gymflow-admin`](../gymflow-admin) backend and shows lock-screen push
notifications through Firebase Cloud Messaging (FCM).

Release builds are Android only, for `arm64-v8a`. There is no `ios/` folder in this repo (see
"iOS" below).

## What you need

- Node.js 22.11 or newer (`engines` in `package.json`).
- JDK and the Android SDK (Android Studio is the easiest way to get both), plus an emulator or a
  phone with USB debugging.
- A running `gymflow-admin` backend. See [`../gymflow-admin`](../gymflow-admin).
- A Firebase project with an Android app (for push; see step 3).
- Your Supabase project URL and anon (public) key.

## Setup

### 1. Install dependencies

```bash
cd gymflow-mobile
npm install
```

### 2. Set environment variables

Copy `.env.example` to `.env.local` in `gymflow-mobile/`. `babel.config.js` tells
`react-native-dotenv` to read that file.

| Variable | What it is |
|---|---|
| `ADMIN_API_BASE` | Where `gymflow-admin` runs, for **development builds only**. Use your computer's LAN address (for example `http://192.168.x.x:3001`), not `localhost`: on a phone or emulator, `localhost` is the device itself. |
| `SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_ANON_KEY` | Your Supabase anon (public) key. |

These values are compiled into the app, so anyone with the APK can read them. Put only public values
here. Never use a service-role key or a password.

Release builds ignore `ADMIN_API_BASE`. They use `defaultBaseUrl` in `lib/api/client.ts`, so a
leftover local address cannot ship.

**Running your own deployment?** Change these two values in the code before a release build:

- `defaultBaseUrl` in `lib/api/client.ts` (your admin panel's URL).
- The fallback Supabase URL in `lib/supabase-realtime.ts`.

After you change `.env.local`, restart Metro with a clean cache:

```bash
npx react-native start --reset-cache
```

### 3. Firebase and push notifications

1. Create a Firebase project and add an **Android app** with the package name
   `com.gymflowAdminMobile`.
2. Download `google-services.json` and put it at `android/app/google-services.json`.
3. Restrict the API key to the package name and your signing SHA-1 in Google Cloud Console.

`google-services.json` is gitignored. **Never commit it**, and never commit `GoogleService-Info.plist`,
service-account keys or signing keystores. A pre-commit hook in the repo root rejects them.

The Gradle side is already set up: the `com.google.gms.google-services` plugin, the Firebase BoM,
the `POST_NOTIFICATIONS` permission, and the `admin-alerts` default channel.

The server-side credentials (`FIREBASE_*`, `CRON_SECRET`) belong to the `gymflow-admin`
environment, not to this app. See [`../gymflow-admin`](../gymflow-admin/README.md#push-notifications).

### 4. Run on Android

```bash
npm start            # Metro bundler (react-native start)
npm run android      # build and install the debug app
```

A JS reload is not enough after you add or upgrade native modules. Do a full rebuild with
`npm run android`.

### iOS

`package.json` has an `ios` script and the code handles iOS push tokens, but this repo has no
`ios/` project. If you want to build for iOS, you need to generate the native project yourself,
link `react-native-vector-icons` (`Feather.ttf` in `Info.plist`), and upload an APNs key to
Firebase (needs a paid Apple Developer account). This path is not tested here.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start Metro |
| `npm run android` | Build and run on an Android device or emulator |
| `npm run ios` | Build and run on iOS (see the note above) |
| `npm run lint` | ESLint |

## Building a release APK

The repo has a Windows helper, `scripts/release.ps1`. It builds the signed APK with Gradle
(`assembleRelease`), verifies the signature with `apksigner`, and publishes a GitHub release.
It needs the `gh` CLI, Python, and the Android SDK build-tools.

```powershell
.\gymflow-mobile\scripts\release.ps1 -DryRun    # build and verify only, publish nothing
.\gymflow-mobile\scripts\release.ps1            # build, verify and publish
```

Signing:

- Put your release key in `%USERPROFILE%\.gradle\gradle.properties`, never in the repo:
  `GYMFLOW_RELEASE_STORE_FILE`, `GYMFLOW_RELEASE_STORE_PASSWORD`, `GYMFLOW_RELEASE_KEY_ALIAS`,
  `GYMFLOW_RELEASE_KEY_PASSWORD`.
- Use the **same key** for every release, or Android will refuse to update an installed app.
- Without that key, Gradle signs with the public debug key. The script refuses to publish in that case.
- Release builds target `arm64-v8a` only (`reactNativeArchitectures` in `android/gradle.properties`).

The script's header documents the version scheme and its other options (`-Clean`, `-Ask`, `-Notes`).

## Troubleshooting

| Problem | Fix |
|---|---|
| App cannot reach the backend in dev | `ADMIN_API_BASE` must be your computer's LAN address, and the phone must be on the same network. Restart Metro with `--reset-cache`. |
| Env change has no effect | Restart Metro with `npx react-native start --reset-cache`. |
| Build fails: `google-services.json` missing | Add the file (step 3). |
| Gradle fails with `Imported target ReactAndroid::jsi includes non-existent path` | Stale native caches. Run `release.ps1 -Clean`, or delete `android/app/.cxx` and `android/app/build`. Do not run `gradlew clean`. |
| `Property 'TextDecoder' doesn't exist` | `polyfills.js` is no longer the first import in `index.js`. |
| Device stops receiving push | Check that `onTokenRefresh` still re-registers the token, and that the server has `FIREBASE_*` set. |

## How it works

### Auth

`LoginScreen` sends the admin password once to `POST /api/auth` with `client: 'mobile'`. The server
returns a signed token that lasts 30 days. Only the token is stored (AsyncStorage). The password is
never kept on the phone. When the server rejects the token (expired, or revoked by an
`ADMIN_SESSION_VERSION` bump), the user is signed out. There is one shared password, so there is no
per-admin identity. That is why push tokens are keyed per **device**.

### Push notifications

| App state | Who shows the notification |
|---|---|
| Background | The OS, through FCM and the `admin-alerts` channel |
| Quit | The OS, through FCM (the handler is registered in `index.js`) |
| Foreground | Notifee (`onMessage` in `lib/push.ts`); FCM does not draw one |

- `initPushNotifications()` runs after sign-in. It creates the channel, asks for permission, then
  registers the FCM token with `POST /api/push/register-token`.
- Permission is requested **per platform**: Notifee on Android (the only thing that prompts for
  `POST_NOTIFICATIONS` on Android 13+), `requestPermission` on iOS.
- `onTokenRefresh` re-registers rotated tokens. Without it a device silently stops receiving push.
- Sign-out calls `unregisterPushDevice()` **before** clearing the auth token, so a signed-out phone
  stops receiving admin alerts.
- Tapping a notification opens the relevant gym, also from a cold start.

### Email inbox and composer

- **Inbox** (`InboxScreen`, `EmailRow`): coloured sender circles, bold unread, swipe right to delete.
- **Conversation** (`EmailThreadScreen`): full-width message cards, older ones folded, a Reply button.
- **Composer** (`EmailComposeScreen`): To and Subject, a formatting bar (bold, italic, underline,
  bullets, numbers, link), Preview, and attachments (up to 5 files, 3 MB each, 4 MB in total).
- Formatting is written as markers (`**bold**`, `_italic_`, `++underline++`, `[text](url)`) by
  `lib/email-markup.ts`. `gymflow-admin/lib/email-format.ts` turns the same markers into the HTML
  email. Keep the two in step.
- Attachments use the native `@react-native-documents/picker`. Rebuild the app after pulling.

## Project layout

```
gymflow-mobile/
├── index.js              # Polyfills first, then the FCM background handler, then AppRegistry
├── polyfills.js          # URL and TextEncoder/TextDecoder globals (Hermes lacks them)
├── babel.config.js       # RN preset, module-resolver (@/ alias), react-native-dotenv
├── metro.config.js
├── android/              # Native Android project (google-services.json goes in android/app/)
├── scripts/              # release.ps1 and mobile_release.py (release helpers)
├── src/
│   ├── App.tsx           # Auth gate, navigator, push init, deep links
│   ├── navigation/       # Route and tab types
│   └── screens/          # Login, gym detail, subscription, notifications, email, AWS monitor,
│                         #   announcements, and tabs/ (Dashboard, Gyms, Inbox, Logs, Support)
├── components/           # Shared UI (ui/, dashboard/, charts/, email and ticket components)
├── constants/            # Theme values
└── lib/
    ├── api/              # axios client with Bearer interceptor, plus one *.api.ts per area
    ├── auth.ts           # Token storage in AsyncStorage
    ├── cache.ts          # Stale-while-revalidate cache with AsyncStorage persistence
    ├── push.ts           # FCM permissions, token lifecycle, listeners, deep links
    ├── supabase-realtime.ts          # Anon client, broadcast hints only
    ├── use-cached-query.ts           # Cache-first screen data (focus-aware)
    └── use-realtime-invalidation.ts  # Subscribes to admin:* invalidation hints
```

Main libraries: React Native 0.88, React Navigation, axios, NativeWind (Tailwind for RN),
`@react-native-firebase/app` and `/messaging`, `@notifee/react-native`, `@supabase/supabase-js`,
`react-native-vector-icons` (Feather). The `@/` alias maps to the project root (Babel and tsconfig).

## Rules worth knowing

- **`polyfills.js` must stay the first import in `index.js`.** Hermes has no `TextEncoder` or
  `TextDecoder`, which `@supabase/realtime-js` needs. Loading it later throws
  `Property 'TextDecoder' doesn't exist` on every websocket heartbeat.
- **Use the React Native Firebase modular API** (`getMessaging(getApp())` plus standalone
  functions). The namespaced `messaging()` form is deprecated and logs a warning on every call.
- Realtime carries **no data**. `admin:*` broadcasts are payload-free hints. Each one triggers a
  debounced re-fetch through the authenticated admin API.
- Screens read through `useCachedQuery`, so navigation paints from cache instead of a spinner.
  `NotificationBell` deliberately avoids it: that hook uses `useFocusEffect`, which needs a screen
  navigation context the header does not have.

## License

[GNU AGPL v3.0](../LICENSE), the same as the rest of the repository.
