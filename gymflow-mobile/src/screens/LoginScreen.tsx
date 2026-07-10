import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { saveToken } from '@/lib/auth';
import { ADMIN_API_BASE } from '@/lib/api';
import { AdminInput } from '@/components/AdminInput';
import { AdminButton } from '@/components/AdminButton';
import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = {
  onLoginSuccess: () => void;
};

export default function LoginScreen({ onLoginSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!password.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Invalid password');
      }

      await saveToken(password);
      onLoginSuccess();
    } catch (e: any) {
      Alert.alert('Login Failed', e.message ?? 'Invalid admin password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / Header */}
        <View style={styles.logoArea}>
          <View style={styles.logoBox}>
            <Feather name="activity" size={32} color={Colors.indigo} />
          </View>
          <Text style={styles.title}>GymFlow Admin</Text>
          <Text style={styles.subtitle}>Super Admin Panel</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.lockIcon}>
              <Feather name="lock" size={18} color={Colors.indigo} />
            </View>
            <View>
              <Text style={styles.cardTitle}>Admin Access</Text>
              <Text style={styles.cardSub}>Enter your admin panel password</Text>
            </View>
          </View>

          <View style={styles.form}>
            <View>
              <Text style={styles.inputLabel}>Admin Password</Text>
              <View style={styles.inputWrapper}>
                <AdminInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter admin password..."
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  style={styles.passwordInput}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(v => !v)}
                >
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={16}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <AdminButton
              label="Sign In to Admin Panel"
              onPress={handleLogin}
              loading={loading}
              disabled={!password.trim()}
            />
          </View>
        </View>

        {/* Security Note */}
        <View style={styles.secNote}>
          <Feather name="shield" size={12} color={Colors.textMuted} />
          <Text style={styles.secNoteText}>
            Restricted access. All actions are logged.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.xxl,
  },
  logoArea: { alignItems: 'center', gap: Spacing.sm },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Colors.indigoBg,
    borderWidth: 1,
    borderColor: Colors.indigoBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 14, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    padding: Spacing.xxl,
    gap: Spacing.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgCardBorder,
  },
  lockIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.indigoBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  cardSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  form: { gap: Spacing.lg },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: Spacing.xs,
  },
  inputWrapper: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: 'absolute',
    right: Spacing.lg,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  secNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  secNoteText: { fontSize: 11, color: Colors.textMuted },
});
