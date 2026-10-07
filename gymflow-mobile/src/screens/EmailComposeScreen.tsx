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
import { replyToEmailThread, type LocalAttachment } from '@/lib/api';
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

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function fileIcon(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'file-text';
  return 'file';
}

/**
 * Writing a reply, laid out like Gmail's composer: To and Subject at the top, the message
 * below, files attached as chips, and a formatting bar (bold, italic, underline, bullets,
 * numbers, link) above the keyboard. Send and Attach live in the header.
 *
 * Formatting is written as light markers around the text (see lib/email-markup.ts); Preview
 * shows them as real bold and lists, and the server turns the same markers into the HTML
 * email the customer receives.
 */
export default function EmailComposeScreen({ route, navigation }: Props) {
  const { threadId, subject, toName, toEmail, initialText = '', retryMessageId } = route.params;

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
  const sentRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const canSend = body.trim().length > 0 && !sending;
  const dirty = body.trim() !== initialText.trim() || files.length > 0;

  // ── leaving with unsent work asks first ────────────────────────────────────────────────
  useEffect(() => {
    return navigation.addListener('beforeRemove', e => {
      if (sentRef.current || !dirty || sending) return;
      e.preventDefault();
      Alert.alert('Discard this reply?', 'What you wrote and attached will be lost.', [
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
      for (const p of picked) {
        const uri = p.fileCopyUri ?? p.uri;
        const size = p.size ?? 0;
        const name = p.name ?? 'attachment';
        if (next.length >= MAX_FILES) { Alert.alert('Too many files', `You can attach up to ${MAX_FILES} files.`); break; }
        if (size > MAX_FILE_BYTES) { Alert.alert('File too large', `${name} is ${fmtSize(size)}. Each file can be up to 3 MB.`); continue; }
        if (next.reduce((n, f) => n + f.size, 0) + size > MAX_TOTAL_BYTES) {
          Alert.alert('Too much attached', 'Attachments together can be up to 4 MB.');
          break;
        }
        if (next.some(f => f.uri === uri)) continue;
        next.push({ uri, name, type: p.type ?? 'application/octet-stream', size });
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
      await replyToEmailThread(threadId, body.trim(), retryMessageId, files);
      sentRef.current = true;
      void refreshEmailInbox();
      navigation.goBack();
    } catch (e: any) {
      // The text and files stay on screen, so nothing is lost and Send can simply be pressed again.
      Alert.alert('Could not send', e?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [canSend, threadId, body, retryMessageId, files, navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: 'Reply',
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
  }, [navigation, attach, send, canSend, sending]);

  const who = toName || toEmail;

  return (
    <KeyboardSafeView style={styles.root} safeBottom>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        {/* To / From / Subject, as Gmail lays them out */}
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>From</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>GymFlow Support</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>To</Text>
          <View style={styles.chip}>
            <Avatar name={who} seed={toEmail} size={22} />
            <Text style={styles.chipText} numberOfLines={1}>{who}</Text>
          </View>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Subject</Text>
          <Text style={styles.fieldValue} numberOfLines={2}>{subject}</Text>
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
            autoFocus={!initialText}
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
    </KeyboardSafeView>
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
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%',
    paddingVertical: 3, paddingLeft: 3, paddingRight: 12, borderRadius: Radius.full,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  chipText: { flexShrink: 1, fontSize: 13, color: Colors.textPrimary },

  input: {
    minHeight: 260, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.lg,
    fontSize: 16, lineHeight: 23, color: Colors.textPrimary,
  },
  previewBox: { minHeight: 260, padding: Spacing.lg },
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
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.lg },
  dialogCancel: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2 },
  dialogCancelText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  dialogOk: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm + 2, borderRadius: Radius.full, backgroundColor: Colors.indigo },
  dialogOkText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
