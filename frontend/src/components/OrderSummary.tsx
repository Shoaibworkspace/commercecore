import type { z } from 'zod';
import type { totalsSchema, deliverySchema } from '../../../shared/checkout.ts';
import { formatPrice } from '../features/catalog/model';

export function OrderTotals({ totals }: { totals: z.infer<typeof totalsSchema> }) {
  return (
    <dl className="checkout-totals">
      <div>
        <dt>Items subtotal</dt>
        <dd>{formatPrice(totals.subtotalMinor)}</dd>
      </div>
      <div>
        <dt>Demo shipping</dt>
        <dd>{totals.shippingMinor === 0 ? 'Free' : formatPrice(totals.shippingMinor)}</dd>
      </div>
      <div>
        <dt>Illustrative tax (5%)</dt>
        <dd>{formatPrice(totals.taxMinor)}</dd>
      </div>
      <div className="checkout-grand-total">
        <dt>Total</dt>
        <dd>{formatPrice(totals.totalMinor)}</dd>
      </div>
    </dl>
  );
}
export function DeliveryDetails({ delivery }: { delivery: z.infer<typeof deliverySchema> }) {
  return (
    <address className="checkout-delivery">
      <strong>{delivery.recipient}</strong>
      <br />
      {delivery.line1}
      <br />
      {delivery.line2 && (
        <>
          {delivery.line2}
          <br />
        </>
      )}
      {delivery.city}, {delivery.region} {delivery.postalCode}
      <br />
      India · {delivery.phone}
    </address>
  );
}
