import { orderSchema, orderSummarySchema, type Order, type Quote } from '../../shared/checkout.ts';
import { z } from 'zod';
import { writeGuard } from './audit.ts';

export type CheckoutDB = Pick<D1Database, 'prepare' | 'batch'>;
export async function checkoutSnapshot(db: CheckoutDB, userId: string, addressId: string) {
  return db
    .prepare(
      `SELECT c.id AS cartId,c.version AS cartVersion,a.version AS addressVersion,
    json_object('recipient',a.recipient,'line1',a.line1,'line2',a.line2,'city',a.city,'region',a.region,
      'postalCode',a.postal_code,'countryCode',a.country_code,'phone',a.phone) AS delivery,
    (SELECT json_group_array(json_object('variantId',v.id,'productName',p.name,'variantLabel',v.label,
      'sku',v.sku,'image',v.image_path,'quantity',ci.quantity,'unitPriceMinor',v.price_minor,
      'lineTotalMinor',v.price_minor*ci.quantity,'stock',v.stock,'active',v.active,'archived',p.archived))
      FROM cart_items ci JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id
      WHERE ci.cart_id=c.id ORDER BY ci.variant_id) AS items
    FROM addresses a LEFT JOIN carts c ON c.user_id=a.user_id WHERE a.user_id=? AND a.id=?`,
    )
    .bind(userId, addressId)
    .first<{
      cartId: string | null;
      cartVersion: number | null;
      addressVersion: number;
      delivery: string;
      items: string;
    }>();
}
export async function storeQuote(
  db: CheckoutDB,
  userId: string,
  cartId: string,
  addressId: string,
  addressVersion: number,
  quote: Quote,
) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO checkout_quotes(id,user_id,cart_id,cart_version,address_id,address_version,pricing_version,items_json,
      delivery_json,subtotal_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        quote.id,
        userId,
        cartId,
        quote.cartVersion,
        addressId,
        addressVersion,
        quote.pricingVersion,
        JSON.stringify(quote.items),
        JSON.stringify(quote.delivery),
        quote.subtotalMinor,
        quote.shippingMinor,
        quote.taxMinor,
        quote.totalMinor,
        quote.expiresAt,
      ),
    db
      .prepare(
        `DELETE FROM checkout_quotes WHERE user_id=?1 AND NOT EXISTS(SELECT 1 FROM orders WHERE checkout_quote_id=checkout_quotes.id)
      AND (expires_at<=unixepoch() OR id NOT IN (SELECT q.id FROM checkout_quotes q WHERE q.user_id=?1
        AND NOT EXISTS(SELECT 1 FROM orders WHERE checkout_quote_id=q.id) ORDER BY (q.id=?2) DESC,q.created_at DESC,q.id LIMIT 5))`,
      )
      .bind(userId, quote.id),
  ]);
}
export async function quoteState(db: CheckoutDB, userId: string, quoteId: string) {
  return db
    .prepare(
      `SELECT q.expires_at AS expiresAt,q.pricing_version AS pricingVersion,
    (SELECT id FROM orders WHERE checkout_quote_id=q.id) AS orderId FROM checkout_quotes q WHERE q.id=? AND q.user_id=?`,
    )
    .bind(quoteId, userId)
    .first<{ expiresAt: number; pricingVersion: string; orderId: string | null }>();
}
export async function idempotency(db: CheckoutDB, userId: string, key: string) {
  return db
    .prepare(
      'SELECT request_hash AS requestHash,order_id AS orderId FROM checkout_idempotency_keys WHERE user_id=? AND key=?',
    )
    .bind(userId, key)
    .first<{ requestHash: string; orderId: string }>();
}
export async function commitOrder(
  db: CheckoutDB,
  userId: string,
  quoteId: string,
  key: string,
  requestHash: string,
  requestId: string,
) {
  const id = crypto.randomUUID(),
    number = `CC-${crypto.randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO orders(id,order_number,user_id,status,payment_mode,payment_status,currency,
      subtotal_minor,shipping_minor,tax_minor,total_minor,delivery_json,checkout_quote_id)
      SELECT ?,?,user_id,'CONFIRMED','demo','SIMULATED_SUCCESS','INR',subtotal_minor,shipping_minor,tax_minor,total_minor,delivery_json,id
      FROM checkout_quotes WHERE id=? AND user_id=?`,
      )
      .bind(id, number, quoteId, userId),
    writeGuard(db),
    db
      .prepare(
        'INSERT INTO checkout_idempotency_keys(user_id,key,request_hash,order_id) VALUES(?,?,?,?)',
      )
      .bind(userId, key, requestHash, id),
    writeGuard(db),
    db
      .prepare(
        `INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,metadata_json,request_id)
      VALUES(?,?,'ORDER_CREATED','order',?,'{"paymentMode":"demo"}',?)`,
      )
      .bind(crypto.randomUUID(), userId, id, requestId),
    writeGuard(db),
  ]);
  return id;
}
const summaryColumns = `o.id,o.order_number AS orderNumber,o.status,o.payment_mode AS paymentMode,o.payment_status AS paymentStatus,
  o.currency,o.total_minor AS totalMinor,o.created_at AS createdAt,
  (SELECT sum(quantity) FROM order_items WHERE order_id=o.id) AS itemCount`;
export async function readOrder(db: CheckoutDB, userId: string, id: string): Promise<Order | null> {
  const row = await db
    .prepare(
      `SELECT ${summaryColumns},o.version,o.subtotal_minor AS subtotalMinor,o.shipping_minor AS shippingMinor,o.tax_minor AS taxMinor,
    o.delivery_json AS delivery,(SELECT json_group_array(json_object('variantId',variant_id,'productName',product_name,
      'variantLabel',variant_label,'sku',sku,'image',image_path,'quantity',quantity,'unitPriceMinor',unit_price_minor,'lineTotalMinor',line_total_minor))
      FROM (SELECT * FROM order_items WHERE order_id=o.id ORDER BY id)) AS items FROM orders o WHERE o.id=? AND o.user_id=?`,
    )
    .bind(id, userId)
    .first<Record<string, unknown> & { items: string; delivery: string }>();
  return row
    ? orderSchema.parse({
        ...row,
        items: JSON.parse(row.items),
        delivery: JSON.parse(row.delivery),
      })
    : null;
}
export async function listOrders(db: CheckoutDB, userId: string, page: number) {
  const row = await db
    .prepare(
      `WITH owned AS (SELECT ${summaryColumns} FROM orders o WHERE o.user_id=?1),
    page_rows AS (SELECT * FROM owned ORDER BY createdAt DESC,id DESC LIMIT 10 OFFSET ?2)
    SELECT (SELECT count(*) FROM owned) AS total,(SELECT json_group_array(json_object('id',id,'orderNumber',orderNumber,
      'status',status,'paymentMode',paymentMode,'paymentStatus',paymentStatus,'currency',currency,'totalMinor',totalMinor,
      'createdAt',createdAt,'itemCount',itemCount)) FROM page_rows) AS items`,
    )
    .bind(userId, (page - 1) * 10)
    .first<{ total: number; items: string }>();
  return {
    data: z.array(orderSummarySchema).parse(JSON.parse(row!.items)),
    meta: { page, total: row!.total, totalPages: Math.max(1, Math.ceil(row!.total / 10)) },
  };
}
