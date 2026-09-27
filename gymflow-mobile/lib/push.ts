import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';

import { registerPushToken } from './api/notifications.api';
import { getToken } from './auth';

/**
 * Push wiring for the admin app.
 *
 * FCM delivers to the OS when the app is background/quit (the lock-screen alert
 * the user asked for). When the app is in the FOREGROUND, FCM does NOT show a
 * system notification, so we render one ourselves via notifee. Taps (from any
 * state) are funnelled into a single deep-link handler.
 */

const CHANNEL_ID = 'admin-alerts';

// The screen layer registers a handler; push tap payloads flow here. Kept as a
// module-level slot so a cold-start tap (resolved before React mounts) can be
// replayed once the handler attaches.
type DeepLinkPayload = { type?: string; gymId?: string; entityId?: string };
let deepLinkHandler: ((p: DeepLinkPayload) => void) | null = null;
let pendingDeepLink: DeepLinkPayload | null = null;

export function setNotificationDeepLinkHandler(fn: (p: DeepLinkPayload) => void) {
  deepLinkHandler = fn;
  if (pendingDeepLink) {
    fn(pendingDeepLink);
    pendingDeepLink = null;
  }
}

function dispatchDeepLink(data: Record<string, string | object> | undefined) {
  if (!data) return;
  const payload: DeepLinkPayload = {
    type: typeof data.type === 'string' ? data.type : undefined,
    gymId: typeof data.gymId === 'string' ? data.gymId : undefined,
    entityId: typeof data.entityId === 'string' ? data.entityId : undefined,
  };
  if (deepLinkHandler) deepLinkHandler(payload);
  else pendingDeepLink = payload;
}

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Admin Alerts',
    importance: AndroidImportance.HIGH,
  });
}

/**
 * Called after login. Requests permission, ensures the channel exists, gets the
 * FCM token, and registers it with the backend. Safe to call more than once.
 */
export async function initPushNotifications(): Promise<void> {
  try {
    // Only register a token if the admin is signed in (backend requires auth).
    const authToken = await getToken();
    if (!authToken) return;

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) return;

    await ensureChannel();

    // Android requires an explicit runtime prompt on 13+, handled by notifee.
    if (Platform.OS === 'android') {
      await notifee.requestPermission();
    }

    const fcmToken = await messaging().getToken();
    if (fcmToken) {
      await registerPushToken(fcmToken, Platform.OS === 'ios' ? 'ios' : 'android');
    }
  } catch (e) {
    if (__DEV__) console.warn('[push] init failed', e);
  }
}

/**
 * Foreground handlers + tap listeners. Call once at app start. Returns an
 * unsubscribe for the foreground message listener.
 */
export function attachPushListeners(): () => void {
  // Foreground: FCM won't show a notification, so display one via notifee.
  const unsubForeground = messaging().onMessage(async remoteMessage => {
    await ensureChannel();
    const title = remoteMessage.notification?.title ?? 'GymFlow';
    const body = remoteMessage.notification?.body ?? '';
    await notifee.displayNotification({
      title,
      body,
      data: (remoteMessage.data as Record<string, string>) ?? {},
      android: { channelId: CHANNEL_ID, pressAction: { id: 'default' }, smallIcon: 'ic_launcher' },
    });
  });

  // Tap on a notifee (foreground-displayed) notification.
  const unsubNotifee = notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) {
      dispatchDeepLink(detail.notification?.data as Record<string, string> | undefined);
    }
  });

  // Tap on an FCM system notification that opened the app from BACKGROUND.
  const unsubOpened = messaging().onNotificationOpenedApp(remoteMessage => {
    dispatchDeepLink(remoteMessage?.data as Record<string, string> | undefined);
  });

  // Tap that launched the app from QUIT state.
  messaging()
    .getInitialNotification()
    .then(remoteMessage => {
      if (remoteMessage) dispatchDeepLink(remoteMessage.data as Record<string, string> | undefined);
    });

  return () => {
    unsubForeground();
    unsubNotifee();
    unsubOpened();
  };
}
