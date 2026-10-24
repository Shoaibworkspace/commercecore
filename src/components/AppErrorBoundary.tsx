import { Component } from 'react';
import type { ReactNode } from 'react';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="empty-state">
          <h1>Something interrupted the page.</h1>
          <p>Reload to load the latest version of the storefront.</p>
          <button className="primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </main>
      );
    return this.props.children;
  }
}
