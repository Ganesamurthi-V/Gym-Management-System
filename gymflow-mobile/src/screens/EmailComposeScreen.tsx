import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, Alert, type NativeSyntheticEvent, type TextInputSelectionChangeEventData,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import DocumentPicker, { types as pickerTypes } from 'react-native-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { refreshEmailInbox } from '@/lib/email-sync';
import {
  replyToEmailThread, sendNewEmail, searchEmailContacts, aiComposeEmail,
  type LocalAttachment, type EmailContact,
} from '@/lib/api';
import {
  toggleWrap, toggleList, insertLink, normalizeUrl, type Selection,
} from '@/lib/email-markup';
import { Avatar } from '@/components/EmailRow';
import { FormattedText } from '@/components/FormattedText';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailCompose'>;

const MAX_CHARS = 10_000;
// The same limits the server enforces, checked here first so the admin hears about a
// problem before waiting on an upload.
const MAX_FILES = 5;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

const AI_IDEAS = [
  'Invite them to a free demo this week',
  'Follow up on their pricing question',
  'Thank them for their feedback',
  'Tell them their issue is fixed',
];

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function fileIcon(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'file-text';
  return 'file';
}

/**
 * Writing an email, laid out like Gmail's composer. Two modes share this screen:
 *
 *   Reply  (a threadId is given): To and Subject are fixed.
 *   New    (no threadId): To is a searchable list of people who have already emailed support,
 *          and the subject is typed.
 *
 * Below the fields: the message, files attached as chips, and a formatting bar (bold,
 * italic, underline, bullets, numbers, link) above the keyboard. "Write with AI" lets the
 * admin describe the email and have it written into the editor, to read and change before
 * sending. Send and Attach live in the header.
 *
 * Formatting is written as light markers (see lib/email-markup.ts); Preview shows them as
 * real bold and lists, and the server turns the same markers into the HTML email.
 */
