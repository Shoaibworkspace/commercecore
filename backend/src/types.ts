import type { User } from '../../shared/account.ts';
export type AuthSession = { user: User; tokenHash: string; csrfHash: string; expiresAt: number };
export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: 'development' | 'production';
  PAYMENT_MODE: 'demo';
  AUTH_SECRET?: string;
  AUTH_PUBLIC_ENABLED?: string;
  APP_ORIGIN?: string;
  AUTH_PROVIDER?: 'local' | 'supabase';
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { requestId: string; auth: AuthSession };
};
