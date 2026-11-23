import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-style replacement for Alert.alert confirms:
 *   const confirm = useConfirm();
 *   if (await confirm({ title, description, confirmText, destructive: true })) ...
 * Backed by the Reusables AlertDialog (rendered through the PortalHost).
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(opts => {
    // A second call while one is open cancels the first rather than leaving it pending.
    resolver.current?.(false);
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setOpen(false);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(ok);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* The Action/Cancel primitives call onOpenChange(false) BEFORE their own onPress. Settling false
          right here made every press resolve "cancelled" first, so Confirm never reached the caller
          (Sign Out did nothing). Defer by one microtask: a Confirm press settles true synchronously after this,
          and the later settle(false) then finds nothing pending. Backdrop/back-button closes still cancel. */}
      <AlertDialog open={open} onOpenChange={next => (next ? setOpen(true) : Promise.resolve().then(() => settle(false)))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title ?? ''}</AlertDialogTitle>
            {options?.description ? (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => settle(false)}>
              <Text>{options?.cancelText ?? 'Cancel'}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() => settle(true)}
              className={cn(options?.destructive && 'bg-destructive active:bg-destructive/90')}>
              <Text className={cn(options?.destructive && 'text-white')}>
                {options?.confirmText ?? 'Confirm'}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
