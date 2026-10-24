import type { z } from 'zod';
import type { User, Address } from '../../../shared/account.ts';
import { addressInputSchema, addressUpdateSchema } from '../../../shared/account.ts';
import { writeGuard } from './audit.ts';

type AddressInput = z.infer<typeof addressInputSchema>;
type AddressUpdate = z.infer<typeof addressUpdateSchema>;
const addressColumns =
  'id,recipient,line1,line2,city,region,postal_code AS postalCode,country_code AS countryCode,phone,is_default AS isDefault,version';
type AddressRow = Omit<Address, 'isDefault'> & { isDefault: number };
const asAddress = (row: AddressRow): Address => ({ ...row, isDefault: Boolean(row.isDefault) });
const fields = (input: AddressInput) => [
  input.recipient,
  input.line1,
  input.line2,
  input.city,
  input.region,
  input.postalCode,
  input.countryCode,
  input.phone,
];
export async function profile(db: D1Database, userId: string) {
  return db
    .prepare('SELECT id,email,name,role,version FROM users WHERE id=?')
    .bind(userId)
    .first<User>();
}
export async function updateProfile(db: D1Database, userId: string, name: string, version: number) {
  return db
    .prepare(
      'UPDATE users SET name=?,version=version+1,updated_at=unixepoch() WHERE id=? AND version=? RETURNING id,email,name,role,version',
    )
    .bind(name, userId, version)
    .first<User>();
}
export async function addresses(db: D1Database, userId: string) {
  return (
    await db
      .prepare(
        `SELECT ${addressColumns} FROM addresses WHERE user_id=? ORDER BY is_default DESC,created_at,id`,
      )
      .bind(userId)
      .all<AddressRow>()
  ).results.map(asAddress);
}
export async function address(db: D1Database, userId: string, id: string) {
  const row = await db
    .prepare(`SELECT ${addressColumns} FROM addresses WHERE user_id=? AND id=?`)
    .bind(userId, id)
    .first<AddressRow>();
  return row ? asAddress(row) : null;
}
export async function insertAddress(
  db: D1Database,
  userId: string,
  id: string,
  input: AddressInput,
) {
  try {
    const result = await db.batch([
      db
        .prepare(
          `INSERT INTO addresses (id,user_id,recipient,line1,line2,city,region,postal_code,country_code,phone,is_default)
      SELECT ?,?,?,?,?,?,?,?,?,?,0 WHERE (SELECT COUNT(*) FROM addresses WHERE user_id=?)<10`,
        )
        .bind(id, userId, ...fields(input), userId),
      writeGuard(db),
      db
        .prepare(
          `UPDATE addresses SET is_default=0,version=version+1,updated_at=unixepoch() WHERE user_id=? AND is_default=1
      AND ?=1 AND EXISTS(SELECT 1 FROM addresses WHERE id=? AND user_id=?)`,
        )
        .bind(userId, Number(input.isDefault), id, userId),
      db
        .prepare(
          `UPDATE addresses SET is_default=1 WHERE id=? AND user_id=?
      AND (?=1 OR NOT EXISTS(SELECT 1 FROM addresses WHERE user_id=? AND is_default=1))`,
        )
        .bind(id, userId, Number(input.isDefault), userId),
      db
        .prepare(
          `SELECT json(CASE WHEN EXISTS(SELECT 1 FROM addresses WHERE user_id=?1 AND is_default=1)
      AND (?2=0 OR EXISTS(SELECT 1 FROM addresses WHERE id=?3 AND user_id=?1 AND is_default=1))
      THEN '{}' ELSE 'required default missing' END)`,
        )
        .bind(userId, Number(input.isDefault), id),
    ]);
    return result[0]!.meta.changes === 1;
  } catch (error) {
    if (/malformed JSON/.test(String(error))) return false;
    throw error;
  }
}
export async function changeAddress(
  db: D1Database,
  userId: string,
  id: string,
  input: AddressUpdate,
) {
  try {
    const results = await db.batch([
      // Clear the old default before setting a new one; the partial UNIQUE index is always respected.
      // Version guard on the target ensures stale requests cannot clear unrelated defaults.
      db
        .prepare(
          `UPDATE addresses SET is_default=0,version=CASE WHEN id=? THEN version ELSE version+1 END,updated_at=unixepoch()
      WHERE user_id=? AND is_default=1 AND ?=1 AND EXISTS(SELECT 1 FROM addresses WHERE id=? AND user_id=? AND version=?)`,
        )
        .bind(id, userId, Number(input.isDefault), id, userId, input.version),
      db
        .prepare(
          `UPDATE addresses SET recipient=?,line1=?,line2=?,city=?,region=?,postal_code=?,country_code=?,phone=?,is_default=?,
      version=version+1,updated_at=unixepoch() WHERE id=? AND user_id=? AND version=? RETURNING id`,
        )
        .bind(...fields(input), Number(input.isDefault), id, userId, input.version),
      writeGuard(db),
    ]);
    return results[1]!.meta.changes === 1;
  } catch (error) {
    if (/malformed JSON/.test(String(error))) return false;
    throw error;
  }
}
export async function removeAddress(db: D1Database, userId: string, id: string, version: number) {
  return db
    .prepare('DELETE FROM addresses WHERE id=? AND user_id=? AND version=? RETURNING id')
    .bind(id, userId, version)
    .first<{ id: string }>();
}
