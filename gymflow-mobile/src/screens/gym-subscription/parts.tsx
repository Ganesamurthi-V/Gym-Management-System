import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ListRow } from '@/components/dashboard/ListRow';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { useAppTheme } from '@/lib/theme';
import type { AuditLog, GymActivityEvent } from '@/lib/api';
import { eventTone, fmtDateTime } from './helpers';

// ─── Typed-input dialog (reject reason, custom trial days, delete-gym name) ─────

export type InputDialogState = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  inputPlaceholder?: string;
  inputValue?: string;
  onInputChange?: (v: string) => void;
  inputKeyboardType?: 'default' | 'number-pad';
};

export function InputDialog({ state, onCancel }: { state: InputDialogState; onCancel: () => void }) {
  const numeric = state.inputKeyboardType === 'number-pad';
  return (
    <Dialog open={state.visible} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription>{state.message}</DialogDescription>
        </DialogHeader>
        {numeric ? (
          <Input
            value={state.inputValue}
            onChangeText={state.onInputChange}
            placeholder={state.inputPlaceholder}
            keyboardType="number-pad"
            autoFocus
          />
        ) : (
          <Textarea
            value={state.inputValue}
            onChangeText={state.onInputChange}
            placeholder={state.inputPlaceholder}
            autoFocus
          />
        )}
        <DialogFooter>
          <Button variant="outline" onPress={onCancel}>
            <Text>Cancel</Text>
          </Button>
          <Button variant={state.destructive ? 'destructive' : 'default'} onPress={state.onConfirm}>
            <Text>{state.confirmLabel ?? 'Confirm'}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unsaved-changes bar ────────────────────────────────────────────────────────

export function SaveBar({ saving, onSave, onCancel }: {
  saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="bg-card border-border absolute inset-x-0 bottom-0 z-30 flex-row gap-3 border-t p-4">
      <Button variant="outline" className="flex-1" onPress={onCancel} disabled={saving}>
        <Text>Discard</Text>
      </Button>
      <Button className="flex-[2]" onPress={onSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <>
            <Icon name="save" size={14} />
            <Text>Save Changes</Text>
          </>
        )}
      </Button>
    </View>
  );
}

// ─── Timeline (audit log) row ───────────────────────────────────────────────────
// ListRow has a 2-line subtitle clamp; audit notes and plan changes must show in full,
// so the row mirrors ListRow's layout (dot, title, divider) with an unclamped body.

export function TimelineRow({ log, last }: { log: AuditLog; last: boolean }) {
  return (
    <View className={last ? 'flex-row gap-3 py-3' : 'border-border flex-row gap-3 border-b py-3'}>
      <View className="bg-foreground mt-1.5 size-2 rounded-full" />
      <View className="flex-1 gap-1">
        <Text className="text-sm font-medium">{log.action}</Text>
        <Text className="text-muted-foreground text-xs">{fmtDateTime(log.created_at)} · {log.performed_by}</Text>
        {log.notes ? <Text className="text-muted-foreground text-xs">{log.notes}</Text> : null}
        {log.prev_plan && log.new_plan && log.prev_plan !== log.new_plan && (
          <View className="mt-1 flex-row items-center gap-2">
            <StatusBadge tone="neutral">{log.prev_plan}</StatusBadge>
            <Icon name="arrow-right" size={12} className="text-muted-foreground" />
            <StatusBadge tone="info">{log.new_plan}</StatusBadge>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Logs tab body ──────────────────────────────────────────────────────────────

const SUMMARY: { type: GymActivityEvent['type']; label: string; icon: string }[] = [
  { type: 'member_added', label: 'Members Added', icon: 'user-plus' },
  { type: 'whatsapp_sent', label: 'WhatsApp Sent', icon: 'message-circle' },
  { type: 'subscription_event', label: 'Subscription Events', icon: 'shield' },
];

export function ActivityLogs({ events, loading, error, onRetry }: {
  events: GymActivityEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <>
      <SectionCard title="Activity Logs" description="All actions taken in this gym account">
        {loading ? (
          <View className="items-center gap-2 py-6">
            <ActivityIndicator color={colors.mutedForeground} size="small" />
            <Text className="text-muted-foreground text-xs">Loading activity logs…</Text>
          </View>
        ) : error ? (
          <View className="items-start gap-3">
            <View className="flex-row items-center gap-2">
              <Icon name="alert-circle" size={16} className="text-destructive" />
              <Text className="text-destructive flex-1 text-sm">{error}</Text>
            </View>
            <Button variant="outline" size="sm" onPress={onRetry}>
              <Text>Retry</Text>
            </Button>
          </View>
        ) : events.length === 0 ? (
          <View className="items-center gap-2 py-6">
            <Icon name="inbox" size={32} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">No activity recorded yet</Text>
          </View>
        ) : (
          events.map((event, idx) => (
            <ListRow
              key={event.id}
              last={idx === events.length - 1}
              title={event.title}
              subtitle={event.subtitle || undefined}
              left={
                <View className="bg-muted border-border size-7 items-center justify-center rounded-full border">
                  <Icon name={event.icon} size={12} className="text-muted-foreground" />
                </View>
              }
              right={
                <View className="items-end gap-1">
                  <Text className="text-muted-foreground text-[10px]">{fmtDateTime(event.timestamp)}</Text>
                  {event.meta ? <StatusBadge tone={eventTone(event.color)}>{event.meta}</StatusBadge> : null}
                </View>
              }
            />
          ))
        )}
      </SectionCard>

      {events.length > 0 && (
        <SectionCard title="Activity Summary">
          {SUMMARY.map((s, i) => (
            <ListRow
              key={s.type}
              last={i === SUMMARY.length - 1}
              title={s.label}
              left={<Icon name={s.icon} size={14} className="text-muted-foreground" />}
              right={<Text className="text-lg font-medium tabular-nums">{events.filter(e => e.type === s.type).length}</Text>}
            />
          ))}
        </SectionCard>
      )}
    </>
  );
}
