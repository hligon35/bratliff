import type { Env, JsonValue } from './types';

type SquareExpiryResponse = {
  order?: { id: string; state: string; tenders?: { payment_id?: string }[] };
  payment?: Record<string, JsonValue>;
  cancelled_order_id?: string;
};
type ExpiringCheckout = { orderNumber: string; orderId: string; linkId: string };

// Square deletion cancels the associated order. A completed order must be
// reconciled instead; payment/stock authority stays with the settlement ledger.
export async function expireSquareCheckouts(env: Env, reconcile: (payment: Record<string, JsonValue>) => Promise<void>) {
  if (!env.SQUARE_ACCESS_TOKEN) return;
  const started = Date.now();
  const base = env.SQUARE_ENVIRONMENT === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  const headers = { Authorization: 'Bearer ' + env.SQUARE_ACCESS_TOKEN, 'Square-Version': env.SQUARE_API_VERSION || '2024-10-17' };
  async function square(route: string, method = 'GET') {
    const response = await fetch(base + '/v2/' + route, { method, headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Square checkout expiry request failed (' + response.status + ').');
    return await response.json() as SquareExpiryResponse;
  }
  for (let count = 0; count < 10 && Date.now() - started < 45000; count++) {
    const row = await env.DB.prepare(`UPDATE orders SET checkout_expiry_lock_until = datetime('now', '+3 minutes')
      WHERE order_number = (SELECT order_number FROM orders WHERE provider = 'square' AND payment_status = 'Pending'
        AND square_checkout_id != '' AND square_order_id != '' AND checkout_expired_at = ''
        AND datetime(created_at) <= datetime('now', '-30 minutes')
        AND (checkout_expiry_lock_until = '' OR datetime(checkout_expiry_lock_until) <= datetime('now'))
        AND (checkout_expiry_next_attempt_at = '' OR datetime(checkout_expiry_next_attempt_at) <= datetime('now'))
        ORDER BY created_at LIMIT 1)
      RETURNING order_number AS orderNumber, square_order_id AS orderId, square_checkout_id AS linkId`).first<ExpiringCheckout>();
    if (!row) return;
    try {
      const { order } = await square('orders/' + encodeURIComponent(row.orderId));
      if (!order || order.id !== row.orderId) throw new Error('Square checkout order identity mismatch.');
      // Recover missed webhooks before attempting cancellation, including payments
      // on orders that Square has not yet moved to COMPLETED.
      for (const tender of order.tenders || []) {
        if (!tender.payment_id) continue;
        const { payment } = await square('payments/' + encodeURIComponent(tender.payment_id));
        if (payment?.status === 'COMPLETED') await reconcile(payment);
      }
      const state = await env.DB.prepare('SELECT payment_status AS status FROM orders WHERE order_number = ?1').bind(row.orderNumber).first<{status: string}>();
      if (state?.status !== 'Pending') continue;
      if (order.state === 'COMPLETED') throw new Error('Completed Square order needs payment reconciliation; do not fulfill.');
      if (order.state !== 'CANCELED') {
        const deleted = await square('online-checkout/payment-links/' + encodeURIComponent(row.linkId), 'DELETE');
        if (deleted.cancelled_order_id !== row.orderId) throw new Error('Square did not confirm cancellation of this order.');
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE orders SET checkout_expired_at = datetime('now'), checkout_expiry_error = '', checkout_expiry_lock_until = '', payment_status = 'Checkout Expired' WHERE order_number = ?1 AND payment_status = 'Pending'").bind(row.orderNumber),
        env.DB.prepare("DELETE FROM checkout_reservations WHERE order_number = ?1 AND EXISTS (SELECT 1 FROM orders WHERE order_number = ?1 AND payment_status = 'Checkout Expired')").bind(row.orderNumber),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Square checkout expiry failed.';
      await env.DB.prepare("UPDATE orders SET checkout_expiry_error = ?2, checkout_expiry_lock_until = '', checkout_expiry_next_attempt_at = datetime('now', '+5 minutes') WHERE order_number = ?1")
        .bind(row.orderNumber, message.slice(0, 1000)).run();
      console.error(JSON.stringify({ type: 'checkout_expiry_failed', orderNumber: row.orderNumber, error: message }));
    }
  }
}
