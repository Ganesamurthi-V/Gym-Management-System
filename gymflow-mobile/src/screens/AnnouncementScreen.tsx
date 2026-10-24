import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { getAnnouncement, saveAnnouncement, type SiteAnnouncement } from '@/lib/api';
import { AdminInput } from '@/components/AdminInput';
import { AdminButton } from '@/components/AdminButton';
import { AnnouncementPreview } from '@/components/AnnouncementPreview';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';

const MAX_MESSAGE = 200;
const MAX_LABEL = 30;
const MAX_AFTER = 120;
const LEVELS: SiteAnnouncement['level'][] = ['info', 'warning', 'critical'];

export default function AnnouncementScreen() {
  const [current, setCurrent] = useState<SiteAnnouncement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<SiteAnnouncement['level']>('info');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [messageAfter, setMessageAfter] = useState('');
  const [saving, setSaving] = useState<'publish' | 'off' | null>(null);

  const apply = useCallback((a: SiteAnnouncement) => {
    setCurrent(a);
    setMessage(a.message ?? '');
    setLevel(a.level ?? 'info');
    setLinkUrl(a.link_url ?? '');
    setLinkLabel(a.link_label ?? '');
    setMessageAfter(a.message_after ?? '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      apply(await getAnnouncement());
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => { load(); }, [load]);

  const url = linkUrl.trim();
  const linkInvalid = url.length > 0 && !url.startsWith('https://');
  const canPublish = !!message.trim() && message.length <= MAX_MESSAGE && !linkInvalid;

  async function submit(active: boolean) {
    setSaving(active ? 'publish' : 'off');
    try {
      const saved = await saveAnnouncement({
        message: message.trim(),
        message_after: messageAfter.trim(),
        level,
        link_url: url || null,
        link_label: url ? linkLabel.trim() || null : null,
        is_active: active,
      });
      apply(saved);
      Alert.alert(active ? 'Published' : 'Turned off', active ? 'Owners will see the banner.' : 'The banner is hidden.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save');
      // 409 means another publish changed the row first; show its current state.
      if (/concurrent|changed|conflict/i.test(e.message ?? '')) load();
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.indigo} /></View>;
  }
  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{loadError}</Text>
        <AdminButton label="Retry" onPress={load} />
      </View>
    );
  }

  const nearLimit = message.length >= MAX_MESSAGE - 20;

  return (
    <KeyboardSafeView style={styles.flex1}>
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={[styles.status, { color: current?.is_active ? Colors.emerald : Colors.textMuted }]}>
            {current?.is_active ? 'Currently live' : 'Currently off'}
          </Text>
          <Text style={styles.meta}>
            Version {current?.version ?? 0}
            {current?.updated_at ? ` - updated ${new Date(current.updated_at).toLocaleString()}` : ''}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <AdminInput
              label="Message"
              value={message}
              onChangeText={t => setMessage(t.slice(0, MAX_MESSAGE))}
              placeholder="e.g. Scheduled maintenance tonight at 11 PM"
              multiline
              numberOfLines={3}
              maxLength={MAX_MESSAGE}
              style={styles.textarea}
            />
            <Text style={[styles.counter, nearLimit && { color: Colors.amber }]}>
              {message.length}/{MAX_MESSAGE}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Level</Text>
            <View style={styles.pills}>
              {LEVELS.map(l => (
                <TouchableOpacity
                  key={l}
                  style={[styles.pill, level === l && styles.pillActive]}
                  onPress={() => setLevel(l)}
                >
                  <Text style={[styles.pillText, level === l && styles.pillTextActive]}>
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>Critical cannot be closed by owners</Text>
          </View>

          <View style={styles.field}>
            <AdminInput
              label="Link URL (optional)"
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={[styles.hint, linkInvalid && { color: Colors.red }]}>must start with https://</Text>
          </View>

          <AdminInput
            label="Link label (optional)"
            value={linkLabel}
            onChangeText={t => setLinkLabel(t.slice(0, MAX_LABEL))}
            placeholder="Learn more"
            maxLength={MAX_LABEL}
          />

          <View style={styles.field}>
            <AdminInput
              label="Text after the link (optional)"
              value={messageAfter}
              onChangeText={t => setMessageAfter(t.slice(0, MAX_AFTER))}
              maxLength={MAX_AFTER}
            />
            <Text style={[styles.counter, messageAfter.length >= MAX_AFTER - 20 && { color: Colors.amber }]}>
              {messageAfter.length}/{MAX_AFTER}
            </Text>
            <Text style={styles.hint}>Shown after the link, on the same line.</Text>
          </View>
        </View>

        <AnnouncementPreview
          message={message}
          messageAfter={messageAfter}
          level={level}
          linkLabel={linkLabel}
          hasLink={url.length > 0 && !linkInvalid}
        />

        <AdminButton
          label="Publish"
          onPress={() => submit(true)}
          loading={saving === 'publish'}
          disabled={!canPublish || saving !== null}
        />
        <AdminButton
          label="Turn off"
          variant="danger"
          onPress={() => submit(false)}
          loading={saving === 'off'}
          disabled={!current?.is_active || !message.trim() || saving !== null}
        />
      </ScrollView>
    </KeyboardSafeView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl, gap: Spacing.lg, backgroundColor: Colors.bg },
  errorText: { fontSize: 14, color: Colors.red, textAlign: 'center' },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.bgCardBorder, padding: Spacing.xl, gap: Spacing.lg,
  },
  status: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: -Spacing.sm },
  field: { gap: Spacing.xs },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  counter: { fontSize: 11, color: Colors.textMuted, alignSelf: 'flex-end' },
  hint: { fontSize: 11, color: Colors.textMuted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.bgCardBorder, backgroundColor: Colors.bgInput,
  },
  pillActive: { backgroundColor: Colors.indigoBg, borderColor: Colors.indigoBorder },
  pillText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  pillTextActive: { color: Colors.indigo },
});
