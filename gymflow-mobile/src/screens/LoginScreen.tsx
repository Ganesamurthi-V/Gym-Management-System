import React, { useState } from 'react';
import { View, ScrollView, Pressable, StatusBar, Image } from 'react-native';
import { saveToken } from '@/lib/auth';
import { loginWithPassword } from '@/lib/api';
import { useAppTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { toast } from '@/components/dashboard/Toast';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';

type Props = {
  onLoginSuccess: () => void;
};

export default function LoginScreen({ onLoginSuccess }: Props) {
  const { scheme } = useAppTheme();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!password.trim()) return;
    setLoading(true);
    try {
      const token = await loginWithPassword(password);
      await saveToken(token);
      setPassword('');
      onLoginSuccess();
    } catch (e: any) {
      toast.show(e.message ?? 'Invalid admin password', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardSafeView className="bg-background flex-1">
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card className="gap-6">
          <CardHeader className="items-center gap-2">
            <Image
              source={require('../../assets/logo_only.png')}
              className="mb-2 size-16 rounded-full"
              resizeMode="contain"
            />
            <CardTitle className="text-xl">GymFlow Admin</CardTitle>
            <CardDescription>Enter your admin panel password</CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="gap-2">
              <Label nativeID="admin-password">Admin Password</Label>
              <View className="justify-center">
                <Input
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter admin password..."
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  aria-labelledby="admin-password"
                  className="pr-10"
                />
                <Pressable
                  className="absolute right-3"
                  onPress={() => setShowPassword(v => !v)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} className="text-muted-foreground" />
                </Pressable>
              </View>
            </View>
            <Button onPress={handleLogin} disabled={loading || !password.trim()}>
              <Text>{loading ? 'Signing in...' : 'Sign In to Admin Panel'}</Text>
            </Button>
          </CardContent>
        </Card>

        <View className="flex-row items-center justify-center gap-1">
          <Icon name="shield" size={12} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-xs">Restricted access. All actions are logged.</Text>
        </View>
      </ScrollView>
    </KeyboardSafeView>
  );
}
