import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { openHttpsUrl } from '@/lib/safe-link';
import { CacheKeys, invalidate, peek, write } from '@/lib/cache';
import { useCachedQuery } from '@/lib/use-cached-query';
import { useAppTheme } from '@/lib/theme';
import { refreshEmailInbox, useEmailRefresher } from '@/lib/email-sync';
import {
  fetchEmailThread, setEmailThreadStatus, fetchEmailAttachmentLink, deleteEmailMessage,
  regenerateEmailDraft, dismissEmailDraft,
  type EmailAttachment, type EmailMessage, type EmailThreadDetail,
} from '@/lib/api';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { toast } from '@/components/dashboard/Toast';
import { cn } from '@/lib/utils';
import { SenderAvatar } from './_email/SenderAvatar';
import { errMessage, fileIcon, fmtSize } from './_email/util';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailThread'>;

/**
 * Splits a message into what the person wrote and the quoted history under it ("On Mon,
 * X wrote:", "-----Original Message-----", or lines starting with ">"). The history is
 * collapsed behind a tap, so a long chain does not bury the new message.
 */
function splitQuoted(text: string): { fresh: string; quoted: string } {
  const lines = text.split('\n');
  const cut = lines.findIndex((line, i) =>
    /^on .{5,200} wrote:\s*$/i.test(line.trim()) ||
    /^-{2,}\s*original message\s*-{2,}$/i.test(line.trim()) ||
    /^_{5,}$/.test(line.trim()) ||
    (line.startsWith('>') && i > 0),
  );
  if (cut <= 0) return { fresh: text.trim(), quoted: '' };
  return { fresh: lines.slice(0, cut).join('\n').trim(), quoted: lines.slice(cut).join('\n').trim() };
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * One message of the conversation, drawn the way Gmail does it: a full-width card with the
 * sender's circle and name, "to me" under it, and the date on the right. Older messages
 * are folded to a single line; tapping opens them. The arrow next to "to me" shows the full
 * From / To / Date details.
 */
function MessageCard({
  message, expanded, onToggle, onEditRetry, onOpenAttachment,
}: {
  message: EmailMessage;
  expanded: boolean;
  onToggle: () => void;
  onEditRetry: (m: EmailMessage) => void;
  onOpenAttachment: (m: EmailMessage, a: EmailAttachment) => void;
}) {
  const [showQuoted, setShowQuoted] = useState(false);
  const [details, setDetails] = useState(false);
  const mine = message.direction === 'outbound';
  const name = mine ? 'GymFlow Support' : (message.from_name || message.from_email);
  const { fresh, quoted } = splitQuoted(message.body_text ?? '');
  const dmarcFailed = message.auth_result?.dmarc === 'fail';
  const failed = message.status === 'failed';
  const recipient = mine ? (message.to_emails[0] ?? '') : 'me';

  const oneLine = (fresh || '(no text)').replace(/\s+/g, ' ');

  return (
    <Card className={cn('gap-0 rounded-none border-x-0 border-b-0 py-0 shadow-none', failed && 'bg-destructive/10')}>
      <Pressable
        className="flex-row items-start gap-3 px-4 py-3"
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <SenderAvatar name={name} />
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-[15px] font-extrabold" numberOfLines={1}>{name}</Text>
            <Text className="text-xs text-muted-foreground">{shortDate(message.created_at)}</Text>
          </View>
          {expanded ? (
            <Pressable className="flex-row items-center gap-1 self-start" onPress={() => setDetails(v => !v)} hitSlop={8} accessibilityRole="button">
              <Text className="max-w-[240px] text-[13px] text-muted-foreground" numberOfLines={1}>to {recipient}</Text>
              <Icon name={details ? 'chevron-up' : 'chevron-down'} size={14} className="text-muted-foreground" />
            </Pressable>
          ) : (
            <Text className="text-[13px] text-muted-foreground" numberOfLines={1}>{oneLine}</Text>
          )}
        </View>
      </Pressable>

      {expanded && (
        <View className="gap-2 px-4 pb-4 pl-[68px]">
          {details && (
            <View className="gap-1 rounded-md bg-muted p-3">
              <Text className="text-xs text-muted-foreground"><Text className="text-xs font-bold text-muted-foreground">From  </Text>{message.from_name ? `${message.from_name} <${message.from_email}>` : message.from_email}</Text>
              <Text className="text-xs text-muted-foreground"><Text className="text-xs font-bold text-muted-foreground">To  </Text>{message.to_emails.join(', ') || 'me'}</Text>
              <Text className="text-xs text-muted-foreground"><Text className="text-xs font-bold text-muted-foreground">Date  </Text>{fullDate(message.created_at)}</Text>
            </View>
          )}

          {dmarcFailed && (
            <View className="flex-row items-center gap-2 rounded-md border border-border bg-muted p-2">
              <View className="size-1.5 rounded-full bg-warning" />
              <Text className="flex-1 text-xs font-semibold text-muted-foreground">Sender could not be verified. Be careful with links.</Text>
            </View>
          )}
          {message.is_auto && (
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Automatic reply</Text>
          )}

          <Text className="text-[15px] leading-[23px]" selectable>{fresh || '(no text)'}</Text>

          {quoted ? (
            <>
              <Pressable
                onPress={() => setShowQuoted(v => !v)}
                className="self-start rounded-sm bg-muted px-2.5 py-0.5"
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Show trimmed content"
              >
                <Icon name="more-horizontal" size={16} className="text-muted-foreground" />
              </Pressable>
              {showQuoted && (
                <Text className="border-l-2 border-border pl-2 text-[13px] leading-[19px] text-muted-foreground" selectable>{quoted}</Text>
              )}
            </>
          ) : null}

          {message.attachments.length > 0 && (
            <View className="mt-1 gap-2">
              {message.attachments.map(a => (
                <Pressable
                  key={a.id}
                  className="flex-row items-center gap-3 rounded-md border border-border bg-muted p-2 active:bg-accent"
                  onPress={() => onOpenAttachment(message, a)}
                >
                  <View className="size-9 items-center justify-center rounded-sm bg-background">
                    <Icon name={fileIcon(a.content_type)} size={18} className="text-muted-foreground" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[13px] font-semibold" numberOfLines={1}>{a.filename ?? 'attachment'}</Text>
                    <Text className="mt-px text-[11px] text-muted-foreground">{fmtSize(a.size)}</Text>
                  </View>
                  {!mine && <Icon name="download" size={16} className="text-muted-foreground" />}
                </Pressable>
              ))}
            </View>
          )}

          {mine && message.status === 'sending' && <Text className="text-xs text-muted-foreground">Sending…</Text>}

          {failed && (
            <Pressable className="mt-0.5 flex-row items-center gap-1.5" onPress={() => onEditRetry(message)}>
              <Icon name="refresh-cw" size={13} className="text-destructive" />
              <Text className="text-xs font-bold text-destructive">Not sent. Tap to edit and send again</Text>
            </Pressable>
          )}
        </View>
      )}
    </Card>
  );
}

export default function EmailThreadScreen({ route, navigation }: Props) {
  const { threadId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState(false);

  const { data, loading, error, refresh } = useCachedQuery<EmailThreadDetail>({
    key: CacheKeys.emailThread(threadId),
    fetcher: () => fetchEmailThread(threadId),
    ttlMs: 0,
  });
  useEmailRefresher(refresh);

  const thread = data?.thread;
  const messages = useMemo(() => data?.messages ?? [], [data?.messages]);
  const lastId = messages[messages.length - 1]?.id;

  // The newest message is open, as in Gmail; the admin can open or fold any other one.
  const isExpanded = (id: string) => (id === lastId ? !collapsedIds.has(id) : expandedIds.has(id));
  const toggle = (id: string) => {
    if (id === lastId) {
      setCollapsedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    } else {
      setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }
  };

  // A draft left "queued" (every model was out of free-tier budget) is written by the server
  // when the thread is opened. Look once more shortly after, instead of leaving the banner
  // waiting for a manual refresh.
  useEffect(() => {
    if (thread?.ai_draft_status !== 'queued') return;
    const t = setTimeout(() => { refresh(); }, 9_000);
    return () => clearTimeout(t);
  }, [thread?.ai_draft_status, refresh]);

  const regenerate = useCallback(async () => {
    if (drafting) return;
    setDrafting(true);
    try {
      await regenerateEmailDraft(threadId);
      await refresh();
    } catch (e) {
      toast.show(`Could not write a draft: ${errMessage(e, 'Please try again in a minute.')}`, 'error');
    } finally {
      setDrafting(false);
    }
  }, [drafting, threadId, refresh]);

  const dismissDraft = useCallback(async () => {
    try {
      await dismissEmailDraft(threadId);
      await refresh();
    } catch (e) {
      toast.show(`Could not dismiss: ${errMessage(e, 'Please try again.')}`, 'error');
    }
  }, [threadId, refresh]);

  // Archive / restore, and a shortcut to the gym when the sender owns one.
  useEffect(() => {
    if (!thread) return;
    const archived = thread.status === 'archived';
    navigation.setOptions({
      headerTitle: '',
      // eslint-disable-next-line react/no-unstable-nested-components -- navigation header options must be rebuilt with live thread state
      headerRight: () => (
        <View className="mr-2 flex-row items-center">
          {thread.gym_id ? (
            <Button
              variant="ghost"
              size="icon"
              onPress={() => navigation.navigate('GymDetail', { gymId: thread.gym_id as string })}
              hitSlop={10}
              accessibilityLabel="Open this gym"
            >
              <Icon name="home" size={20} />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onPress={async () => {
              try {
                await setEmailThreadStatus(thread.id, archived ? 'open' : 'archived');
                refreshEmailInbox();
                if (!archived) navigation.goBack();
                else await refresh();
              } catch (e) {
                toast.show(`Could not update: ${errMessage(e, 'Please try again.')}`, 'error');
              }
            }}
            hitSlop={10}
            accessibilityLabel={archived ? 'Move back to inbox' : 'Archive'}
          >
            <Icon name={archived ? 'inbox' : 'archive'} size={20} />
          </Button>
        </View>
      ),
    });
  }, [thread, navigation, refresh]);

  // Swipe left on the conversation: archive it (or restore it from Archived).
  const swipeArchive = useCallback(async () => {
    if (!thread) return;
    const archived = thread.status === 'archived';
    try {
      await setEmailThreadStatus(thread.id, archived ? 'open' : 'archived');
      invalidate(CacheKeys.emailThreads(archived ? 'archived' : 'open'));
      refreshEmailInbox();
      if (!archived) navigation.goBack();
      else await refresh();
    } catch (e) {
      toast.show(`Could not update: ${errMessage(e, 'Please try again.')}`, 'error');
    }
  }, [thread, navigation, refresh]);

  // Swipe right on a message: delete THAT message only, straight away. The card has already
  // slid out, so it is dropped from the cached conversation and the server is told. When it
  // was the last message the conversation is empty, so the screen closes.
  const swipeDelete = useCallback((messageId: string) => {
    const cur = peek<EmailThreadDetail>(CacheKeys.emailThread(threadId))?.data;
    const remaining = cur ? cur.messages.filter(m => m.id !== messageId) : [];
    if (cur) write<EmailThreadDetail>(CacheKeys.emailThread(threadId), { ...cur, messages: remaining });
    if (cur && remaining.length === 0) navigation.goBack();

    deleteEmailMessage(messageId)
      .then(() => { invalidate(CacheKeys.emailThreads('archived')); refreshEmailInbox(); })
      .catch(e => {
        toast.show(`Could not delete: ${errMessage(e, 'Please try again.')}`, 'error');
        refresh();
      });
  }, [threadId, navigation, refresh]);

  const openCompose = useCallback((opts?: { initialText?: string; retryMessageId?: string }) => {
    if (!thread) return;
    navigation.navigate('EmailCompose', {
      threadId,
      subject: `Re: ${thread.subject.replace(/^(re|fwd?):\s*/gi, '')}`,
      toName: thread.counterparty_name,
      toEmail: thread.counterparty_email,
      ...opts,
    });
  }, [navigation, thread, threadId]);

  const openAttachment = useCallback(async (message: EmailMessage, attachment: EmailAttachment) => {
    // A file we sent is not kept as a download, only listed; one we received can be opened.
    if (message.direction === 'outbound') {
      toast.show(`${attachment.filename ?? 'Attachment'}: this file was sent with your reply.`, 'success');
      return;
    }
    try {
      const link = await fetchEmailAttachmentLink(message.id, attachment.id);
      await openHttpsUrl(link.url);
    } catch (e) {
      toast.show(`Could not open attachment: ${errMessage(e, 'Please try again.')}`, 'error');
    }
  }, []);

  if (loading && !data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
        <Icon name="mail" size={32} className="text-muted-foreground" />
        <Text className="text-center text-[13px] text-muted-foreground">{error ?? 'This conversation could not be loaded.'}</Text>
        <Button variant="outline" size="sm" onPress={() => { refresh(); }}>
          <Text>Try again</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={messages}
        keyExtractor={m => m.id}
        contentContainerClassName="pb-5"
        ListHeaderComponent={
          <View className="gap-2 px-4 pb-4 pt-2">
            <Text className="text-[21px] font-bold leading-7">{thread?.subject}</Text>
            <Text className="text-[11px] text-muted-foreground">
              Swipe a message right to delete it · left to {thread?.status === 'archived' ? 'restore' : 'archive'} the conversation
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Badge variant="outline">
                <Text>{thread?.status === 'archived' ? 'Archived' : 'Inbox'}</Text>
              </Badge>
              {thread?.gyms?.name ? (
                <Badge variant="outline" className="max-w-[200px] gap-1.5">
                  <Icon name="home" size={11} className="text-muted-foreground" />
                  <Text className="shrink" numberOfLines={1}>{thread.gyms.name}</Text>
                </Badge>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <SwipeToDelete
            mode="dismiss"
            leftMode="action"
            radius={0}
            onDelete={() => swipeDelete(item.id)}
            onSwipeLeft={() => { swipeArchive(); }}
            leftLabel={thread?.status === 'archived' ? 'Move to inbox' : 'Archive'}
            leftIcon={thread?.status === 'archived' ? 'inbox' : 'archive'}
          >
            <MessageCard
              message={item}
              expanded={isExpanded(item.id)}
              onToggle={() => toggle(item.id)}
              onEditRetry={m => openCompose({ initialText: m.body_text ?? '', retryMessageId: m.id })}
              onOpenAttachment={openAttachment}
            />
          </SwipeToDelete>
        )}
      />

      {/* The AI draft. Only ever a suggestion: Use draft opens it in the editor for review,
          and nothing is sent until Send is pressed there. */}
      {thread && thread.ai_draft && (
        <Card className="mx-3 mt-2 gap-2 px-3 py-3">
          <View className="flex-row items-center gap-1.5">
            <Icon name={thread.ai_needs_human ? 'user' : 'cpu'} size={13} className="text-muted-foreground" />
            {thread.ai_needs_human && <View className="size-1.5 rounded-full bg-warning" />}
            <Text className="flex-1 text-xs font-extrabold">
              {thread.ai_needs_human ? 'Needs a person. Holding reply drafted' : 'AI draft ready. Review before sending'}
            </Text>
          </View>
          <Text className="text-xs leading-[17px] text-muted-foreground" numberOfLines={3}>{thread.ai_draft}</Text>
          <View className="flex-row items-center gap-1">
            <Button
              size="sm"
              className="rounded-full"
              onPress={() => openCompose({ initialText: thread.ai_draft as string })}
              accessibilityRole="button"
            >
              <Text className="text-xs">Use draft</Text>
            </Button>
            <Button variant="ghost" size="sm" onPress={() => { regenerate(); }} disabled={drafting} accessibilityRole="button">
              {drafting ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : <Text className="text-xs text-muted-foreground">Regenerate</Text>}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => { dismissDraft(); }} accessibilityRole="button">
              <Text className="text-xs text-muted-foreground">Dismiss</Text>
            </Button>
          </View>
        </Card>
      )}
      {thread && !thread.ai_draft && thread.ai_draft_status === 'queued' && (
        <View className="mx-3 mt-2 flex-row items-center gap-2 py-1.5">
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text className="flex-1 text-[11px] text-muted-foreground">Preparing a draft. The AI is busy, so it will appear here in a moment.</Text>
        </View>
      )}
      {thread && !thread.ai_draft && (thread.ai_draft_status === 'failed' || thread.ai_draft_status === 'skipped') && (
        <Pressable className="mx-3 mt-2 flex-row items-center gap-2 py-1.5" onPress={() => { regenerate(); }} disabled={drafting}>
          <Icon name="cpu" size={13} className="text-muted-foreground" />
          <Text className="flex-1 text-[11px] text-muted-foreground">
            {thread.ai_draft_status === 'skipped' ? "Today's AI draft limit was reached. Tap to try again." : 'No draft could be written. Tap to try again.'}
          </Text>
        </Pressable>
      )}

      {/* Gmail's bottom action: one wide Reply button that opens the full editor. */}
      <View className="border-t-hairline border-border bg-background px-4 pt-3" style={{ paddingBottom: 12 + insets.bottom }}>
        <Button variant="outline" size="lg" className="rounded-full" onPress={() => openCompose()} accessibilityRole="button" accessibilityLabel="Reply">
          <Icon name="corner-up-left" size={18} />
          <Text>Reply</Text>
        </Button>
      </View>
    </View>
  );
}
