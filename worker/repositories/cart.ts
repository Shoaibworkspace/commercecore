import type { Cart } from '../../shared/cart.ts';

type Line = Omit<Cart['items'][number], 'lineTotalMinor' | 'issue'> & {
  active: number;
  archived: number;
};
export async function readCart(db: D1Database, userId: string): Promise<Cart> {
  const row = await db
    .prepare(
      `SELECT
    COALESCE((SELECT version FROM carts WHERE user_id = ?1), 0) AS version,
    (SELECT json_group_array(json_object(
      'variantId', r.variant_id, 'productId', r.product_id, 'slug', r.slug, 'name', r.name,
      'label', r.label, 'image', r.image_path, 'quantity', r.quantity,
      'stock', r.stock, 'unitPriceMinor', r.price_minor, 'active', r.active, 'archived', r.archived
    )) FROM (SELECT ci.variant_id, ci.quantity, v.product_id, v.label, v.image_path,
      v.stock, v.price_minor, v.active, p.archived, p.slug, p.name
      FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
      JOIN product_variants v ON v.id = ci.variant_id JOIN products p ON p.id = v.product_id
      WHERE c.user_id = ?1 ORDER BY ci.created_at, ci.variant_id) r) AS items
  `,
    )
    .bind(userId)
    .first<{ version: number; items: string }>();
  const items: Cart['items'] = (JSON.parse(row!.items) as Line[]).map(
    ({ active, archived, ...line }) => ({
      ...line,
      lineTotalMinor: line.quantity * line.unitPriceMinor,
      issue:
        !active || archived
          ? 'UNAVAILABLE'
          : line.quantity > line.stock
            ? 'INSUFFICIENT_STOCK'
            : null,
    }),
  );
  return {
    version: row!.version,
    currency: 'INR',
    items,
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotalMinor: items.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    hasIssues: items.some((line) => line.issue !== null),
  };
}

// The INSERT/UPSERT guards run atomically in SQLite, including cumulative stock and line limits.
// Cart contents never reserve or decrement inventory.
export async function writeCart(
  db: D1Database,
  userId: string,
  variantId: string,
  quantity: number,
  version?: number,
) {
  const results = await db.batch(cartWriteStatements(db, userId, variantId, quantity, version));
  return results[1]!.results.length > 0;
}
// Reused by atomic wishlist transfers. The optional product guard also requires an owned favorite.
export function cartWriteStatements(
  db: D1Database,
  userId: string,
  variantId: string,
  quantity: number,
  version?: number,
  wishlistProductId?: string,
) {
  const additive = version === undefined;
  return [
    db
      .prepare('INSERT INTO carts (id, user_id) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING')
      .bind(crypto.randomUUID(), userId),
    db
      .prepare(
        `INSERT INTO cart_items (cart_id, variant_id, quantity)
      SELECT c.id, v.id, ?3 FROM carts c JOIN product_variants v ON v.id = ?2
      JOIN products p ON p.id = v.product_id
      WHERE c.user_id = ?1 AND v.active = 1 AND p.archived = 0 AND v.stock >= ?3
      AND (?4 IS NULL OR c.version = ?4)
      AND (?5 IS NULL OR (v.product_id = ?5 AND EXISTS (
        SELECT 1 FROM wishlist_items wi JOIN wishlists w ON w.id = wi.wishlist_id
        WHERE w.user_id = ?1 AND wi.product_id = ?5)))
      AND (EXISTS (SELECT 1 FROM cart_items WHERE cart_id = c.id AND variant_id = v.id)
        OR (SELECT count(*) FROM cart_items WHERE cart_id = c.id) < 50)
      ON CONFLICT(cart_id, variant_id) DO UPDATE SET
        quantity = ${additive ? 'cart_items.quantity + excluded.quantity' : 'excluded.quantity'},
        updated_at = unixepoch()
      WHERE ${additive ? 'cart_items.quantity + excluded.quantity' : 'excluded.quantity'} <= 20
        AND ${additive ? 'cart_items.quantity + excluded.quantity' : 'excluded.quantity'} <=
          (SELECT stock FROM product_variants WHERE id = excluded.variant_id)
      RETURNING variant_id`,
      )
      .bind(userId, variantId, quantity, version ?? null, wishlistProductId ?? null),
  ];
}
export async function deleteCartLine(
  db: D1Database,
  userId: string,
  variantId: string,
  version: number,
) {
  const result = await db
    .prepare(
      `DELETE FROM cart_items WHERE variant_id = ?
    AND cart_id IN (SELECT id FROM carts WHERE user_id = ? AND version = ?) RETURNING variant_id`,
    )
    .bind(variantId, userId, version)
    .all();
  return result.results.length > 0;
}
