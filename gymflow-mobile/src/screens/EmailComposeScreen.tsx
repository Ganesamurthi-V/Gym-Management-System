import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, ScrollView, Pressable, TextInput, ActivityIndicator, type TextInputSelectionChangeEvent,
} from 'react-native';
import { pick, keepLocalCopy, types as pickerTypes, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { refreshEmailInbox } from '@/lib/email-sync';
import {
  replyToEmailThread, sendNewEmail, searchEmailContacts, aiComposeEmail,
  type LocalAttachment, type EmailContact,
} from '@/lib/api';
import {
  toggleWrap, toggleList, insertLink, normalizeUrl, type Selection,
} from '@/lib/email-markup';
import { useAppTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { FormattedText } from '@/components/FormattedText';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/dashboard/ConfirmDialog';
import { toast } from '@/components/dashboard/Toast';
import { SenderAvatar } from './_email/SenderAvatar';
import { useDialogKeyboardLift } from './_email/useDialogKeyboardLift';
import { errMessage, fileIcon, fmtSize } from './_email/util';
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

// Borderless, transparent field used inside the From / To / Subject rows and the editor.
const BARE_INPUT = 'flex-1 border-0 bg-transparent px-0 shadow-none dark:bg-transparent';

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
  const { colors } = useAppTheme();
  const confirm = useConfirm();

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
  const inputRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  // The kit Input types its ref as the TextInput value (not the instance), so the node comes in through a callback.
  const setInputRef = useCallback((node: React.ComponentRef<typeof TextInput> | typeof TextInput | null) => {
    inputRef.current = node as React.ComponentRef<typeof TextInput> | null;
  }, []);
  // Only one of the two dialogs is ever open, so one lift serves both.
  const lift = useDialogKeyboardLift(linkOpen || aiOpen);

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
      confirm({
        title: 'Discard this email?',
        description: 'What you wrote and attached will be lost.',
        confirmText: 'Discard',
        cancelText: 'Keep editing',
        destructive: true,
      }).then(ok => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
  }, [navigation, dirty, sending, confirm]);

  // ── toolbar ──────────────────────────────────────────────────────────────────────────────
  const apply = useCallback((edit: { text: string; selection: Selection }) => {
    setBody(edit.text);
    setSel(edit.selection);
    setForcedSel(edit.selection);
    // Hand the cursor back to the box on the next tick so typing is never fought over.
    setTimeout(() => setForcedSel(undefined), 60);
    inputRef.current?.focus();
  }, []);

  const onSelectionChange = (e: TextInputSelectionChangeEvent) =>
    setSel(e.nativeEvent.selection);

  const openLink = () => {
    setLinkLabel(body.slice(sel.start, sel.end));
    setLinkUrl('');
    setLinkOpen(true);
  };
  const confirmLink = () => {
    const url = normalizeUrl(linkUrl);
    if (!url) {
      toast.show('That is not a web address. Use something like https://www.thegymflow.in or name@example.com.', 'error');
      return;
    }
    setLinkOpen(false);
    apply(insertLink(body, sel, linkLabel, url));
  };

  // ── attachments ─────────────────────────────────────────────────────────────────────────
  const attach = useCallback(async () => {
    try {
      const picked = await pick({
        type: [pickerTypes.allFiles],
        allowMultiSelection: true,
      });
      // A cache copy has a plain file:// path, which is what the upload reads.
      const copies = picked.length
        ? await keepLocalCopy({
            files: picked.map(f => ({ uri: f.uri, fileName: f.name ?? 'attachment' })) as [{ uri: string; fileName: string }, ...{ uri: string; fileName: string }[]],
            destination: 'cachesDirectory',
          })
        : [];
      const next = [...files];
      for (const [i, f] of picked.entries()) {
        const copy = copies[i];
        const uri = copy && copy.status === 'success' ? copy.localUri : f.uri;
        const size = f.size ?? 0;
        const name = f.name ?? 'attachment';
        if (next.length >= MAX_FILES) { toast.show(`Too many files. You can attach up to ${MAX_FILES} files.`, 'error'); break; }
        if (size > MAX_FILE_BYTES) { toast.show(`File too large. ${name} is ${fmtSize(size)}. Each file can be up to 3 MB.`, 'error'); continue; }
        if (next.reduce((n, x) => n + x.size, 0) + size > MAX_TOTAL_BYTES) {
          toast.show('Too much attached. Attachments together can be up to 4 MB.', 'error');
          break;
        }
        if (next.some(x => x.uri === uri)) continue;
        next.push({ uri, name, type: f.type ?? 'application/octet-stream', size });
      }
      setFiles(next);
    } catch (e) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) toast.show('Could not attach. Please try again.', 'error');
    }
  }, [files]);

  // ── send ────────────────────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    try {
      if (isNew) {
        await sendNewEmail({ to: contact!.email, toName: contact!.name, subject: subject.trim(), text: body.trim(), attachments: files });
      } else {
        await replyToEmailThread(threadId!, body.trim(), retryMessageId, files);
      }
      sentRef.current = true;
      refreshEmailInbox();
      navigation.goBack();
    } catch (e) {
      // The text and files stay on screen, so nothing is lost and Send can simply be pressed again.
      toast.show(`Could not send: ${errMessage(e, 'Please try again.')}`, 'error');
    } finally {
      setSending(false);
    }
  }, [canSend, isNew, contact, subject, body, threadId, retryMessageId, files, navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: isNew ? 'New message' : 'Reply',
      // eslint-disable-next-line react/no-unstable-nested-components -- navigation header options must be rebuilt with live state (sending/canSend)
      headerRight: () => (
        <View className="mr-2 flex-row items-center">
          <Button variant="ghost" size="icon" onPress={() => { attach(); }} hitSlop={10} accessibilityLabel="Attach files" disabled={sending}>
            <Icon name="paperclip" size={21} />
          </Button>
          <Button variant="ghost" size="icon" onPress={() => { send(); }} hitSlop={10} accessibilityLabel="Send" disabled={!canSend}>
            {sending
              ? <ActivityIndicator size="small" color={colors.mutedForeground} />
              : <Icon name="send" size={21} />}
          </Button>
        </View>
      ),
    });
  }, [navigation, isNew, attach, send, canSend, sending, colors.mutedForeground]);

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
        const replace = await confirm({
          title: 'Replace what you wrote?',
          description: 'The AI email will take the place of the current text.',
          confirmText: 'Replace',
          cancelText: 'Keep mine',
        });
        if (replace) fill();
      } else {
        fill();
      }
    } catch (e) {
      toast.show(`The AI could not write it: ${errMessage(e, 'Please try again.')}`, 'error');
    } finally {
      setAiBusy(false);
    }
  }, [aiText, aiBusy, contact, threadId, isNew, subject, body, confirm]);

  const who = contact ? (contact.name || contact.email) : '';

  return (
    <KeyboardSafeView className="bg-background" safeBottom>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-5">
        {/* From / To / Subject, as Gmail lays them out */}
        <View className="min-h-12 flex-row items-center gap-3 border-b-hairline border-border px-4 py-2">
          <Text className="w-14 text-sm text-muted-foreground">From</Text>
          <Text className="flex-1 text-sm" numberOfLines={1}>GymFlow Support</Text>
        </View>

        {isNew ? (
          <ContactPicker value={contact} onChange={setContact} disabled={sending} />
        ) : (
          <View className="min-h-12 flex-row items-center gap-3 border-b-hairline border-border px-4 py-2">
            <Text className="w-14 text-sm text-muted-foreground">To</Text>
            <Badge variant="outline" className="shrink gap-2 py-0.5 pl-0.5 pr-3">
              <SenderAvatar name={who} size={22} />
              <Text className="shrink text-[13px]" numberOfLines={1}>{who}</Text>
            </Badge>
          </View>
        )}

        <View className="min-h-12 flex-row items-center gap-3 border-b-hairline border-border px-4 py-2">
          <Text className="w-14 text-sm text-muted-foreground">Subject</Text>
          {isNew ? (
            <Input
              className={BARE_INPUT}
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject"
              maxLength={200}
              editable={!sending}
              returnKeyType="next"
            />
          ) : (
            <Text className="flex-1 text-sm" numberOfLines={2}>{p.subject}</Text>
          )}
        </View>

        <View className="flex-row px-4 pt-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full"
            onPress={() => setAiOpen(true)}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Write with AI"
          >
            <Icon name="cpu" size={13} />
            <Text className="text-xs font-bold">Write with AI</Text>
          </Button>
        </View>

        {preview ? (
          <View className="min-h-60 p-4">
            {body.trim() ? <FormattedText markup={body} /> : <Text className="text-sm text-muted-foreground">Nothing to preview yet</Text>}
          </View>
        ) : (
          <Input
            ref={setInputRef}
            className="h-auto min-h-60 items-start rounded-none border-0 bg-transparent px-4 pb-4 pt-3 text-base leading-[23px] shadow-none dark:bg-transparent"
            value={body}
            onChangeText={setBody}
            onSelectionChange={onSelectionChange}
            selection={forcedSel}
            placeholder="Compose email"
            multiline
            maxLength={MAX_CHARS}
            editable={!sending}
            textAlignVertical="top"
          />
        )}

        {files.length > 0 && (
          <View className="flex-row flex-wrap gap-2 px-4 pt-2">
            {files.map(f => (
              <Badge key={f.uri} variant="outline" className="max-w-full gap-2 py-1.5 pl-2.5 pr-2">
                <Icon name={fileIcon(f.type)} size={14} className="text-muted-foreground" />
                <Text className="shrink text-[13px]" numberOfLines={1}>{f.name}</Text>
                <Text className="text-[11px] text-muted-foreground">{fmtSize(f.size)}</Text>
                <Pressable
                  onPress={() => setFiles(prev => prev.filter(x => x.uri !== f.uri))}
                  hitSlop={10}
                  disabled={sending}
                  accessibilityLabel={`Remove ${f.name}`}
                >
                  <Icon name="x" size={15} className="text-muted-foreground" />
                </Pressable>
              </Badge>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Formatting bar: stays above the keyboard */}
      <View className="flex-row items-center gap-0.5 border-t border-border bg-card px-2 py-1.5">
        <ToolButton icon="bold" label="Bold" disabled={preview} onPress={() => apply(toggleWrap(body, sel, '**'))} />
        <ToolButton icon="italic" label="Italic" disabled={preview} onPress={() => apply(toggleWrap(body, sel, '_'))} />
        <ToolButton icon="underline" label="Underline" disabled={preview} onPress={() => apply(toggleWrap(body, sel, '++'))} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton icon="list" label="Bulleted list" disabled={preview} onPress={() => apply(toggleList(body, sel, 'bullet'))} />
        <ToolButton icon="hash" label="Numbered list" disabled={preview} onPress={() => apply(toggleList(body, sel, 'number'))} />
        <ToolButton icon="link" label="Insert link" disabled={preview} onPress={openLink} />
        <View className="flex-1" />
        <Button
          variant={preview ? 'default' : 'outline'}
          size="sm"
          className="h-8 rounded-full"
          onPress={() => setPreview(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: preview }}
        >
          <Icon name={preview ? 'edit-3' : 'eye'} size={14} />
          <Text className="text-xs font-bold">{preview ? 'Edit' : 'Preview'}</Text>
        </Button>
      </View>

      {/* Insert link */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent style={lift.style}>
          <View ref={lift.ref} collapsable={false} className="gap-4">
            <DialogHeader>
              <DialogTitle>Insert link</DialogTitle>
            </DialogHeader>
            <View className="gap-2">
              <Label>Text to show</Label>
              <Input
                value={linkLabel}
                onChangeText={setLinkLabel}
                placeholder="e.g. our pricing page"
              />
            </View>
            <View className="gap-2">
              <Label>Web address</Label>
              <Input
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                autoFocus
              />
            </View>
            <DialogFooter>
              <Button onPress={confirmLink}>
                <Text>Insert</Text>
              </Button>
              <Button variant="outline" onPress={() => setLinkOpen(false)}>
                <Text>Cancel</Text>
              </Button>
            </DialogFooter>
          </View>
        </DialogContent>
      </Dialog>

      {/* Write with AI */}
      <Dialog open={aiOpen} onOpenChange={open => { if (!open && !aiBusy) setAiOpen(false); }}>
        <DialogContent className="max-h-[90%]" style={lift.style}>
          <View ref={lift.ref} collapsable={false} className="gap-4">
            <DialogHeader>
              <View className="flex-row items-center gap-2">
                <Icon name="cpu" size={16} />
                <DialogTitle>Write with AI</DialogTitle>
              </View>
              <Text className="text-sm text-muted-foreground">
                Say what the email should do. The AI writes it into the editor, and you can change anything before sending.
              </Text>
            </DialogHeader>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4">
              <Textarea
                value={aiText}
                onChangeText={setAiText}
                placeholder="e.g. Invite him for a free demo this week and ask what time suits him"
                numberOfLines={4}
                className="max-h-40 min-h-24"
                maxLength={1000}
                editable={!aiBusy}
                autoFocus
              />

              <View className="flex-row flex-wrap gap-2">
                {AI_IDEAS.map(idea => (
                  <Button key={idea} variant="outline" size="sm" className="h-8 rounded-full" onPress={() => setAiText(idea)} disabled={aiBusy}>
                    <Text className="text-xs font-normal text-muted-foreground">{idea}</Text>
                  </Button>
                ))}
              </View>
            </ScrollView>

            <DialogFooter>
              <Button
                onPress={() => { runAi(); }}
                disabled={aiText.trim().length < 3 || aiBusy}
                accessibilityRole="button"
              >
                {aiBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Icon name="zap" size={15} />}
                <Text>{aiBusy ? 'Writing…' : 'Write email'}</Text>
              </Button>
              <Button variant="outline" onPress={() => setAiOpen(false)} disabled={aiBusy}>
                <Text>Cancel</Text>
              </Button>
            </DialogFooter>
          </View>
        </DialogContent>
      </Dialog>
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
  const { colors } = useAppTheme();
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
      } catch (e) {
        if (mine === ticket.current) setFailed(errMessage(e, 'Could not load contacts'));
      } finally {
        if (mine === ticket.current) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, open]);

  const choose = (c: EmailContact) => {
    onChange(c);
    setOpen(false);
    setQuery('');
  };

  // An address that is not in the list can simply be typed. Offered as the first choice, and
  // also taken when the keyboard's Done is pressed.
  const typed = query.trim().toLowerCase();
  const typedIsEmail = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(typed);
  const typedKnown = results.some(r => r.email === typed);
  const chooseTyped = () => choose({ email: typed, name: null, gymName: null, lastAt: '' });

  if (value) {
    const name = value.name || value.email;
    return (
      <View className="min-h-12 flex-row items-center gap-3 border-b-hairline border-border px-4 py-2">
        <Text className="w-14 text-sm text-muted-foreground">To</Text>
        <Badge variant="outline" className="shrink gap-2 py-0.5 pl-0.5 pr-3">
          <SenderAvatar name={name} size={22} />
          <Text className="shrink text-[13px]" numberOfLines={1}>{name}</Text>
          <Pressable onPress={() => onChange(null)} hitSlop={10} disabled={disabled} accessibilityLabel="Change recipient">
            <Icon name="x" size={15} className="text-muted-foreground" />
          </Pressable>
        </Badge>
      </View>
    );
  }

  return (
    <View>
      <View className="min-h-12 flex-row items-center gap-3 border-b-hairline border-border px-4 py-2">
        <Text className="w-14 text-sm text-muted-foreground">To</Text>
        <Input
          className={BARE_INPUT}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setOpen(true)}
          onSubmitEditing={() => { if (typedIsEmail) chooseTyped(); }}
          returnKeyType="done"
          keyboardType="email-address"
          placeholder="Name, gym or email address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
        />
        {loading && <ActivityIndicator size="small" color={colors.mutedForeground} />}
        {open && !loading && (
          <Pressable onPress={() => { setOpen(false); setQuery(''); }} hitSlop={10} accessibilityLabel="Close list">
            <Icon name="chevron-up" size={18} className="text-muted-foreground" />
          </Pressable>
        )}
      </View>

      {open && (
        <Card className="mx-4 my-2 gap-0 overflow-hidden py-0">
          {typedIsEmail && !typedKnown && (
            <Pressable
              className="flex-row items-center gap-3 border-b-hairline border-border px-3 py-2.5 active:bg-accent"
              onPress={chooseTyped}
            >
              <View className="size-[34px] items-center justify-center rounded-full bg-muted">
                <Icon name="mail" size={16} className="text-muted-foreground" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold" numberOfLines={1}>Send to {typed}</Text>
                <Text className="text-xs text-muted-foreground">New address</Text>
              </View>
            </Pressable>
          )}
          {failed ? (
            <Text className="p-4 text-[13px] text-muted-foreground">{failed}</Text>
          ) : results.length === 0 && !loading ? (
            typedIsEmail ? null : (
              <Text className="p-4 text-[13px] text-muted-foreground">
                {query ? 'No customer matches that. Type a full email address to write to someone new.' : 'No customers yet.'}
              </Text>
            )
          ) : (
            results.map(c => (
              <Pressable
                key={c.email}
                className={cn('flex-row items-center gap-3 border-b-hairline border-border px-3 py-2.5 active:bg-accent')}
                onPress={() => choose(c)}
              >
                <SenderAvatar name={c.name || c.email} size={34} />
                <View className="flex-1">
                  <Text className="text-sm font-bold" numberOfLines={1}>{c.name || c.email}</Text>
                  {c.name ? <Text className="mt-px text-xs text-muted-foreground" numberOfLines={1}>{c.email}</Text> : null}
                </View>
                {c.gymName ? (
                  <Badge variant="outline" className="max-w-[110px] gap-1">
                    <Icon name="home" size={10} className="text-muted-foreground" />
                    <Text className="shrink text-[10px] text-muted-foreground" numberOfLines={1}>{c.gymName}</Text>
                  </Badge>
                ) : null}
              </Pressable>
            ))
          )}
        </Card>
      )}
    </View>
  );
}

function ToolButton({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={19} />
    </Button>
  );
}
