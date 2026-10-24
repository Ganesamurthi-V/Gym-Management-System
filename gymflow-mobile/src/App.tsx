import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { TouchableOpacity, StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import { isAuthenticated, clearToken, setSessionExpiredHandler } from '@/lib/auth';
import { invalidate } from '@/lib/cache';
import {
  initPushNotifications, attachPushListeners, setNotificationDeepLinkHandler,
  unregisterPushDevice,
} from '@/lib/push';
import { NotificationBell } from '@/components/NotificationBell';
import { EmailRealtime, useOpenEmailThreads } from '@/lib/email-sync';

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/tabs/DashboardScreen';
import GymsScreen from './screens/tabs/GymsScreen';
import SupportScreen from './screens/tabs/SupportScreen';
import InboxScreen from './screens/tabs/InboxScreen';
import LogsScreen from './screens/tabs/LogsScreen';
import GymDetailScreen from './screens/GymDetailScreen';
import GymSubscriptionScreen from './screens/GymSubscriptionScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import AnnouncementScreen from './screens/AnnouncementScreen';
import EmailThreadScreen from './screens/EmailThreadScreen';
import EmailComposeScreen from './screens/EmailComposeScreen';

import type { RootStackParamList, TabParamList } from './navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Navigation ref so push-tap deep links can navigate from outside the tree.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function LogoutButton({ onLogout }: { onLogout: () => void }) {
  function confirmLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: onLogout },
    ]);
  }
  return (
    <TouchableOpacity
      onPress={confirmLogout}
      style={styles.logoutBtn}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
    >
      <Feather name="log-out" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  logoutBtn: { marginRight: 16, padding: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  splash: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
});

// Built outside TabNavigator so the icon/header components are not defined during render.
const tabIcon = (name: string) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Feather name={name} size={size} color={color} />;
  };

const makeHeaderRight = (onLogout: () => void) =>
  function HeaderRight() {
    return (
      <View style={styles.headerRight}>
        <NotificationBell onPress={() => navigationRef.navigate('Notifications')} />
        <LogoutButton onLogout={onLogout} />
      </View>
    );
  };

function TabNavigator({ onLogout }: { onLogout: () => void }) {
  const insets = useSafeAreaInsets();
  // Unread mail across the open inbox, for the tab badge. Shares its cache with the
  // Inbox screen, so this costs no extra request.
  const unreadMail = useOpenEmailThreads().data?.unreadTotal ?? 0;
  return (
    <>
    {/* The single realtime subscription for the inbox; see lib/email-sync.ts. */}
    <EmailRealtime />
    <Tab.Navigator
      screenOptions={{
        // Blurred tabs stop re-rendering instead of reconciling in the background
        // on every state change elsewhere in the app. react-native-screens is
        // already a dependency, so this costs nothing to switch on.
        freezeOnBlur: true,
        tabBarStyle: {
          backgroundColor: Colors.bgCard,
          borderTopColor: Colors.bgCardBorder,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarActiveTintColor: Colors.indigo,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerStyle: {
          backgroundColor: Colors.bg,
        },
        headerShadowVisible: false,
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerRight: makeHeaderRight(onLogout),
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: tabIcon('grid'),
        }}
      />
      <Tab.Screen
        name="Gyms"
        component={GymsScreen}
        options={{
          tabBarIcon: tabIcon('activity'),
        }}
      />
      <Tab.Screen
        name="Support"
        component={SupportScreen}
        options={{
          tabBarIcon: tabIcon('headphones'),
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          tabBarBadge: unreadMail > 0 ? (unreadMail > 99 ? '99+' : unreadMail) : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.indigo, color: '#fff', fontSize: 10 },
          tabBarIcon: tabIcon('mail'),
        }}
      />
      <Tab.Screen
        name="Logs"
        component={LogsScreen}
        options={{
          title: 'Event Logs',
          tabBarLabel: 'Logs',
          tabBarIcon: tabIcon('file-text'),
        }}
      />
    </Tab.Navigator>
    </>
  );
}

