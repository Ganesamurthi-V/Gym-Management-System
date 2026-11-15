import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { getAnnouncement, saveAnnouncement, type SiteAnnouncement } from '@/lib/api';
import { useAppTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { toast } from '@/components/dashboard/Toast';
import { AnnouncementPreview } from '@/components/AnnouncementPreview';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';

const MAX_MESSAGE = 200;
const MAX_LABEL = 30;
const MAX_AFTER = 120;
const LEVELS: SiteAnnouncement['level'][] = ['info', 'warning', 'critical'];

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const levelLabel = (l: SiteAnnouncement['level']) => l.charAt(0).toUpperCase() + l.slice(1);

export default function AnnouncementScreen() {
  const { colors } = useAppTheme();
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
    } catch (e) {
      setLoadError(errMsg(e, 'Failed to load'));
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
      toast.show(active ? 'Published. Owners will see the banner.' : 'Turned off. The banner is hidden.', 'success');
    } catch (e) {
      toast.show(errMsg(e, 'Failed to save'), 'error');
      // 409 means another publish changed the row first; show its current state.
      if (/concurrent|changed|conflict/i.test(e instanceof Error ? e.message : '')) load();
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (loadError) {
    return (
      <View className="bg-background flex-1 items-center justify-center gap-4 p-8">
        <Text className="text-destructive text-center text-sm">{loadError}</Text>
        <Button onPress={load}><Text>Retry</Text></Button>
      </View>
    );
  }

  const nearLimit = message.length >= MAX_MESSAGE - 20;

  return (
    <KeyboardSafeView style={{ flex: 1 }}>
      <ScrollView
        className="bg-background flex-1"
        contentContainerClassName="gap-4 p-4 pb-10"
        keyboardShouldPersistTaps="handled">
        <SectionCard
          title="Site announcement"
          description={`Version ${current?.version ?? 0}${current?.updated_at ? ` - updated ${new Date(current.updated_at).toLocaleString()}` : ''}`}
          action={
            <StatusBadge tone={current?.is_active ? 'success' : 'neutral'}>
              {current?.is_active ? 'Currently live' : 'Currently off'}
            </StatusBadge>
          }>
          <View className="gap-4">
            <View className="gap-1.5">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChangeText={t => setMessage(t.slice(0, MAX_MESSAGE))}
                placeholder="e.g. Scheduled maintenance tonight at 11 PM"
                numberOfLines={3}
                maxLength={MAX_MESSAGE}
                className="min-h-20"
              />
              <Text className={nearLimit ? 'self-end text-xs text-warning' : 'text-muted-foreground self-end text-xs'}>
                {message.length}/{MAX_MESSAGE}
              </Text>
            </View>

            <View className="gap-1.5">
              <Label>Level</Label>
              <Select
                value={{ value: level, label: levelLabel(level) }}
                onValueChange={opt => { if (opt) setLevel(opt.value as SiteAnnouncement['level']); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a level" />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map(l => (
                    <SelectItem key={l} value={l} label={levelLabel(l)} />
                  ))}
                </SelectContent>
              </Select>
              <Text className="text-muted-foreground text-xs">Critical cannot be closed by owners</Text>
            </View>

            <View className="gap-1.5">
              <Label>Link URL (optional)</Label>
              <Input
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text className={linkInvalid ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
                must start with https://
              </Text>
            </View>

            <View className="gap-1.5">
              <Label>Link label (optional)</Label>
              <Input
                value={linkLabel}
                onChangeText={t => setLinkLabel(t.slice(0, MAX_LABEL))}
                placeholder="Learn more"
                maxLength={MAX_LABEL}
              />
            </View>

            <View className="gap-1.5">
              <Label>Text after the link (optional)</Label>
              <Input
                value={messageAfter}
                onChangeText={t => setMessageAfter(t.slice(0, MAX_AFTER))}
                maxLength={MAX_AFTER}
              />
              <Text className={messageAfter.length >= MAX_AFTER - 20 ? 'self-end text-xs text-warning' : 'text-muted-foreground self-end text-xs'}>
                {messageAfter.length}/{MAX_AFTER}
              </Text>
              <Text className="text-muted-foreground text-xs">Shown after the link, on the same line.</Text>
            </View>
          </View>
        </SectionCard>

        <AnnouncementPreview
          message={message}
          messageAfter={messageAfter}
          level={level}
          linkLabel={linkLabel}
          hasLink={url.length > 0 && !linkInvalid}
        />

        <Button onPress={() => submit(true)} disabled={!canPublish || saving !== null}>
          <Text>{saving === 'publish' ? 'Publishing...' : 'Publish'}</Text>
        </Button>
        <Button
          variant="destructive"
          onPress={() => submit(false)}
          disabled={!current?.is_active || !message.trim() || saving !== null}>
          <Text>{saving === 'off' ? 'Turning off...' : 'Turn off'}</Text>
        </Button>
      </ScrollView>
    </KeyboardSafeView>
  );
}
