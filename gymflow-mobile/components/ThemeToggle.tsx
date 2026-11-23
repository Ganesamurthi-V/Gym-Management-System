import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useAppTheme } from '@/lib/theme';
import React from 'react';

/** Header icon button: shows the icon of the theme you will switch to. */
export function ThemeToggle() {
  const { scheme, setPreference } = useAppTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9 rounded-full"
      onPress={() => setPreference(scheme === 'dark' ? 'light' : 'dark')}
      accessibilityLabel={scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
      <Icon name={scheme === 'dark' ? 'sun' : 'moon'} size={18} className="text-muted-foreground" />
    </Button>
  );
}
