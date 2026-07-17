import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  TouchableOpacity,
  Switch,
  Modal,
  Animated,
  Linking,
  Dimensions,
  RefreshControl,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Radius, Spacing } from '@/constants/theme';
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
  type SubscriptionDetailResponse,
  type AuditLog,
} from '@/lib/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GymSubscription'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Utility helpers ───────────────────────────────────────────────────────────

function fmtDate(iso?: string | null, fallback = '—'): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(iso?: string | null, fallback = '—'): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function daysRemaining(iso?: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatCurrency(amount?: number | null): string {
  if (amount == null) return '₹0';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return Colors.emerald;
    case 'trial': return Colors.amber;
    case 'expired': return Colors.red;
    case 'cancelled': return Colors.red;
    case 'suspended': return Colors.amber;
    default: return Colors.textMuted;
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case 'active': return Colors.emeraldBg;
    case 'trial': return Colors.amberBg;
    case 'expired': return Colors.redBg;
    case 'cancelled': return Colors.redBg;
    case 'suspended': return Colors.amberBg;
    default: return Colors.bgInput;
  }
}

function getDaysBadgeColor(days: number | null): string {
  if (days === null) return Colors.emerald; // lifetime
  if (days > 14) return Colors.emerald;
  if (days > 0) return Colors.amber;
  return Colors.red;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, color = Colors.indigo }: { icon: string; title: string; color?: string }) {
  return (
    <View style={sectionHeaderStyles.row}>
      <View style={[sectionHeaderStyles.iconBox, { backgroundColor: color + '22', borderColor: color + '44' }]}>
        <Feather name={icon as any} size={14} color={color} />
      </View>
      <Text style={sectionHeaderStyles.title}>{title}</Text>
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  iconBox: {
    width: 28, height: 28, borderRadius: Radius.sm,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
});

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={infoRowStyles.row}>
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={[infoRowStyles.value, mono && { fontFamily: 'Courier', fontSize: 11 }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  label: { fontSize: 12, color: Colors.textMuted, flex: 1 },
  value: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', textAlign: 'right', flex: 1.2 },
});

function Divider() {
  return <View style={{ height: 1, backgroundColor: Colors.bgCardBorder, marginVertical: Spacing.xs }} />;
}

function StatusChip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[chipStyles.chip, { backgroundColor: bg, borderColor: color + '55' }]}>
      <Text style={[chipStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  text: { fontSize: 12, fontWeight: '700' },
});

// ─── Confirmation Dialog ────────────────────────────────────────────────────────

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
  inputPlaceholder?: string;
  inputValue?: string;
  onInputChange?: (v: string) => void;
};

function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmColor = Colors.indigo,
  onConfirm,
  onCancel,
  inputPlaceholder,
  inputValue,
  onInputChange,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={dialogStyles.overlay}>
        <View style={dialogStyles.box}>
          <Text style={dialogStyles.title}>{title}</Text>
          <Text style={dialogStyles.message}>{message}</Text>
          {inputPlaceholder && (
            <TextInput
              value={inputValue}
              onChangeText={onInputChange}
              placeholder={inputPlaceholder}
              placeholderTextColor={Colors.textMuted}
              style={dialogStyles.input}
              multiline
            />
          )}
          <View style={dialogStyles.btnRow}>
            <TouchableOpacity style={[dialogStyles.btn, dialogStyles.cancelBtn]} onPress={onCancel}>
              <Text style={dialogStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dialogStyles.btn, { backgroundColor: confirmColor }]}
              onPress={onConfirm}
            >
              <Text style={dialogStyles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dialogStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  box: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.bgCardBorder,
    padding: Spacing.xl, width: '100%', gap: Spacing.md,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  message: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  input: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder,
    borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 13, minHeight: 72, textAlignVertical: 'top',
  },
  btnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
  btn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center' },
  cancelBtn: { backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder },
  cancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── FAB Speed Dial ─────────────────────────────────────────────────────────────

type FABAction = { icon: string; label: string; onPress: () => void; color?: string };

function FABSpeedDial({ actions, ownerPhone }: { actions: FABAction[]; ownerPhone?: string }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  function toggle() {
    Animated.spring(anim, {
      toValue: open ? 0 : 1,
      useNativeDriver: true,
      bounciness: 8,
    }).start();
    setOpen(v => !v);
  }

  const rotation = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <>
      {open && (
        <TouchableOpacity style={fabStyles.backdrop} onPress={toggle} activeOpacity={1} />
      )}
      <View style={fabStyles.container} pointerEvents="box-none">
        {open && actions.map((action, i) => {
          const translateY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -(60 * (actions.length - i))],
          });
          return (
            <Animated.View key={i} style={[fabStyles.actionContainer, { transform: [{ translateY }] }]}>
              <Text style={fabStyles.actionLabel}>{action.label}</Text>
              <TouchableOpacity
                style={[fabStyles.actionBtn, { backgroundColor: action.color || Colors.indigo }]}
                onPress={() => { toggle(); action.onPress(); }}
              >
                <Feather name={action.icon as any} size={16} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
        <TouchableOpacity style={fabStyles.fab} onPress={toggle} activeOpacity={0.85}>
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Feather name="plus" size={24} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
}

const fabStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', zIndex: 10 },
  container: {
    position: 'absolute', bottom: 90, right: Spacing.lg,
    alignItems: 'flex-end', zIndex: 20,
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.indigo, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: Colors.indigo, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  actionContainer: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    marginBottom: 12, position: 'absolute', right: 0,
  },
  actionLabel: {
    backgroundColor: Colors.bgCard, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.md, fontSize: 12, fontWeight: '600', color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  actionBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4,
  },
});

