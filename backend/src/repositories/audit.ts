export type AuditContext = { actorId: string; requestId: string };
// SQLite evaluates only the chosen CASE branch. Malformed JSON deliberately aborts
// the D1 batch if a required single-row write was silently skipped by a trigger.
export function writeGuard(db: Pick<D1Database, 'prepare'>) {
  return db.prepare(
    "SELECT json(CASE WHEN changes()=1 THEN '{}' ELSE 'required write missing' END)",
  );
}
export function auditStatement(
  db: Pick<D1Database, 'prepare'>,
  context: AuditContext,
  action: string,
  entity: string,
  id: string,
  metadata: unknown = {},
  conditional = true,
) {
  return db
    .prepare(
      `INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,metadata_json,request_id)
    SELECT ?,?,?,?,?,?,? ${conditional ? 'WHERE changes()=1' : ''}`,
    )
    .bind(
      crypto.randomUUID(),
      context.actorId,
      action,
      entity,
      id,
      JSON.stringify(metadata),
      context.requestId,
    );
}
export async function catalogWrite(
  db: D1Database,
  statement: D1PreparedStatement,
  context: AuditContext | undefined,
  action: string,
  entity: string,
  id: string,
) {
  if (!context) return statement.all<{ version: number; id: string }>();
  const result = await db.batch<{ version: number; id: string }>([
    auditStatement(db, context, action, entity, id, {}, false),
    writeGuard(db),
    statement,
    writeGuard(db),
  ]);
  return result[2]!;
}
