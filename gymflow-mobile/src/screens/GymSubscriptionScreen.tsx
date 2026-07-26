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
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';

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
  fetchGymActivityLogs,
  type SubscriptionDetailResponse,
  type AuditLog,
  type GymActivityEvent,
} from '@/lib/api';
import { getSupabaseRealtimeClient } from '@/lib/supabase-realtime';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GymSubscription'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Design tokens (matching the reference image) ─────────────────────────────

const D = {
  bg: '#0d0f1a',          // deep navy background
  card: '#131726',         // card background
  cardBorder: '#1e2438',   // card border
  input: '#0f1220',        // input background
  headerBg: '#0d0f1a',

  text: '#f0f2ff',
  textSub: '#8b92b5',
  textMuted: '#4b5175',

  indigo: '#7c83f5',       // primary blue-purple (tab active)
  indigoGlow: 'rgba(124,131,245,0.18)',

  emerald: '#34d399',
  emeraldBg: 'rgba(52,211,153,0.12)',

  amber: '#f5a623',        // golden for trial plan
  amberBg: 'rgba(245,166,35,0.12)',

  red: '#f87171',
  redBg: 'rgba(248,113,113,0.12)',

  purple: '#c084fc',
  purpleBg: 'rgba(192,132,252,0.12)',

  sky: '#38bdf8',
  skyBg: 'rgba(56,189,248,0.12)',

  green: '#25D366',
  greenBg: 'rgba(37,211,102,0.12)',

  // Quick action colors from ref image
  qaGreen: '#1a3a2a',      // Activate Monthly bg (dark green tinted)
  qaGreenBorder: '#26a859',
  qaGreenText: '#4ade80',

  qaPurple: '#1e1840',     // Activate Yearly bg (dark purple tinted)
  qaPurpleBorder: '#5b4fcf',
  qaPurpleText: '#818cf8',

  qaGold: '#2a2010',       // Activate Lifetime bg (dark gold tinted)
  qaGoldBorder: '#a07830',
  qaGoldText: '#f5a623',

  qaTeal: '#0e2535',       // Extend Trial bg (dark teal tinted)
  qaTealBorder: '#1e7fa0',
  qaTealText: '#38bdf8',

  qaMagenta: '#251528',    // Reset Trial bg (dark magenta)
  qaMagentaBorder: '#7c3da0',
  qaMagentaText: '#c084fc',

  qaDarkRed: '#251520',    // Expire Now bg (dark red)
  qaDarkRedBorder: '#8b2a2a',
  qaDarkRedText: '#f87171',
};

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
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded));
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${sign}₹${grouped}`;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return D.emerald;
    case 'expiring': return D.amber;
    case 'trial': return D.amber;
    case 'expired': return D.red;
    case 'cancelled': return D.red;
    case 'suspended': return D.amber;
    default: return D.textMuted;
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case 'active': return D.emeraldBg;
    case 'expiring': return D.amberBg;
    case 'trial': return D.amberBg;
    case 'expired': return D.redBg;
    case 'cancelled': return D.redBg;
    case 'suspended': return D.amberBg;
    default: return D.input;
  }
}

function getDaysBadgeColor(days: number | null): string {
  if (days === null) return D.emerald;
  if (days > 14) return D.emerald;
  if (days > 0) return D.amber;
  return D.red;
}

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
  inputKeyboardType?: 'default' | 'number-pad';
};

function ConfirmDialog({
  visible, title, message, confirmLabel = 'Confirm',
  confirmColor = D.indigo, onConfirm, onCancel,
  inputPlaceholder, inputValue, onInputChange, inputKeyboardType = 'default',
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={dialogStyles.overlay}
      >
        <View style={dialogStyles.box}>
          <Text style={dialogStyles.title}>{title}</Text>
          <Text style={dialogStyles.message}>{message}</Text>
          {inputPlaceholder && (
            <TextInput
              value={inputValue}
              onChangeText={onInputChange}
              placeholder={inputPlaceholder}
              placeholderTextColor={D.textMuted}
              style={dialogStyles.input}
              multiline={inputKeyboardType === 'default'}
              keyboardType={inputKeyboardType}
              autoFocus
            />
          )}
          <View style={dialogStyles.btnRow}>
            <TouchableOpacity style={[dialogStyles.btn, dialogStyles.cancelBtn]} onPress={onCancel}>
              <Text style={dialogStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[dialogStyles.btn, { backgroundColor: confirmColor }]} onPress={onConfirm}>
              <Text style={dialogStyles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const dialogStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  box: {
    backgroundColor: D.card, borderRadius: 16,
    borderWidth: 1, borderColor: D.cardBorder,
    padding: Spacing.xl, width: '100%', gap: Spacing.md,
  },
  title: { fontSize: 16, fontWeight: '700', color: D.text },
  message: { fontSize: 13, color: D.textSub, lineHeight: 20 },
  input: {
    backgroundColor: D.input, borderWidth: 1, borderColor: D.cardBorder,
    borderRadius: 12, padding: Spacing.md,
    color: D.text, fontSize: 13, minHeight: 72, textAlignVertical: 'top',
  },
  btnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
  btn: { flex: 1, paddingVertical: Spacing.md, borderRadius: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: D.input, borderWidth: 1, borderColor: D.cardBorder },
  cancelText: { fontSize: 14, fontWeight: '600', color: D.textSub },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── FAB Speed Dial ─────────────────────────────────────────────────────────────

type FABAction = { icon: string; label: string; onPress: () => void; color?: string };

function FABSpeedDial({ actions, ownerPhone }: { actions: FABAction[]; ownerPhone?: string }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  function toggle() {
    Animated.spring(anim, { toValue: open ? 0 : 1, useNativeDriver: true, bounciness: 8 }).start();
    setOpen(v => !v);
  }

  const rotation = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <>
      {open && <TouchableOpacity style={fabStyles.backdrop} onPress={toggle} activeOpacity={1} />}
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
                style={[fabStyles.actionBtn, { backgroundColor: action.color || D.indigo }]}
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
  container: { position: 'absolute', bottom: 90, right: Spacing.lg, alignItems: 'flex-end', zIndex: 20 },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: D.indigo, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: D.indigo, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12,
  },
  actionContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: 12, position: 'absolute', right: 0 },
  actionLabel: {
    backgroundColor: D.card, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, fontSize: 12, fontWeight: '600', color: D.text,
    borderWidth: 1, borderColor: D.cardBorder,
  },
  actionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});

// ─── Sticky Bottom Bar ───────────────────────────────────────────────────────────

function StickyBottomBar({ visible, saving, onSave, onCancel }: {
  visible: boolean; saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: visible ? 1 : 0, useNativeDriver: true }).start();
  }, [visible]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] });

  return (
    <Animated.View style={[stickyStyles.bar, { transform: [{ translateY }] }]} pointerEvents={visible ? 'auto' : 'none'}>
      <TouchableOpacity style={stickyStyles.cancelBtn} onPress={onCancel} disabled={saving}>
        <Text style={stickyStyles.cancelText}>Discard</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[stickyStyles.saveBtn, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
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
    backgroundColor: D.card, borderTopWidth: 1, borderTopColor: D.cardBorder,
    elevation: 20, zIndex: 30,
  },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: 12, alignItems: 'center',
    backgroundColor: D.input, borderWidth: 1, borderColor: D.cardBorder,
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: D.textSub },
  saveBtn: {
    flex: 2, paddingVertical: Spacing.md, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: D.indigo,
  },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── DateCard ──────────────────────────────────────────────────────────────────

function DateCard({ label, value, onChange }: { label: string; value: Date | null; onChange: (d: Date) => void }) {
  const displayDate = value ? fmtDate(value.toISOString()) : 'Not Set';
  return (
    <View style={dateCardStyles.card}>
      <Text style={dateCardStyles.label}>{label}</Text>
      <Text style={[dateCardStyles.value, !value && { color: D.textMuted }]}>{displayDate}</Text>
    </View>
  );
}

const dateCardStyles = StyleSheet.create({
  card: {
    backgroundColor: D.input, borderRadius: 12,
    borderWidth: 1, borderColor: D.cardBorder, padding: Spacing.md, gap: 8,
  },
  label: { fontSize: 10, fontWeight: '700', color: D.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: '700', color: D.text },
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
        <Text style={timelineStyles.meta}>{fmtDateTime(log.created_at)} · {log.performed_by}</Text>
        {log.notes ? <Text style={timelineStyles.notes}>{log.notes}</Text> : null}
        {log.prev_plan && log.new_plan && log.prev_plan !== log.new_plan && (
          <View style={timelineStyles.planChange}>
            <View style={timelineStyles.planChip}><Text style={timelineStyles.planChipText}>{log.prev_plan}</Text></View>
            <Feather name="arrow-right" size={10} color={D.textMuted} />
            <View style={[timelineStyles.planChip, { backgroundColor: D.indigoGlow, borderColor: D.indigo + '44' }]}>
              <Text style={[timelineStyles.planChipText, { color: D.indigo }]}>{log.new_plan}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md },
  dotCol: { alignItems: 'center', width: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: D.indigo, marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: D.cardBorder, marginTop: 4 },
  content: { flex: 1 },
  action: { fontSize: 13, fontWeight: '600', color: D.text },
  meta: { fontSize: 11, color: D.textMuted, marginTop: 2 },
  notes: { fontSize: 11, color: D.textSub, marginTop: 4, lineHeight: 16 },
  planChange: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  planChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1,
    backgroundColor: D.input, borderColor: D.cardBorder,
  },
  planChipText: { fontSize: 10, fontWeight: '700', color: D.textMuted },
});

// ─── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={{ height: 1, backgroundColor: D.cardBorder, marginVertical: 6 }} />;
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

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
  label: { fontSize: 12, color: D.textMuted, flex: 1 },
  value: { fontSize: 13, color: D.text, fontWeight: '600', textAlign: 'right', flex: 1.2 },
});

// ─── Quick Action Button ────────────────────────────────────────────────────────
// Matches reference image: full-width rows, icon + label + arrow, colored borders

type QuickActionConfig = {
  icon: string;
  label: string;
  bg: string;
  border: string;
  textColor: string;
  onPress: () => void;
  disabled?: boolean;
};

function QuickActionBtn({ icon, label, bg, border, textColor, onPress, disabled }: QuickActionConfig) {
  return (
    <TouchableOpacity
      style={[qaStyles.btn, { backgroundColor: bg, borderColor: border }, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Feather name={icon as any} size={18} color={textColor} />
      <Text style={[qaStyles.text, { color: textColor }]}>{label}</Text>
      <Feather name="chevron-right" size={14} color={textColor + 'aa'} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const qaStyles = StyleSheet.create({
  btn: {
    width: '48%',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  text: { fontSize: 11, fontWeight: '700', flex: 1 },
});

// ─── Tab Bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'activity' },
  { key: 'billing',  label: 'Billing',  icon: 'credit-card' },
  { key: 'history',  label: 'History',  icon: 'clock' },
  { key: 'logs',     label: 'Logs',     icon: 'file-text' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function GymSubscriptionScreen({ route, navigation }: Props) {
  const { gymId } = route.params;

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

  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean; title: string; message: string; confirmLabel?: string;
    confirmColor?: string; onConfirm: () => void;
    inputPlaceholder?: string; inputValue?: string; onInputChange?: (v: string) => void;
    inputKeyboardType?: 'default' | 'number-pad';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const dialogInputRef = useRef('');
  const [actionLoading, setActionLoading] = useState(false);

  const [activityLogs, setActivityLogs] = useState<GymActivityEvent[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const loadActivityLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setLogsRefreshing(true); else setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await fetchGymActivityLogs(gymId, 60);
      setActivityLogs(res.events);
    } catch (e: any) {
      setLogsError(e.message ?? 'Failed to load activity logs');
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
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load subscription details');
      navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gymId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const supabase = getSupabaseRealtimeClient();
    const channel = supabase
      .channel(`admin_mobile_gym_${gymId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gyms', filter: `id=eq.${gymId}` },
        () => { loadData(); }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'subscription_audit_logs', filter: `gym_id=eq.${gymId}` },
        () => { loadData(); if (logsLoadedRef.current) loadActivityLogs(); }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_messages', filter: `gym_id=eq.${gymId}` },
        (payload: any) => {
          const subject: string = payload.new?.subject ?? 'New message';
          Alert.alert('📣 GymFlow Support', subject, [{ text: 'OK', style: 'default' }]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gymId, loadData, loadActivityLogs]);

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
          trial_started_at: trialStartDate?.toISOString() ?? null,
          trial_ends_at: trialEndDate?.toISOString() ?? null,
        }));
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

  function confirmAction(opts: {
    title: string; message: string; confirmLabel?: string; confirmColor?: string;
    inputPlaceholder?: string; inputValue?: string; onInputChange?: (v: string) => void;
    inputKeyboardType?: 'default' | 'number-pad';
    onConfirm: () => void;
  }) {
    if (opts.inputPlaceholder) {
      dialogInputRef.current = opts.inputValue ?? '';
      setConfirmDialog({
        visible: true, title: opts.title, message: opts.message,
        confirmLabel: opts.confirmLabel, confirmColor: opts.confirmColor,
        inputPlaceholder: opts.inputPlaceholder, inputValue: opts.inputValue ?? '',
        inputKeyboardType: opts.inputKeyboardType,
        onInputChange: (v) => { dialogInputRef.current = v; setConfirmDialog(prev => ({ ...prev, inputValue: v })); },
        onConfirm: opts.onConfirm,
      });
    } else {
      setConfirmDialog({
        visible: true, title: opts.title, message: opts.message,
        confirmLabel: opts.confirmLabel, confirmColor: opts.confirmColor,
        onConfirm: opts.onConfirm,
      });
    }
  }

  function closeDialog() { setConfirmDialog(prev => ({ ...prev, visible: false })); }

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
        <StatusBar barStyle="light-content" backgroundColor={D.bg} />
        <ActivityIndicator color={D.indigo} size="large" />
        <Text style={styles.loadingText}>Loading subscription data...</Text>
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

  const statusColor = getStatusColor(effectiveStatus);

  // Compute trial duration for progress bar (14 days default)
  const TRIAL_DAYS = 14;
  const totalDays = effectiveStatus === 'trial' ? TRIAL_DAYS : (days ?? TRIAL_DAYS);
  const progressRatio = days !== null ? Math.max(0, Math.min(1, days / totalDays)) : 1;

  const renewalHistory = timeline.filter(l =>
    l.new_plan && l.new_plan !== 'trial' && l.action.toLowerCase().includes('activat')
  );

  // FAB actions
  const fabActions: FABAction[] = [
    {
      icon: 'check-circle', label: 'Activate Monthly', color: D.emerald,
      onPress: () => confirmAction({
        title: 'Activate Monthly Subscription?',
        message: 'This will activate a Monthly subscription starting today for 30 days.',
        confirmLabel: 'Activate', confirmColor: D.emerald,
        onConfirm: () => doAction(() => activateSubscription(gymId, 'monthly')),
      }),
    },
    {
      icon: 'credit-card', label: 'Approve Payment', color: D.indigo,
      onPress: () => {
        if (!pendingRequest) { Alert.alert('No Pending Request', 'There is no pending payment request to approve.'); return; }
        confirmAction({
          title: 'Approve Payment?',
          message: `Approve and activate Monthly plan for ${gym.name}?`,
          confirmLabel: 'Approve', confirmColor: D.indigo,
          onConfirm: () => doAction(() => approvePayment(gymId, pendingRequest.id, 'monthly')),
        });
      },
    },
    {
      icon: 'clock', label: 'Extend +7 Days', color: D.amber,
      onPress: () => confirmAction({
        title: 'Extend Trial by 7 Days?',
        message: 'This will add 7 more days to the current trial expiry.',
        confirmLabel: 'Extend', confirmColor: D.amber,
        onConfirm: () => doAction(() => extendTrial(gymId, 'extend', 7)),
      }),
    },
    {
      icon: 'phone', label: 'Call Customer', color: D.sky,
      onPress: () => {
        const phone = gym.phone || owner?.phone;
        if (phone) { Linking.openURL(`tel:${phone}`); }
        else { Alert.alert('No Phone', 'No phone number available for this gym.'); }
      },
    },
    {
      icon: 'message-circle', label: 'WhatsApp', color: D.green,
      onPress: () => {
        const phone = gym.phone || owner?.phone;
        if (phone) { Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`); }
        else { Alert.alert('No Phone', 'No phone number available for this gym.'); }
      },
    },
  ];

  // Plan display label
  const planTypeStr = gym.plan_type as string;
  const planLabel = planTypeStr === 'trial' ? 'Trial Plan'
    : planTypeStr === 'monthly' ? 'Monthly Plan'
    : planTypeStr === 'yearly' ? 'Yearly Plan'
    : planTypeStr === 'lifetime' ? 'Lifetime Plan'
    : `${planTypeStr.charAt(0).toUpperCase() + planTypeStr.slice(1)} Plan`;

  const planBadge = planTypeStr === 'trial' ? 'Trial'
    : planTypeStr === 'monthly' ? 'Monthly'
    : planTypeStr === 'yearly' ? 'Yearly'
    : planTypeStr === 'lifetime' ? 'Lifetime'
    : planTypeStr;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={D.bg} />

      <StatusBar barStyle="light-content" backgroundColor={D.bg} />

      {/* ─── TAB BAR ─────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => {
                setActiveTab(tab.key);
                if (tab.key === 'logs' && !logsLoadedRef.current) {
                  logsLoadedRef.current = true;
                  loadActivityLogs();
                }
              }}
            >
              <Feather name={tab.icon as any} size={15} color={isActive ? D.indigo : D.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── OVERVIEW TAB ─────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: 160 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={D.indigo} />}
        >
          {/* ── GYM INFORMATION CARD ── */}
          <View style={styles.card}>
            {/* Section header row */}
            <View style={styles.sectionHeaderRow}>
              <Feather name="activity" size={13} color={D.indigo} />
              <Text style={styles.sectionHeaderText}>GYM INFORMATION</Text>
            </View>

            {/* Gym name row with crown shield on right */}
            <View style={styles.gymHeroRow}>
              {/* Avatar circle */}
              <View style={styles.gymAvatar}>
                <Text style={styles.gymAvatarText}>{gym.name.charAt(0).toUpperCase()}</Text>
              </View>

              {/* Name + status */}
              <View style={{ flex: 1 }}>
                <Text style={styles.gymName}>{gym.name}</Text>
                {gym.city && <Text style={styles.gymCity}>📍 {gym.city}</Text>}
                {/* Active / Banned badge */}
                <View style={[styles.activeBadge, { backgroundColor: gym.is_active ? D.emeraldBg : D.redBg, borderColor: gym.is_active ? D.emerald + '55' : D.red + '55' }]}>
                  <Text style={[styles.activeBadgeText, { color: gym.is_active ? D.emerald : D.red }]}>
                    {gym.is_active ? 'Active' : 'Banned'}
                  </Text>
                </View>
              </View>
            </View>

            <Divider />

            {/* Owner row */}
            <View style={styles.contactRow}>
              <View style={styles.contactIconBox}>
                <Feather name="user" size={14} color={D.textSub} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactLabel}>Owner</Text>
                <Text style={styles.contactValue} numberOfLines={1}>{owner?.email || gym.owner_id}</Text>
              </View>

              {/* Phone row */}
              <View style={styles.contactIconBox}>
                <Feather name="phone" size={14} color={D.textSub} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactLabel}>Phone</Text>
                <Text style={styles.contactValue}>{gym.phone || '—'}</Text>
              </View>
            </View>

            <Divider />

            {/* Current Plan */}
            <View style={styles.planHeaderRow}>
              <Text style={styles.currentPlanLabel}>Current Plan</Text>
              <View style={[styles.planBadge, {
                backgroundColor: effectiveStatus === 'trial' ? D.amberBg : effectiveStatus === 'active' ? D.indigoGlow : D.redBg,
                borderColor: effectiveStatus === 'trial' ? D.amber + '66' : effectiveStatus === 'active' ? D.indigo + '66' : D.red + '66',
              }]}>
                <Text style={[styles.planBadgeText, {
                  color: effectiveStatus === 'trial' ? D.amber : effectiveStatus === 'active' ? D.indigo : D.red,
                }]}>{planBadge}</Text>
              </View>
            </View>

            <View style={styles.planNameRow}>
              <View style={[styles.planDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.planName, { color: statusColor }]}>{planLabel}</Text>
            </View>

            {/* Date grid with calendar icons */}
            <View style={styles.dateGrid}>
              <View style={styles.dateCell}>
                <Feather name="calendar" size={14} color={D.textMuted} style={{ marginBottom: 4 }} />
                <Text style={styles.dateCellLabel}>Started On</Text>
                <Text style={styles.dateCellValue}>{fmtDate(gym.subscription_started_at || gym.trial_started_at)}</Text>
              </View>
              <View style={styles.dateCell}>
                <Feather name="calendar" size={14} color={D.textMuted} style={{ marginBottom: 4 }} />
                <Text style={styles.dateCellLabel}>Expires On</Text>
                <Text style={styles.dateCellValue}>
                  {gym.plan_type === 'lifetime' ? 'Never' : fmtDate(gym.subscription_ends_at || gym.trial_ends_at)}
                </Text>
              </View>
            </View>

            {/* Days remaining with progress bar */}
            {days !== null && !isExpired && gym.plan_type !== 'lifetime' && (
              <View style={[styles.daysRemainingRow, { backgroundColor: D.amberBg, borderColor: D.amber + '44' }]}>
                <Feather name="clock" size={14} color={D.amber} />
                <Text style={styles.daysRemainingText}>
                  {isExpiringSoon
                    ? `Expiring in ${days} Day${days !== 1 ? 's' : ''} — Renew Soon`
                    : `${days} Days Remaining`}
                </Text>
                {/* Progress bar */}
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, {
                    width: `${progressRatio * 100}%` as any,
                    backgroundColor: days > 7 ? D.amber : D.red,
                  }]} />
                </View>
              </View>
            )}
            {isExpired && (
              <View style={[styles.daysRemainingRow, { backgroundColor: D.redBg, borderColor: D.red + '44' }]}>
                <Feather name="alert-circle" size={14} color={D.red} />
                <Text style={[styles.daysRemainingText, { color: D.red }]}>Expired</Text>
              </View>
            )}
            {gym.plan_type === 'lifetime' && (
              <View style={[styles.daysRemainingRow, { backgroundColor: D.emeraldBg, borderColor: D.emerald + '44' }]}>
                <Feather name="award" size={14} color={D.emerald} />
                <Text style={[styles.daysRemainingText, { color: D.emerald }]}>Lifetime Access</Text>
              </View>
            )}
          </View>

          {/* ── QUICK ACTIONS CARD ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="zap" size={13} color={D.amber} />
              <Text style={styles.sectionHeaderText}>QUICK ACTIONS</Text>
            </View>

            {actionLoading && (
              <View style={styles.actionLoading}>
                <ActivityIndicator color={D.indigo} size="small" />
                <Text style={styles.actionLoadingText}>Processing...</Text>
              </View>
            )}

            <View style={styles.quickActionsGrid}>
              <QuickActionBtn
                icon="award" label="Activate Monthly"
                bg={D.qaGreen} border={D.qaGreenBorder} textColor={D.qaGreenText}
                disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Activate Monthly Subscription?', message: 'This will activate a Monthly subscription starting today for 30 days.', confirmLabel: 'Activate', confirmColor: D.emerald, onConfirm: () => doAction(() => activateSubscription(gymId, 'monthly')) })}
              />
              <QuickActionBtn
                icon="calendar" label="Activate Yearly"
                bg={D.qaPurple} border={D.qaPurpleBorder} textColor={D.qaPurpleText}
                disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Activate Yearly Subscription?', message: 'This will activate a Yearly subscription starting today for 365 days.', confirmLabel: 'Activate', confirmColor: D.indigo, onConfirm: () => doAction(() => activateSubscription(gymId, 'yearly')) })}
              />
              <QuickActionBtn
                icon="hexagon" label="Activate Lifetime"
                bg={D.qaGold} border={D.qaGoldBorder} textColor={D.qaGoldText}
                disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Activate Lifetime Subscription?', message: 'This will grant permanent lifetime access. This cannot be automatically reversed.', confirmLabel: 'Activate', confirmColor: D.amber, onConfirm: () => doAction(() => activateSubscription(gymId, 'lifetime')) })}
              />
              <QuickActionBtn
                icon="clock" label="Extend Trial"
                bg={D.qaTeal} border={D.qaTealBorder} textColor={D.qaTealText}
                disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Extend Trial by 7 Days?', message: 'This will add 7 more days to the current trial expiry.', confirmLabel: 'Extend', confirmColor: D.sky, onConfirm: () => doAction(() => extendTrial(gymId, 'extend', 7)) })}
              />
              <QuickActionBtn
                icon="refresh-cw" label="Reset Trial"
                bg={D.qaMagenta} border={D.qaMagentaBorder} textColor={D.qaMagentaText}
                disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Reset Trial?', message: 'This will reset the trial to a fresh 14-day trial starting today.', confirmLabel: 'Reset', confirmColor: D.purple, onConfirm: () => doAction(() => extendTrial(gymId, 'reset')) })}
              />
              <QuickActionBtn
                icon="x-circle" label="Expire Now"
                bg={D.qaDarkRed} border={D.qaDarkRedBorder} textColor={D.qaDarkRedText}
                disabled={actionLoading}
                onPress={() => confirmAction({ title: 'Expire Subscription Now?', message: 'This will immediately mark the subscription as expired. The gym owner will lose access.', confirmLabel: 'Expire Now', confirmColor: D.red, onConfirm: () => doAction(() => expireSubscription(gymId, 'Admin forced expiry')) })}
              />
            </View>
          </View>

          {/* ── PENDING RENEWAL REQUEST ── */}
          {pendingRequest && (
            <View style={[styles.card, { borderColor: D.amber + '55' }]}>
              <View style={styles.sectionHeaderRow}>
                <Feather name="alert-circle" size={13} color={D.amber} />
                <Text style={styles.sectionHeaderText}>PENDING RENEWAL REQUEST</Text>
              </View>
              <View style={styles.pendingBadge}>
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
                  <Feather name="image" size={14} color={D.indigo} />
                  <Text style={styles.viewScreenshotText}>View Payment Screenshot</Text>
                </TouchableOpacity>
              )}
              <View style={styles.approveRejectRow}>
                <TouchableOpacity style={styles.approveBtn} disabled={actionLoading}
                  onPress={() => confirmAction({ title: 'Approve Payment?', message: `Approve the payment for ${gym.name} and activate Monthly plan?`, confirmLabel: 'Approve', confirmColor: D.emerald, onConfirm: () => doAction(() => approvePayment(gymId, pendingRequest.id, 'monthly')) })}>
                  <Feather name="check" size={14} color={D.emerald} />
                  <Text style={[styles.approveRejectText, { color: D.emerald }]}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} disabled={actionLoading}
                  onPress={() => confirmAction({ title: 'Reject Payment?', message: 'Please provide a reason for rejection. This will be visible to the gym owner.', confirmLabel: 'Reject', confirmColor: D.red, inputPlaceholder: 'Rejection reason (required)...', inputValue: '', onConfirm: () => { const reason = dialogInputRef.current.trim(); if (!reason) { Alert.alert('Required', 'Please enter a rejection reason'); return; } doAction(() => rejectPayment(gymId, pendingRequest.id, reason)); } })}>
                  <Feather name="x" size={14} color={D.red} />
                  <Text style={[styles.approveRejectText, { color: D.red }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── USAGE STATISTICS CARD ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="bar-chart-2" size={13} color={D.sky} />
              <Text style={styles.sectionHeaderText}>USAGE STATISTICS</Text>
            </View>
            <View style={styles.statsGrid}>
              {[
                { label: 'Members',   value: usageStats?.total_members?.toLocaleString() || '0',         icon: 'users',          color: D.indigo  },
                { label: 'Revenue',   value: formatCurrency(usageStats?.total_revenue),                  icon: 'trending-up',    color: D.emerald },
                { label: 'Attendance',value: usageStats?.total_attendance?.toLocaleString() || '0',      icon: 'activity',       color: D.sky     },
                { label: 'WhatsApp',  value: `${usageStats?.whatsapp_sent?.toLocaleString() || '0'} msgs`,icon: 'message-circle', color: D.green   },
                { label: 'Payments',  value: usageStats?.total_payments?.toLocaleString() || '0',        icon: 'credit-card',    color: D.amber   },
                { label: 'Reports',   value: usageStats?.reports_generated?.toLocaleString() || '0',     icon: 'file-text',      color: D.purple  },
                { label: 'Storage',   value: usageStats?.storage_used_kb ? `${(usageStats.storage_used_kb / 1024).toFixed(1)} MB` : '0 MB', icon: 'hard-drive', color: D.textSub },
                { label: 'Last Active', value: usageStats?.last_active_at ? fmtDate(usageStats.last_active_at) : '—', icon: 'clock', color: D.textMuted },
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
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 160 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={D.indigo} />}>
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="dollar-sign" size={13} color={D.emerald} />
              <Text style={styles.sectionHeaderText}>PAYMENT INFORMATION</Text>
            </View>
            <InfoRow label="Last Amount" value={formatCurrency(gym.last_payment_amount)} />
            <InfoRow label="Payment Method" value={gym.last_payment_method || '—'} />
            <InfoRow label="Transaction ID" value={gym.last_transaction_id || '—'} mono />
            <InfoRow label="Payment Date" value={fmtDate(gym.last_payment_date)} />
            <InfoRow label="Payment Status" value={gym.last_payment_status === 'paid' ? '✅ Paid' : gym.last_payment_status === 'pending' ? '🟡 Pending' : gym.last_payment_status === 'failed' ? '❌ Failed' : '—'} />
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="calendar" size={13} color={D.indigo} />
              <Text style={styles.sectionHeaderText}>SUBSCRIPTION DATES</Text>
            </View>
            <DateCard label="Subscription Started" value={subStartDate} onChange={d => { setSubStartDate(d); setDatesChanged(true); setDirty(true); }} />
            <DateCard label="Subscription Ends" value={subEndDate} onChange={d => { setSubEndDate(d); setDatesChanged(true); setDirty(true); }} />
            <Divider />
            <DateCard label="Trial Started" value={trialStartDate} onChange={d => { setTrialStartDate(d); setDatesChanged(true); setDirty(true); }} />
            <DateCard label="Trial Ends" value={trialEndDate} onChange={d => { setTrialEndDate(d); setDatesChanged(true); setDirty(true); }} />
          </View>

          {gym.subscription_status === 'trial' && (
            <View style={[styles.card, { borderColor: D.amber + '55' }]}>
              <View style={styles.sectionHeaderRow}>
                <Feather name="clock" size={13} color={D.amber} />
                <Text style={styles.sectionHeaderText}>TRIAL INFORMATION</Text>
              </View>
              <InfoRow label="Trial Started" value={fmtDate(gym.trial_started_at)} />
              <InfoRow label="Trial Ends" value={fmtDate(gym.trial_ends_at)} />
              <Divider />
              <Text style={styles.subLabel}>EXTEND TRIAL</Text>
              <View style={styles.trialBtnRow}>
                {[3, 7, 14].map(d => (
                  <TouchableOpacity key={d} style={styles.trialExtBtn} disabled={actionLoading}
                    onPress={() => confirmAction({ title: `Extend Trial by ${d} Days?`, message: `This will add ${d} days to the current trial expiry date.`, confirmLabel: `+${d} Days`, confirmColor: D.amber, onConfirm: () => doAction(() => extendTrial(gymId, 'extend', d)) })}>
                    <Text style={styles.trialExtBtnText}>+{d} Days</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.trialExtBtn, { backgroundColor: D.indigoGlow, borderColor: D.indigo + '55' }]} disabled={actionLoading}
                  onPress={() => confirmAction({ title: 'Extend Trial by Custom Days?', message: 'Enter number of days to extend the trial.', confirmLabel: 'Extend', confirmColor: D.indigo, inputPlaceholder: 'Number of days (e.g. 10)', inputValue: '', inputKeyboardType: 'number-pad', onConfirm: () => { const d = parseInt(dialogInputRef.current, 10); if (!Number.isFinite(d) || d <= 0 || d > 365) { Alert.alert('Invalid', 'Enter a number of days between 1 and 365'); return; } doAction(() => extendTrial(gymId, 'custom', d)); } })}>
                  <Text style={[styles.trialExtBtnText, { color: D.indigo }]}>Custom</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── HISTORY TAB ────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 160 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={D.indigo} />}>
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="repeat" size={13} color={D.sky} />
              <Text style={styles.sectionHeaderText}>RENEWAL HISTORY</Text>
            </View>
            {renewalHistory.length === 0 ? (
              <Text style={styles.emptyText}>No renewal history yet.</Text>
            ) : (
              renewalHistory.map((log, i) => (
                <View key={log.id}>
                  <View style={styles.renewalRow}>
                    <View style={[styles.renewalPlanBadge]}>
                      <Text style={styles.renewalPlanText}>{log.new_plan?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.renewalDates}>
                        {fmtDate(log.created_at)}{log.new_expiry ? ` → ${fmtDate(log.new_expiry)}` : ''}
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
            <View style={styles.sectionHeaderRow}>
              <Feather name="list" size={13} color={D.indigo} />
              <Text style={styles.sectionHeaderText}>ACTIVITY TIMELINE</Text>
            </View>
            {timeline.length === 0 ? (
              <Text style={styles.emptyText}>No activity recorded yet.</Text>
            ) : (
              timeline.slice(0, 20).map((log, i) => (
                <TimelineItem key={log.id} log={log} isLast={i === Math.min(timeline.length, 20) - 1} />
              ))
            )}
            {timeline.length > 20 && <Text style={styles.moreText}>+{timeline.length - 20} more entries</Text>}
          </View>
        </ScrollView>
      )}

      {/* ─── LOGS TAB ────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 160 }]}
          refreshControl={<RefreshControl refreshing={logsRefreshing} onRefresh={() => loadActivityLogs(true)} tintColor={D.indigo} />}>
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="terminal" size={13} color={D.indigo} />
              <Text style={styles.sectionHeaderText}>ACTIVITY LOGS</Text>
            </View>
            <Text style={logsStyles.hint}>All actions taken in this gym account</Text>

            {logsLoading ? (
              <View style={logsStyles.center}>
                <ActivityIndicator color={D.indigo} size="small" />
                <Text style={logsStyles.loadingText}>Loading activity logs…</Text>
              </View>
            ) : logsError ? (
              <View style={logsStyles.errorBox}>
                <Feather name="alert-circle" size={16} color={D.red} />
                <Text style={logsStyles.errorText}>{logsError}</Text>
                <TouchableOpacity style={logsStyles.retryBtn} onPress={() => loadActivityLogs()}>
                  <Text style={logsStyles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : activityLogs.length === 0 ? (
              <View style={logsStyles.center}>
                <Feather name="inbox" size={32} color={D.cardBorder} />
                <Text style={logsStyles.emptyText}>No activity recorded yet</Text>
              </View>
            ) : (
              activityLogs.map((event, idx) => {
                const colorMap: Record<string, string> = {
                  emerald: D.emerald, green: D.emerald, red: D.red,
                  amber: D.amber, indigo: D.indigo, sky: D.sky,
                };
                const bgMap: Record<string, string> = {
                  emerald: D.emeraldBg, green: D.emeraldBg, red: D.redBg,
                  amber: D.amberBg, indigo: D.indigoGlow, sky: D.skyBg,
                };
                const eventColor = colorMap[event.color] ?? D.textMuted;
                const eventBg = bgMap[event.color] ?? D.input;
                const isLast = idx === activityLogs.length - 1;
                return (
                  <View key={event.id} style={logsStyles.item}>
                    <View style={logsStyles.timelineCol}>
                      <View style={[logsStyles.iconCircle, { backgroundColor: eventBg, borderColor: eventColor + '55' }]}>
                        <Feather name={event.icon as any} size={12} color={eventColor} />
                      </View>
                      {!isLast && <View style={logsStyles.connector} />}
                    </View>
                    <View style={[logsStyles.content, !isLast && { marginBottom: 16 }]}>
                      <View style={logsStyles.titleRow}>
                        <Text style={logsStyles.title} numberOfLines={1}>{event.title}</Text>
                        <Text style={logsStyles.time}>{fmtDateTime(event.timestamp)}</Text>
                      </View>
                      {event.subtitle ? <Text style={logsStyles.subtitle} numberOfLines={2}>{event.subtitle}</Text> : null}
                      {event.meta ? (
                        <View style={[logsStyles.metaBadge, { backgroundColor: eventBg, borderColor: eventColor + '44' }]}>
                          <Text style={[logsStyles.metaText, { color: eventColor }]}>{event.meta}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {activityLogs.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Feather name="bar-chart-2" size={13} color={D.purple} />
                <Text style={styles.sectionHeaderText}>ACTIVITY SUMMARY</Text>
              </View>
              {(['member_added', 'whatsapp_sent', 'subscription_event'] as const).map((type) => {
                const count = activityLogs.filter(e => e.type === type).length;
                const labels: Record<string, string> = { member_added: 'Members Added', whatsapp_sent: 'WhatsApp Sent', subscription_event: 'Subscription Events' };
                const icons: Record<string, string> = { member_added: 'user-plus', whatsapp_sent: 'message-circle', subscription_event: 'shield' };
                const colors: Record<string, string> = { member_added: D.emerald, whatsapp_sent: D.green, subscription_event: D.indigo };
                return (
                  <View key={type} style={logsStyles.summaryRow}>
                    <View style={logsStyles.summaryLeft}>
                      <Feather name={icons[type] as any} size={14} color={colors[type]} />
                      <Text style={logsStyles.summaryLabel}>{labels[type]}</Text>
                    </View>
                    <Text style={[logsStyles.summaryCount, { color: colors[type] }]}>{count}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── SETTINGS TAB ────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 160 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={D.indigo} />}>
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="edit-3" size={13} color={D.purple} />
              <Text style={styles.sectionHeaderText}>ADMIN NOTES</Text>
            </View>
            {editingNotes ? (
              <>
                <TextInput value={adminNotes} onChangeText={v => { setAdminNotes(v); setDirty(true); }} placeholder="Add internal notes about this customer..." placeholderTextColor={D.textMuted} style={styles.notesInput} multiline autoFocus textAlignVertical="top" />
                <TouchableOpacity style={styles.doneEditingBtn} onPress={() => setEditingNotes(false)}>
                  <Feather name="check" size={12} color={D.emerald} />
                  <Text style={styles.doneEditingText}>Done Editing</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.notesDisplay} onPress={() => setEditingNotes(true)}>
                <Text style={adminNotes ? styles.notesText : styles.notesEmpty}>{adminNotes || 'Tap to add notes about this customer...'}</Text>
                <Feather name="edit-2" size={14} color={D.textMuted} style={{ alignSelf: 'flex-start', marginTop: 2 }} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="toggle-right" size={13} color={D.amber} />
              <Text style={styles.sectionHeaderText}>INTERNAL FLAGS</Text>
            </View>
            <Text style={styles.flagsNote}>Admin only — not visible to gym owner</Text>
            {[
              { key: 'is_vip', label: 'VIP Customer', icon: 'star', color: D.amber },
              { key: 'is_payment_verified', label: 'Payment Verified', icon: 'check-circle', color: D.emerald },
              { key: 'whatsapp_enabled', label: 'WhatsApp Enabled', icon: 'message-circle', color: D.green },
              { key: 'priority_support', label: 'Priority Support', icon: 'headphones', color: D.sky },
              { key: 'auto_renewal_eligible', label: 'Auto Renewal Eligible', icon: 'refresh-cw', color: D.indigo },
              { key: 'lifetime_offer', label: 'Lifetime Offer Available', icon: 'gift', color: D.purple },
            ].map(({ key, label, icon, color }) => (
              <View key={key} style={styles.flagRow}>
                <View style={styles.flagLeft}>
                  <Feather name={icon as any} size={14} color={color} />
                  <Text style={styles.flagLabel}>{label}</Text>
                </View>
                <Switch
                  value={flags[key as keyof typeof flags]}
                  onValueChange={v => { setFlags(prev => ({ ...prev, [key]: v })); setDirty(true); }}
                  trackColor={{ false: D.input, true: color + '44' }}
                  thumbColor={flags[key as keyof typeof flags] ? color : D.textMuted}
                />
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="shield" size={13} color={D.emerald} />
              <Text style={styles.sectionHeaderText}>SECURITY INFORMATION</Text>
            </View>
            <InfoRow label="Registered Email" value={owner?.email || '—'} />
            <InfoRow label="Last Login" value={fmtDateTime(owner?.last_sign_in_at)} />
            <InfoRow label="Account Created" value={fmtDate(owner?.created_at)} />
            <InfoRow label="Email Verified" value={owner?.email_confirmed_at ? '✅ Verified' : '❌ Pending'} />
            <InfoRow label="Login Disabled" value={gym.login_disabled ? '🔴 Yes' : '🟢 No'} />
          </View>

          <View style={[styles.card, styles.dangerCard]}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="alert-triangle" size={13} color={D.red} />
              <Text style={[styles.sectionHeaderText, { color: D.red }]}>DANGER ZONE</Text>
            </View>
            <Text style={styles.dangerNote}>All actions are irreversible or require confirmation. Proceed with caution.</Text>
            <TouchableOpacity
              style={styles.dangerBtn}
              disabled={actionLoading}
              onPress={() => confirmAction({
                title: 'Delete Gym Permanently?',
                message: `⚠️ PERMANENT. This will delete the gym and ALL its data including members, attendance, and payments. This CANNOT be undone.\n\nType the gym name "${gym.name}" below to confirm.`,
                confirmLabel: 'Delete Forever', confirmColor: D.red,
                inputPlaceholder: gym.name, inputValue: '',
                onConfirm: () => {
                  if (dialogInputRef.current.trim() !== gym.name) {
                    Alert.alert('Name Mismatch', 'The name you typed does not match the gym name. Deletion cancelled.');
                    return;
                  }
                  doAction(async () => { await executeDangerAction(gymId, 'delete_gym'); navigation.goBack(); });
                },
              })}
            >
              <Feather name="x-octagon" size={14} color={D.red} />
              <Text style={styles.dangerBtnText}>Delete Gym</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ─── Sticky Bottom Bar ──── */}
      <StickyBottomBar visible={dirty} saving={saving} onSave={handleSave} onCancel={handleDiscard} />

      {/* ─── FAB ─────────────────────────────────────────── */}
      <FABSpeedDial actions={fabActions} ownerPhone={gym.phone || owner?.phone} />

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
        inputKeyboardType={confirmDialog.inputKeyboardType}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.bg },
  scroll: { flex: 1 },
  content: { padding: 14, gap: 14 },
  centered: { flex: 1, backgroundColor: D.bg, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontSize: 13, color: D.textMuted },

  // ── Header ────────────────────────────────────────────────────────
  // Removed custom header styles to use React Navigation header

  // ── Tab Bar ───────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: D.card,
    borderBottomWidth: 1,
    borderBottomColor: D.cardBorder,
  },
  tabBtn: {
    flex: 1, paddingVertical: 10,
    alignItems: 'center', gap: 3,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: D.indigo },
  tabText: { fontSize: 10, fontWeight: '600', color: D.textMuted },
  tabTextActive: { color: D.indigo, fontWeight: '700' },

  // ── Cards ─────────────────────────────────────────────────────────
  card: {
    backgroundColor: D.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: D.cardBorder,
    padding: 16,
    gap: 12,
  },
  dangerCard: { borderColor: D.red + '55' },

  // ── Section Header ────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2,
  },
  sectionHeaderText: {
    fontSize: 12, fontWeight: '700', color: D.indigo,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // ── Gym Hero ──────────────────────────────────────────────────────
  gymHeroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  gymAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: D.indigoGlow,
    borderWidth: 2, borderColor: D.indigo + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  gymAvatarText: { fontSize: 24, fontWeight: '800', color: D.indigo },
  gymName: { fontSize: 18, fontWeight: '800', color: D.text, marginBottom: 2 },
  gymCity: { fontSize: 12, color: D.textMuted, marginBottom: 6 },
  activeBadge: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 99, borderWidth: 1, alignSelf: 'flex-start',
  },
  activeBadgeText: { fontSize: 11, fontWeight: '700' },

  // ── Contact row ───────────────────────────────────────────────────
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  contactIconBox: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: D.input, borderWidth: 1, borderColor: D.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  contactLabel: { fontSize: 10, color: D.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  contactValue: { fontSize: 12, color: D.text, fontWeight: '600', marginTop: 2 },

  // ── Plan section ──────────────────────────────────────────────────
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currentPlanLabel: { fontSize: 11, color: D.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  planBadge: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 99, borderWidth: 1,
  },
  planBadgeText: { fontSize: 11, fontWeight: '700' },
  planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planDot: { width: 10, height: 10, borderRadius: 5 },
  planName: { fontSize: 22, fontWeight: '800' },

  // ── Date Grid ─────────────────────────────────────────────────────
  dateGrid: { flexDirection: 'row', gap: 12 },
  dateCell: {
    flex: 1, backgroundColor: D.input,
    borderRadius: 12, borderWidth: 1, borderColor: D.cardBorder,
    padding: 12, alignItems: 'flex-start',
  },
  dateCellLabel: { fontSize: 10, fontWeight: '600', color: D.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  dateCellValue: { fontSize: 14, fontWeight: '700', color: D.text, marginTop: 2 },

  // ── Days remaining ────────────────────────────────────────────────
  daysRemainingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1,
  },
  daysRemainingText: { fontSize: 13, fontWeight: '700', color: D.amber, flex: 1 },
  progressBarBg: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', borderRadius: 3 },

  // ── Quick Actions ─────────────────────────────────────────────────
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  actionLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  actionLoadingText: { fontSize: 12, color: D.textMuted },

  // ── Pending ───────────────────────────────────────────────────────
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: D.amberBg, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: D.amber + '55',
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: D.amber },
  pendingText: { fontSize: 12, fontWeight: '700', color: D.amber },
  pendingNotes: {
    backgroundColor: D.input, borderRadius: 8,
    padding: 12, borderWidth: 1, borderColor: D.cardBorder,
  },
  pendingNoteText: { fontSize: 12, color: D.textSub },
  viewScreenshotBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: D.indigoGlow, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: D.indigo + '55',
    alignSelf: 'flex-start',
  },
  viewScreenshotText: { fontSize: 12, fontWeight: '700', color: D.indigo },
  approveRejectRow: { flexDirection: 'row', gap: 12 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: D.emeraldBg, borderRadius: 12,
    paddingVertical: 12, borderWidth: 1, borderColor: D.emerald + '55',
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: D.redBg, borderRadius: 12,
    paddingVertical: 12, borderWidth: 1, borderColor: D.red + '55',
  },
  approveRejectText: { fontSize: 13, fontWeight: '700' },

  // ── Stats ─────────────────────────────────────────────────────────
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2.5%', justifyContent: 'flex-start' },
  statCell: {
    width: '23%',
    backgroundColor: D.input, borderRadius: 12,
    borderWidth: 1, borderColor: D.cardBorder,
    padding: 10, alignItems: 'center', gap: 5,
    marginBottom: 10,
  },
  statValue: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  statLabel: { fontSize: 9, color: D.textMuted, textAlign: 'center', fontWeight: '600', textTransform: 'uppercase' },

  // ── Notes ─────────────────────────────────────────────────────────
  notesInput: {
    backgroundColor: D.input, borderWidth: 1, borderColor: D.indigo + '55',
    borderRadius: 12, padding: 12,
    color: D.text, fontSize: 13, minHeight: 100, textAlignVertical: 'top',
  },
  notesDisplay: {
    flexDirection: 'row', gap: 8,
    backgroundColor: D.input, borderRadius: 12,
    borderWidth: 1, borderColor: D.cardBorder, padding: 12,
  },
  notesText: { flex: 1, fontSize: 13, color: D.text, lineHeight: 20 },
  notesEmpty: { flex: 1, fontSize: 13, color: D.textMuted, fontStyle: 'italic' },
  doneEditingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: D.emeraldBg, borderRadius: 99,
    borderWidth: 1, borderColor: D.emerald + '55',
  },
  doneEditingText: { fontSize: 11, fontWeight: '700', color: D.emerald },

  // ── Flags ─────────────────────────────────────────────────────────
  flagsNote: { fontSize: 11, color: D.textMuted, fontStyle: 'italic', marginBottom: 4 },
  flagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  flagLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  flagLabel: { fontSize: 13, color: D.text },

  // ── Billing extras ────────────────────────────────────────────────
  subLabel: { fontSize: 10, fontWeight: '700', color: D.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  trialBtnRow: { flexDirection: 'row', gap: 8 },
  trialExtBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 99,
    backgroundColor: D.amberBg, borderWidth: 1, borderColor: D.amber + '55',
    alignItems: 'center',
  },
  trialExtBtnText: { fontSize: 12, fontWeight: '700', color: D.amber },

  // ── History ───────────────────────────────────────────────────────
  renewalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  renewalPlanBadge: {
    borderRadius: 8, borderWidth: 1, borderColor: D.indigo + '55',
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: D.indigoGlow, alignItems: 'center',
  },
  renewalPlanText: { fontSize: 11, fontWeight: '800', color: D.indigo },
  renewalDates: { fontSize: 12, color: D.text, fontWeight: '600' },
  renewalStatus: { fontSize: 10, color: D.textMuted, marginTop: 2, fontWeight: '700' },

  // ── Danger ────────────────────────────────────────────────────────
  dangerNote: {
    fontSize: 12, color: D.red, backgroundColor: D.redBg,
    borderRadius: 8, padding: 12, lineHeight: 18,
    borderWidth: 1, borderColor: D.red + '55',
  },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 12,
    backgroundColor: D.redBg, borderWidth: 1, borderColor: D.red + '55',
  },
  dangerBtnText: { fontSize: 13, fontWeight: '700', color: D.red },

  // ── Generic ───────────────────────────────────────────────────────
  emptyText: { fontSize: 13, color: D.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  moreText: { fontSize: 12, color: D.indigo, textAlign: 'center', paddingTop: 8 },
});

// ─── Logs Tab Styles ──────────────────────────────────────────────────────────

const logsStyles = StyleSheet.create({
  hint: { fontSize: 11, color: D.textMuted, fontStyle: 'italic', marginBottom: 4 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  loadingText: { fontSize: 12, color: D.textMuted },
  emptyText: { fontSize: 13, color: D.textMuted, fontStyle: 'italic' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    backgroundColor: D.redBg, borderRadius: 10,
    borderWidth: 1, borderColor: D.red + '55', padding: 12,
  },
  errorText: { flex: 1, fontSize: 12, color: D.red },
  retryBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: D.redBg, borderRadius: 99,
    borderWidth: 1, borderColor: D.red + '55',
  },
  retryText: { fontSize: 11, fontWeight: '700', color: D.red },

  item: { flexDirection: 'row', gap: 12 },
  timelineCol: { alignItems: 'center', width: 28 },
  iconCircle: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  connector: { flex: 1, width: 2, backgroundColor: D.cardBorder, marginTop: 4, minHeight: 20 },
  content: { flex: 1, paddingBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 },
  title: { fontSize: 13, fontWeight: '700', color: D.text, flex: 1 },
  time: { fontSize: 10, color: D.textMuted, marginTop: 1, flexShrink: 0 },
  subtitle: { fontSize: 12, color: D.textSub, marginTop: 2, lineHeight: 17 },
  metaBadge: {
    alignSelf: 'flex-start', marginTop: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 99, borderWidth: 1,
  },
  metaText: { fontSize: 10, fontWeight: '600' },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: D.cardBorder,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryLabel: { fontSize: 13, color: D.text, fontWeight: '600' },
  summaryCount: { fontSize: 20, fontWeight: '800' },
});
