import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { CacheKeys } from '@/lib/cache';
import { useCachedQuery } from '@/lib/use-cached-query';
import { refreshEmailInbox, useEmailRefresher } from '@/lib/email-sync';
import {
  fetchEmailThread, setEmailThreadStatus, fetchEmailAttachmentLink,
  regenerateEmailDraft, dismissEmailDraft,
  type EmailAttachment, type EmailMessage, type EmailThreadDetail,
} from '@/lib/api';
import { Avatar } from '@/components/EmailRow';
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

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function fileIcon(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'file-text';
  return 'file';
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
    <View style={[styles.card, failed && styles.cardFailed]}>
      <TouchableOpacity style={styles.cardHead} onPress={onToggle} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded }}>
        <Avatar name={name} seed={mine ? 'support' : message.from_email} />
        <View style={styles.headText}>
          <View style={styles.headTop}>
            <Text style={styles.sender} numberOfLines={1}>{name}</Text>
            <Text style={styles.date}>{shortDate(message.created_at)}</Text>
          </View>
          {expanded ? (
            <TouchableOpacity style={styles.toRow} onPress={() => setDetails(v => !v)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.toText} numberOfLines={1}>to {recipient}</Text>
              <Feather name={details ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <Text style={styles.collapsedLine} numberOfLines={1}>{oneLine}</Text>
          )}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardBody}>
          {details && (
            <View style={styles.details}>
              <Text style={styles.detailLine}><Text style={styles.detailKey}>From  </Text>{message.from_name ? `${message.from_name} <${message.from_email}>` : message.from_email}</Text>
              <Text style={styles.detailLine}><Text style={styles.detailKey}>To  </Text>{message.to_emails.join(', ') || 'me'}</Text>
              <Text style={styles.detailLine}><Text style={styles.detailKey}>Date  </Text>{fullDate(message.created_at)}</Text>
            </View>
          )}

          {dmarcFailed && (
            <View style={styles.warn}>
              <Feather name="alert-triangle" size={13} color={Colors.amber} />
              <Text style={styles.warnText}>Sender could not be verified. Be careful with links.</Text>
            </View>
          )}
          {message.is_auto && <Text style={styles.autoTag}>Automatic reply</Text>}

          <Text style={styles.bodyText} selectable>{fresh || '(no text)'}</Text>

          {quoted ? (
            <>
              <TouchableOpacity onPress={() => setShowQuoted(v => !v)} style={styles.dots} hitSlop={8} accessibilityRole="button" accessibilityLabel="Show trimmed content">
                <Feather name="more-horizontal" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
              {showQuoted && <Text style={styles.quotedText} selectable>{quoted}</Text>}
            </>
          ) : null}

          {message.attachments.length > 0 && (
            <View style={styles.files}>
              {message.attachments.map(a => (
                <TouchableOpacity key={a.id} style={styles.file} onPress={() => onOpenAttachment(message, a)} activeOpacity={0.8}>
                  <View style={styles.fileIcon}>
                    <Feather name={fileIcon(a.content_type) as any} size={18} color={Colors.sky} />
                  </View>
                  <View style={styles.fileText}>
                    <Text style={styles.fileName} numberOfLines={1}>{a.filename ?? 'attachment'}</Text>
                    <Text style={styles.fileSize}>{fmtSize(a.size)}</Text>
                  </View>
                  {!mine && <Feather name="download" size={16} color={Colors.textSecondary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {mine && message.status === 'sending' && <Text style={styles.sendingNote}>Sending…</Text>}

          {failed && (
            <TouchableOpacity style={styles.retry} onPress={() => onEditRetry(message)} activeOpacity={0.8}>
              <Feather name="refresh-cw" size={13} color={Colors.red} />
              <Text style={styles.retryText}>Not sent. Tap to edit and send again</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function EmailThreadScreen({ route, navigation }: Props) {
  const { threadId } = route.params;
  const insets = useSafeAreaInsets();
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
    const t = setTimeout(() => { void refresh(); }, 9_000);
    return () => clearTimeout(t);
  }, [thread?.ai_draft_status, refresh]);

  const regenerate = useCallback(async () => {
    if (drafting) return;
    setDrafting(true);
    try {
      await regenerateEmailDraft(threadId);
      await refresh();
    } catch (e: any) {
      Alert.alert('Could not write a draft', e?.message ?? 'Please try again in a minute.');
    } finally {
      setDrafting(false);
    }
  }, [drafting, threadId, refresh]);

  const dismissDraft = useCallback(async () => {
    try {
      await dismissEmailDraft(threadId);
      await refresh();
    } catch (e: any) {
      Alert.alert('Could not dismiss', e?.message ?? 'Please try again.');
    }
  }, [threadId, refresh]);

  // Archive / restore, and a shortcut to the gym when the sender owns one.
  useEffect(() => {
    if (!thread) return;
    const archived = thread.status === 'archived';
    navigation.setOptions({
      headerTitle: '',
      headerRight: () => (
        <View style={styles.headerActions}>
          {thread.gym_id ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('GymDetail', { gymId: thread.gym_id as string })}
              hitSlop={10}
              accessibilityLabel="Open this gym"
            >
              <Feather name="home" size={20} color={Colors.sky} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={async () => {
              try {
                await setEmailThreadStatus(thread.id, archived ? 'open' : 'archived');
                void refreshEmailInbox();
                if (!archived) navigation.goBack();
                else await refresh();
              } catch (e: any) {
                Alert.alert('Could not update', e?.message ?? 'Please try again.');
              }
            }}
            hitSlop={10}
            accessibilityLabel={archived ? 'Move back to inbox' : 'Archive'}
          >
            <Feather name={archived ? 'inbox' : 'archive'} size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [thread, navigation, refresh]);

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
      Alert.alert(attachment.filename ?? 'Attachment', 'This file was sent with your reply.');
      return;
    }
    try {
      const link = await fetchEmailAttachmentLink(message.id, attachment.id);
      await Linking.openURL(link.url);
    } catch (e: any) {
      Alert.alert('Could not open attachment', e?.message ?? 'Please try again.');
    }
  }, []);

  if (loading && !data) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.indigo} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.root, styles.center]}>
        <Feather name="mail" size={32} color={Colors.bgCardBorder} />
        <Text style={styles.emptyText}>{error ?? 'This conversation could not be loaded.'}</Text>
        <TouchableOpacity onPress={() => { void refresh(); }} style={styles.retryBtn} activeOpacity={0.8}>
          <Text style={styles.retryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.subjectBlock}>
            <Text style={styles.subject}>{thread?.subject}</Text>
            <View style={styles.chips}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{thread?.status === 'archived' ? 'Archived' : 'Inbox'}</Text>
              </View>
              {thread?.gyms?.name ? (
                <View style={[styles.chip, styles.chipGym]}>
                  <Feather name="home" size={11} color={Colors.sky} />
                  <Text style={[styles.chipText, { color: Colors.sky }]} numberOfLines={1}>{thread.gyms.name}</Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <MessageCard
            message={item}
            expanded={isExpanded(item.id)}
            onToggle={() => toggle(item.id)}
            onEditRetry={m => openCompose({ initialText: m.body_text ?? '', retryMessageId: m.id })}
            onOpenAttachment={openAttachment}
          />
        )}
      />

      {/* The AI draft. Only ever a suggestion: Use draft opens it in the editor for review,
          and nothing is sent until Send is pressed there. */}
      {thread && thread.ai_draft && (
        <View style={[styles.aiBanner, thread.ai_needs_human && styles.aiBannerHuman]}>
          <View style={styles.aiHead}>
            <Feather name={thread.ai_needs_human ? 'user' : 'cpu'} size={13} color={thread.ai_needs_human ? Colors.amber : Colors.purple} />
            <Text style={[styles.aiTitle, thread.ai_needs_human && { color: Colors.amber }]}>
              {thread.ai_needs_human ? 'Needs a person. Holding reply drafted' : 'AI draft ready. Review before sending'}
            </Text>
          </View>
          <Text style={styles.aiPreview} numberOfLines={3}>{thread.ai_draft}</Text>
          <View style={styles.aiActions}>
            <TouchableOpacity
              style={styles.aiUse}
              onPress={() => openCompose({ initialText: thread.ai_draft as string })}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.aiUseText}>Use draft</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { void regenerate(); }} disabled={drafting} hitSlop={8} accessibilityRole="button">
              {drafting ? <ActivityIndicator size="small" color={Colors.textSecondary} /> : <Text style={styles.aiLink}>Regenerate</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { void dismissDraft(); }} hitSlop={8} accessibilityRole="button">
              <Text style={styles.aiLink}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {thread && !thread.ai_draft && thread.ai_draft_status === 'queued' && (
        <View style={styles.aiNote}>
          <ActivityIndicator size="small" color={Colors.textMuted} />
          <Text style={styles.aiNoteText}>Preparing a draft. The AI is busy, so it will appear here in a moment.</Text>
        </View>
      )}
      {thread && !thread.ai_draft && (thread.ai_draft_status === 'failed' || thread.ai_draft_status === 'skipped') && (
        <TouchableOpacity style={styles.aiNote} onPress={() => { void regenerate(); }} disabled={drafting} activeOpacity={0.8}>
          <Feather name="cpu" size={13} color={Colors.textMuted} />
          <Text style={styles.aiNoteText}>
            {thread.ai_draft_status === 'skipped' ? "Today's AI draft limit was reached. Tap to try again." : 'No draft could be written. Tap to try again.'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Gmail's bottom action: one wide Reply button that opens the full editor. */}
      <View style={[styles.actionBar, { paddingBottom: Spacing.md + insets.bottom }]}>
        <TouchableOpacity style={styles.replyBtn} onPress={() => openCompose()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Reply">
          <Feather name="corner-up-left" size={18} color={Colors.textPrimary} />
          <Text style={styles.replyText}>Reply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xxxl },
  list: { paddingBottom: Spacing.xl },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl, marginRight: Spacing.lg },

  subjectBlock: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg, gap: Spacing.sm },
  subject: { fontSize: 21, lineHeight: 28, fontWeight: '700', color: Colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 200,
    paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: Radius.sm,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  chipGym: { backgroundColor: Colors.skyBg, borderColor: 'transparent' },
  chipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  card: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.bgCardBorder },
  cardFailed: { backgroundColor: Colors.redBg },
  cardHead: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  headText: { flex: 1, gap: 2 },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  sender: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  date: { fontSize: 12, color: Colors.textMuted },
  toRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  toText: { fontSize: 13, color: Colors.textMuted, maxWidth: 240 },
  collapsedLine: { fontSize: 13, color: Colors.textMuted },

  cardBody: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, paddingLeft: Spacing.lg + 40 + Spacing.md, gap: Spacing.sm },
  details: { gap: 3, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.bgCard },
  detailLine: { fontSize: 12, color: Colors.textSecondary },
  detailKey: { color: Colors.textMuted, fontWeight: '700' },
  bodyText: { fontSize: 15, lineHeight: 23, color: Colors.textPrimary },
  dots: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 2, borderRadius: Radius.sm, backgroundColor: Colors.bgCard },
  quotedText: { fontSize: 13, lineHeight: 19, color: Colors.textMuted, borderLeftWidth: 2, borderLeftColor: Colors.bgCardBorder, paddingLeft: Spacing.sm },
  autoTag: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.amberBg },
  warnText: { flex: 1, fontSize: 12, color: Colors.amber, fontWeight: '600' },
  files: { gap: Spacing.sm, marginTop: Spacing.xs },
  file: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm,
    borderRadius: Radius.md, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  fileIcon: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.skyBg, alignItems: 'center', justifyContent: 'center' },
  fileText: { flex: 1 },
  fileName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  fileSize: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  sendingNote: { fontSize: 12, color: Colors.textMuted },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  retryText: { fontSize: 12, fontWeight: '700', color: Colors.red },

  aiBanner: { marginHorizontal: Spacing.md, marginTop: Spacing.sm, padding: Spacing.md, gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.purpleBg, backgroundColor: Colors.purpleBg },
  aiBannerHuman: { borderColor: Colors.amberBorder, backgroundColor: Colors.amberBg },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTitle: { fontSize: 12, fontWeight: '800', color: Colors.purple },
  aiPreview: { fontSize: 12, lineHeight: 17, color: Colors.textSecondary },
  aiActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  aiUse: { paddingHorizontal: Spacing.lg, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.indigo },
  aiUseText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  aiLink: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  aiNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.md, marginTop: Spacing.sm, paddingVertical: 6 },
  aiNoteText: { flex: 1, fontSize: 11, color: Colors.textMuted },

  actionBar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.bgCardBorder, backgroundColor: Colors.bg },
  replyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 46,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.textMuted, backgroundColor: Colors.bgCard,
  },
  replyText: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },

  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.indigoBg },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: Colors.indigo },
});
