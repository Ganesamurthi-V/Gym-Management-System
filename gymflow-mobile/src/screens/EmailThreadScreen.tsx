import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Linking,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { CacheKeys } from '@/lib/cache';
import { useCachedQuery } from '@/lib/use-cached-query';
import { refreshEmailInbox, useEmailRefresher } from '@/lib/email-sync';
import {
  fetchEmailThread, replyToEmailThread, setEmailThreadStatus, fetchEmailAttachmentLink,
  type EmailAttachment, type EmailMessage, type EmailThreadDetail,
} from '@/lib/api';
import { timeAgo } from '@/components/EmailRow';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailThread'>;

const MAX_REPLY_CHARS = 10_000;

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

function MessageBubble({
  message, onRetry, onOpenAttachment,
}: {
  message: EmailMessage;
  onRetry: (m: EmailMessage) => void;
  onOpenAttachment: (m: EmailMessage, a: EmailAttachment) => void;
}) {
  const [showQuoted, setShowQuoted] = useState(false);
  const mine = message.direction === 'outbound';
  const { fresh, quoted } = splitQuoted(message.body_text ?? '');
  const dmarcFailed = message.auth_result?.dmarc === 'fail';
  const failed = message.status === 'failed';

  return (
    <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, failed && styles.bubbleFailed]}>
        {!mine && (
          <Text style={styles.sender} numberOfLines={1}>{message.from_name || message.from_email}</Text>
        )}

        {dmarcFailed && (
          <View style={styles.warn}>
            <Feather name="alert-triangle" size={12} color={Colors.amber} />
            <Text style={styles.warnText}>Sender could not be verified. Be careful with links.</Text>
          </View>
        )}
        {message.is_auto && <Text style={styles.autoTag}>Automatic reply</Text>}

        <Text style={styles.bodyText} selectable>{fresh || '(no text)'}</Text>

        {quoted ? (
          <>
            <TouchableOpacity onPress={() => setShowQuoted(v => !v)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.quotedToggle}>{showQuoted ? 'Hide earlier messages' : '•••  Show earlier messages'}</Text>
            </TouchableOpacity>
            {showQuoted && <Text style={styles.quotedText} selectable>{quoted}</Text>}
          </>
        ) : null}

        {message.attachments.map(a => (
          <TouchableOpacity key={a.id} style={styles.attachment} onPress={() => onOpenAttachment(message, a)} activeOpacity={0.8}>
            <Feather name="paperclip" size={13} color={Colors.sky} />
            <Text style={styles.attachmentText} numberOfLines={1}>{a.filename ?? 'attachment'}</Text>
            <Text style={styles.attachmentSize}>{Math.max(1, Math.round(a.size / 1024))} KB</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.metaRow}>
          <Text style={styles.time}>{timeAgo(message.created_at)}</Text>
          {mine && message.status === 'sending' && <Text style={styles.time}> · sending…</Text>}
          {mine && message.status === 'sent' && <Feather name="check" size={11} color={Colors.textMuted} style={{ marginLeft: 4 }} />}
        </View>

        {failed && (
          <TouchableOpacity style={styles.retry} onPress={() => onRetry(message)} activeOpacity={0.8}>
            <Feather name="refresh-cw" size={12} color={Colors.red} />
            <Text style={styles.retryText}>Not sent. Tap to retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function EmailThreadScreen({ route, navigation }: Props) {
  const { threadId } = route.params;
  const listRef = useRef<FlatList<EmailMessage>>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const { data, loading, error, refresh } = useCachedQuery<EmailThreadDetail>({
    key: CacheKeys.emailThread(threadId),
    fetcher: () => fetchEmailThread(threadId),
    ttlMs: 0,
  });
  useEmailRefresher(refresh);

  const thread = data?.thread;
  const messages = data?.messages ?? [];

  // Archive / restore, and a shortcut to the gym when the sender owns one.
  useEffect(() => {
    if (!thread) return;
    const archived = thread.status === 'archived';
    navigation.setOptions({
      headerTitle: thread.counterparty_name || thread.counterparty_email,
      headerRight: () => (
        <View style={styles.headerActions}>
          {thread.gym_id ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('GymDetail', { gymId: thread.gym_id as string })}
              hitSlop={10}
              accessibilityLabel="Open this gym"
            >
              <Feather name="home" size={19} color={Colors.sky} />
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
            <Feather name={archived ? 'inbox' : 'archive'} size={19} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [thread, navigation, refresh]);

  const send = useCallback(async (text: string, retryMessageId?: string) => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await replyToEmailThread(threadId, body, retryMessageId);
      if (!retryMessageId) setDraft('');
      await refresh();
      void refreshEmailInbox();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      // The server keeps a failed row for this reply, so it shows in the thread with a
      // retry button. The draft stays in the box either way: nothing typed is lost.
      setSendError(e?.message ?? 'Could not send the reply.');
      await refresh().catch(() => {});
    } finally {
      setSending(false);
    }
  }, [threadId, sending, refresh]);

  const openAttachment = useCallback(async (message: EmailMessage, attachment: EmailAttachment) => {
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

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.subject}>{thread?.subject}</Text>}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            onRetry={m => { void send(m.body_text ?? '', m.id); }}
            onOpenAttachment={openAttachment}
          />
        )}
      />

      {sendError && (
        <View style={styles.sendError}>
          <Feather name="alert-circle" size={13} color={Colors.red} />
          <Text style={styles.sendErrorText} numberOfLines={2}>{sendError}</Text>
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={`Reply to ${thread?.counterparty_name || thread?.counterparty_email}`}
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={MAX_REPLY_CHARS}
          editable={!sending}
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={() => { void send(draft); }}
          disabled={!canSend}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Send reply"
        >
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={17} color="#fff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xxxl },
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xl },
  subject: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginRight: Spacing.lg },

  bubbleWrap: { alignItems: 'flex-start' },
  bubbleWrapMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '88%', borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.xs, borderWidth: 1 },
  bubbleTheirs: { backgroundColor: Colors.bgCard, borderColor: Colors.bgCardBorder, borderTopLeftRadius: 4 },
  bubbleMine: { backgroundColor: Colors.indigoBg, borderColor: Colors.indigoBorder, borderTopRightRadius: 4 },
  bubbleFailed: { borderColor: Colors.redBorder, backgroundColor: Colors.redBg },
  sender: { fontSize: 11, fontWeight: '800', color: Colors.purple },
  bodyText: { fontSize: 14, lineHeight: 20, color: Colors.textPrimary },
  quotedToggle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 2 },
  quotedText: { fontSize: 12, lineHeight: 17, color: Colors.textMuted, borderLeftWidth: 2, borderLeftColor: Colors.bgCardBorder, paddingLeft: Spacing.sm },
  autoTag: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.amberBg },
  warnText: { flex: 1, fontSize: 11, color: Colors.amber, fontWeight: '600' },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.skyBg, marginTop: 2 },
  attachmentText: { flex: 1, fontSize: 12, color: Colors.sky, fontWeight: '600' },
  attachmentSize: { fontSize: 10, color: Colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 2 },
  time: { fontSize: 10, color: Colors.textMuted },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  retryText: { fontSize: 11, fontWeight: '700', color: Colors.red },

  sendError: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.redBg },
  sendErrorText: { flex: 1, fontSize: 12, color: Colors.red },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, padding: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.bgCardBorder, backgroundColor: Colors.bgCard,
  },
  input: {
    flex: 1, maxHeight: 140, minHeight: 42, backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, color: Colors.textPrimary, fontSize: 14,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.indigo, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.indigoBg },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: Colors.indigo },
});
