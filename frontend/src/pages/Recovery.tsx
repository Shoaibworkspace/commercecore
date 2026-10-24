import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { emailSchema, passwordSchema } from '../../../shared/account.ts';
import { accountRequest, useSession } from '../features/account/query';

export default function Recovery({ reset = false }: { reset?: boolean }) {
  const session = useSession();
  const token = useRef(
    new URLSearchParams(window.location.hash.slice(1)).get('access_token') ?? '',
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    // Recovery tokens remain in component memory only, never storage, query caches or URLs.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session.data || pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = String(data.get(reset ? 'password' : 'email') ?? '');
    const parsed = (reset ? passwordSchema : emailSchema).safeParse(value);
    if (reset && new TextEncoder().encode(value).length > 72) {
      setError('Use at least 15 characters, up to 72 UTF-8 bytes.');
      return;
    }
    if (!parsed.success || (reset && !token.current)) {
      setError(
        reset
          ? 'Use a fresh recovery link and a password of at least 15 characters, up to 72 UTF-8 bytes.'
          : 'Enter a valid email address.',
      );
      return;
    }
    setPending(true);
    setError('');
    try {
      await accountRequest(
        reset ? '/api/auth/reset-password' : '/api/auth/recover',
        'POST',
        reset ? { accessToken: token.current, password: parsed.data } : { email: parsed.data },
        session.data.csrfToken,
      );
      setMessage(
        reset
          ? 'Password updated. Sign in with your new password.'
          : 'If an account exists, check your email for a recovery link.',
      );
      if (reset) {
        token.current = '';
        setComplete(true);
        await session.refetch();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (reset) (form.elements.namedItem('password') as HTMLInputElement).value = '';
      setPending(false);
    }
  }
  return (
    <section className="container recovery-page">
      <p className="eyebrow">YOUR COMMERCECORE ACCOUNT</p>
      <h1>{reset ? 'Choose a new password.' : 'Let’s get you back in.'}</h1>
      <p>
        {reset
          ? 'Use a unique passphrase of at least 15 characters, up to 72 UTF-8 bytes.'
          : 'We’ll send a recovery link to your registered email.'}
      </p>
      {session.data?.authProvider === 'local' && (
        <p className="account-feedback" role="status">
          Email recovery is available on the hosted store. Local demo accounts use this device’s
          database.
        </p>
      )}
      {message && (
        <p className="account-feedback" role="status">
          {message}
        </p>
      )}
      {(error || session.isError) && (
        <p className="account-feedback error" role="alert">
          {error || 'Account service is unavailable. Please try again.'}
        </p>
      )}
      {!complete && (
        <form
          className="account-form"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label>
            {reset ? 'New password' : 'Email address'}
            <input
              name={reset ? 'password' : 'email'}
              type={reset ? 'password' : 'email'}
              autoComplete={reset ? 'new-password' : 'email'}
              required
              minLength={reset ? 15 : undefined}
              maxLength={reset ? 128 : 254}
            />
          </label>
          <button
            className="primary"
            disabled={pending || !session.data || session.data.authProvider !== 'supabase'}
          >
            {pending ? 'Please wait…' : reset ? 'Update password' : 'Send recovery link'}
          </button>
        </form>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </section>
  );
}
