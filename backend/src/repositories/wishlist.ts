import { wishlistSchema } from '../../../shared/wishlist.ts';
import { cartWriteStatements } from './cart.ts';

export async function readWishlist(db: D1Database, userId: string) {
  const row = await db
    .prepare(
      `SELECT json_group_array(json_object(
    'productId', r.id, 'slug', r.slug, 'name', r.name, 'subtitle', r.subtitle,
    'image', COALESCE((SELECT image_path FROM product_variants WHERE product_id=r.id ORDER BY active DESC,position,id LIMIT 1), '/images/product-placeholder.svg'),
    'available', json(CASE WHEN r.archived=0 AND EXISTS(SELECT 1 FROM product_variants WHERE product_id=r.id AND active=1)
      AND EXISTS(SELECT 1 FROM product_images WHERE product_id=r.id) THEN 'true' ELSE 'false' END),
    'variants', json((SELECT json_group_array(json_object('id',v.id,'label',v.label,'color',v.swatch,
      'priceMinor',v.price_minor,'compareAtMinor',v.compare_at_minor,'size',v.size,'stock',v.stock,'image',v.image_path,'detailImage',v.detail_image_path))
      FROM (SELECT * FROM product_variants WHERE product_id=r.id AND active=1 AND r.archived=0 ORDER BY position,id) v))
    )) AS items FROM (SELECT p.* FROM wishlists w JOIN wishlist_items wi ON wi.wishlist_id=w.id
      JOIN products p ON p.id=wi.product_id WHERE w.user_id=? ORDER BY wi.created_at DESC,p.id) r`,
    )
    .bind(userId)
    .first<{ items: string }>();
  return wishlistSchema.parse(JSON.parse(row!.items));
}
export async function saveWishlist(db: D1Database, userId: string, productId: string) {
  const results = await db.batch([
    db
      .prepare('INSERT INTO wishlists(id,user_id) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING')
      .bind(crypto.randomUUID(), userId),
    db
      .prepare(
        `INSERT INTO wishlist_items(wishlist_id,product_id)
      SELECT w.id,p.id FROM wishlists w JOIN products p ON p.id=?2
      WHERE w.user_id=?1 AND p.archived=0
      AND EXISTS(SELECT 1 FROM product_variants WHERE product_id=p.id AND active=1)
      AND EXISTS(SELECT 1 FROM product_images WHERE product_id=p.id)
      AND ((SELECT count(*) FROM wishlist_items WHERE wishlist_id=w.id)<50
        OR EXISTS(SELECT 1 FROM wishlist_items WHERE wishlist_id=w.id AND product_id=p.id))
      ON CONFLICT(wishlist_id,product_id) DO UPDATE SET created_at=wishlist_items.created_at
      RETURNING product_id`,
      )
      .bind(userId, productId),
  ]);
  return results[1]!.results.length > 0;
}
export async function removeWishlist(db: D1Database, userId: string, productId: string) {
  await db
    .prepare(
      'DELETE FROM wishlist_items WHERE product_id=? AND wishlist_id IN (SELECT id FROM wishlists WHERE user_id=?)',
    )
    .bind(productId, userId)
    .run();
}
export async function moveWishlist(
  db: D1Database,
  userId: string,
  productId: string,
  variantId: string,
  quantity: number,
) {
  // D1 batch is a transaction. changes() refers to the preceding outer cart INSERT/UPSERT,
  // not the cart-version trigger. A failed guard means zero changes and keeps the favorite.
  const results = await db.batch([
    ...cartWriteStatements(db, userId, variantId, quantity, undefined, productId),
    db
      .prepare(
        `DELETE FROM wishlist_items WHERE product_id=? AND wishlist_id IN
      (SELECT id FROM wishlists WHERE user_id=?) AND changes()=1 RETURNING product_id`,
      )
      .bind(productId, userId),
  ]);
  return results[1]!.results.length > 0 && results[2]!.results.length > 0;
}
