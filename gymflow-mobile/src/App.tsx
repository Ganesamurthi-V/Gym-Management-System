import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { TouchableOpacity } from 'react-native';

import { Colors } from '@/constants/theme';
import { isAuthenticated, clearToken } from '@/lib/auth';
import { invalidate } from '@/lib/cache';
import {
  initPushNotifications, attachPushListeners, setNotificationDeepLinkHandler,
  unregisterPushDevice,
} from '@/lib/push';
import { NotificationBell } from '@/components/NotificationBell';

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/tabs/DashboardScreen';
import GymsScreen from './screens/tabs/GymsScreen';
import SupportScreen from './screens/tabs/SupportScreen';
import LogsScreen from './screens/tabs/LogsScreen';
import GymDetailScreen from './screens/GymDetailScreen';
import GymSubscriptionScreen from './screens/GymSubscriptionScreen';
import NotificationsScreen from './screens/NotificationsScreen';

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
      style={{ marginRight: 16, padding: 4 }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
    >
      <Feather name="log-out" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

function TabNavigator({ onLogout }: { onLogout: () => void }) {
  const insets = useSafeAreaInsets();
  return (
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
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <NotificationBell onPress={() => navigationRef.navigate('Notifications')} />
            <LogoutButton onLogout={onLogout} />
          </View>
        ),
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Gyms"
        component={GymsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Support"
        component={SupportScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="headphones" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Logs"
        component={LogsScreen}
        options={{
          title: 'Event Logs',
          tabBarLabel: 'Logs',
          tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  // Read inside the deep-link retry loop, which outlives any single render.
  const authedRef = useRef(false);
  authedRef.current = authed;

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
      const gymId = payload.gymId;
      if (!gymId) return;

      const attemptNavigate = (attempt = 0) => {
        if (navigationRef.isReady() && authedRef.current) {
          try {
            navigationRef.navigate('GymDetail', { gymId });
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
    if (authed) void initPushNotifications();
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
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <ActivityIndicator color={Colors.indigo} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
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
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
