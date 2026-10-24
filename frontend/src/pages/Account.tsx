import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Address, User } from '../../../shared/account.ts';
import { profileInputSchema } from '../../../shared/account.ts';
import { accountRequest, useAddresses, useProfile, useSession } from '../features/account/query';
import { ApiError } from '../lib/api';

import { AddressForm } from '../components/AddressForm';

function ProfileForm({
  user,
  csrfToken,
  hosted,
  onSaved,
}: {
  user: User;
  csrfToken: string;
  hosted: boolean;
  onSaved: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const parsed = profileInputSchema.safeParse({
      name: String(new FormData(event.currentTarget).get('name') ?? ''),
      version: user.version,
    });
    if (!parsed.success) {
      setFailed(true);
      setMessage('Enter a name of 1–100 characters.');
      return;
    }
    setPending(true);
    setMessage('');
    try {
      await accountRequest('/api/me', 'PATCH', parsed.data, csrfToken);
      await onSaved();
      setFailed(false);
      setMessage('Profile saved.');
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Could not save profile.');
      if (error instanceof ApiError && [401, 403, 409].includes(error.status)) await onSaved();
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      className="account-form"
      onSubmit={(e) => {
        void submit(e);
      }}
    >
      <label>
        Full name
        <input
          key={user.version}
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          defaultValue={user.name}
        />
      </label>
      <div className="readonly-field">
        <span>Email address</span>
        <strong>{user.email}</strong>
        <p className="field-help">
          Email changes are not available in this demo.{' '}
          {hosted ? (
            <Link to="/forgot-password">Reset your password by email.</Link>
          ) : (
            'Email recovery is available on the hosted store.'
          )}
        </p>
      </div>
      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className={`account-feedback ${failed ? 'error' : 'success'}`}
        >
          {message}
        </p>
      )}
      <button className="primary" disabled={pending}>
        {pending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}
export default function Account() {
  const session = useSession(),
    queryClient = useQueryClient(),
    navigate = useNavigate(),
    profile = useProfile(session.data?.user?.id),
    addresses = useAddresses(session.data?.user?.id);
  const [editing, setEditing] = useState<Address | null>(null),
    [formOpen, setFormOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: ['addresses'] }),
      queryClient.invalidateQueries({ queryKey: ['session'] }),
    ]);
  };
  const signOut = async () => {
    if (busy || !session.data) return;
    setBusy(true);
    setMessage('');
    try {
      await accountRequest('/api/auth/logout', 'POST', undefined, session.data.csrfToken);
      queryClient.clear();
      navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.clear();
        navigate('/login', { replace: true });
      } else {
        setMessage(error instanceof Error ? error.message : 'Could not sign out.');
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };
  const remove = async (address: Address) => {
    if (busy || !session.data) return;
    setBusy(true);
    setMessage('');
    try {
      await accountRequest(
        `/api/me/addresses/${encodeURIComponent(address.id)}`,
        'DELETE',
        { version: address.version },
        session.data.csrfToken,
      );
      await refresh();
      setMessage('Address removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove address.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  if (session.isPending)
    return (
      <div className="container section-space" role="status">
        Loading your account…
      </div>
    );
  if (session.isError)
    return (
      <div className="container empty-state" role="alert">
        <h1>We couldn’t open your account.</h1>
        <p>Please check your connection and try again.</p>
        <button
          className="primary"
          onClick={() => {
            void session.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!session.data.user) return <Navigate to="/login" replace />;
  if (
    (profile.error instanceof ApiError && profile.error.status === 401) ||
    (addresses.error instanceof ApiError && addresses.error.status === 401)
  )
    return <Navigate to="/login" replace />;
  return (
    <div className="container account-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span>My account</span>
      </nav>
      <div className="account-heading">
        <div>
          <p className="eyebrow">YOUR EVERYDAY, TOGETHER</p>
          <h1>Hello, {session.data.user.name}.</h1>
          <p>Your profile and demo delivery details, in one place.</p>
          {session.data.user.role === 'admin' && (
            <Link className="secondary" to="/admin">
              Shop administration
            </Link>
          )}
          <Link className="text-link" to="/orders">
            My demo orders →
          </Link>
        </div>
        <button
          className="secondary"
          onClick={() => {
            void signOut();
          }}
          disabled={busy}
        >
          {busy ? 'Please wait…' : 'Sign out'}
        </button>
      </div>
      {message && (
        <p className="account-feedback" role="status">
          {message}
        </p>
      )}
      <div className="account-grid">
        <section className="account-panel" aria-labelledby="profile-heading">
          <p className="eyebrow">THE BASICS</p>
          <h2 id="profile-heading">Your profile</h2>
          {profile.isPending ? (
            <p role="status">Loading profile…</p>
          ) : profile.isError ? (
            <div role="alert">
              <p>Could not load your profile.</p>
              <button
                className="text-button"
                onClick={() => {
                  void refresh();
                }}
              >
                Retry profile
              </button>
            </div>
          ) : (
            <ProfileForm
              user={profile.data}
              csrfToken={session.data.csrfToken}
              hosted={session.data.authProvider === 'supabase'}
              onSaved={refresh}
            />
          )}
        </section>
        <section className="account-panel" aria-labelledby="addresses-heading">
          <div className="account-section-heading">
            <div>
              <p className="eyebrow">A PLACE FOR YOUR FINDS</p>
              <h2 id="addresses-heading">Saved addresses</h2>
            </div>
            <button
              className="secondary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={formOpen || (addresses.data?.length ?? 0) >= 10}
            >
              Add address
            </button>
          </div>
          <p className="field-help">Save up to 10 Indian demo addresses. Nothing is shipped.</p>
          {addresses.isPending ? (
            <p role="status">Loading addresses…</p>
          ) : addresses.isError ? (
            <div role="alert">
              <p>Could not load addresses.</p>
              <button
                className="text-button"
                onClick={() => {
                  void refresh();
                }}
              >
                Retry addresses
              </button>
            </div>
          ) : addresses.data.length === 0 && !formOpen ? (
            <div className="address-empty">
              <h3>No saved addresses yet.</h3>
              <p>Add sample delivery details to keep your demo account ready.</p>
            </div>
          ) : (
            <div className="address-list">
              {addresses.data.map((address) => (
                <article className="address-card" key={address.id}>
                  <div className="address-card-heading">
                    <h3>{address.recipient}</h3>
                    {address.isDefault && <span className="address-default">Default</span>}
                  </div>
                  <p>
                    {address.line1}
                    {address.line2 && (
                      <>
                        <br />
                        {address.line2}
                      </>
                    )}
                    <br />
                    {address.city}, {address.region} {address.postalCode}
                    <br />
                    India
                  </p>
                  <p>{address.phone}</p>
                  <div className="account-actions">
                    <button
                      className="text-button"
                      onClick={() => {
                        setEditing(address);
                        setFormOpen(true);
                      }}
                      disabled={busy || formOpen}
                      aria-label={`Edit address for ${address.recipient}`}
                    >
                      Edit
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        void remove(address);
                      }}
                      disabled={busy}
                      aria-label={`Remove address for ${address.recipient}`}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {formOpen && (
            <AddressForm
              key={editing?.id ?? 'new'}
              editing={editing}
              csrfToken={session.data.csrfToken}
              onSaved={refresh}
              onCancel={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            />
          )}
        </section>
      </div>
      <p className="account-demo-note">
        Demo account · Use sample details.{' '}
        {session.data.authProvider === 'supabase'
          ? 'Email confirmation is required; password recovery is available by email.'
          : 'Local accounts do not send verification or recovery emails.'}{' '}
        Your cart, wishlist and demo checkout are ready. No real charges.
      </p>
    </div>
  );
}
