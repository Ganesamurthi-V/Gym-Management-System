import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchGymDetail, toggleGymStatus, resetGymPassword } from '@/lib/api';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import { Badge } from '@/components/Badge';
import { AdminButton } from '@/components/AdminButton';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GymDetail'>;
type GymDetail = Awaited<ReturnType<typeof fetchGymDetail>>;

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon as any} size={14} color={Colors.textMuted} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function GymDetailScreen({ route, navigation }: Props) {
  const { gymId } = route.params;
  const [detail, setDetail] = useState<GymDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const data = await fetchGymDetail(gymId);
      setDetail(data);
      setIsActive(data.gym.is_active);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load gym');
    } finally {
      setLoading(false);
    }
  }, [gymId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  useRealtimeInvalidation({
    channelName: 'admin:gyms',
    onInvalidate: loadDetail,
  });

  async function handleToggleStatus(value: boolean) {
    setTogglingStatus(true);
    setIsActive(value);
    try {
      await toggleGymStatus(gymId, value);
    } catch (e: any) {
      setIsActive(!value);
      Alert.alert('Error', e.message ?? 'Failed to update status');
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handlePasswordReset() {
    if (newPassword.length < 8) {
      Alert.alert('Validation', 'Password must be at least 8 characters');
      return;
    }
    Alert.alert(
      'Reset Password',
      `Reset password for ${detail?.gym.name}? This will immediately invalidate the current password.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResettingPassword(true);
            try {
              await resetGymPassword(detail!.gym.owner_id, newPassword);
              Alert.alert('✓ Done', 'Password reset successfully');
              setNewPassword('');
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to reset password');
            } finally {
              setResettingPassword(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.indigo} size="large" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-circle" size={32} color={Colors.red} />
        <Text style={styles.notFoundText}>Gym not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { gym, owner } = detail;
  const created = new Date(gym.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Gym Header */}
      <View style={styles.gymHeader}>
        <View style={styles.gymIconBox}>
          <Feather name="activity" size={24} color={Colors.indigo} />
        </View>
        <View style={styles.gymHeaderInfo}>
          <Text style={styles.gymName}>{gym.name}</Text>
          <Text style={styles.gymRegistered}>Registered {created}</Text>
        </View>
        <Badge label={isActive ? 'Active' : 'Banned'} variant={isActive ? 'success' : 'error'} />
      </View>

      {/* Owner Details */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Feather name="shield" size={15} color={Colors.emerald} />
          <Text style={styles.cardTitle}>Gym Owner Details</Text>
        </View>
        <InfoRow icon="mail" label="Primary Email" value={owner?.email ?? 'No email found'} />
        <InfoRow
          icon="calendar"
          label="Account Created"
          value={owner?.created_at ? new Date(owner.created_at).toLocaleDateString('en-IN') : 'Unknown'}
        />
        <InfoRow
          icon="clock"
          label="Last Sign In"
          value={owner?.last_sign_in_at ? new Date(owner.last_sign_in_at).toLocaleString('en-IN') : 'Never'}
        />
        <InfoRow
          icon="check-circle"
          label="Email Verified"
          value={owner?.email_confirmed_at ? 'Yes, Verified' : 'Pending'}
        />
        <View style={styles.idBox}>
          <Text style={styles.idLabel}>Owner ID</Text>
          <Text style={styles.idValue}>{gym.owner_id}</Text>
        </View>
        <View style={styles.idBox}>
          <Text style={styles.idLabel}>Gym ID</Text>
          <Text style={styles.idValue}>{gym.id}</Text>
        </View>
      </View>

      {/* Status Toggle */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Feather name="toggle-right" size={15} color={Colors.indigo} />
          <Text style={styles.cardTitle}>Gym Status</Text>
        </View>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>
              {isActive ? 'Active — gym can log in' : 'Banned — access blocked'}
            </Text>
            <Text style={styles.toggleSub}>
              Disabling will immediately prevent gym owner login
            </Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={handleToggleStatus}
            disabled={togglingStatus}
            trackColor={{ false: Colors.redBg, true: Colors.emeraldBg }}
            thumbColor={isActive ? Colors.emerald : Colors.red}
          />
        </View>
      </View>

      {/* Subscription Management */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Feather name="credit-card" size={15} color={Colors.indigo} />
          <Text style={styles.cardTitle}>Subscription & Trial</Text>
        </View>
        <Text style={styles.toggleSub}>
          Manage plan types, set expiry dates, and block renewals.
        </Text>
        <AdminButton
          label="Manage Subscription"
          onPress={() => navigation.navigate('GymSubscription', { gymId })}
          variant="primary"
        />
      </View>

      {/* Password Reset */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Feather name="lock" size={15} color={Colors.amber} />
          <Text style={styles.cardTitle}>Reset Password</Text>
        </View>
        <Text style={styles.passwordWarn}>
          ⚠️ This immediately invalidates the current password.
        </Text>
        <View style={styles.passwordRow}>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password (min 8 chars)..."
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!showPassword}
            style={styles.passwordInput}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword(v => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        <AdminButton
          label="Reset Password"
          onPress={handlePasswordReset}
          loading={resettingPassword}
          disabled={newPassword.length < 8}
          variant="danger"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
  centered: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  notFoundText: { fontSize: 16, color: Colors.textSecondary },
  backLink: { fontSize: 14, color: Colors.indigo, fontWeight: '600' },
  gymHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.lg,
  },
  gymIconBox: {
    width: 48, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.indigoBg, borderWidth: 1, borderColor: Colors.indigoBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  gymHeaderInfo: { flex: 1 },
  gymName: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  gymRegistered: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.lg, gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.bgCardBorder,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, color: Colors.textPrimary, marginTop: 2 },
  idBox: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.md, gap: 3,
  },
  idLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  idValue: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Courier' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  toggleSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  passwordWarn: {
    fontSize: 12, color: Colors.amber, backgroundColor: Colors.amberBg,
    borderRadius: Radius.sm, padding: Spacing.md,
  },
  passwordRow: { position: 'relative' },
  passwordInput: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder,
    borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    paddingRight: 48, color: Colors.textPrimary, fontSize: 14,
  },
  eyeBtn: { position: 'absolute', right: Spacing.lg, top: 0, bottom: 0, justifyContent: 'center' },
});
