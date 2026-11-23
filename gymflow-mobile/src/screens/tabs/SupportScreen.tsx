import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import {
  fetchGyms, fetchTickets, sendSupportMessage, resolveTicket, clearTickets, draftTicketReply,
  type Gym, type SupportTicket,
} from '@/lib/api';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { useAppTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { useConfirm } from '@/components/dashboard/ConfirmDialog';
import { toast } from '@/components/dashboard/Toast';
import { TicketCard } from '@/components/TicketCard';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';
import { useDialogKeyboardLift } from '../_email/useDialogKeyboardLift';

type Tab = 'send' | 'tickets';

function SendMessageTab() {
  const { colors } = useAppTheme();
  const [selectedGymIds, setSelectedGymIds] = useState<string[]>([]);
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

  /*
    Shares the Gyms tab's cache key, so the recipient picker is populated the
    instant this tab opens if the gym list has been seen at all this session. This
    was the third independent caller of /api/gyms — each with its own state and its
    own focus fetch — and they now converge on one value.
  */
  const { data: gymData, loading: loadingGyms } = useCachedQuery<Gym[]>({
    key: CacheKeys.gyms,
    fetcher: fetchGyms,
  });
  const gyms = gymData ?? [];
  const allSelected = gyms.length > 0 && selectedGymIds.length === gyms.length;

  function toggleGym(id: string) {
    setSelectedGymIds(prev => (prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]));
  }

  async function handleSend() {
    if (selectedGymIds.length === 0 || !subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await sendSupportMessage({ gym_ids: selectedGymIds, subject: subject.trim(), body: body.trim(), type });
      toast.show(selectedGymIds.length === 1
        ? 'Message sent to gym owner successfully!'
        : `Message sent to ${selectedGymIds.length} gym owners successfully!`, 'success');
      setSubject('');
      setBody('');
      setSelectedGymIds([]);
      setType('info');
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : 'Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  }

  const canSend = selectedGymIds.length > 0 && !!subject.trim() && !!body.trim();

  return (
    <KeyboardSafeView>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <SectionCard
          title="New Message"
          description="Broadcast updates, warnings, or support replies."
          action={<Icon name="headphones" size={18} className="text-muted-foreground" />}
        >
          <View className="gap-5">
            <View className="gap-2">
              <Label>
                Select Recipient Gyms{selectedGymIds.length > 0 ? ` (${selectedGymIds.length})` : ''}
              </Label>
              {loadingGyms ? (
                <ActivityIndicator color={colors.mutedForeground} />
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  <Toggle
                    variant="outline"
                    size="sm"
                    pressed={allSelected}
                    onPressedChange={() => setSelectedGymIds(allSelected ? [] : gyms.map(g => g.id))}
                  >
                    <Text>{allSelected ? 'Clear all' : 'Select all'}</Text>
                  </Toggle>
                  {gyms.map(gym => (
                    <Toggle
                      key={gym.id}
                      variant="outline"
                      size="sm"
                      pressed={selectedGymIds.includes(gym.id)}
                      onPressedChange={() => toggleGym(gym.id)}
                    >
                      <Text>{gym.name}</Text>
                    </Toggle>
                  ))}
                </View>
              )}
            </View>

            <View className="gap-2">
              <Label>Message Type</Label>
              <Select
                value={typeOptions.find(o => o.value === type)}
                onValueChange={opt => { if (opt) setType(opt.value); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} label={opt.label} />
                  ))}
                </SelectContent>
              </Select>
            </View>

            <View className="gap-2">
              <Label>Message Subject</Label>
              <Input
                value={subject}
                onChangeText={setSubject}
                placeholder="e.g. Action Required: Subscription Renewal"
              />
            </View>

            <View className="gap-2">
              <Label>Message Body</Label>
              <Textarea
                value={body}
                onChangeText={setBody}
                placeholder="Write your message here..."
                numberOfLines={5}
                className="min-h-28"
              />
            </View>

            <Button onPress={handleSend} disabled={sending || !canSend}>
              {sending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
              <Text>Send Message</Text>
            </Button>
          </View>
        </SectionCard>
      </ScrollView>
    </KeyboardSafeView>
  );
}

function TicketsTab() {
  const { colors } = useAppTheme();
  const confirm = useConfirm();
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingTicket, setResolvingTicket] = useState<SupportTicket | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [resolving, setResolving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [needsHuman, setNeedsHuman] = useState(false);
  const [view, setView] = useState<'issues' | 'feedback'>('issues');
  const lift = useDialogKeyboardLift(!!resolvingTicket);

  /*
    This tab was the worst offender of the set. Its loader ran `else setLoading(true)`
    with no "do we already have data" guard, so every focus tore the list down to a
    full-screen spinner and rebuilt it from the network — a guaranteed blank pause on
    each visit rather than only the first.
  */
  const { data, loading, refresh: load } = useCachedQuery<SupportTicket[]>({
    key: CacheKeys.tickets,
    fetcher: fetchTickets,
  });
  const allTickets = data ?? [];
  const feedbackCount = allTickets.filter(t => t.type === 'feedback').length;
  // Feedback is listed on its own so star ratings do not bury real issues.
  const tickets = allTickets.filter(t => (t.type === 'feedback') === (view === 'feedback'));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useRealtimeInvalidation({
    channelName: 'admin:support',
    onInvalidate: load,
    refetchOnSubscribe: false,
  });

  function openResolve(ticket: SupportTicket) {
    setReplySubject(`Re: ${ticket.subject}`);
    setReplyMessage(`Your issue regarding "${ticket.subject}" has been resolved. Let us know if you need any further assistance.`);
    setNeedsHuman(false);
    setResolvingTicket(ticket);
  }

  async function handleAiDraft() {
    if (!resolvingTicket) return;
    setDrafting(true);
    try {
      const draft = await draftTicketReply(resolvingTicket.id);
      setReplySubject(draft.subject);
      setReplyMessage(draft.body);
      setNeedsHuman(draft.needsHuman);
    } catch (e) {
      toast.show(`AI draft failed: ${e instanceof Error ? e.message : 'Could not write a draft'}`, 'error');
    } finally {
      setDrafting(false);
    }
  }

  async function submitResolve() {
    if (!resolvingTicket) return;
    if (!replySubject.trim() || !replyMessage.trim()) {
      toast.show('Reply subject and message cannot be empty', 'error');
      return;
    }
    setResolving(true);
    try {
      await resolveTicket({ ticketId: resolvingTicket.id, replySubject: replySubject.trim(), replyMessage: replyMessage.trim() });
      toast.show('Ticket resolved and reply sent!', 'success');
      setResolvingTicket(null);
      load();
    } catch {
      toast.show('Failed to resolve ticket', 'error');
    } finally {
      setResolving(false);
    }
  }

  async function handleClearResolved() {
    const ok = await confirm({
      title: 'Clear Resolved',
      description: 'Remove all resolved tickets?',
      confirmText: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    try {
      await clearTickets();
    } catch {
      toast.show('Failed to clear resolved tickets', 'error');
    }
    load();
  }

  const hasResolved = allTickets.some(t => t.status === 'resolved');

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Tabs
        value={view}
        onValueChange={v => setView(v === 'feedback' ? 'feedback' : 'issues')}
        className="px-4 pt-4"
      >
        <TabsList className="w-full">
          <TabsTrigger value="issues" className="flex-1">
            <Text>{`Tickets (${allTickets.length - feedbackCount})`}</Text>
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex-1">
            <Text>{`Feedback (${feedbackCount})`}</Text>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {hasResolved && (
        <Button variant="ghost" size="sm" className="mx-3 mt-2 self-end" onPress={handleClearResolved}>
          <Icon name="trash-2" size={13} className="text-muted-foreground" />
          <Text className="text-muted-foreground">Clear Resolved</Text>
        </Button>
      )}

      <FlatList
        data={tickets}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TicketCard ticket={item} onResolve={() => openResolve(item)} />
        )}
        contentContainerClassName="gap-3 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedForeground} />
        }
        ListEmptyComponent={
          <View className="items-center justify-center gap-3 p-16">
            <Icon name="inbox" size={36} className="text-muted-foreground" />
            <Text className="text-center text-sm text-muted-foreground">
              {view === 'feedback' ? 'No feedback yet.' : 'No support tickets found.'}
            </Text>
          </View>
        }
      />

      <Dialog open={!!resolvingTicket} onOpenChange={open => { if (!open) setResolvingTicket(null); }}>
        <DialogContent className="max-h-[90%]" style={lift.style}>
          <View ref={lift.ref} collapsable={false} className="gap-4">
            <DialogHeader>
              <DialogTitle>Resolve Ticket</DialogTitle>
              <DialogDescription>
                Send a confirmation message to {resolvingTicket?.gyms?.name}
              </DialogDescription>
            </DialogHeader>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4">
              <View className="items-start gap-2">
                <Button variant="outline" size="sm" onPress={handleAiDraft} disabled={drafting || resolving}>
                  {drafting
                    ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                    : <Icon name="zap" size={13} />}
                  <Text>{drafting ? 'Writing...' : 'AI draft'}</Text>
                </Button>
                {needsHuman && (
                  <View className="flex-row items-center gap-1.5">
                    <View className="size-1.5 rounded-full bg-warning" />
                    <Text className="flex-1 text-xs text-muted-foreground">
                      Needs a personal reply: review before sending
                    </Text>
                  </View>
                )}
              </View>

              <View className="gap-2">
                <Label>Reply Subject</Label>
                <Input value={replySubject} onChangeText={setReplySubject} />
              </View>

              <View className="gap-2">
                <Label>Reply Message</Label>
                <Textarea
                  value={replyMessage}
                  onChangeText={setReplyMessage}
                  numberOfLines={4}
                  className="min-h-28"
                />
              </View>
            </ScrollView>

            <DialogFooter>
              <Button onPress={submitResolve} disabled={resolving}>
                {resolving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
                <Text>Resolve & Send</Text>
              </Button>
              <Button variant="outline" onPress={() => setResolvingTicket(null)}>
                <Text>Cancel</Text>
              </Button>
            </DialogFooter>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  );
}

export default function SupportScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('send');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View className="flex-1 bg-background">
      <Pressable onPress={() => navigation.navigate('Announcements')} className="m-4 mb-0">
        <Card className="flex-row items-center gap-3 px-4 py-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-medium">Site-wide banner</Text>
            <Text className="text-xs text-muted-foreground">Show a message at the top of every owner app</Text>
          </View>
          <Icon name="chevron-right" size={18} className="text-muted-foreground" />
        </Card>
      </Pressable>
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v === 'tickets' ? 'tickets' : 'send')}
        className="flex-1 gap-0"
      >
        <View className="px-4 pt-4">
          <TabsList className="w-full">
            <TabsTrigger value="send" className="flex-1">
              <Text>Send Message</Text>
            </TabsTrigger>
            <TabsTrigger value="tickets" className="flex-1">
              <Text>Incoming Tickets</Text>
            </TabsTrigger>
          </TabsList>
        </View>
        <TabsContent value="send" className="flex-1">
          <SendMessageTab />
        </TabsContent>
        <TabsContent value="tickets" className="flex-1">
          <TicketsTab />
        </TabsContent>
      </Tabs>
    </View>
  );
}
