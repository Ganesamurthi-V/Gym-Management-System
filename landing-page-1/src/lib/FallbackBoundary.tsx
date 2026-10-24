import { Component, type ReactNode } from 'react';

/**
 * Last line of defence for the whole page. React 19 unmounts the entire tree when a render error
 * is not caught, and createRoot had already replaced the static copy that shipped inside #root, so
 * an error thrown by a lazy section after mount left the visitor with a blank page.
 *
 * The entries save that static copy before React mounts (`html`); on an error this puts it back
 * and removes the .mounted class that hides it (see the head files), so the page degrades to the
 * readable copy crawlers and no-JS visitors get, with its links, instead of nothing.
 *
 * Only render errors reach a boundary; errors in event handlers and timers never unmount the tree.
 */
export class FallbackBoundary extends Component<{ html: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    document.documentElement.classList.remove('mounted');
  }

  render() {
    // The HTML is this site's own build output, read back from #root before React touched it.
    if (this.state.failed) return <div dangerouslySetInnerHTML={{ __html: this.props.html }} />;
    return this.props.children;
  }
}