export default function EmailComposeScreen({ route, navigation }: Props) {
  const p = route.params ?? {};
  const { threadId, initialText = '', retryMessageId } = p;
  const isNew = !threadId;

  const [contact, setContact] = useState<EmailContact | null>(
    p.toEmail ? { email: p.toEmail, name: p.toName ?? null, gymName: null, lastAt: '' } : null,
  );
  const [subject, setSubject] = useState(p.subject ?? '');
  const [body, setBody] = useState(initialText);
  const [sel, setSel] = useState<Selection>({ start: initialText.length, end: initialText.length });
  // Set only when a toolbar button moves the cursor; otherwise the box manages its own.
  const [forcedSel, setForcedSel] = useState<Selection | undefined>();
  const [files, setFiles] = useState<LocalAttachment[]>([]);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const sentRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const canSend =
    body.trim().length > 0 && !sending && (!isNew || (!!contact && subject.trim().length > 0));
  const dirty = isNew
    ? !!contact || subject.trim() !== '' || body.trim() !== '' || files.length > 0
    : body.trim() !== initialText.trim() || files.length > 0;

  // ── leaving with unsent work asks first ────────────────────────────────────────────────
  useEffect(() => {
    return navigation.addListener('beforeRemove', e => {
      if (sentRef.current || !dirty || sending) return;
      e.preventDefault();
      Alert.alert('Discard this email?', 'What you wrote and attached will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, dirty, sending]);

  // ── toolbar ──────────────────────────────────────────────────────────────────────────────
  const apply = useCallback((edit: { text: string; selection: Selection }) => {
    setBody(edit.text);
    setSel(edit.selection);
    setForcedSel(edit.selection);
    // Hand the cursor back to the box on the next tick so typing is never fought over.
    setTimeout(() => setForcedSel(undefined), 60);
    inputRef.current?.focus();
  }, []);

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
    setSel(e.nativeEvent.selection);

  const openLink = () => {
    setLinkLabel(body.slice(sel.start, sel.end));
    setLinkUrl('');
    setLinkOpen(true);
  };
  const confirmLink = () => {
    const url = normalizeUrl(linkUrl);
    if (!url) {
      Alert.alert('That is not a web address', 'Use something like https://www.gymflow.sbs or name@example.com.');
      return;
    }
    setLinkOpen(false);
    apply(insertLink(body, sel, linkLabel, url));
  };

  // ── attachments ─────────────────────────────────────────────────────────────────────────
  const attach = useCallback(async () => {
    try {
      const picked = await DocumentPicker.pick({
        type: [pickerTypes.allFiles],
        allowMultiSelection: true,
        // A cache copy has a plain file:// path, which is what the upload reads.
        copyTo: 'cachesDirectory',
      });
      const next = [...files];
      for (const f of picked) {
        const uri = f.fileCopyUri ?? f.uri;
        const size = f.size ?? 0;
        const name = f.name ?? 'attachment';
        if (next.length >= MAX_FILES) { Alert.alert('Too many files', `You can attach up to ${MAX_FILES} files.`); break; }
        if (size > MAX_FILE_BYTES) { Alert.alert('File too large', `${name} is ${fmtSize(size)}. Each file can be up to 3 MB.`); continue; }
        if (next.reduce((n, x) => n + x.size, 0) + size > MAX_TOTAL_BYTES) {
          Alert.alert('Too much attached', 'Attachments together can be up to 4 MB.');
          break;
        }
        if (next.some(x => x.uri === uri)) continue;
        next.push({ uri, name, type: f.type ?? 'application/octet-stream', size });
      }
      setFiles(next);
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) Alert.alert('Could not attach', 'Please try again.');
    }
  }, [files]);

  // ── send ────────────────────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    try {
      if (isNew) {
        await sendNewEmail({ to: contact!.email, subject: subject.trim(), text: body.trim(), attachments: files });
      } else {
        await replyToEmailThread(threadId!, body.trim(), retryMessageId, files);
      }
      sentRef.current = true;
      void refreshEmailInbox();
      navigation.goBack();
    } catch (e: any) {
      // The text and files stay on screen, so nothing is lost and Send can simply be pressed again.
      Alert.alert('Could not send', e?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [canSend, isNew, contact, subject, body, threadId, retryMessageId, files, navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: isNew ? 'New message' : 'Reply',
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => { void attach(); }} hitSlop={10} accessibilityLabel="Attach files" disabled={sending}>
            <Feather name="paperclip" size={21} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { void send(); }} hitSlop={10} accessibilityLabel="Send" disabled={!canSend}>
            {sending
              ? <ActivityIndicator size="small" color={Colors.indigo} />
              : <Feather name="send" size={21} color={canSend ? Colors.indigo : Colors.textMuted} />}
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, isNew, attach, send, canSend, sending]);

  // ── write with AI ───────────────────────────────────────────────────────────────────────
  const runAi = useCallback(async () => {
    const instruction = aiText.trim();
    if (instruction.length < 3 || aiBusy) return;
    setAiBusy(true);
    try {
      const result = await aiComposeEmail({ instruction, to: contact?.email, threadId });
      const fill = () => {
        if (isNew && !subject.trim() && result.subject) setSubject(result.subject);
        setBody(result.body);
        setSel({ start: result.body.length, end: result.body.length });
        setPreview(false);
      };
      setAiOpen(false);
      if (body.trim()) {
        Alert.alert('Replace what you wrote?', 'The AI email will take the place of the current text.', [
          { text: 'Keep mine', style: 'cancel' },
          { text: 'Replace', onPress: fill },
        ]);
      } else {
        fill();
      }
    } catch (e: any) {
      Alert.alert('The AI could not write it', e?.message ?? 'Please try again.');
    } finally {
      setAiBusy(false);
    }
  }, [aiText, aiBusy, contact, threadId, isNew, subject, body]);

  const who = contact ? (contact.name || contact.email) : '';

  return (
    <KeyboardSafeView style={styles.root} safeBottom>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        {/* From / To / Subject, as Gmail lays them out */}
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>From</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>GymFlow Support</Text>
        </View>

        {isNew ? (
          <ContactPicker value={contact} onChange={setContact} disabled={sending} />
        ) : (
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>To</Text>
            <View style={styles.chip}>
              <Avatar name={who} seed={contact?.email ?? ''} size={22} />
              <Text style={styles.chipText} numberOfLines={1}>{who}</Text>
            </View>
          </View>
        )}

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Subject</Text>
          {isNew ? (
            <TextInput
              style={styles.subjectInput}
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject"
              placeholderTextColor={Colors.textMuted}
              maxLength={200}
              editable={!sending}
              returnKeyType="next"
            />
          ) : (
            <Text style={styles.fieldValue} numberOfLines={2}>{p.subject}</Text>
          )}
        </View>

        <View style={styles.aiRow}>
          <TouchableOpacity
            style={styles.aiPill}
            onPress={() => setAiOpen(true)}
            activeOpacity={0.8}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Write with AI"
          >
            <Feather name="cpu" size={13} color={Colors.purple} />
            <Text style={styles.aiPillText}>Write with AI</Text>
          </TouchableOpacity>
        </View>

        {preview ? (
          <View style={styles.previewBox}>
            {body.trim() ? <FormattedText markup={body} /> : <Text style={styles.placeholder}>Nothing to preview yet</Text>}
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={body}
            onChangeText={setBody}
            onSelectionChange={onSelectionChange}
            selection={forcedSel}
            placeholder="Compose email"
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={MAX_CHARS}
            editable={!sending}
            textAlignVertical="top"
          />
        )}

        {files.length > 0 && (
          <View style={styles.files}>
            {files.map(f => (
              <View key={f.uri} style={styles.file}>
                <Feather name={fileIcon(f.type) as any} size={18} color={Colors.sky} />
                <View style={styles.fileText}>
                  <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.fileSize}>{fmtSize(f.size)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setFiles(prev => prev.filter(x => x.uri !== f.uri))}
                  hitSlop={10}
                  disabled={sending}
                  accessibilityLabel={`Remove ${f.name}`}
                >
                  <Feather name="x" size={17} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Formatting bar: stays above the keyboard */}
      <View style={styles.toolbar}>
        <ToolButton icon="bold" label="Bold" disabled={preview} onPress={() => apply(toggleWrap(body, sel, '**'))} />
        <ToolButton icon="italic" label="Italic" disabled={preview} onPress={() => apply(toggleWrap(body, sel, '_'))} />
        <ToolButton icon="underline" label="Underline" disabled={preview} onPress={() => apply(toggleWrap(body, sel, '++'))} />
        <View style={styles.sep} />
        <ToolButton icon="list" label="Bulleted list" disabled={preview} onPress={() => apply(toggleList(body, sel, 'bullet'))} />
        <ToolButton icon="hash" label="Numbered list" disabled={preview} onPress={() => apply(toggleList(body, sel, 'number'))} />
        <ToolButton icon="link" label="Insert link" disabled={preview} onPress={openLink} />
        <View style={styles.spacer} />
        <TouchableOpacity
          style={[styles.previewBtn, preview && styles.previewBtnOn]}
          onPress={() => setPreview(v => !v)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: preview }}
        >
          <Feather name={preview ? 'edit-3' : 'eye'} size={14} color={preview ? '#fff' : Colors.textSecondary} />
          <Text style={[styles.previewText, preview && { color: '#fff' }]}>{preview ? 'Edit' : 'Preview'}</Text>
        </TouchableOpacity>
      </View>

      {/* Insert link */}
      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <KeyboardSafeView style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Insert link</Text>
            <Text style={styles.dialogLabel}>Text to show</Text>
            <TextInput
              style={styles.dialogInput}
              value={linkLabel}
              onChangeText={setLinkLabel}
              placeholder="e.g. our pricing page"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.dialogLabel}>Web address</Text>
            <TextInput
              style={styles.dialogInput}
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
            />
            <View style={styles.dialogActions}>
              <TouchableOpacity onPress={() => setLinkOpen(false)} style={styles.dialogCancel}>
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmLink} style={styles.dialogOk}>
                <Text style={styles.dialogOkText}>Insert</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardSafeView>
      </Modal>

      {/* Write with AI */}
      <Modal visible={aiOpen} transparent animationType="slide" onRequestClose={() => !aiBusy && setAiOpen(false)}>
        <KeyboardSafeView style={styles.sheetOverlay} safeBottom>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Feather name="cpu" size={16} color={Colors.purple} />
              <Text style={styles.sheetTitle}>Write with AI</Text>
            </View>
            <Text style={styles.sheetSub}>
              Say what the email should do. The AI writes it into the editor, and you can change anything before sending.
            </Text>

            <TextInput
              style={styles.aiInput}
              value={aiText}
              onChangeText={setAiText}
              placeholder="e.g. Invite him for a free demo this week and ask what time suits him"
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={1000}
              editable={!aiBusy}
              textAlignVertical="top"
              autoFocus
            />

            <View style={styles.ideas}>
              {AI_IDEAS.map(idea => (
                <TouchableOpacity key={idea} style={styles.idea} onPress={() => setAiText(idea)} disabled={aiBusy} activeOpacity={0.7}>
                  <Text style={styles.ideaText}>{idea}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dialogActions}>
              <TouchableOpacity onPress={() => setAiOpen(false)} style={styles.dialogCancel} disabled={aiBusy}>
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { void runAi(); }}
                style={[styles.aiWrite, (aiText.trim().length < 3 || aiBusy) && { opacity: 0.45 }]}
                disabled={aiText.trim().length < 3 || aiBusy}
                accessibilityRole="button"
              >
                {aiBusy ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="zap" size={15} color="#fff" />}
                <Text style={styles.aiWriteText}>{aiBusy ? 'Writing…' : 'Write email'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardSafeView>
      </Modal>
    </KeyboardSafeView>
  );
}

/**
 * The "To" field of a new message: a searchable dropdown of people who have emailed support,
 * found by name or address. Opening it lists the most recent correspondents; typing narrows
 * the list. The list comes from the server, which is also what refuses any other address.
 */
function ContactPicker({
  value, onChange, disabled,
}: { value: EmailContact | null; onChange: (c: EmailContact | null) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<EmailContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ticket = useRef(0);

  // Search as the admin types, a moment after the last keystroke. An older, slower answer
  // must never overwrite a newer one, hence the ticket.
  useEffect(() => {
    if (!open) return;
    const mine = ++ticket.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchEmailContacts(query.trim());
        if (mine !== ticket.current) return;
        setResults(found);
        setFailed(null);
      } catch (e: any) {
        if (mine === ticket.current) setFailed(e?.message ?? 'Could not load contacts');
      } finally {
        if (mine === ticket.current) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, open]);

  const pick = (c: EmailContact) => {
    onChange(c);
    setOpen(false);
    setQuery('');
  };

  if (value) {
    const name = value.name || value.email;
    return (
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>To</Text>
        <View style={styles.chip}>
          <Avatar name={name} seed={value.email} size={22} />
          <Text style={styles.chipText} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={10} disabled={disabled} accessibilityLabel="Change recipient">
            <Feather name="x" size={15} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>To</Text>
        <TextInput
          style={styles.subjectInput}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setOpen(true)}
          placeholder="Search by name or email"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
        />
        {loading && <ActivityIndicator size="small" color={Colors.textMuted} />}
        {open && !loading && (
          <TouchableOpacity onPress={() => { setOpen(false); setQuery(''); }} hitSlop={10} accessibilityLabel="Close list">
            <Feather name="chevron-up" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {open && (
        <View style={styles.dropdown}>
          {failed ? (
            <Text style={styles.dropdownEmpty}>{failed}</Text>
          ) : results.length === 0 && !loading ? (
            <Text style={styles.dropdownEmpty}>
              {query ? 'No one who has emailed support matches that.' : 'No one has emailed support yet.'}
            </Text>
          ) : (
            results.map(c => (
              <TouchableOpacity key={c.email} style={styles.option} onPress={() => pick(c)} activeOpacity={0.7}>
                <Avatar name={c.name || c.email} seed={c.email} size={34} />
                <View style={styles.optionText}>
                  <Text style={styles.optionName} numberOfLines={1}>{c.name || c.email}</Text>
                  {c.name ? <Text style={styles.optionEmail} numberOfLines={1}>{c.email}</Text> : null}
                </View>
                {c.gymName ? (
                  <View style={styles.optionGym}>
                    <Feather name="home" size={10} color={Colors.sky} />
                    <Text style={styles.optionGymText} numberOfLines={1}>{c.gymName}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function ToolButton({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.tool, disabled && { opacity: 0.35 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon as any} size={19} color={Colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingBottom: Spacing.xl },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl, marginRight: Spacing.lg },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.bgCardBorder,
  },
  fieldLabel: { width: 56, fontSize: 14, color: Colors.textMuted },
  fieldValue: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  subjectInput: { flex: 1, fontSize: 15, color: Colors.textPrimary, paddingVertical: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1,
    paddingVertical: 3, paddingLeft: 3, paddingRight: 12, borderRadius: Radius.full,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  chipText: { flexShrink: 1, fontSize: 13, color: Colors.textPrimary },

  dropdown: {
    marginHorizontal: Spacing.lg, marginVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.bgCardBorder, overflow: 'hidden',
  },
  dropdownEmpty: { padding: Spacing.lg, fontSize: 13, color: Colors.textMuted },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.bgCardBorder,
  },
  optionText: { flex: 1 },
  optionName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  optionEmail: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  optionGym: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110,
    paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.skyBg,
  },
  optionGymText: { fontSize: 10, fontWeight: '700', color: Colors.sky },

  aiRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  aiPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 30,
    borderRadius: Radius.full, backgroundColor: Colors.purpleBg, borderWidth: 1, borderColor: 'rgba(192,132,252,0.3)',
  },
  aiPillText: { fontSize: 12, fontWeight: '800', color: Colors.purple },

  input: {
    minHeight: 240, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
    fontSize: 16, lineHeight: 23, color: Colors.textPrimary,
  },
  previewBox: { minHeight: 240, padding: Spacing.lg },
  placeholder: { fontSize: 14, color: Colors.textMuted },

  files: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  file: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md,
    borderRadius: Radius.md, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  fileText: { flex: 1 },
  fileName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  fileSize: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: Colors.bgCardBorder, backgroundColor: Colors.bgCard,
  },
  tool: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  sep: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: Colors.bgCardBorder },
  spacer: { flex: 1 },
  previewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 32,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  previewBtnOn: { backgroundColor: Colors.indigo, borderColor: Colors.indigo },
  previewText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.xl },
  dialog: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.bgCardBorder },
  dialogTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  dialogLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: Spacing.sm },
  dialogInput: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, color: Colors.textPrimary, fontSize: 15,
  },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.lg },
  dialogCancel: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2 },
  dialogCancelText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  dialogOk: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm + 2, borderRadius: Radius.full, backgroundColor: Colors.indigo },
  dialogOkText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgCard, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: Spacing.xl, gap: Spacing.md, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.bgCardBorder, marginBottom: Spacing.xs },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  sheetSub: { fontSize: 13, lineHeight: 19, color: Colors.textSecondary },
  aiInput: {
    minHeight: 96, maxHeight: 160, backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder,
    borderRadius: Radius.md, padding: Spacing.md, color: Colors.textPrimary, fontSize: 15, lineHeight: 21,
  },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  idea: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.bgCardBorder },
  ideaText: { fontSize: 12, color: Colors.textSecondary },
  aiWrite: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.xl, height: 42,
    borderRadius: Radius.full, backgroundColor: '#9333ea',
  },
  aiWriteText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
