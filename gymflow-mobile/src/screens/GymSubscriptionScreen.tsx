import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Linking,
  RefreshControl,
  StatusBar,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  fetchSubscriptionDetail,
  activateSubscription,
  extendTrial,
  expireSubscription,
  approvePayment,
  rejectPayment,
  saveAdminNotes,
  updateSubscriptionDates,
  executeDangerAction,
  fetchGymActivityLogs,
  fetchGymFeedback,
  type SubscriptionDetailResponse,
  type GymActivityEvent,
  type SupportTicket,
} from '@/lib/api';
import { openHttpsUrl } from '@/lib/safe-link';
import { isPaidPlan } from '@/lib/plan';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import type { RootStackParamList } from '../navigation/types';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';
import { useAppTheme } from '@/lib/theme';
import { useConfirm } from '@/components/dashboard/ConfirmDialog';
import { toast } from '@/components/dashboard/Toast';
import { MetricCards, type MetricCardItem } from '@/components/dashboard/MetricCards';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { StatusBadge, type StatusTone } from '@/components/dashboard/StatusBadge';
import { DetailList } from '@/components/dashboard/DetailList';
import { ListRow } from '@/components/dashboard/ListRow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import {
  approveMessage,
  errMsg,
  fmtDate,
  fmtDateTime,
  formatCurrency,
  resolveRequestedPlan,
  statusTone,
} from './gym-subscription/helpers';
import {
  ActivityLogs,
  InputDialog,
  SaveBar,
  TimelineRow,
  type InputDialogState,
} from './gym-subscription/parts';

type Props = NativeStackScreenProps<RootStackParamList, 'GymSubscription'>;

// ─── Tab Bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'billing',  label: 'Billing' },
  { key: 'history',  label: 'History' },
  { key: 'logs',     label: 'Logs' },
  { key: 'settings', label: 'Settings' },
] as const;

type TabKey = typeof TABS[number]['key'];

const FLAG_ROWS = [
  { key: 'is_vip', label: 'VIP Customer', icon: 'star' },
  { key: 'is_payment_verified', label: 'Payment Verified', icon: 'check-circle' },
  { key: 'whatsapp_enabled', label: 'WhatsApp Enabled', icon: 'message-circle' },
  { key: 'priority_support', label: 'Priority Support', icon: 'headphones' },
  { key: 'auto_renewal_eligible', label: 'Auto Renewal Eligible', icon: 'refresh-cw' },
  { key: 'lifetime_offer', label: 'Lifetime Offer Available', icon: 'gift' },
] as const;

