import type { Order } from '../../../shared/checkout.ts';
import type { AuditContext } from '../repositories/audit.ts';
import { auditStatement, writeGuard } from '../repositories/audit.ts';
import { readOrder } from '../repositories/checkout.ts';
import { ServiceError } from './errors.ts';

export async function transitionOrder(
  database: D1Database,
  id: string,
  version: number,
  status: Order['status'],
  actor: AuditContext,
  admin = false,
) {
  const db = database.withSession('first-primary');
  const owned = await db
    .prepare(
      `SELECT user_id AS userId,status,version FROM orders WHERE id=? ${admin ? '' : 'AND user_id=?'}`,
    )
    .bind(...(admin ? [id] : [id, actor.actorId]))
    .first<{ userId: string; status: string; version: number }>();
  if (!owned) throw new ServiceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (!admin && status !== 'CANCELLED')
    throw new ServiceError(403, 'FORBIDDEN', 'This action requires an administrator.');
  if (owned.status === status) return readOrder(db, owned.userId, id);
  if (owned.version !== version)
    throw new ServiceError(409, 'STALE_ORDER', 'This order changed. Reload before updating.');
  try {
    await db.batch([
      auditStatement(
        db,
        actor,
        status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
        'order',
        id,
        { from: owned.status, to: status },
        false,
      ),
      writeGuard(db),
      db
        .prepare(
          `UPDATE orders SET status=?,version=version+1,updated_at=unixepoch(),
        stock_restored_at=CASE WHEN ?='CANCELLED' THEN unixepoch() ELSE NULL END
        WHERE id=? AND version=? RETURNING version`,
        )
        .bind(status, status, id, version),
      writeGuard(db),
    ]);
  } catch (error) {
    if (/malformed JSON/.test(String(error))) {
      const current = await readOrder(db, owned.userId, id);
      if (current?.status === status) return current;
      throw new ServiceError(409, 'STALE_ORDER', 'This order changed. Reload before updating.');
    }
    if (error instanceof ServiceError) throw error;
    if (/order:|CHECK constraint|UNIQUE constraint/.test(String(error)))
      throw new ServiceError(
        409,
        'INVALID_TRANSITION',
        'This order cannot make that transition. Shipped orders cannot be cancelled; stock restoration must fit inventory limits.',
      );
    throw error;
  }
  return readOrder(db, owned.userId, id);
}
