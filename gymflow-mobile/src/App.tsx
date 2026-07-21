import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { TouchableOpacity } from 'react-native';

import { Colors } from '@/constants/theme';
import { isAuthenticated, clearToken } from '@/lib/auth';

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/tabs/DashboardScreen';
import GymsScreen from './screens/tabs/GymsScreen';
import SupportScreen from './screens/tabs/SupportScreen';
import LogsScreen from './screens/tabs/LogsScreen';
import GymDetailScreen from './screens/GymDetailScreen';
import GymSubscriptionScreen from './screens/GymSubscriptionScreen';

import type { RootStackParamList, TabParamList } from './navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

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
        headerRight: () => <LogoutButton onLogout={onLogout} />,
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

  useEffect(() => {
    isAuthenticated().then(result => {
      setAuthed(result);
      setChecking(false);
    });
  }, []);

  function handleLogout() {
    clearToken().then(() => setAuthed(false));
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
      <NavigationContainer>
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
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
