import React, { useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchGymDetail, fetchGymActivity, toggleGymStatus, resetGymPassword } from '@/lib/api';
import { formatDateTime } from '@/lib/activity-format';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys, invalidate } from '@/lib/cache';
import { useAppTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { DetailList } from '@/components/dashboard/DetailList';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { useConfirm } from '@/components/dashboard/ConfirmDialog';
import { toast } from '@/components/dashboard/Toast';
import type { RootStackParamList } from '../navigation/types';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';

type Props = NativeStackScreenProps<RootStackParamList, 'GymDetail'>;
type GymDetail = Awaited<ReturnType<typeof fetchGymDetail>>;

export default function GymDetailScreen({ route, navigation }: Props) {
  const { gymId } = route.params;
  const { colors } = useAppTheme();
  const confirm = useConfirm();
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  /*
    Cache-first, which matters most on this screen. It is pushed onto the stack, so
    it mounted fresh on every open and gated its first paint behind a round-trip —
    the most visible instance of the 3-4s transition. Coming back to a gym you just
    looked at now paints immediately from cache while it revalidates.
  */
  const { data: detail, loading, refresh: loadDetail } = useCachedQuery<GymDetail>({
    key: CacheKeys.gymDetail(gymId),
    fetcher: () => fetchGymDetail(gymId),
  });

  // Separate query so a failing activity endpoint never blanks the rest of the screen.
  const { data: activity, error: activityError } = useCachedQuery({
    key: `gym-activity:${gymId}`,
    fetcher: () => fetchGymActivity(gymId, { kind: 'app_open', limit: 3 }),
  });

  useRealtimeInvalidation({
    channelName: 'admin:gyms',
    onInvalidate: loadDetail,
    refetchOnSubscribe: false,
  });

  /*
    The switch is optimistic, so it needs its own state, but it must track the
    server value as it arrives and after a revalidation. Derived-with-override
    rather than a plain useState seeded once, which would have gone stale the
    moment the cache refreshed underneath it.
  */
  const [statusOverride, setStatusOverride] = useState<boolean | null>(null);
  const isActive = statusOverride ?? detail?.gym.is_active ?? false;

  async function handleToggleStatus(value: boolean) {
    const ok = await confirm({
      title: value ? 'Activate gym' : 'Ban gym',
      description: value
        ? 'The gym owner will be able to log in again.'
        : 'This will immediately prevent the gym owner from logging in.',
      confirmText: value ? 'Activate' : 'Ban',
      destructive: !value,
    });
    if (!ok) return;
    setTogglingStatus(true);
    setStatusOverride(value);
    try {
      await toggleGymStatus(gymId, value);
      // The gym list shows this flag too, so drop its cache rather than let the
      // list show a stale badge until its own TTL lapses.
      invalidate(CacheKeys.gyms);
      await loadDetail();
      setStatusOverride(null);
    } catch (e: any) {
      setStatusOverride(null);
      toast.show(e.message ?? 'Failed to update status', 'error');
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handlePasswordReset() {
    if (newPassword.length < 8) {
      toast.show('Password must be at least 8 characters', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Reset Password',
      description: `Reset password for ${detail?.gym.name}? This will immediately invalidate the current password.`,
      confirmText: 'Reset',
      destructive: true,
    });
    if (!ok) return;
    setResettingPassword(true);
    try {
      await resetGymPassword(detail!.gym.owner_id, newPassword);
      toast.show('Password reset successfully', 'success');
      setNewPassword('');
    } catch (e: any) {
      toast.show(e.message ?? 'Failed to reset password', 'error');
    } finally {
      setResettingPassword(false);
    }
  }

  if (loading) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator color={colors.mutedForeground} size="large" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View className="bg-background flex-1 items-center justify-center gap-3">
        <Icon name="alert-circle" size={32} className="text-destructive" />
        <Text className="text-muted-foreground text-sm">Gym not found</Text>
        <Button variant="outline" onPress={() => navigation.goBack()}>
          <Text>Go back</Text>
        </Button>
      </View>
    );
  }

  const { gym, owner } = detail;
  const lastOpenAt = owner?.last_open_at ?? activity?.summary.lastOpenAt ?? null;
  const created = new Date(gym.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <KeyboardSafeView className="bg-background flex-1">
      <ScrollView
        className="bg-background flex-1"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Gym Header */}
        <View className="flex-row items-center gap-3">
          <View className="bg-muted border-border size-12 items-center justify-center rounded-xl border">
            <Icon name="activity" size={22} className="text-muted-foreground" />
          </View>
          <View className="flex-1 gap-0.5">
            <Text role="heading" aria-level={1} className="text-xl font-semibold tracking-tight">
              {gym.name}
            </Text>
            <Text className="text-muted-foreground text-sm">Registered {created}</Text>
          </View>
          <StatusBadge tone={isActive ? 'success' : 'error'}>
            {isActive ? 'Active' : 'Banned'}
          </StatusBadge>
        </View>

        <MetricCards
          items={[
            {
              icon: 'log-in',
              label: 'Opens (7 days)',
              value: activity ? String(activity.summary.opensLast7Days) : '—',
            },
            {
              icon: 'smartphone',
              label: 'Opens (15 days)',
              value: activity ? String(activity.summary.opensLast15Days) : '—',
            },
          ]}
        />

        {/* Owner Details */}
        <SectionCard title="Gym Owner Details">
          <DetailList
            items={[
              { label: 'Primary Email', value: owner?.email ?? 'No email found', tone: 'blue' },
              {
                label: 'Account Created',
                value: owner?.created_at ? new Date(owner.created_at).toLocaleDateString('en-IN') : 'Unknown',
                tone: 'violet',
              },
              {
                label: 'Last Sign In',
                value: owner?.last_sign_in_at ? new Date(owner.last_sign_in_at).toLocaleString('en-IN') : 'Never',
              },
              { label: 'Last opened', value: lastOpenAt ? formatDateTime(lastOpenAt) : 'Never' },
              {
                label: 'Email Verified',
                value: owner?.email_confirmed_at ? 'Yes, Verified' : 'Pending',
                tone: owner?.email_confirmed_at ? 'emerald' : 'amber',
              },
              { label: 'Owner ID', value: gym.owner_id, tone: 'sky' },
              { label: 'Gym ID', value: gym.id, tone: 'sky' },
            ]}
          />
        </SectionCard>

        {/* Owner Activity */}
        <SectionCard title="Owner Activity">
          {activity ? (
            <View className="gap-1">
              <Text className="text-sm">
                Opened {activity.summary.opensLast7Days} {activity.summary.opensLast7Days === 1 ? 'time' : 'times'} in
                the last 7 days, {activity.summary.opensLast15Days} in the last 15 days
              </Text>
              {activity.events.slice(0, 3).map(e => (
                <Text key={e.id} className="text-muted-foreground text-xs">{formatDateTime(e.createdAt)}</Text>
              ))}
            </View>
          ) : activityError ? (
            <Text className="text-destructive text-sm">Could not load activity</Text>
          ) : (
            <ActivityIndicator color={colors.mutedForeground} />
          )}
          <Button
            variant="outline"
            className="mt-4"
            onPress={() => navigation.navigate('GymActivity', { gymId, gymName: gym.name })}
          >
            <Text>View all activity</Text>
          </Button>
        </SectionCard>

        {/* Status Toggle */}
        <SectionCard title="Gym Status">
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-medium">
                {isActive ? 'Active — gym can log in' : 'Banned — access blocked'}
              </Text>
              <Text className="text-muted-foreground text-xs">
                Disabling will immediately prevent gym owner login
              </Text>
            </View>
            <Switch
              checked={isActive}
              onCheckedChange={handleToggleStatus}
              disabled={togglingStatus}
            />
          </View>
        </SectionCard>

        {/* Subscription Management */}
        <SectionCard
          title="Subscription & Trial"
          description="Manage plan types, set expiry dates, and block renewals."
        >
          <Button onPress={() => navigation.navigate('GymSubscription', { gymId })}>
            <Text>Manage Subscription</Text>
          </Button>
        </SectionCard>

        {/* Password Reset */}
        <SectionCard
          title="Reset Password"
          description="This immediately invalidates the current password."
        >
          <View className="gap-4">
            <View className="justify-center">
              <Input
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password (min 8 chars)..."
                secureTextEntry={!showPassword}
                autoCapitalize="none"
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
            <Button
              variant="destructive"
              onPress={handlePasswordReset}
              disabled={resettingPassword || newPassword.length < 8}
            >
              <Text>{resettingPassword ? 'Resetting...' : 'Reset Password'}</Text>
            </Button>
          </View>
        </SectionCard>
      </ScrollView>
    </KeyboardSafeView>
  );
}