// Scroll area: bottom padding leaves room for the unsaved-changes bar.
const SCROLL_CONTENT = 'gap-3.5 p-3.5 pb-40';

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function GymSubscriptionScreen({ route, navigation }: Props) {
  const { gymId } = route.params;
  const { scheme, colors } = useAppTheme();
  const confirm = useConfirm();
  const statusBar = (
    <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
  );

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<SubscriptionDetailResponse | null>(null);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [adminNotes, setAdminNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);

  const [flags, setFlags] = useState({
    is_vip: false,
    is_payment_verified: false,
    whatsapp_enabled: true,
    priority_support: false,
    auto_renewal_eligible: false,
    lifetime_offer: false,
  });

  const [subStartDate, setSubStartDate] = useState<Date | null>(null);
  const [subEndDate, setSubEndDate] = useState<Date | null>(null);
  const [trialStartDate, setTrialStartDate] = useState<Date | null>(null);
  const [trialEndDate, setTrialEndDate] = useState<Date | null>(null);
  const [datesChanged, setDatesChanged] = useState(false);

  // Only dialogs that need typed input live here; plain confirms go through useConfirm.
  const [confirmDialog, setConfirmDialog] = useState<InputDialogState>({
    visible: false, title: '', message: '', onConfirm: () => {},
  });

  const dialogInputRef = useRef('');
  const [actionLoading, setActionLoading] = useState(false);

  const [activityLogs, setActivityLogs] = useState<GymActivityEvent[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Gym-wise owner feedback (support_tickets, type='feedback', with a star rating).
  const [feedback, setFeedback] = useState<SupportTicket[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);

  const loadFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    try {
      const rows = await fetchGymFeedback(gymId);
      setFeedback(rows);
    } catch {
      // Non-fatal: the feedback card just shows an empty state on failure.
    } finally {
      setFeedbackLoading(false);
    }
  }, [gymId]);

  useEffect(() => { loadFeedback(); }, [loadFeedback]);

  const loadActivityLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setLogsRefreshing(true); else setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await fetchGymActivityLogs(gymId, 60);
      setActivityLogs(res.events);
    } catch (e) {
      setLogsError(errMsg(e, 'Failed to load activity logs'));
    } finally {
      setLogsLoading(false);
      setLogsRefreshing(false);
    }
  }, [gymId]);

  const logsLoadedRef = useRef(false);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const result = await fetchSubscriptionDetail(gymId);
      setData(result);
      const gym = result.gym;
      setAdminNotes(gym.admin_notes || '');
      setFlags({
        is_vip: gym.is_vip,
        is_payment_verified: gym.is_payment_verified,
        whatsapp_enabled: gym.whatsapp_enabled,
        priority_support: gym.priority_support,
        auto_renewal_eligible: gym.auto_renewal_eligible,
        lifetime_offer: gym.lifetime_offer,
      });
      setSubStartDate(gym.subscription_started_at ? new Date(gym.subscription_started_at) : null);
      setSubEndDate(gym.subscription_ends_at ? new Date(gym.subscription_ends_at) : null);
      setTrialStartDate(gym.trial_started_at ? new Date(gym.trial_started_at) : null);
      setTrialEndDate(gym.trial_ends_at ? new Date(gym.trial_ends_at) : null);
      setDirty(false);
      setDatesChanged(false);
    } catch (e) {
      toast.show(errMsg(e, 'Failed to load subscription details'), 'error');
      navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gymId, navigation]);

  useEffect(() => { loadData(); }, [loadData]);

  useRealtimeInvalidation({
    channelName: 'admin:gyms',
    onInvalidate: loadData,
  });
  useRealtimeInvalidation({
    channelName: 'admin:activity',
    onInvalidate: async () => {
      await loadData();
      if (logsLoadedRef.current) await loadActivityLogs();
    },
  });

  const autoRefreshFiredRef = React.useRef(false);

  async function handleSave() {
    setSaving(true);
    try {
      const promises: Promise<void>[] = [];
      promises.push(saveAdminNotes(gymId, { admin_notes: adminNotes, ...flags }));
      if (datesChanged) {
        promises.push(updateSubscriptionDates(gymId, {
          subscription_started_at: subStartDate?.toISOString() ?? null,
          subscription_ends_at: subEndDate?.toISOString() ?? null,
          // Server refuses trial dates for paid gyms, so they are not sent.
          ...(isPaidPlan(data?.gym.plan_type) ? {} : {
            trial_started_at: trialStartDate?.toISOString() ?? null,
            trial_ends_at: trialEndDate?.toISOString() ?? null,
          }),
        }));
      }
      await Promise.all(promises);
      setDirty(false);
      setDatesChanged(false);
      toast.show('Changes saved successfully', 'success');
      await loadData(true);
    } catch (e) {
      toast.show(errMsg(e, 'Failed to save changes'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!data) return;
    const gym = data.gym;
    setAdminNotes(gym.admin_notes || '');
    setFlags({
      is_vip: gym.is_vip,
      is_payment_verified: gym.is_payment_verified,
      whatsapp_enabled: gym.whatsapp_enabled,
      priority_support: gym.priority_support,
      auto_renewal_eligible: gym.auto_renewal_eligible,
      lifetime_offer: gym.lifetime_offer,
    });
    setSubStartDate(gym.subscription_started_at ? new Date(gym.subscription_started_at) : null);
    setSubEndDate(gym.subscription_ends_at ? new Date(gym.subscription_ends_at) : null);
    setTrialStartDate(gym.trial_started_at ? new Date(gym.trial_started_at) : null);
    setTrialEndDate(gym.trial_ends_at ? new Date(gym.trial_ends_at) : null);
    setDirty(false);
    setDatesChanged(false);
  }

  async function confirmAction(opts: {
    title: string; message: string; confirmLabel?: string; destructive?: boolean;
    inputPlaceholder?: string; inputValue?: string;
    inputKeyboardType?: 'default' | 'number-pad';
    onConfirm: () => void;
  }) {
    if (opts.inputPlaceholder) {
      dialogInputRef.current = opts.inputValue ?? '';
      setConfirmDialog({
        visible: true, title: opts.title, message: opts.message,
        confirmLabel: opts.confirmLabel, destructive: opts.destructive,
        inputPlaceholder: opts.inputPlaceholder, inputValue: opts.inputValue ?? '',
        inputKeyboardType: opts.inputKeyboardType,
        onInputChange: (v) => { dialogInputRef.current = v; setConfirmDialog(prev => ({ ...prev, inputValue: v })); },
        onConfirm: opts.onConfirm,
      });
    } else {
      const ok = await confirm({
        title: opts.title,
        description: opts.message,
        confirmText: opts.confirmLabel,
        destructive: opts.destructive,
      });
      if (ok) opts.onConfirm();
    }
  }

  function closeDialog() { setConfirmDialog(prev => ({ ...prev, visible: false })); }

  async function doAction(fn: () => Promise<void>) {
    setActionLoading(true);
    closeDialog();
    try {
      await fn();
      await loadData(true);
    } catch (e) {
      toast.show(errMsg(e, 'Action failed'), 'error');
    } finally {
      setActionLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="bg-background flex-1 items-center justify-center gap-3">
        {statusBar}
        <ActivityIndicator color={colors.mutedForeground} size="large" />
        <Text className="text-muted-foreground text-sm">Loading subscription data...</Text>
      </View>
    );
  }

  if (!data) return null;

  const { gym, owner, pendingRequest, timeline, usageStats } = data;

  const EXPIRING_SOON_DAYS = 7;

  function getEffectiveState(g: typeof gym) {
    const status = g.subscription_status;
    if (status === 'expired' || status === 'cancelled' || status === 'suspended') {
      return { effectiveStatus: status, days: 0, isExpired: true, isExpiringSoon: false };
    }
    if (status === 'active') {
      if (!g.subscription_ends_at) return { effectiveStatus: 'active', days: null, isExpired: false, isExpiringSoon: false };
      const msLeft = new Date(g.subscription_ends_at).getTime() - Date.now();
      const d = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      if (d <= 0) return { effectiveStatus: 'expired', days: 0, isExpired: true, isExpiringSoon: false };
      if (d <= EXPIRING_SOON_DAYS) return { effectiveStatus: 'expiring', days: d, isExpired: false, isExpiringSoon: true };
      return { effectiveStatus: 'active', days: d, isExpired: false, isExpiringSoon: false };
    }
    if (status === 'trial') {
      if (!g.trial_ends_at) return { effectiveStatus: 'expired', days: 0, isExpired: true, isExpiringSoon: false };
      const msLeft = new Date(g.trial_ends_at).getTime() - Date.now();
      const d = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      if (d <= 0) return { effectiveStatus: 'expired', days: 0, isExpired: true, isExpiringSoon: false };
      return { effectiveStatus: 'trial', days: d, isExpired: false, isExpiringSoon: d <= EXPIRING_SOON_DAYS };
    }
    return { effectiveStatus: 'expired', days: 0, isExpired: true, isExpiringSoon: false };
  }

  const { effectiveStatus, days, isExpired, isExpiringSoon } = getEffectiveState(gym);

  if (isExpired && gym.subscription_status !== 'expired' && !autoRefreshFiredRef.current) {
    autoRefreshFiredRef.current = true;
    setTimeout(() => loadData(true), 0);
  }

  // Compute trial duration for progress bar (14 days default)
  const TRIAL_DAYS = 14;
  const totalDays = effectiveStatus === 'trial' ? TRIAL_DAYS : (days ?? TRIAL_DAYS);
  const progressRatio = days !== null ? Math.max(0, Math.min(1, days / totalDays)) : 1;

  const renewalHistory = timeline.filter(l =>
    l.new_plan && l.new_plan !== 'trial' && l.action.toLowerCase().includes('activat')
  );

  const ratedFeedback = feedback.filter(f => f.rating != null);
  const avgRating = ratedFeedback.length
    ? ratedFeedback.reduce((sum, f) => sum + (f.rating ?? 0), 0) / ratedFeedback.length
    : null;

  // Plan display label
  const planTypeStr = gym.plan_type as string;
  const planLabel = planTypeStr === 'trial' ? 'Trial Plan'
    : planTypeStr === 'monthly' ? 'Monthly Plan'
    : planTypeStr === 'yearly' ? 'Yearly Plan'
    : planTypeStr === 'lifetime' ? 'Lifetime Plan'
    : `${planTypeStr.charAt(0).toUpperCase() + planTypeStr.slice(1)} Plan`;

  // Plan badge colour by plan: monthly blue, yearly violet, lifetime emerald, trial amber, expired red.
  const planBadgeTone: StatusTone = isExpired ? 'critical'
    : planTypeStr === 'monthly' ? 'primary'
    : planTypeStr === 'yearly' ? 'violet'
    : planTypeStr === 'lifetime' ? 'success'
    : planTypeStr === 'trial' ? 'warning'
    : statusTone(effectiveStatus);
  const planBadge = planTypeStr === 'trial' ? 'Trial'
    : planTypeStr === 'monthly' ? 'Monthly'
    : planTypeStr === 'yearly' ? 'Yearly'
    : planTypeStr === 'lifetime' ? 'Lifetime'
    : planTypeStr;

  function handleApprove(req: NonNullable<typeof pendingRequest>) {
    const plan = resolveRequestedPlan(req);
    if (!plan) { toast.show('This request is for a product this app version does not recognise. Approve it from the web admin.', 'error'); return; }
    confirmAction({
      title: 'Approve Payment?',
      message: approveMessage(plan, gym.name, req.expected_amount_inr),
      confirmLabel: 'Approve',
      onConfirm: () => doAction(() => approvePayment(gymId, req.id, plan)),
    });
  }

  function handleCall() {
    const phone = gym.phone || owner?.phone;
    if (phone) { Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`); }
    else { toast.show('No phone number available for this gym.', 'error'); }
  }

  function handleWhatsApp() {
    const phone = gym.phone || owner?.phone;
    if (phone) { Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`); }
    else { toast.show('No phone number available for this gym.', 'error'); }
  }

  // Subscription facts: dates, days remaining (with progress), WhatsApp add-on.
  const planMetrics: MetricCardItem[] = [
    { icon: 'calendar', label: 'Started On', value: fmtDate(gym.subscription_started_at || gym.trial_started_at), tone: 'violet' },
    {
      icon: 'calendar', label: 'Expires On',
      // Free has no end date; falling back to trial_ends_at would show the old trial date.
      value: gym.plan_type === 'lifetime' || gym.plan_type === 'free'
        ? 'Never'
        : fmtDate(gym.subscription_ends_at || gym.trial_ends_at),
      ...(isExpired ? { tone: 'red' as const, valueTone: 'red' as const }
        : isExpiringSoon ? { tone: 'amber' as const, valueTone: 'amber' as const } : {}),
    },
  ];
  // WhatsApp add-on: shown for Free gyms, and for any gym that has ever had one.
  if (gym.plan_type === 'free' || gym.whatsapp_addon_until) {
    const until = gym.whatsapp_addon_until ? new Date(gym.whatsapp_addon_until) : null;
    const addonDays = until ? Math.ceil((until.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    const active = until !== null && addonDays > 0;
    planMetrics.push({
      icon: 'message-circle',
      label: 'WhatsApp Add-on',
      value: active ? 'Active' : until ? 'Expired' : 'Not purchased',
      tone: active ? 'emerald' : until ? 'red' : 'neutral',
      valueTone: active ? 'emerald' : until ? 'red' : 'neutral',
      footnote: active
        ? `Until ${fmtDate(gym.whatsapp_addon_until)} (${addonDays} day${addonDays !== 1 ? 's' : ''} left)`
        : until
          ? `Expired on ${fmtDate(gym.whatsapp_addon_until)}`
          : undefined,
    });
  }
  if (days !== null && !isExpired && gym.plan_type !== 'lifetime') {
    planMetrics.push({
      icon: 'clock', label: 'Days Remaining', value: String(days),
      progress: progressRatio * 100,
      tone: isExpiringSoon ? 'amber' : 'emerald',
      valueTone: isExpiringSoon ? 'amber' : 'emerald',
      footnote: isExpiringSoon ? `Expiring in ${days} Day${days !== 1 ? 's' : ''} — Renew Soon` : undefined,
    });
  }
  if (isExpired) {
    planMetrics.push({ icon: 'alert-circle', label: 'Status', value: 'Expired', tone: 'red', valueTone: 'red', badge: { text: 'Expired', variant: 'destructive' } });
  }
  if (gym.plan_type === 'lifetime') {
    planMetrics.push({ icon: 'award', label: 'Access', value: 'Lifetime', tone: 'emerald', valueTone: 'emerald' });
  }

  const usageMetrics: MetricCardItem[] = [
    { icon: 'users', label: 'Members', value: usageStats?.total_members?.toLocaleString() || '0', tone: 'blue', valueTone: 'blue' },
    { icon: 'trending-up', label: 'Revenue', value: formatCurrency(usageStats?.total_revenue), tone: 'emerald', valueTone: 'emerald' },
    { icon: 'activity', label: 'Attendance', value: usageStats?.total_attendance?.toLocaleString() || '0', tone: 'sky', valueTone: 'sky' },
    { icon: 'message-circle', label: 'WhatsApp', value: `${usageStats?.whatsapp_sent?.toLocaleString() || '0'} msgs`, tone: 'violet', valueTone: 'violet' },
    { icon: 'credit-card', label: 'Payments', value: usageStats?.total_payments?.toLocaleString() || '0' },
    { icon: 'file-text', label: 'Reports', value: usageStats?.reports_generated?.toLocaleString() || '0' },
    { icon: 'hard-drive', label: 'Storage', value: usageStats?.storage_used_kb ? `${(usageStats.storage_used_kb / 1024).toFixed(1)} MB` : '0 MB' },
    { icon: 'clock', label: 'Last Active', value: usageStats?.last_active_at ? fmtDate(usageStats.last_active_at) : '—' },
  ];

  const refresh = (
    <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.mutedForeground} />
  );

  const paymentStatus = gym.last_payment_status === 'paid' ? 'Paid'
    : gym.last_payment_status === 'pending' ? 'Pending'
    : gym.last_payment_status === 'failed' ? 'Failed'
    : '—';

  return (
    <KeyboardSafeView style={{ flex: 1, backgroundColor: colors.background }}>
      {statusBar}

      {/* ─── TAB BAR ─────────────────────────────────────────────────── */}
      <View className="bg-card border-border border-b px-3.5 py-2">
        <Tabs
          value={activeTab}
          onValueChange={v => {
            const key = v as TabKey;
            setActiveTab(key);
            if (key === 'logs' && !logsLoadedRef.current) {
              logsLoadedRef.current = true;
              loadActivityLogs();
            }
          }}>
          <TabsList className="w-full">
            {TABS.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key} className="flex-1">
                <Text numberOfLines={1} className="text-xs">{tab.label}</Text>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </View>

      {/* ─── OVERVIEW TAB ─────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <ScrollView className="flex-1" contentContainerClassName={SCROLL_CONTENT} refreshControl={refresh}>
          <SectionCard
            title={gym.name}
            description={gym.city || undefined}
            action={<StatusBadge tone={gym.is_active ? 'success' : 'critical'}>{gym.is_active ? 'Active' : 'Banned'}</StatusBadge>}>
            <DetailList
              items={[
                { label: 'Owner', value: owner?.email || gym.owner_id, tone: 'blue' },
                // Prefer the gym's own contact number; fall back to the owner's signup mobile
                // so a gym that never set a separate contact number still shows a number.
                { label: 'Phone', value: gym.phone || owner?.phone || '—' },
              ]}
            />
          </SectionCard>

          <SectionCard
            title={planLabel}
            description="Current Plan"
            action={<StatusBadge tone={planBadgeTone}>{planBadge}</StatusBadge>}>
            <MetricCards items={planMetrics} />
          </SectionCard>

          <SectionCard title="Quick Actions">
            {actionLoading && (
              <View className="mb-3 flex-row items-center gap-2">
                <ActivityIndicator color={colors.mutedForeground} size="small" />
                <Text className="text-muted-foreground text-xs">Processing...</Text>
              </View>
            )}
            <View className="flex-row flex-wrap gap-2">
              <Button variant="outline" className="h-auto min-h-9 w-[48.5%] py-2" disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Activate Monthly Subscription?', message: 'This will activate the Monthly plan for 30 days, added to any time remaining on a running paid plan.', confirmLabel: 'Activate', onConfirm: () => doAction(() => activateSubscription(gymId, 'monthly')) })}>
                <Icon name="award" size={16} />
                <Text>Activate Monthly</Text>
              </Button>
              <Button variant="outline" className="h-auto min-h-9 w-[48.5%] py-2" disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Activate Yearly Subscription?', message: 'This will activate the Yearly plan for 365 days, added to any time remaining on a running paid plan.', confirmLabel: 'Activate', onConfirm: () => doAction(() => activateSubscription(gymId, 'yearly')) })}>
                <Icon name="calendar" size={16} />
                <Text>Activate Yearly</Text>
              </Button>
              <Button variant="outline" className="h-auto min-h-9 w-[48.5%] py-2" disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Activate Lifetime Subscription?', message: 'This will grant permanent lifetime access. This cannot be automatically reversed.', confirmLabel: 'Activate', onConfirm: () => doAction(() => activateSubscription(gymId, 'lifetime')) })}>
                <Icon name="hexagon" size={16} />
                <Text>Activate Lifetime</Text>
              </Button>
              {/* Trial actions: hidden on paid plans (the server refuses them; they would downgrade the gym). */}
              {!isPaidPlan(gym.plan_type) && (
                <>
                  <Button variant="outline" className="h-auto min-h-9 w-[48.5%] py-2" disabled={actionLoading}
                    onPress={() => confirmAction({ title: 'Extend Trial by 7 Days?', message: 'This will add 7 more days to the current trial expiry.', confirmLabel: 'Extend', onConfirm: () => doAction(() => extendTrial(gymId, 'extend', 7)) })}>
                    <Icon name="clock" size={16} />
                    <Text>Extend Trial</Text>
                  </Button>
                  <Button variant="outline" className="h-auto min-h-9 w-[48.5%] py-2" disabled={actionLoading}
                    onPress={() => confirmAction({ title: 'Reset Trial?', message: 'This will reset the trial to a fresh 14-day trial starting today.', confirmLabel: 'Reset', onConfirm: () => doAction(() => extendTrial(gymId, 'reset')) })}>
                    <Icon name="refresh-cw" size={16} />
                    <Text>Reset Trial</Text>
                  </Button>
                </>
              )}
              <Button variant="destructive" className="h-auto min-h-9 w-[48.5%] py-2" disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Expire Subscription Now?', message: 'This will immediately mark the subscription as expired. The gym owner will lose access.', confirmLabel: 'Expire Now', destructive: true, onConfirm: () => doAction(() => expireSubscription(gymId, 'Admin forced expiry')) })}>
                <Icon name="x-circle" size={16} />
                <Text>Expire Now</Text>
              </Button>
            </View>
          </SectionCard>

          {/* Contact shortcuts (were FAB speed-dial actions). */}
          <SectionCard title="Contact">
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={handleCall}>
                <Icon name="phone" size={16} />
                <Text>Call Customer</Text>
              </Button>
              <Button variant="outline" className="flex-1" onPress={handleWhatsApp}>
                <Icon name="message-circle" size={16} />
                <Text>WhatsApp</Text>
              </Button>
            </View>
          </SectionCard>

          {/* ── PENDING RENEWAL REQUEST ── */}
          {pendingRequest && (
            <SectionCard
              title="Pending Renewal Request"
              action={<StatusBadge tone="warning">Pending Verification</StatusBadge>}>
              <View className="gap-3">
                <DetailList
                  items={[
                    { label: 'Submitted', value: fmtDateTime(pendingRequest.submitted_at) },
                    { label: 'Transaction ID', value: pendingRequest.transaction_id || '—' },
                    ...(pendingRequest.expected_amount_inr != null
                      ? [{ label: 'Expected', value: formatCurrency(pendingRequest.expected_amount_inr) }]
                      : []),
                  ]}
                />
                {resolveRequestedPlan(pendingRequest) === 'whatsapp_addon' && (
                  <View className="flex-row">
                    <StatusBadge tone="success">WhatsApp add-on (30 days)</StatusBadge>
                  </View>
                )}
                {pendingRequest.notes && (
                  <View className="bg-muted rounded-md p-3">
                    <Text className="text-muted-foreground text-xs">{pendingRequest.notes}</Text>
                  </View>
                )}
                {pendingRequest.uploaded_file_url && (
                  <View className="flex-row">
                    <Button variant="outline" size="sm" onPress={() => openHttpsUrl(pendingRequest.uploaded_file_url)}>
                      <Icon name="image" size={14} />
                      <Text>View Payment Screenshot</Text>
                    </Button>
                  </View>
                )}
                <View className="flex-row gap-3">
                  <Button className="flex-1" disabled={actionLoading} onPress={() => handleApprove(pendingRequest)}>
                    <Icon name="check" size={14} />
                    <Text>Approve</Text>
                  </Button>
                  <Button variant="destructive" className="flex-1" disabled={actionLoading}
                    onPress={() => confirmAction({ title: 'Reject Payment?', message: 'Please provide a reason for rejection. This will be visible to the gym owner.', confirmLabel: 'Reject', destructive: true, inputPlaceholder: 'Rejection reason (required)...', inputValue: '', onConfirm: () => { const reason = dialogInputRef.current.trim(); if (!reason) { toast.show('Please enter a rejection reason', 'error'); return; } doAction(() => rejectPayment(gymId, pendingRequest.id, reason)); } })}>
                    <Icon name="x" size={14} />
                    <Text>Reject</Text>
                  </Button>
                </View>
              </View>
            </SectionCard>
          )}

          <SectionCard title="Usage Statistics">
            <MetricCards items={usageMetrics} />
          </SectionCard>

          {/* ── OWNER FEEDBACK CARD (gym-wise) ── */}
          <SectionCard
            title="Owner Feedback"
            action={avgRating != null ? (
              <View className="flex-row items-center gap-1">
                <Icon name="star" size={12} color={colors.warning} />
                <Text className="text-sm font-medium">{avgRating.toFixed(1)}</Text>
                <Text className="text-muted-foreground text-xs">({ratedFeedback.length})</Text>
              </View>
            ) : undefined}>
            {feedbackLoading ? (
              <ActivityIndicator color={colors.mutedForeground} size="small" className="py-4" />
            ) : feedback.length === 0 ? (
              <Text className="text-muted-foreground py-2 text-center text-sm">No feedback submitted by this gym yet.</Text>
            ) : (
              feedback.map((f, i) => (
                <View key={f.id} className={i === feedback.length - 1 ? 'gap-1.5 py-3' : 'border-border gap-1.5 border-b py-3'}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <Icon
                          key={n}
                          name="star"
                          size={13}
                          color={f.rating != null && n <= f.rating ? colors.warning : colors.mutedForeground}
                        />
                      ))}
                    </View>
                    <Text className="text-muted-foreground text-xs">{fmtDate(f.created_at)}</Text>
                  </View>
                  {f.subject ? <Text className="text-sm font-medium">{f.subject}</Text> : null}
                  <Text className="text-muted-foreground text-sm">{f.message}</Text>
                </View>
              ))
            )}
          </SectionCard>
        </ScrollView>
      )}

      {/* ─── BILLING TAB ────────────────────────────────────────────── */}
      {activeTab === 'billing' && (
        <ScrollView className="flex-1" contentContainerClassName={SCROLL_CONTENT} refreshControl={refresh}>
          <SectionCard title="Payment Information">
            <DetailList
              items={[
                { label: 'Last Amount', value: formatCurrency(gym.last_payment_amount) },
                { label: 'Payment Method', value: gym.last_payment_method || '—' },
                { label: 'Transaction ID', value: gym.last_transaction_id || '—' },
                { label: 'Payment Date', value: fmtDate(gym.last_payment_date) },
                { label: 'Payment Status', value: paymentStatus },
              ]}
            />
          </SectionCard>

          <SectionCard title="Subscription Dates">
            <DetailList
              items={[
                { label: 'Subscription Started', value: subStartDate ? fmtDate(subStartDate.toISOString()) : 'Not Set' },
                { label: 'Subscription Ends', value: subEndDate ? fmtDate(subEndDate.toISOString()) : 'Not Set' },
                ...(!isPaidPlan(gym.plan_type) ? [
                  { label: 'Trial Started', value: trialStartDate ? fmtDate(trialStartDate.toISOString()) : 'Not Set' },
                  { label: 'Trial Ends', value: trialEndDate ? fmtDate(trialEndDate.toISOString()) : 'Not Set' },
                ] : []),
              ]}
            />
          </SectionCard>

          {gym.subscription_status === 'trial' && !isPaidPlan(gym.plan_type) && (
            <SectionCard title="Trial Information">
              <View className="gap-4">
                <DetailList
                  items={[
                    { label: 'Trial Started', value: fmtDate(gym.trial_started_at) },
                    { label: 'Trial Ends', value: fmtDate(gym.trial_ends_at) },
                  ]}
                />
                <Text className="text-muted-foreground text-xs font-medium uppercase">Extend Trial</Text>
                <View className="flex-row gap-2">
                  {[3, 7, 14].map(d => (
                    <Button key={d} variant="outline" size="sm" className="flex-1" disabled={actionLoading}
                      onPress={() => confirmAction({ title: `Extend Trial by ${d} Days?`, message: `This will add ${d} days to the current trial expiry date.`, confirmLabel: `+${d} Days`, onConfirm: () => doAction(() => extendTrial(gymId, 'extend', d)) })}>
                      <Text>+{d} Days</Text>
                    </Button>
                  ))}
                  <Button variant="secondary" size="sm" className="flex-1" disabled={actionLoading}
                    onPress={() => confirmAction({ title: 'Extend Trial by Custom Days?', message: 'Enter number of days to extend the trial.', confirmLabel: 'Extend', inputPlaceholder: 'Number of days (e.g. 10)', inputValue: '', inputKeyboardType: 'number-pad', onConfirm: () => { const d = parseInt(dialogInputRef.current, 10); if (!Number.isFinite(d) || d <= 0 || d > 365) { toast.show('Enter a number of days between 1 and 365', 'error'); return; } doAction(() => extendTrial(gymId, 'custom', d)); } })}>
                    <Text>Custom</Text>
                  </Button>
                </View>
              </View>
            </SectionCard>
          )}
        </ScrollView>
      )}

      {/* ─── HISTORY TAB ────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <ScrollView className="flex-1" contentContainerClassName={SCROLL_CONTENT} refreshControl={refresh}>
          <SectionCard title="Renewal History">
            {renewalHistory.length === 0 ? (
              <Text className="text-muted-foreground py-2 text-center text-sm">No renewal history yet.</Text>
            ) : (
              renewalHistory.map((log, i) => (
                <ListRow
                  key={log.id}
                  last={i === renewalHistory.length - 1}
                  title={`${fmtDate(log.created_at)}${log.new_expiry ? ` → ${fmtDate(log.new_expiry)}` : ''}`}
                  subtitle={log.new_status?.toUpperCase() || 'ACTIVE'}
                  left={
                    <Badge variant={log.new_plan === 'yearly' ? 'violet' : log.new_plan === 'lifetime' ? 'success' : 'primarySoft'}>
                      <Text>{log.new_plan?.toUpperCase()}</Text>
                    </Badge>
                  }
                />
              ))
            )}
          </SectionCard>

          <SectionCard title="Activity Timeline">
            {timeline.length === 0 ? (
              <Text className="text-muted-foreground py-2 text-center text-sm">No activity recorded yet.</Text>
            ) : (
              timeline.slice(0, 20).map((log, i) => (
                <TimelineRow key={log.id} log={log} last={i === Math.min(timeline.length, 20) - 1} />
              ))
            )}
            {timeline.length > 20 && (
              <Text className="text-muted-foreground pt-2 text-center text-xs">+{timeline.length - 20} more entries</Text>
            )}
          </SectionCard>
        </ScrollView>
      )}

      {/* ─── LOGS TAB ────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <ScrollView
          className="flex-1"
          contentContainerClassName={SCROLL_CONTENT}
          refreshControl={<RefreshControl refreshing={logsRefreshing} onRefresh={() => loadActivityLogs(true)} tintColor={colors.mutedForeground} />}>
          <ActivityLogs events={activityLogs} loading={logsLoading} error={logsError} onRetry={() => loadActivityLogs()} />
        </ScrollView>
      )}

      {/* ─── SETTINGS TAB ────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <ScrollView className="flex-1" contentContainerClassName={SCROLL_CONTENT} refreshControl={refresh}>
          <SectionCard title="Admin Notes">
            {editingNotes ? (
              <View className="gap-3">
                <Textarea
                  value={adminNotes}
                  onChangeText={v => { setAdminNotes(v); setDirty(true); }}
                  placeholder="Add internal notes about this customer..."
                  className="min-h-24"
                  autoFocus
                />
                <View className="flex-row justify-end">
                  <Button variant="outline" size="sm" onPress={() => setEditingNotes(false)}>
                    <Icon name="check" size={12} />
                    <Text>Done Editing</Text>
                  </Button>
                </View>
              </View>
            ) : (
              <Pressable
                className="border-input flex-row gap-2 rounded-md border p-3 active:bg-accent"
                onPress={() => setEditingNotes(true)}>
                <Text className={adminNotes ? 'flex-1 text-sm' : 'text-muted-foreground flex-1 text-sm italic'}>
                  {adminNotes || 'Tap to add notes about this customer...'}
                </Text>
                <Icon name="edit-2" size={14} className="text-muted-foreground" />
              </Pressable>
            )}
          </SectionCard>

          <SectionCard title="Internal Flags" description="Admin only — not visible to gym owner">
            {FLAG_ROWS.map(({ key, label, icon }, i) => (
              <ListRow
                key={key}
                last={i === FLAG_ROWS.length - 1}
                title={label}
                left={<Icon name={icon} size={14} className="text-muted-foreground" />}
                right={
                  <Switch
                    checked={flags[key]}
                    onCheckedChange={v => { setFlags(prev => ({ ...prev, [key]: v })); setDirty(true); }}
                  />
                }
              />
            ))}
          </SectionCard>

          <SectionCard title="Security Information">
            <DetailList
              items={[
                { label: 'Registered Email', value: owner?.email || '—' },
                { label: 'Last Login', value: fmtDateTime(owner?.last_sign_in_at) },
                { label: 'Account Created', value: fmtDate(owner?.created_at) },
                { label: 'Email Verified', value: owner?.email_confirmed_at ? 'Verified' : 'Pending' },
                { label: 'Login Disabled', value: gym.login_disabled ? 'Yes' : 'No' },
              ]}
            />
          </SectionCard>

          <SectionCard
            title="Danger Zone"
            description="All actions are irreversible or require confirmation. Proceed with caution."
            className="border-destructive/40">
            <Button
              variant="destructive"
              disabled={actionLoading}
              onPress={() => confirmAction({
                title: 'Delete Gym Permanently?',
                message: `PERMANENT. This will delete the gym and ALL its data including members, attendance, and payments. This CANNOT be undone.\n\nType the gym name "${gym.name}" below to confirm.`,
                confirmLabel: 'Delete Forever', destructive: true,
                inputPlaceholder: gym.name, inputValue: '',
                onConfirm: () => {
                  if (dialogInputRef.current.trim() !== gym.name) {
                    toast.show('The name you typed does not match the gym name. Deletion cancelled.', 'error');
                    return;
                  }
                  doAction(async () => { await executeDangerAction(gymId, 'delete_gym', undefined, dialogInputRef.current.trim()); navigation.goBack(); });
                },
              })}>
              <Icon name="x-octagon" size={14} />
              <Text>Delete Gym</Text>
            </Button>
          </SectionCard>
        </ScrollView>
      )}

      {/* ─── Unsaved-changes bar ──── */}
      {dirty && <SaveBar saving={saving} onSave={handleSave} onCancel={handleDiscard} />}

      {/* ─── Typed-input dialog ──────────────────────────── */}
      <InputDialog state={confirmDialog} onCancel={closeDialog} />
    </KeyboardSafeView>
  );
}