// ─── Sticky Bottom Bar ───────────────────────────────────────────────────────────

function StickyBottomBar({ visible, saving, onSave, onCancel }: {
  visible: boolean; saving: boolean;
  onSave: () => void; onCancel: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: visible ? 1 : 0, useNativeDriver: true }).start();
  }, [visible]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] });

  return (
    <Animated.View style={[stickyStyles.bar, { transform: [{ translateY }] }]}>
      <TouchableOpacity style={stickyStyles.cancelBtn} onPress={onCancel} disabled={saving}>
        <Text style={stickyStyles.cancelText}>Discard</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[stickyStyles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={onSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator size="small" color="#fff" />
          : <><Feather name="save" size={14} color="#fff" /><Text style={stickyStyles.saveText}>Save Changes</Text></>
        }
      </TouchableOpacity>
    </Animated.View>
  );
}

const stickyStyles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', padding: Spacing.lg, gap: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1, borderTopColor: Colors.bgCardBorder,
    elevation: 20, zIndex: 30,
  },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md,
    alignItems: 'center', backgroundColor: Colors.bgInput,
    borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  saveBtn: {
    flex: 2, paddingVertical: Spacing.md, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: Colors.indigo,
  },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── Date Picker Card ──────────────────────────────────────────────────────────

function DateCard({
  label, value, onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const [show, setShow] = useState(false);
  const displayDate = value ? fmtDate(value.toISOString()) : 'Not Set';

  return (
    <View style={dateCardStyles.card}>
      <Text style={dateCardStyles.label}>{label}</Text>
      <View style={dateCardStyles.row}>
        <Text style={[dateCardStyles.value, !value && { color: Colors.textMuted }]}>{displayDate}</Text>
        <TouchableOpacity style={dateCardStyles.changeBtn} onPress={() => setShow(true)}>
          <Feather name="calendar" size={12} color={Colors.indigo} />
          <Text style={dateCardStyles.changeBtnText}>Change</Text>
        </TouchableOpacity>
      </View>
      {show && (
        <DateTimePicker
          value={value || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_e: any, d?: Date) => {
            setShow(false);
            if (d) onChange(d);
          }}
        />
      )}
    </View>
  );
}

const dateCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.md, gap: 8,
  },
  label: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  changeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.indigoBg, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.indigoBorder,
  },
  changeBtnText: { fontSize: 11, fontWeight: '700', color: Colors.indigo },
});

// ─── Timeline Item ─────────────────────────────────────────────────────────────

function TimelineItem({ log, isLast }: { log: AuditLog; isLast: boolean }) {
  return (
    <View style={timelineStyles.row}>
      <View style={timelineStyles.dotCol}>
        <View style={timelineStyles.dot} />
        {!isLast && <View style={timelineStyles.line} />}
      </View>
      <View style={[timelineStyles.content, !isLast && { marginBottom: 16 }]}>
        <Text style={timelineStyles.action}>{log.action}</Text>
        <Text style={timelineStyles.meta}>
          {fmtDateTime(log.created_at)} · {log.performed_by}
        </Text>
        {log.notes ? <Text style={timelineStyles.notes}>{log.notes}</Text> : null}
        {log.prev_plan && log.new_plan && log.prev_plan !== log.new_plan && (
          <View style={timelineStyles.planChange}>
            <StatusChip label={log.prev_plan} color={Colors.textMuted} bg={Colors.bgInput} />
            <Feather name="arrow-right" size={10} color={Colors.textMuted} />
            <StatusChip label={log.new_plan} color={Colors.indigo} bg={Colors.indigoBg} />
          </View>
        )}
      </View>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md },
  dotCol: { alignItems: 'center', width: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.indigo, marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: Colors.bgCardBorder, marginTop: 4 },
  content: { flex: 1 },
  action: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  meta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  notes: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 16 },
  planChange: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
});

// ─── Action Button (Quick Actions) ─────────────────────────────────────────────

