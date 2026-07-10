import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { isAuthenticated } from '@/lib/auth';
import { Colors } from '@/constants/theme';

export default function RootLayout() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const authed = await isAuthenticated();
    setChecking(false);
    if (!authed) {
      router.replace('/login');
    } else {
      router.replace('/(tabs)/dashboard');
    }
  }

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.indigo} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="gyms/[gymId]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: Colors.bg },
            headerTintColor: Colors.textPrimary,
            headerTitle: 'Gym Details',
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
    </>
  );
}
