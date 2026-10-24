import { z } from 'zod';
import {
  DEMO_PRICING,
  demoTotals,
  orderLineSchema,
  quoteSchema,
} from '../../../shared/checkout.ts';
import * as repository from '../repositories/checkout.ts';
import { ServiceError } from './errors.ts';
import { sha256 } from './crypto.ts';

export async function createQuote(
  db: D1Database,
  userId: string,
  addressId: string,
  cartVersion: number,
) {
  const session = db.withSession('first-primary'),
    snapshot = await repository.checkoutSnapshot(session, userId, addressId);
  if (!snapshot)
    throw new ServiceError(
      404,
      'ADDRESS_NOT_FOUND',
      'Choose one of your saved delivery addresses.',
    );
  const lines = z
    .array(orderLineSchema.extend({ stock: z.number(), active: z.number(), archived: z.number() }))
    .parse(JSON.parse(snapshot.items));
  if (!snapshot.cartId || !lines.length)
    throw new ServiceError(409, 'EMPTY_CART', 'Your cart is empty. Add something before checkout.');
  if (snapshot.cartVersion !== cartVersion)
    throw new ServiceError(
      409,
      'CART_CHANGED',
      'Your cart changed. Review it before getting a new summary.',
    );
  if (
    lines.length > 50 ||
    lines.some((line) => !line.active || line.archived || line.quantity > line.stock)
  )
    throw new ServiceError(
      409,
      'STOCK_CHANGED',
      'Some products are unavailable. Review your cart before checkout.',
    );
  const items = lines.map((line) => orderLineSchema.parse(line)),
    subtotal = items.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const quote = quoteSchema.parse({
    id: crypto.randomUUID(),
    currency: 'INR',
    cartVersion,
    expiresAt: Math.floor(Date.now() / 1000) + DEMO_PRICING.quoteSeconds,
    pricingVersion: DEMO_PRICING.version,
    delivery: JSON.parse(snapshot.delivery),
    items,
    ...demoTotals(subtotal),
  });
  await repository.storeQuote(
    session,
    userId,
    snapshot.cartId,
    addressId,
    snapshot.addressVersion,
    quote,
  );
  return quote;
}
export async function placeOrder(
  db: D1Database,
  userId: string,
  key: string,
  input: { quoteId: string; simulation: 'success' | 'failure' },
  requestId: string,
) {
  const session = db.withSession('first-primary'),
    requestHash = await sha256(
      JSON.stringify({ quoteId: input.quoteId, simulation: input.simulation }),
    );
  const replay = async () => {
    const existing = await repository.idempotency(session, userId, key);
    if (!existing) return null;
    if (existing.requestHash !== requestHash)
      throw new ServiceError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This request key was already used for a different checkout.',
      );
    const order = await repository.readOrder(session, userId, existing.orderId);
    if (!order)
      throw new ServiceError(
        503,
        'ORDER_UNAVAILABLE',
        'Your order could not be loaded. Retry the same request.',
      );
    return { order, replayed: true };
  };
  const existing = await replay();
  if (existing) return existing;
  const quote = await repository.quoteState(session, userId, input.quoteId);
  if (!quote)
    throw new ServiceError(
      404,
      'QUOTE_NOT_FOUND',
      'This summary is unavailable. Get a new order summary.',
    );
  if (quote.orderId) {
    // Another request may commit after our first idempotency read and before
    // this quote snapshot. Its order and key are atomic, so resolve the key
    // again before treating a consumed quote as a conflicting checkout.
    const committed = await replay();
    if (committed) return committed;
    throw new ServiceError(
      409,
      'QUOTE_USED',
      'This summary already created an order. Check your orders.',
    );
  }
  if (
    quote.expiresAt <= Math.floor(Date.now() / 1000) ||
    quote.pricingVersion !== DEMO_PRICING.version
  )
    throw new ServiceError(
      409,
      'QUOTE_EXPIRED',
      'Your summary expired. Review the latest prices and try again.',
    );
  if (input.simulation === 'failure')
    throw new ServiceError(
      402,
      'DEMO_PAYMENT_FAILED',
      'Demo payment declined. No order was created; your cart and stock are unchanged.',
    );
  let id: string;
  try {
    id = await repository.commitOrder(session, userId, input.quoteId, key, requestHash, requestId);
  } catch (error) {
    const repeated = await replay();
    if (repeated) return repeated;
    const current = await repository.quoteState(session, userId, input.quoteId);
    const message =
      error instanceof Error
        ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`
        : String(error);
    if (!current || current.orderId || /checkout:(stale|inventory|cart|items|ledger)/.test(message))
      throw new ServiceError(
        409,
        'CHECKOUT_CHANGED',
        'Your cart, address, prices or stock changed. Review a fresh summary before ordering.',
      );
    throw error;
  }
  const order = await repository.readOrder(session, userId, id);
  if (!order)
    throw new ServiceError(
      503,
      'ORDER_UNAVAILABLE',
      'Order saved. Retry the same request to retrieve it.',
    );
  return { order, replayed: false };
}
