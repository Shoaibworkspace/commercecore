import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Address } from '../../../shared/account.ts';
import { addressInputSchema, addressUpdateSchema } from '../../../shared/account.ts';
import { accountRequest } from '../features/account/query';
import { ApiError } from '../lib/api';

export function AddressForm({
  editing,
  csrfToken,
  onSaved,
  onCancel,
}: {
  editing: Address | null;
  csrfToken: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget),
      raw = {
        recipient: String(data.get('recipient') ?? ''),
        line1: String(data.get('line1') ?? ''),
        line2: String(data.get('line2') ?? ''),
        city: String(data.get('city') ?? ''),
        region: String(data.get('region') ?? ''),
        postalCode: String(data.get('postalCode') ?? ''),
        countryCode: 'IN',
        phone: String(data.get('phone') ?? ''),
        isDefault: data.get('isDefault') === 'on',
        ...(editing ? { version: editing.version } : {}),
      };
    const parsed = (editing ? addressUpdateSchema : addressInputSchema).safeParse(raw);
    if (!parsed.success) {
      setError('Check the address, six-digit Indian PIN and phone number (10–15 digits).');
      return;
    }
    setPending(true);
    setError('');
    try {
      await accountRequest(
        editing ? `/api/me/addresses/${encodeURIComponent(editing.id)}` : '/api/me/addresses',
        editing ? 'PATCH' : 'POST',
        parsed.data,
        csrfToken,
      );
      await onSaved();
      onCancel();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save address.');
      if (error instanceof ApiError && [401, 403, 409].includes(error.status)) await onSaved();
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      className="account-form address-form"
      onSubmit={(e) => {
        void submit(e);
      }}
      aria-label={editing ? 'Edit address' : 'New address'}
    >
      <h3>{editing ? 'Edit your address' : 'Add a delivery address'}</h3>
      <label>
        Recipient
        <input
          name="recipient"
          autoComplete="shipping name"
          required
          maxLength={100}
          defaultValue={editing?.recipient}
        />
      </label>
      <label>
        Address line 1
        <input
          name="line1"
          autoComplete="shipping address-line1"
          required
          maxLength={200}
          defaultValue={editing?.line1}
        />
      </label>
      <label>
        Address line 2 (optional)
        <input
          name="line2"
          autoComplete="shipping address-line2"
          maxLength={200}
          defaultValue={editing?.line2}
        />
      </label>
      <div className="account-form-row">
        <label>
          City
          <input
            name="city"
            autoComplete="shipping address-level2"
            required
            maxLength={100}
            defaultValue={editing?.city}
          />
        </label>
        <label>
          State / region
          <input
            name="region"
            autoComplete="shipping address-level1"
            required
            maxLength={100}
            defaultValue={editing?.region}
          />
        </label>
      </div>
      <div className="account-form-row">
        <label>
          PIN code
          <input
            name="postalCode"
            autoComplete="shipping postal-code"
            required
            pattern="[1-9][0-9]{5}"
            inputMode="numeric"
            maxLength={6}
            defaultValue={editing?.postalCode}
          />
        </label>
        <label>
          Country
          <input value="India" readOnly aria-readonly="true" />
        </label>
      </div>
      <label>
        Phone number
        <input
          name="phone"
          type="tel"
          autoComplete="shipping tel"
          required
          maxLength={30}
          defaultValue={editing?.phone}
        />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" name="isDefault" defaultChecked={editing?.isDefault} /> Use as my
        default address
      </label>
      {error && (
        <p role="alert" className="account-feedback error">
          {error}
        </p>
      )}
      <div className="account-actions">
        <button className="primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save address'}
        </button>
        <button className="secondary" type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
