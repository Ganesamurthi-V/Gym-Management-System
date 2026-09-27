// Must be first: installs URL + TextEncoder/TextDecoder globals before any module
// (App -> Supabase realtime) is evaluated. See polyfills.js for why.
import './polyfills';

import {AppRegistry} from 'react-native';
import {getApp} from '@react-native-firebase/app';
import {getMessaging, setBackgroundMessageHandler} from '@react-native-firebase/messaging';
import App from './src/App';
import {name as appName} from './app.json';

// Background/quit message handler. Must be registered at the top level (headless)
// so FCM can wake the app to process data messages when it is not running.
// FCM itself renders the system notification for "notification" messages via the
// default channel declared in AndroidManifest; this handler just needs to exist.
// Modular API (v22) — the namespaced messaging() form is deprecated.
setBackgroundMessageHandler(getMessaging(getApp()), async () => {
  // No extra work needed: the notification is displayed by the OS. Kept here so
  // FCM has a registered handler and to host any future background data sync.
});

AppRegistry.registerComponent(appName, () => App);