export default function App() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  // Read inside the deep-link retry loop, which outlives any single render.
  const authedRef = useRef(false);
  authedRef.current = authed;

  useEffect(() => {
    setSessionExpiredHandler(() => {
      invalidate();
      setAuthed(false);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    isAuthenticated().then(result => {
      setAuthed(result);
      setChecking(false);
    });
  }, []);

  /*
    Push: attach OS listeners once and route a notification tap to the gym it
    refers to.

    A tap that cold-starts the app resolves through getInitialNotification while
    React is still mounting, so the navigator is not ready and the auth check has
    not finished. Navigating immediately silently dropped those taps — the app just
    opened on the dashboard. So retry briefly until navigation is ready AND the
    session is confirmed, then give up rather than hanging on to it forever.
  */
  useEffect(() => {
    setNotificationDeepLinkHandler(payload => {
      const { type, gymId, entityId } = payload;

      /*
        Route by notification type so a tap lands on the screen that actually
        answers it, instead of always dumping the admin on GymDetail:

          ticket / feedback  → Support tab (where tickets & feedback are triaged)
          email              → the conversation itself (EmailThread)
          payment_request    → GymSubscription (approve/reject the payment) for the gym
          new_gym            → GymDetail for the new gym
          anything else      → GymDetail if we have a gym, otherwise the
                               Notifications centre so the tap is never a dead end.

        entity_id is carried in the payload for future per-row targeting, but the
        current screens open at the gym/list level, which is enough to act on.
      */
      const navigate = () => {
        switch (type) {
          case 'ticket':
          case 'feedback':
            navigationRef.navigate('Main', { screen: 'Support' });
            return;
          case 'email':
            // entityId is the thread id, so the tap opens that conversation directly.
            if (entityId) { navigationRef.navigate('EmailThread', { threadId: entityId }); return; }
            navigationRef.navigate('Main', { screen: 'Inbox' });
            return;
          case 'payment_request':
            if (gymId) { navigationRef.navigate('GymSubscription', { gymId }); return; }
            break;
          case 'new_gym':
            if (gymId) { navigationRef.navigate('GymDetail', { gymId }); return; }
            break;
          case 'alert':
            // Failure alerts have no screen to open; the tap just opens the app.
            return;
          default:
            if (gymId) { navigationRef.navigate('GymDetail', { gymId }); return; }
        }
        // No gym to open (or unknown type without one): fall back to the feed.
        navigationRef.navigate('Notifications');
      };

      const attemptNavigate = (attempt = 0) => {
        if (navigationRef.isReady() && authedRef.current) {
          try {
            navigate();
          } catch (e) {
            if (__DEV__) console.warn('[push] deep link navigation failed', e);
          }
          return;
        }
        // ~10s of grace: covers a cold start on a slow device, then stops.
        if (attempt < 40) setTimeout(() => attemptNavigate(attempt + 1), 250);
      };

      attemptNavigate();
    });

    return attachPushListeners();
  }, []);

  // Register this device's FCM token whenever the admin is signed in.
  useEffect(() => {
    if (authed) initPushNotifications();
  }, [authed]);

  async function handleLogout() {
    /*
      Unregister the device BEFORE the auth token goes away — the endpoint is
      authenticated. Skipping this left the phone in device_push_tokens, so a
      signed-out device kept receiving admin alerts with no way to revoke them.
    */
    await unregisterPushDevice();

    // Clear cached API data alongside the token. It is persisted to AsyncStorage,
    // so without this the next person to sign in on this device would briefly see
    // the previous admin's gym list and dashboard figures from disk.
    invalidate();
    await clearToken();
    setAuthed(false);
  }

  function handleLoginSuccess() {
    setAuthed(true);
  }

  if (checking) {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={Colors.indigo} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!authed ? (
            <Stack.Screen name="Login">
              {props => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen name="Main">
                {() => <TabNavigator onLogout={handleLogout} />}
              </Stack.Screen>
              <Stack.Screen
                name="GymDetail"
                component={GymDetailScreen}
                options={{
                  headerShown: true,
                  headerStyle: { backgroundColor: Colors.bg },
                  headerTintColor: Colors.textPrimary,
                  headerTitle: 'Gym Details',
                  headerBackTitle: 'Back',
                  headerShadowVisible: false,
                }}
              />
              <Stack.Screen
                name="GymSubscription"
                component={GymSubscriptionScreen}
                options={{
                  headerShown: true,
                  headerStyle: { backgroundColor: Colors.bg },
                  headerTintColor: Colors.textPrimary,
                  headerTitle: 'Manage Subscription',
                  headerBackTitle: 'Back',
                  headerShadowVisible: false,
                }}
              />
              <Stack.Screen
                name="EmailThread"
                component={EmailThreadScreen}
                options={{
                  headerShown: true,
                  headerStyle: { backgroundColor: Colors.bg },
                  headerTintColor: Colors.textPrimary,
                  headerTitle: 'Conversation',
                  headerBackTitle: 'Back',
                  headerShadowVisible: false,
                }}
              />
              <Stack.Screen
                name="EmailCompose"
                component={EmailComposeScreen}
                options={{
                  headerShown: true,
                  headerStyle: { backgroundColor: Colors.bg },
                  headerTintColor: Colors.textPrimary,
                  headerTitle: 'Reply',
                  headerBackTitle: 'Back',
                  headerShadowVisible: false,
                  // A sheet, as in Gmail: slides up over the conversation it answers.
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{
                  headerShown: true,
                  headerStyle: { backgroundColor: Colors.bg },
                  headerTintColor: Colors.textPrimary,
                  headerTitle: 'Notifications',
                  headerBackTitle: 'Back',
                  headerShadowVisible: false,
                }}
              />
              <Stack.Screen
                name="Announcements"
                component={AnnouncementScreen}
                options={{
                  headerShown: true,
                  headerStyle: { backgroundColor: Colors.bg },
                  headerTintColor: Colors.textPrimary,
                  headerTitle: 'Site-wide banner',
                  headerBackTitle: 'Back',
                  headerShadowVisible: false,
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
