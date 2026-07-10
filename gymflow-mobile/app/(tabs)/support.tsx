import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  fetchGyms,
  fetchTickets,
  sendSupportMessage,
  resolveTicket,
  clearTickets,
  type Gym,
  type SupportTicket,
} from '@/lib/api';
import { AdminInput } from '@/components/AdminInput';
import { AdminButton } from '@/components/AdminButton';
import { TicketCard } from '@/components/TicketCard';

type Tab = 'send' | 'tickets';

function TabButton({ label, active, onPress, badge }: { label: string; active: boolean; onPress: () => void; badge?: boolean }) {
  return (
    <TouchableOpacity style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={onPress}>
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
      {badge && <View style={styles.tabDot} />}
    </TouchableOpacity>
  );
}

function SendMessageTab() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loadingGyms, setLoadingGyms] = useState(true);
  const [selectedGymId, setSelectedGymId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [sending, setSending] = useState(false);

  const typeOptions = [
    { label: 'Information', value: 'info' },
    { label: 'Warning', value: 'warning' },
    { label: 'Critical Error', value: 'error' },
    { label: 'Success Note', value: 'success' },
  ];

  const loadGyms = useCallback(() => {
    setLoadingGyms(true);
    fetchGyms()
      .then(data => setGyms(data))
      .catch(() => {})
      .finally(() => setLoadingGyms(false));
  }, []);

  useFocusEffect(useCallback(() => { loadGyms(); }, [loadGyms]));

  async function handleSend() {
    if (!selectedGymId || !subject || !body) return;
    setSending(true);
    try {
      await sendSupportMessage({ gym_id: selectedGymId, subject, body, type });
      Alert.alert('✓ Sent', 'Message sent to gym owner successfully!');
      setSubject('');
      setBody('');
      setSelectedGymId('');
      setType('info');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner}>
        <View style={styles.formCard}>
          <View style={styles.formCardHeader}>
            <View style={styles.formIconBox}>
              <Feather name="headphones" size={18} color={Colors.indigo} />
            </View>
            <View>
              <Text style={styles.formCardTitle}>New Message</Text>
              <Text style={styles.formCardSub}>Broadcast updates, warnings, or support replies.</Text>
            </View>
          </View>

          {/* Gym Selector */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Select Recipient Gym</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gymPills}>
              {loadingGyms ? (
                <ActivityIndicator color={Colors.indigo} />
              ) : gyms.map(gym => (
                <TouchableOpacity
                  key={gym.id}
                  style={[styles.gymPill, selectedGymId === gym.id && styles.gymPillActive]}
                  onPress={() => setSelectedGymId(gym.id)}
                >
                  <Text style={[styles.gymPillText, selectedGymId === gym.id && styles.gymPillTextActive]}>
                    {gym.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Type selector */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Message Type</Text>
            <View style={styles.typePills}>
              {typeOptions.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.typePill, type === opt.value && styles.typePillActive]}
                  onPress={() => setType(opt.value)}
                >
                  <Text style={[styles.typePillText, type === opt.value && styles.typePillTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <AdminInput
            label="Message Subject"
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Action Required: Subscription Renewal"
            containerStyle={styles.field}
          />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Message Body</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write your message here..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={5}
              style={styles.textarea}
            />
          </View>

          <AdminButton
            label="Send Message"
            onPress={handleSend}
            loading={sending}
            disabled={!selectedGymId || !subject || !body}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TicketsTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resolve modal
  const [resolvingTicket, setResolvingTicket] = useState<SupportTicket | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchTickets();
      setTickets(data);
    } catch (e: any) {
      Alert.alert('Error', 'Failed to load tickets');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openResolve(ticket: SupportTicket) {
    setReplySubject(`Re: ${ticket.subject}`);
    setReplyMessage(`Your issue regarding "${ticket.subject}" has been resolved. Let us know if you need any further assistance.`);
    setResolvingTicket(ticket);
  }

  async function submitResolve() {
    if (!resolvingTicket) return;
    setResolving(true);
    try {
      await resolveTicket({
        ticketId: resolvingTicket.id,
        replySubject,
        replyMessage,
      });
      Alert.alert('✓ Resolved', 'Ticket resolved and reply sent!');
      setResolvingTicket(null);
      load();
    } catch {
      Alert.alert('Error', 'Failed to resolve ticket');
    } finally {
      setResolving(false);
    }
  }

  async function handleClearResolved() {
    Alert.alert('Clear Resolved', 'Remove all resolved tickets?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearTickets();
          load();
        },
      },
    ]);
  }

  const hasResolved = tickets.some(t => t.status === 'resolved');

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.indigo} />
      </View>
    );
  }

  return (
    <>
      {hasResolved && (
        <TouchableOpacity style={styles.clearBtn} onPress={handleClearResolved}>
          <Feather name="trash-2" size={13} color={Colors.textMuted} />
          <Text style={styles.clearBtnText}>Clear Resolved</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={tickets}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TicketCard
            ticket={item}
            onResolve={() => openResolve(item)}
          />
        )}
        contentContainerStyle={styles.ticketList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.indigo} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={36} color={Colors.bgCardBorder} />
            <Text style={styles.emptyText}>No support tickets found.</Text>
          </View>
        }
      />

      {/* Resolve Modal */}
      <Modal visible={!!resolvingTicket} transparent animationType="slide" onRequestClose={() => setResolvingTicket(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Resolve Ticket</Text>
            <Text style={styles.modalSub}>Send a confirmation message to {resolvingTicket?.gyms?.name}</Text>

            <AdminInput
              label="Reply Subject"
              value={replySubject}
              onChangeText={setReplySubject}
              containerStyle={styles.field}
            />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Reply Message</Text>
              <TextInput
                value={replyMessage}
                onChangeText={setReplyMessage}
                multiline
                numberOfLines={4}
                style={styles.textarea}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setResolvingTicket(null)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <AdminButton
                label="Resolve & Send"
                onPress={submitResolve}
                loading={resolving}
                variant="success"
                style={styles.resolveActionBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

export default function SupportScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('send');

  return (
    <View style={styles.root}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        <TabButton label="Send Message" active={activeTab === 'send'} onPress={() => setActiveTab('send')} />
        <TabButton label="Incoming Tickets" active={activeTab === 'tickets'} onPress={() => setActiveTab('tickets')} />
      </View>

      {activeTab === 'send' ? <SendMessageTab /> : <TicketsTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgCardBorder,
    backgroundColor: Colors.bgCard,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: Colors.indigo },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabBtnTextActive: { color: Colors.indigo },
  tabDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.red,
  },
  tabContent: { flex: 1 },
  tabContentInner: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
  formCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  formCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgCardBorder,
  },
  formIconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.indigoBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  formCardSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  field: { gap: Spacing.xs },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  gymPills: { flexDirection: 'row' },
  gymPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    marginRight: Spacing.sm,
    backgroundColor: Colors.bgInput,
  },
  gymPillActive: {
    backgroundColor: Colors.indigoBg,
    borderColor: Colors.indigoBorder,
  },
  gymPillText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  gymPillTextActive: { color: Colors.indigo },
  typePills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    backgroundColor: Colors.bgInput,
  },
  typePillActive: {
    backgroundColor: Colors.indigoBg,
    borderColor: Colors.indigoBorder,
  },
  typePillText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  typePillTextActive: { color: Colors.indigo },
  textarea: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 110,
  },
  ticketList: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxxl },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-end',
    margin: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  clearBtnText: { fontSize: 12, color: Colors.textMuted },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl * 2,
    gap: Spacing.md,
  },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    padding: Spacing.xxl,
    gap: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.bgCardBorder,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  modalSub: { fontSize: 13, color: Colors.textSecondary, marginTop: -Spacing.sm },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  resolveActionBtn: { flex: 1 },
});
