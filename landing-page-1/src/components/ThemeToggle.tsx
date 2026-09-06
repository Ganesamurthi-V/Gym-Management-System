import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/useTheme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      // The label states the destination, not the current state — a screen
      // reader user needs to know what pressing it will do.
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`grid h-9 w-9 place-items-center rounded-pill border border-border-subtle bg-frame text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
