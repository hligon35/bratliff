import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, loadWorker } from './helpers/worker-harness.mjs';

function setup(provider) {
  const f = fixture();
  f.sqlite.exec("UPDATE orders SET created_at = datetime('now', '-31 minutes'), square_checkout_id = 'link1'");
  f.sqlite.prepare("INSERT INTO checkout_reservations VALUES (?, 'b1', 2, datetime('now', '-1 minute'))").run(f.orderNumber);
  const calls = [];
  const worker = loadWorker(async (url, options) => {
    calls.push([String(url), options?.method || 'GET']);
    if (provider) return provider(url, options, f);
    return Response.json(options?.method === 'DELETE' ? { cancelled_order_id: 'sq-order' } : { order: { id: 'sq-order', state: 'OPEN' } });
  });
  return { ...f, calls, review: worker.review };
}
const order = f => f.sqlite.prepare('SELECT * FROM orders WHERE order_number = ?').get(f.orderNumber);
const stock = f => f.sqlite.prepare("SELECT stock FROM books WHERE id = 'b1'").get().stock;

test('expired links are cancelled once and reservations released without changing stock', async () => {
  const f = setup();
  await Promise.all([f.review.expireSquareCheckouts(f.env, () => { throw Error('unexpected reconciliation'); }), f.review.expireSquareCheckouts(f.env, () => {})]);
  assert.equal(order(f).payment_status, 'Checkout Expired');
  assert.equal(f.calls.filter(([, method]) => method === 'DELETE').length, 1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM checkout_reservations').get().n, 0);
  assert.equal(stock(f), 5);
});

test('provider failure is retained and retried later without declaring the link expired', async () => {
  const f = setup(() => new Response('', { status: 503 }));
  await f.review.expireSquareCheckouts(f.env, () => {});
  assert.equal(order(f).payment_status, 'Pending');
  assert.match(order(f).checkout_expiry_error, /503/);
  await f.review.expireSquareCheckouts(f.env, () => {});
  assert.equal(f.calls.length, 1, 'retry waits five minutes');
});

test('a cancellation committed before a lost response is recovered from Square CANCELED state', async () => {
  const f = setup(() => Response.json({ order: { id: 'sq-order', state: 'CANCELED' } }));
  await f.review.expireSquareCheckouts(f.env, () => {});
  assert.equal(order(f).payment_status, 'Checkout Expired');
  assert.equal(f.calls.length, 1);
});

test('missed completed payment is reconciled before cancellation and preserves the ledger', async () => {
  const f = setup((url, options, fixture) => Response.json(String(url).includes('/payments/') ? { payment: fixture.payment } : { order: { ...fixture.squareOrder, state: 'COMPLETED', tenders: [{ payment_id: 'pay1' }] } }));
  await f.review.expireSquareCheckouts(f.env, payment => f.review.recordPaidOrderFromSquarePayment(f.env, 'recovered', payment));
  assert.equal(order(f).payment_status, 'Paid');
  assert.equal(stock(f), 3);
  assert.equal(f.calls.some(([, method]) => method === 'DELETE'), false);
});

test('late payment after cancellation still settles only if stock is available; review cannot be fulfilled', async () => {
  for (const available of [5, 1]) {
    const f = setup();
    await f.review.expireSquareCheckouts(f.env, () => {});
    f.sqlite.prepare('UPDATE books SET stock = ?').run(available);
    const review = loadWorker(f.squareFetch).review;
    if (available === 5) {
      await review.recordPaidOrderFromSquarePayment(f.env, 'late', f.payment);
      await review.recordPaidOrderFromSquarePayment(f.env, 'duplicate', f.payment);
      assert.equal(stock(f), 3);
      assert.equal(order(f).payment_status, 'Paid');
    } else {
      await assert.rejects(review.recordPaidOrderFromSquarePayment(f.env, 'late', f.payment), /Insufficient inventory/);
      assert.equal(order(f).payment_status, 'Payment Review');
      assert.equal(order(f).square_payment_id, 'pay1');
      assert.equal(stock(f), 1);
      await assert.rejects(review.updateFulfillment(f.env, f.orderNumber, { fulfillmentStatus: 'Shipped' }), /Only settled paid/);
      assert.throws(() => f.sqlite.exec("UPDATE orders SET fulfillment_status = 'Fulfilled'"), /Only settled paid/);
    }
  }
});

test('unexpired and paid checkouts never call Square cancellation', async () => {
  const f = setup();
  f.sqlite.exec("UPDATE orders SET created_at = datetime('now')");
  await f.review.expireSquareCheckouts(f.env, () => {});
  f.sqlite.exec("UPDATE orders SET created_at = datetime('now', '-31 minutes'), payment_status = 'Paid'");
  await f.review.expireSquareCheckouts(f.env, () => {});
  assert.equal(f.calls.length, 0);
});
