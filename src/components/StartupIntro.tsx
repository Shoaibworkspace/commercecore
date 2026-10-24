import type { ReactNode } from 'react';

// Introduce the store in place without delaying navigation or sign-in.
export function StartupIntro({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
