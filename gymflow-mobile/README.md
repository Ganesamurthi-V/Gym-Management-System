# GymFlow Admin — Mobile App

React Native 0.75 app (plain Metro, no Expo) for the GymFlow super-admin panel.

## Stack

| Layer | Package |
|---|---|
| Navigation | `@react-navigation/native` + native-stack + bottom-tabs |
| Icons | `react-native-vector-icons/Feather` |
| Storage | `@react-native-async-storage/async-storage` |
| Safe area | `react-native-safe-area-context` |
| Bundler | Metro (`@react-native/metro-config`) |

## Project layout

```
gymflow-mobile/
├── index.js                  # Entry point — AppRegistry
├── app.json                  # RN app name config
├── babel.config.js           # @react-native/babel-preset + module-resolver
├── metro.config.js           # @react-native/metro-config
├── tsconfig.json             # @react-native/typescript-config + paths
│
├── src/
│   ├── App.tsx               # Root component — auth gate + navigator
│   ├── navigation/
│   │   └── types.ts          # RootStackParamList, TabParamList
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── GymDetailScreen.tsx
│       └── tabs/
│           ├── DashboardScreen.tsx
│           ├── GymsScreen.tsx
│           ├── LogsScreen.tsx
│           └── SupportScreen.tsx
│
├── components/
│   ├── AdminButton.tsx
│   ├── AdminInput.tsx
│   ├── Badge.tsx
│   ├── GymRow.tsx
│   ├── LogRow.tsx
│   ├── StatCard.tsx
│   └── TicketCard.tsx
│
├── constants/
│   └── theme.ts              # Colors, Fonts, Spacing, Radius
│
└── lib/
    ├── api.ts                # All API calls (fetchGyms, fetchTickets, etc.)
    └── auth.ts               # AsyncStorage token helpers
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. iOS — link vector icons

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

### 3. Android — link vector icons

In `android/app/build.gradle` add:

```gradle
apply from: "../../node_modules/react-native-vector-icons/fonts.gradle"
```

### 4. Configure API URL

Edit `lib/api.ts`:

```ts
// Local dev (same Wi-Fi network):
export const ADMIN_API_BASE = 'http://192.168.x.x:3001';

// Production:
export const ADMIN_API_BASE = 'https://your-gymflow-admin.vercel.app';
```

### 5. Run

```bash
# iOS
npm run ios

# Android
npm run android
```

## Auth flow

The app uses a single admin password stored as a Bearer token in AsyncStorage.
`LoginScreen` POSTs to `/api/auth`, and on success stores the password as the token
(matching the backend's `verifyRequestAuth` check).

## Notes

- **No Expo dependencies** — the old `app/` folder (Expo Router) has been removed.
  All screens live under `src/screens/`.
- Path alias `@/` maps to the project root (configured in babel + tsconfig).
- `react-native-vector-icons` replaces `@expo/vector-icons`.
- `StatusBar` is imported from `react-native` (not `expo-status-bar`).
- Navigation uses `@react-navigation` native-stack (not `expo-router`).
