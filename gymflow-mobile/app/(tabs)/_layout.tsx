import { Tabs, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { clearToken } from '@/lib/auth';

function LogoutButton() {
  async function handleLogout() {
    await clearToken();
    router.replace('/login');
  }

  return (
    <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
      <Feather name="log-out" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: Colors.bgCard,
          borderTopColor: Colors.bgCardBorder,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: Colors.indigo,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: Colors.bg,
          shadowColor: 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: Colors.bgCardBorder,
        } as any,
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
        },
        headerRight: () => <LogoutButton />,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Feather name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gyms"
        options={{
          title: 'Gyms',
          tabBarLabel: 'Gyms',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Feather name="activity" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Support',
          tabBarLabel: 'Support',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Feather name="headphones" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="logs"
        options={{
          title: 'Event Logs',
          tabBarLabel: 'Logs',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Feather name="file-text" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
