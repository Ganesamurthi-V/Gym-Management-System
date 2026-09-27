import 'react-native-url-polyfill/auto';
import {AppRegistry} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './src/App';
import {name as appName} from './app.json';

// Background/quit message handler. Must be registered at the top level (headless)
// so FCM can wake the app to process data messages when it is not running.
// FCM itself renders the system notification for "notification" messages via the
// default channel declared in AndroidManifest; this handler just needs to exist.
messaging().setBackgroundMessageHandler(async () => {
  // No extra work needed: the notification is displayed by the OS. Kept here so
  // FCM has a registered handler and to host any future background data sync.
});

AppRegistry.registerComponent(appName, () => App);
