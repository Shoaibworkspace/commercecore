export async function databaseReady(db: D1Database, externalAuth = false): Promise<boolean> {
  if (externalAuth)
    await db.prepare('SELECT provider,subject,user_id FROM auth_identities LIMIT 1').first();
  // Bounded subqueries check catalog/account schema columns even when no users exist.
  const row = await db
    .prepare(
      `SELECT
    (SELECT version FROM categories LIMIT 1) AS categoryVersion,
    (SELECT version FROM products LIMIT 1) AS productVersion,
    (SELECT swatch FROM product_variants LIMIT 1) AS swatch,
    (SELECT compare_at_minor FROM product_variants LIMIT 1) AS comparisonPrice,
    (SELECT version FROM users LIMIT 1) AS userVersion,
    (SELECT version FROM addresses LIMIT 1) AS addressVersion,
    (SELECT last_seen_at FROM sessions LIMIT 1) AS lastSeen,
    (SELECT key FROM auth_rate_limits LIMIT 1) AS rateKey,
    (SELECT version FROM carts LIMIT 1) AS cartVersion,
    (SELECT product_id FROM wishlist_items LIMIT 1) AS favorite,
    (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND name IN
      ('cart_item_insert','cart_item_update','cart_item_delete')) AS cartTriggers,
    (SELECT pricing_version FROM checkout_quotes LIMIT 1) AS pricingVersion,
    (SELECT checkout_quote_id FROM orders LIMIT 1) AS quoteId,
    (SELECT image_path FROM order_items LIMIT 1) AS orderImage,
    (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND name IN
      ('checkout_validate','checkout_commit')) AS checkoutTriggers,
    (SELECT version FROM orders LIMIT 1) AS orderVersion,
    (SELECT expected_version FROM inventory_movements LIMIT 1) AS movementVersion,
    (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND name IN
      ('order_transition_guard','order_cancel_stock','inventory_adjust_guard','inventory_adjust_commit','user_role_audit')) AS adminTriggers`,
    )
    .first();
  return (
    row !== null && row.cartTriggers === 3 && row.checkoutTriggers === 2 && row.adminTriggers === 5
  );
}
