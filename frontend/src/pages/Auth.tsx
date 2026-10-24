import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { safeReturnPath } from '../../../shared/return-path.ts';
import { useQueryClient } from '@tanstack/react-query';
import {
  loginSchema,
  registerSchema,
  sessionSchema,
  registrationResultSchema,
} from '../../../shared/account.ts';
import { accountRequest, useSession } from '../features/account/query';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const [params] = useSearchParams();
  const returnPath = safeReturnPath(params.get('next'));
  const session = useSession(),
    queryClient = useQueryClient(),
    navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    // Confirmation is handled by Supabase. Do not retain its implicit-flow tokens in the URL.
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  const registering = mode === 'register';
  if (session.data?.user && !session.isFetching) return <Navigate to={returnPath} replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !session.data) return;
    const form = event.currentTarget,
      values = new FormData(form);
    const raw = {
      email: String(values.get('email') ?? ''),
      password: String(values.get('password') ?? ''),
      ...(registering ? { name: String(values.get('name') ?? '') } : {}),
    };
    const parsed = (registering ? registerSchema : loginSchema).safeParse(raw);
    if (
      session.data.authProvider === 'supabase' &&
      new TextEncoder().encode(raw.password).length > 72
    ) {
      setError('Hosted passwords must fit within 72 UTF-8 bytes. Use a shorter unique passphrase.');
      return;
    }
    if (!parsed.success) {
      setError(
        registering
          ? 'Enter a name, valid email and a password of 15–128 characters. Avoid common passwords.'
          : 'Enter your email and password.',
      );
      return;
    }
    setPending(true);
    setError('');
    try {
      const response = await accountRequest(
        `/api/auth/${mode}`,
        'POST',
        parsed.data,
        session.data.csrfToken,
      );
      if (registering) {
        const registration = registrationResultSchema.parse(response).data;
        if ('verificationRequired' in registration) {
          setNotice(registration.message);
          return;
        }
      }
      const result = sessionSchema.parse(response).data;
      queryClient.removeQueries({ queryKey: ['profile'] });
      queryClient.removeQueries({ queryKey: ['addresses'] });
      queryClient.removeQueries({ queryKey: ['cart'] });
      queryClient.removeQueries({ queryKey: ['wishlist'] });
      queryClient.removeQueries({ queryKey: ['orders'] });
      queryClient.removeQueries({ queryKey: ['order'] });
      queryClient.removeQueries({ queryKey: ['admin'] });
      queryClient.setQueryData(['session'], result);
      navigate(returnPath, { replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again.');
      await session.refetch();
    } finally {
      (form.elements.namedItem('password') as HTMLInputElement).value = '';
      setPending(false);
    }
  };
  return (
    <div className="container auth-page">
      <section className="auth-editorial">
        <img
          src="/images/photos/hero-lifestyle.webp"
          alt="Sunlit home workspace, AI-generated lifestyle image"
          width="1600"
          height="900"
        />
        <div>
          <span className="eyebrow">GOOD FINDS. BETTER EVERYDAY.</span>
          <h1>
            Your everyday,
            <br />
            in one place.
          </h1>
          <p>A little space for your details, your addresses and what comes next.</p>
        </div>
      </section>
      <section className="auth-panel" aria-labelledby="auth-heading">
        <p className="eyebrow">YOUR COMMERCECORE ACCOUNT</p>
        <h2 id="auth-heading">{registering ? 'Make yourself at home.' : 'Welcome back.'}</h2>
        <p>
          {registering
            ? 'Create your demo account to save your profile and delivery addresses.'
            : 'Sign in to manage your profile and saved addresses.'}
        </p>
        {session.isError && (
          <div className="account-feedback error" role="alert">
            <p>Account access is unavailable. Please try again.</p>
            <button
              className="text-button"
              onClick={() => {
                void session.refetch();
              }}
            >
              Retry account connection
            </button>
          </div>
        )}
        {session.isPending && <p role="status">Preparing a secure form…</p>}
        {notice && (
          <p className="account-feedback" role="status">
            {notice}
          </p>
        )}
        <form
          className="account-form"
          onSubmit={(event) => {
            void submit(event);
          }}
          key={mode}
        >
          {registering && (
            <label>
              Full name
              <input name="name" autoComplete="name" required maxLength={100} />
            </label>
          )}
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label htmlFor="account-password">Password</label>
          <div className="password-field">
            <input
              id="account-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={registering ? 'new-password' : 'current-password'}
              required
              minLength={registering ? 15 : 1}
              maxLength={128}
              aria-describedby={registering ? 'password-help' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {registering && (
            <p className="field-help" id="password-help">
              {session.data?.authProvider === 'supabase'
                ? 'Use at least 15 characters, up to 72 UTF-8 bytes. A unique passphrase works well.'
                : 'Use 15–128 characters. A long, unique passphrase works well. Spaces and Unicode are supported.'}
            </p>
          )}
          {error && (
            <p className="account-feedback error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={pending || !session.data || session.isError}>
            {pending
              ? registering
                ? 'Creating account…'
                : 'Signing in…'
              : registering
                ? 'Create account'
                : 'Sign in'}{' '}
            <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="auth-switch">
          {registering ? 'Already have an account?' : 'New to CommerceCore?'}{' '}
          <Link
            to={`${registering ? '/login' : '/register'}?${new URLSearchParams({ next: returnPath })}`}
            onClick={() => {
              setError('');
              setNotice('');
              setShowPassword(false);
            }}
          >
            {registering ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
        {!registering && session.data?.authProvider === 'supabase' && (
          <p>
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        )}
        <p className="account-demo-note">
          Demo store · No real orders or charges.{' '}
          {session.data?.authProvider === 'supabase'
            ? 'Confirm your email before signing in. Password recovery is available by email.'
            : 'Local accounts use this device’s demo database. Email services are available on the hosted store.'}
        </p>
      </section>
    </div>
  );
}