function QuickActionBtn({
  icon, label, color, bg, onPress, disabled,
}: {
  icon: string; label: string; color: string; bg: string;
  onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[qaStyles.btn, { backgroundColor: bg, borderColor: color + '55' }, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Feather name={icon as any} size={16} color={color} />
      <Text style={[qaStyles.text, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const qaStyles = StyleSheet.create({
  btn: {
    flex: 1, minWidth: '30%', borderRadius: Radius.md, borderWidth: 1,
    padding: Spacing.md, alignItems: 'center', gap: 6,
  },
  text: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
});

// ─── Tab Bar ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview', icon: 'activity' },
  { key: 'billing',  label: 'Billing',  icon: 'credit-card' },
  { key: 'history',  label: 'History',  icon: 'list' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function GymSubscriptionScreen({ route, navigation }: Props) {
  const { gymId } = route.params;

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Load state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<SubscriptionDetailResponse | null>(null);

  // Edit state (for sticky bar)
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Admin notes
  const [adminNotes, setAdminNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);

  // Internal flags
  const [flags, setFlags] = useState({
    is_vip: false,
    is_payment_verified: false,
    whatsapp_enabled: true,
    priority_support: false,
    auto_renewal_eligible: false,
    lifetime_offer: false,
  });

  // Subscription dates
  const [subStartDate, setSubStartDate] = useState<Date | null>(null);
  const [subEndDate, setSubEndDate] = useState<Date | null>(null);
  const [trialStartDate, setTrialStartDate] = useState<Date | null>(null);
  const [trialEndDate, setTrialEndDate] = useState<Date | null>(null);
  const [datesChanged, setDatesChanged] = useState(false);

  // Confirmation dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean; title: string; message: string; confirmLabel?: string;
    confirmColor?: string; onConfirm: () => void;
    inputPlaceholder?: string; inputValue?: string; onInputChange?: (v: string) => void;
  }>({
    visible: false, title: '', message: '', onConfirm: () => {},
  });

  const [rejectionReason, setRejectionReason] = useState('');
  const [customTrialDays, setCustomTrialDays] = useState('7');

  // Action loading states
  const [actionLoading, setActionLoading] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────

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
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load subscription details');
      navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gymId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Save handler (notes + flags + dates) ─────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const promises: Promise<void>[] = [];

      // Save notes + flags
      promises.push(
        saveAdminNotes(gymId, {
          admin_notes: adminNotes,
          ...flags,
        })
      );

      // Save dates if changed
      if (datesChanged) {
        promises.push(
          updateSubscriptionDates(gymId, {
            subscription_started_at: subStartDate?.toISOString() ?? null,
            subscription_ends_at: subEndDate?.toISOString() ?? null,
            trial_started_at: trialStartDate?.toISOString() ?? null,
            trial_ends_at: trialEndDate?.toISOString() ?? null,
          })
        );
      }

      await Promise.all(promises);
      setDirty(false);
      setDatesChanged(false);
      Alert.alert('✓ Saved', 'Changes saved successfully');
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save changes');
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

  // ── Quick Action handlers ─────────────────────────────────────────

  function confirmAction(opts: {
    title: string; message: string; confirmLabel?: string; confirmColor?: string;
    inputPlaceholder?: string; inputValue?: string; onInputChange?: (v: string) => void;
    onConfirm: () => void;
  }) {
    if (opts.inputPlaceholder) {
      setConfirmDialog({
        visible: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel,
        confirmColor: opts.confirmColor,
        inputPlaceholder: opts.inputPlaceholder,
        inputValue: '',
        onInputChange: (v) => setConfirmDialog(prev => ({ ...prev, inputValue: v })),
        onConfirm: opts.onConfirm,
      });
    } else {
      setConfirmDialog({
        visible: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel,
        confirmColor: opts.confirmColor,
        onConfirm: opts.onConfirm,
      });
    }
  }

  function closeDialog() {
    setConfirmDialog(prev => ({ ...prev, visible: false }));
  }

  async function doAction(fn: () => Promise<void>) {
    setActionLoading(true);
    closeDialog();
    try {
      await fn();
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.indigo} size="large" />
        <Text style={styles.loadingText}>Loading subscription data...</Text>
      </View>
    );
  }

  if (!data) return null;

  const { gym, owner, pendingRequest, timeline, usageStats } = data;
  const days = daysRemaining(
    gym.subscription_status === 'trial' ? gym.trial_ends_at : gym.subscription_ends_at
  );
  const statusColor = getStatusColor(gym.subscription_status);
  const statusBg = getStatusBg(gym.subscription_status);

  // Renewal history = timeline items that have plan info (successful activations)
  const renewalHistory = timeline.filter(l =>
    l.new_plan && l.new_plan !== 'trial' && l.action.toLowerCase().includes('activat')
  );

  // FAB actions
  const fabActions: FABAction[] = [
    {
      icon: 'check-circle', label: 'Activate Monthly', color: Colors.emerald,
      onPress: () => confirmAction({
        title: 'Activate Monthly Subscription?',
        message: 'This will activate a Monthly subscription starting today for 30 days.',
        confirmLabel: 'Activate',
        confirmColor: Colors.emerald,
        onConfirm: () => doAction(() => activateSubscription(gymId, 'monthly')),
      }),
    },
    {
      icon: 'credit-card', label: 'Approve Payment', color: Colors.indigo,
      onPress: () => {
        if (!pendingRequest) {
          Alert.alert('No Pending Request', 'There is no pending payment request to approve.');
          return;
        }
        confirmAction({
          title: 'Approve Payment?',
          message: `Approve and activate Monthly plan for ${gym.name}?`,
          confirmLabel: 'Approve',
          confirmColor: Colors.indigo,
          onConfirm: () => doAction(() => approvePayment(gymId, pendingRequest.id, 'monthly')),
        });
      },
    },
    {
      icon: 'clock', label: 'Extend +7 Days', color: Colors.amber,
      onPress: () => confirmAction({
        title: 'Extend Trial by 7 Days?',
        message: 'This will add 7 more days to the current trial expiry.',
        confirmLabel: 'Extend',
        confirmColor: Colors.amber,
        onConfirm: () => doAction(() => extendTrial(gymId, 'extend', 7)),
      }),
    },
    {
      icon: 'phone', label: 'Call Customer', color: Colors.sky,
      onPress: () => {
        const phone = gym.phone || owner?.phone;
        if (phone) { Linking.openURL(`tel:${phone}`); }
        else { Alert.alert('No Phone', 'No phone number available for this gym.'); }
      },
    },
    {
      icon: 'message-circle', label: 'WhatsApp', color: '#25D366',
      onPress: () => {
        const phone = gym.phone || owner?.phone;
        if (phone) { Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`); }
        else { Alert.alert('No Phone', 'No phone number available for this gym.'); }
      },
    },
  ];

  return (
    <View style={styles.root}>
      {/* ─── Tab Bar ──────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Feather name={tab.icon as any} size={16} color={isActive ? Colors.indigo : Colors.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── OVERVIEW TAB ─────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 160 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={Colors.indigo} />}>
          <View style={styles.card}>
            <SectionHeader icon="activity" title="Gym Information" color={Colors.indigo} />
            <View style={styles.gymHeroRow}>
              <View style={styles.gymAvatar}>
                <Text style={styles.gymAvatarText}>{gym.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gymName}>{gym.name}</Text>
                {gym.city && <Text style={styles.gymCity}>📍 {gym.city}</Text>}
              </View>
              <StatusChip label={gym.is_active ? 'Active' : 'Banned'} color={gym.is_active ? Colors.emerald : Colors.red} bg={gym.is_active ? Colors.emeraldBg : Colors.redBg} />
            </View>
            <Divider />
            <InfoRow label="Owner" value={owner?.email || gym.owner_id} />
            <InfoRow label="Phone" value={gym.phone || '—'} />
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{gym.subscription_status.charAt(0).toUpperCase() + gym.subscription_status.slice(1)}</Text>
              <StatusChip label={gym.plan_type.charAt(0).toUpperCase() + gym.plan_type.slice(1)} color={Colors.indigo} bg={Colors.indigoBg} />
            </View>
            <View style={styles.dateGrid}>
              <View style={styles.dateCell}>
                <Text style={styles.dateCellLabel}>Started</Text>
                <Text style={styles.dateCellValue}>{fmtDate(gym.subscription_started_at || gym.trial_started_at)}</Text>
              </View>
              <View style={styles.dateCell}>
                <Text style={styles.dateCellLabel}>Expires</Text>
                <Text style={styles.dateCellValue}>{gym.plan_type === 'lifetime' ? 'Never' : fmtDate(gym.subscription_ends_at || gym.trial_ends_at)}</Text>
              </View>
            </View>
            {days !== null && (
              <View style={[styles.daysRemainingBadge, { backgroundColor: getDaysBadgeColor(days) + '22', borderColor: getDaysBadgeColor(days) + '55' }]}>
                <Feather name="clock" size={13} color={getDaysBadgeColor(days)} />
                <Text style={[styles.daysRemainingText, { color: getDaysBadgeColor(days) }]}>{days > 0 ? `${days} Days Remaining` : 'Expired'}</Text>
              </View>
            )}
            {gym.plan_type === 'lifetime' && (
              <View style={[styles.daysRemainingBadge, { backgroundColor: Colors.emeraldBg, borderColor: Colors.emeraldBorder }]}>
                <Feather name="infinity" size={13} color={Colors.emerald} />
                <Text style={[styles.daysRemainingText, { color: Colors.emerald }]}>Lifetime Access</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <SectionHeader icon="zap" title="Quick Actions" color={Colors.purple} />
            {actionLoading && (
              <View style={styles.actionLoading}><ActivityIndicator color={Colors.indigo} size="small" /><Text style={styles.actionLoadingText}>Processing...</Text></View>
            )}
            <View style={styles.quickActionsGrid}>
              <QuickActionBtn icon="check-circle" label="Activate Monthly" color={Colors.emerald} bg={Colors.emeraldBg} disabled={actionLoading} onPress={() => confirmAction({ title: 'Activate Monthly Subscription?', message: 'This will activate a Monthly subscription starting today for 30 days.', confirmLabel: 'Activate', confirmColor: Colors.emerald, onConfirm: () => doAction(() => activateSubscription(gymId, 'monthly')) })} />
              <QuickActionBtn icon="calendar" label="Activate Yearly" color={Colors.indigo} bg={Colors.indigoBg} disabled={actionLoading} onPress={() => confirmAction({ title: 'Activate Yearly Subscription?', message: 'This will activate a Yearly subscription starting today for 365 days.', confirmLabel: 'Activate', confirmColor: Colors.indigo, onConfirm: () => doAction(() => activateSubscription(gymId, 'yearly')) })} />
              <QuickActionBtn icon="star" label="Activate Lifetime" color={Colors.amber} bg={Colors.amberBg} disabled={actionLoading} onPress={() => confirmAction({ title: 'Activate Lifetime Subscription?', message: 'This will grant permanent lifetime access. This cannot be automatically reversed.', confirmLabel: 'Activate', confirmColor: Colors.amber, onConfirm: () => doAction(() => activateSubscription(gymId, 'lifetime')) })} />
              <QuickActionBtn icon="clock" label="Extend Trial" color={Colors.sky} bg={Colors.skyBg} disabled={actionLoading} onPress={() => confirmAction({ title: 'Extend Trial by 7 Days?', message: 'This will add 7 more days to the current trial expiry.', confirmLabel: 'Extend', confirmColor: Colors.sky, onConfirm: () => doAction(() => extendTrial(gymId, 'extend', 7)) })} />
              <QuickActionBtn icon="refresh-cw" label="Reset Trial" color={Colors.purple} bg={Colors.purpleBg} disabled={actionLoading} onPress={() => confirmAction({ title: 'Reset Trial?', message: 'This will reset the trial to a fresh 14-day trial starting today.', confirmLabel: 'Reset', confirmColor: Colors.purple, onConfirm: () => doAction(() => extendTrial(gymId, 'reset')) })} />
              <QuickActionBtn icon="x-circle" label="Expire Now" color={Colors.red} bg={Colors.redBg} disabled={actionLoading} onPress={() => confirmAction({ title: 'Expire Subscription Now?', message: 'This will immediately mark the subscription as expired. The gym owner will lose access.', confirmLabel: 'Expire Now', confirmColor: Colors.red, onConfirm: () => doAction(() => expireSubscription(gymId, 'Admin forced expiry')) })} />
            </View>
          </View>

          {pendingRequest && (
            <View style={[styles.card, { borderColor: Colors.amberBorder }]}>
              <SectionHeader icon="alert-circle" title="Pending Renewal Request" color={Colors.amber} />
              <View style={[styles.pendingBadge]}>
                <View style={styles.pendingDot} />
                <Text style={styles.pendingText}>Pending Verification</Text>
              </View>
              <InfoRow label="Submitted" value={fmtDateTime(pendingRequest.submitted_at)} />
              <InfoRow label="Transaction ID" value={pendingRequest.transaction_id || '—'} mono />
              {pendingRequest.notes && (
                <View style={styles.pendingNotes}><Text style={styles.pendingNoteText}>{pendingRequest.notes}</Text></View>
              )}
              {pendingRequest.uploaded_file_url && (
                <TouchableOpacity style={styles.viewScreenshotBtn} onPress={() => Linking.openURL(pendingRequest.uploaded_file_url)}>
                  <Feather name="image" size={14} color={Colors.indigo} />
                  <Text style={styles.viewScreenshotText}>View Payment Screenshot</Text>
                </TouchableOpacity>
              )}
              <View style={styles.approveRejectRow}>
                <TouchableOpacity style={[styles.approveBtn]} disabled={actionLoading} onPress={() => confirmAction({ title: 'Approve Payment?', message: `Approve the payment for ${gym.name} and activate Monthly plan?`, confirmLabel: 'Approve', confirmColor: Colors.emerald, onConfirm: () => doAction(() => approvePayment(gymId, pendingRequest.id, 'monthly')) })}>
                  <Feather name="check" size={14} color={Colors.emerald} />
                  <Text style={[styles.approveRejectText, { color: Colors.emerald }]}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.rejectBtn]} disabled={actionLoading} onPress={() => { setRejectionReason(''); confirmAction({ title: 'Reject Payment?', message: 'Please provide a reason for rejection. This will be visible to the gym owner.', confirmLabel: 'Reject', confirmColor: Colors.red, inputPlaceholder: 'Rejection reason (required)...', inputValue: rejectionReason, onInputChange: setRejectionReason, onConfirm: () => { const reason = confirmDialog.inputValue || rejectionReason; if (!reason?.trim()) { Alert.alert('Required', 'Please enter a rejection reason'); return; } doAction(() => rejectPayment(gymId, pendingRequest.id, reason)); } }); }}>
                  <Feather name="x" size={14} color={Colors.red} />
                  <Text style={[styles.approveRejectText, { color: Colors.red }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <SectionHeader icon="bar-chart-2" title="Usage Statistics" color={Colors.sky} />
            <View style={styles.statsGrid}>
              {[
                { label: 'Members', value: usageStats?.total_members?.toLocaleString() || '0', icon: 'users', color: Colors.indigo },
                { label: 'Revenue', value: formatCurrency(usageStats?.total_revenue), icon: 'trending-up', color: Colors.emerald },
                { label: 'Attendance', value: usageStats?.total_attendance?.toLocaleString() || '0', icon: 'activity', color: Colors.sky },
                { label: 'WhatsApp', value: `${usageStats?.whatsapp_sent?.toLocaleString() || '0'} msgs`, icon: 'message-circle', color: '#25D366' },
                { label: 'Payments', value: usageStats?.total_payments?.toLocaleString() || '0', icon: 'credit-card', color: Colors.amber },
                { label: 'Reports', value: usageStats?.reports_generated?.toLocaleString() || '0', icon: 'file-text', color: Colors.purple },
                { label: 'Storage', value: usageStats?.storage_used_kb ? `${(usageStats.storage_used_kb / 1024).toFixed(1)} MB` : '0 MB', icon: 'hard-drive', color: Colors.textSecondary },
                { label: 'Last Active', value: usageStats?.last_active_at ? fmtDate(usageStats.last_active_at) : '—', icon: 'clock', color: Colors.textMuted },
              ].map((stat, i) => (
                <View key={i} style={styles.statCell}>
                  <Feather name={stat.icon as any} size={16} color={stat.color} />
                  <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ─── BILLING TAB ────────────────────────────────────────────── */}
      {activeTab === 'billing' && (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 160 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={Colors.indigo} />}>
          <View style={styles.card}>
            <SectionHeader icon="dollar-sign" title="Payment Information" color={Colors.emerald} />
            <InfoRow label="Last Amount" value={formatCurrency(gym.last_payment_amount)} />
            <InfoRow label="Payment Method" value={gym.last_payment_method || '—'} />
            <InfoRow label="Transaction ID" value={gym.last_transaction_id || '—'} mono />
            <InfoRow label="Payment Date" value={fmtDate(gym.last_payment_date)} />
            <InfoRow label="Payment Status" value={gym.last_payment_status === 'paid' ? '✅ Paid' : gym.last_payment_status === 'pending' ? '🟡 Pending' : gym.last_payment_status === 'failed' ? '❌ Failed' : '—'} />
          </View>

          <View style={styles.card}>
            <SectionHeader icon="calendar" title="Subscription Dates" color={Colors.indigo} />
            <DateCard label="Subscription Started" value={subStartDate} onChange={d => { setSubStartDate(d); setDatesChanged(true); setDirty(true); }} />
            <DateCard label="Subscription Ends" value={subEndDate} onChange={d => { setSubEndDate(d); setDatesChanged(true); setDirty(true); }} />
            <Divider />
            <DateCard label="Trial Started" value={trialStartDate} onChange={d => { setTrialStartDate(d); setDatesChanged(true); setDirty(true); }} />
            <DateCard label="Trial Ends" value={trialEndDate} onChange={d => { setTrialEndDate(d); setDatesChanged(true); setDirty(true); }} />
          </View>

          {gym.subscription_status === 'trial' && (
            <View style={[styles.card, { borderColor: Colors.amberBorder }]}>
              <SectionHeader icon="clock" title="Trial Information" color={Colors.amber} />
              <InfoRow label="Trial Started" value={fmtDate(gym.trial_started_at)} />
              <InfoRow label="Trial Ends" value={fmtDate(gym.trial_ends_at)} />
              <Divider />
              <Text style={styles.subLabel}>EXTEND TRIAL</Text>
              <View style={styles.trialBtnRow}>
                {[3, 7, 14].map(d => (
                  <TouchableOpacity key={d} style={styles.trialExtBtn} disabled={actionLoading} onPress={() => confirmAction({ title: `Extend Trial by ${d} Days?`, message: `This will add ${d} days to the current trial expiry date.`, confirmLabel: `+${d} Days`, confirmColor: Colors.amber, onConfirm: () => doAction(() => extendTrial(gymId, 'extend', d)) })}>
                    <Text style={styles.trialExtBtnText}>+{d} Days</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.trialExtBtn, { backgroundColor: Colors.indigoBg, borderColor: Colors.indigoBorder }]} disabled={actionLoading} onPress={() => confirmAction({ title: 'Extend Trial by Custom Days?', message: 'Enter number of days to extend the trial.', confirmLabel: 'Extend', confirmColor: Colors.indigo, inputPlaceholder: 'Number of days (e.g. 10)', inputValue: customTrialDays, onInputChange: setCustomTrialDays, onConfirm: () => doAction(() => extendTrial(gymId, 'custom', parseInt(confirmDialog.inputValue || '7', 10))) })}>
                  <Text style={[styles.trialExtBtnText, { color: Colors.indigo }]}>Custom</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── HISTORY TAB ────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 160 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={Colors.indigo} />}>
          <View style={styles.card}>
            <SectionHeader icon="repeat" title="Renewal History" color={Colors.sky} />
            {renewalHistory.length === 0 ? (
              <Text style={styles.emptyText}>No renewal history yet.</Text>
            ) : (
              renewalHistory.map((log, i) => (
                <View key={log.id}>
                  <View style={styles.renewalRow}>
                    <View style={[styles.renewalPlanBadge, { backgroundColor: Colors.indigoBg, borderColor: Colors.indigoBorder }]}>
                      <Text style={styles.renewalPlanText}>{log.new_plan?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.renewalDates}>
                        {fmtDate(log.created_at)}
                        {log.new_expiry ? ` → ${fmtDate(log.new_expiry)}` : ''}
                      </Text>
                      <Text style={styles.renewalStatus}>{log.new_status?.toUpperCase() || 'ACTIVE'}</Text>
                    </View>
                  </View>
                  {i < renewalHistory.length - 1 && <Divider />}
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <SectionHeader icon="list" title="Activity Timeline" color={Colors.indigo} />
            {timeline.length === 0 ? (
              <Text style={styles.emptyText}>No activity recorded yet.</Text>
            ) : (
              timeline.slice(0, 20).map((log, i) => (
                <TimelineItem key={log.id} log={log} isLast={i === Math.min(timeline.length, 20) - 1} />
              ))
            )}
            {timeline.length > 20 && (
              <Text style={styles.moreText}>+{timeline.length - 20} more entries</Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* ─── SETTINGS TAB ───────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 160 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={Colors.indigo} />}>
          <View style={styles.card}>
            <SectionHeader icon="edit-3" title="Admin Notes" color={Colors.purple} />
            {editingNotes ? (
              <>
                <TextInput value={adminNotes} onChangeText={v => { setAdminNotes(v); setDirty(true); }} placeholder="Add internal notes about this customer..." placeholderTextColor={Colors.textMuted} style={styles.notesInput} multiline autoFocus textAlignVertical="top" />
                <TouchableOpacity style={styles.doneEditingBtn} onPress={() => setEditingNotes(false)}>
                  <Feather name="check" size={12} color={Colors.emerald} />
                  <Text style={styles.doneEditingText}>Done Editing</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.notesDisplay} onPress={() => setEditingNotes(true)}>
                <Text style={adminNotes ? styles.notesText : styles.notesEmpty}>{adminNotes || 'Tap to add notes about this customer...'}</Text>
                <Feather name="edit-2" size={14} color={Colors.textMuted} style={{ alignSelf: 'flex-start', marginTop: 2 }} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <SectionHeader icon="toggle-right" title="Internal Flags" color={Colors.amber} />
            <Text style={styles.flagsNote}>Admin only — not visible to gym owner</Text>
            {[
              { key: 'is_vip', label: 'VIP Customer', icon: 'star', color: Colors.amber },
              { key: 'is_payment_verified', label: 'Payment Verified', icon: 'check-circle', color: Colors.emerald },
              { key: 'whatsapp_enabled', label: 'WhatsApp Enabled', icon: 'message-circle', color: '#25D366' },
              { key: 'priority_support', label: 'Priority Support', icon: 'headphones', color: Colors.sky },
              { key: 'auto_renewal_eligible', label: 'Auto Renewal Eligible', icon: 'refresh-cw', color: Colors.indigo },
              { key: 'lifetime_offer', label: 'Lifetime Offer Available', icon: 'gift', color: Colors.purple },
            ].map(({ key, label, icon, color }) => (
              <View key={key} style={styles.flagRow}>
                <View style={styles.flagLeft}>
                  <Feather name={icon as any} size={14} color={color} />
                  <Text style={styles.flagLabel}>{label}</Text>
                </View>
                <Switch value={flags[key as keyof typeof flags]} onValueChange={v => { setFlags(prev => ({ ...prev, [key]: v })); setDirty(true); }} trackColor={{ false: Colors.bgInput, true: color + '44' }} thumbColor={flags[key as keyof typeof flags] ? color : Colors.textMuted} />
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <SectionHeader icon="shield" title="Security Information" color={Colors.emerald} />
            <InfoRow label="Registered Email" value={owner?.email || '—'} />
            <InfoRow label="Last Login" value={fmtDateTime(owner?.last_sign_in_at)} />
            <InfoRow label="Account Created" value={fmtDate(owner?.created_at)} />
            <InfoRow label="Email Verified" value={owner?.email_confirmed_at ? '✅ Verified' : '❌ Pending'} />
            <InfoRow label="Login Disabled" value={gym.login_disabled ? '🔴 Yes' : '🟢 No'} />
          </View>

          <View style={[styles.card, styles.dangerCard]}>
            <SectionHeader icon="alert-triangle" title="Danger Zone" color={Colors.red} />
            <Text style={styles.dangerNote}>All actions are irreversible or require confirmation. Proceed with caution.</Text>
            <View style={styles.dangerGrid}>
              {[
                { label: 'Disable Login', icon: 'user-x', action: 'disable_login', msg: 'This will immediately prevent the gym owner from logging in.' },
                { label: 'Enable Login', icon: 'user-check', action: 'enable_login', msg: 'This will re-enable gym owner login.' },
                { label: 'Clear Subscription', icon: 'trash-2', action: 'clear_subscription', msg: 'This will clear all subscription data and reset the gym to trial status.' },
                { label: 'Ban Account', icon: 'slash', action: 'ban', msg: 'This will ban the gym account. The gym owner will lose all access.' },
                { label: 'Unban Account', icon: 'check-circle', action: 'unban', msg: 'This will unban the gym account and restore access.' },
                { label: 'Delete Gym', icon: 'x-octagon', action: 'delete_gym', msg: '⚠️ PERMANENT. This will delete the gym and ALL its data including members, attendance, and payments. This CANNOT be undone.' },
              ].map(({ label, icon, action, msg }) => (
                <TouchableOpacity key={action} style={[styles.dangerBtn, action === 'delete_gym' && { borderColor: Colors.red, backgroundColor: Colors.redBg }]} disabled={actionLoading} onPress={() => confirmAction({ title: `${label}?`, message: msg, confirmLabel: label, confirmColor: Colors.red, onConfirm: () => doAction(async () => { const result = await executeDangerAction(gymId, action as any); if (action === 'delete_gym') { navigation.goBack(); } }) })}>
                  <Feather name={icon as any} size={14} color={Colors.red} />
                  <Text style={styles.dangerBtnText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ─── Sticky Bottom Bar (save notes/flags/dates) ──── */}
      <StickyBottomBar
        visible={dirty}
        saving={saving}
        onSave={handleSave}
        onCancel={handleDiscard}
      />

      {/* ─── FAB ─────────────────────────────────────────── */}
      <FABSpeedDial
        actions={fabActions}
        ownerPhone={gym.phone || owner?.phone}
      />

      {/* ─── Confirm Dialog ──────────────────────────────── */}
      <ConfirmDialog
        visible={confirmDialog.visible}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        confirmColor={confirmDialog.confirmColor}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeDialog}
        inputPlaceholder={confirmDialog.inputPlaceholder}
        inputValue={confirmDialog.inputValue}
        onInputChange={confirmDialog.onInputChange}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  centered: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontSize: 13, color: Colors.textMuted },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgCardBorder,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: Colors.indigo },
  tabText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.indigo, fontWeight: '700' },

  // Cards
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  dangerCard: { borderColor: Colors.redBorder },

  // Gym hero
  gymHeroRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  gymAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.indigoBg, borderWidth: 2, borderColor: Colors.indigoBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  gymAvatarText: { fontSize: 22, fontWeight: '800', color: Colors.indigo },
  gymName: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  gymCity: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  vipBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.amberBg, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: Colors.amberBorder, marginTop: 4,
  },
  vipText: { fontSize: 11, fontWeight: '700', color: Colors.amber },

  // Status
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 18, fontWeight: '800', flex: 1 },
  dateGrid: { flexDirection: 'row', gap: Spacing.md },
  dateCell: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.md, gap: 4,
  },
  dateCellLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  dateCellValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  daysRemainingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  daysRemainingText: { fontSize: 13, fontWeight: '700' },

  // Trial
  subLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  trialBtnRow: { flexDirection: 'row', gap: Spacing.sm },
  trialExtBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.full,
    backgroundColor: Colors.amberBg, borderWidth: 1, borderColor: Colors.amberBorder,
    alignItems: 'center',
  },
  trialExtBtnText: { fontSize: 12, fontWeight: '700', color: Colors.amber },

  // Quick Actions
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  actionLoadingText: { fontSize: 12, color: Colors.textMuted },

  // Pending
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.amberBg, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.amberBorder,
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.amber },
  pendingText: { fontSize: 12, fontWeight: '700', color: Colors.amber },
  pendingNotes: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.sm,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  pendingNoteText: { fontSize: 12, color: Colors.textSecondary },
  viewScreenshotBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.indigoBg, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.indigoBorder,
    alignSelf: 'flex-start',
  },
  viewScreenshotText: { fontSize: 12, fontWeight: '700', color: Colors.indigo },
  approveRejectRow: { flexDirection: 'row', gap: Spacing.md },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.emeraldBg, borderRadius: Radius.md,
    paddingVertical: 12, borderWidth: 1, borderColor: Colors.emeraldBorder,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.redBg, borderRadius: Radius.md,
    paddingVertical: 12, borderWidth: 1, borderColor: Colors.redBorder,
  },
  approveRejectText: { fontSize: 13, fontWeight: '700' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCell: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.lg * 2 - Spacing.sm * 3) / 4,
    backgroundColor: Colors.bgInput, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.bgCardBorder,
    padding: Spacing.md, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  statLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', fontWeight: '600' },

  // Notes
  notesInput: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.indigoBorder,
    borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 13, minHeight: 100, textAlignVertical: 'top',
  },
  notesDisplay: {
    flexDirection: 'row', gap: 8,
    backgroundColor: Colors.bgInput, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.md,
  },
  notesText: { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  notesEmpty: { flex: 1, fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' },
  doneEditingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.emeraldBg, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.emeraldBorder,
  },
  doneEditingText: { fontSize: 11, fontWeight: '700', color: Colors.emerald },

  // Flags
  flagsNote: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 4 },
  flagRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  flagLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  flagLabel: { fontSize: 13, color: Colors.textPrimary },

  // Renewal history
  renewalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6 },
  renewalPlanBadge: {
    borderRadius: Radius.sm, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center',
  },
  renewalPlanText: { fontSize: 11, fontWeight: '800', color: Colors.indigo },
  renewalDates: { fontSize: 12, color: Colors.textPrimary, fontWeight: '600' },
  renewalStatus: { fontSize: 10, color: Colors.textMuted, marginTop: 2, fontWeight: '700' },

  // Danger
  dangerNote: {
    fontSize: 12, color: Colors.red, backgroundColor: Colors.redBg,
    borderRadius: Radius.sm, padding: Spacing.md, lineHeight: 18,
    borderWidth: 1, borderColor: Colors.redBorder,
  },
  dangerGrid: { gap: Spacing.sm },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  dangerBtnText: { fontSize: 13, fontWeight: '600', color: Colors.red },

  // Generic
  emptyText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  moreText: { fontSize: 12, color: Colors.indigo, textAlign: 'center', paddingTop: 8 },
});
