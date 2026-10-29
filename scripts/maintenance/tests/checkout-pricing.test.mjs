import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fixture, loadWorker, root } from './helpers/worker-harness.mjs';

const origin = 'https://jackrabbitpunkinpublishing.com';
const request = (path, body) => new Request(origin + path, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
function checkoutFixture(legacyTax) {
  const f = fixture();
  f.env.SQUARE_LOCATION_ID = 'offline-location';
  // Old deployed variables must neither block checkout nor add a charge.
  if (legacyTax !== undefined) Object.assign(f.env, { STORE_TAX_MODE: legacyTax, STORE_TAX_PERCENTAGE: '7.5', STORE_TAX_SHIPPING: 'true' });
  const submitted = [];
  const worker = loadWorker(async (url, options) => {
    assert.ok(String(url).endsWith('/payment-links'), 'no tax-provider lookup is needed');
    submitted.push(JSON.parse(options.body));
    return Response.json({ payment_link: { id: 'link', order_id: 'new-square-order', url: 'https://square.link/offline' } });
  });
  return { f, worker, submitted };
}

function assertNoExtraCharges(payload) {
  assert.equal(payload.order.taxes, undefined);
  assert.equal(payload.order.service_charges, undefined);
  assert.equal(payload.checkout_options.app_fee_money, undefined);
  assert.equal(payload.checkout_options.allow_tipping, undefined);
  for (const item of payload.order.line_items) assert.equal(item.applied_taxes, undefined);
}

for (const legacyTax of [undefined, 'unconfigured', 'fixed', 'none', 'invalid']) {
  test(`native checkout needs no tax configuration and ignores legacy mode ${legacyTax}`, async () => {
    const { f, worker, submitted } = checkoutFixture(legacyTax);
    const catalog = await (await worker.default.fetch(new Request(origin + '/api/store/books'), f.env, {})).json();
    assert.deepEqual(catalog.checkout, { available: true, mode: 'client-managed', percentage: 0, shippingTaxable: false });
    const response = await worker.default.fetch(request('/api/store/checkout', {
      cart: JSON.stringify([{ sku: 'SKU1', quantity: 2, unitPrice: 1, lineTotal: 2 }]),
      tax: 99, total: 1, processingFee: 99,
    }), f.env, {});
    assert.equal(response.status, 200);
    const { id } = await response.json();
    assert.equal(submitted.length, 1);
    const payload = submitted[0];
    assertNoExtraCharges(payload);
    assert.deepEqual(payload.order.pricing_options, { auto_apply_taxes: false, auto_apply_discounts: false });
    assert.equal(payload.order.line_items.length, 2, 'only book and legitimate shipping');
    assert.equal(payload.order.line_items[0].base_price_money.amount, 1000, 'server catalog price');
    assert.equal(payload.order.line_items[0].quantity, '2');
    assert.equal(payload.order.line_items[1].name, 'U.S. Shipping & Handling');
    assert.equal(payload.order.line_items[1].base_price_money.amount, 1000, 'existing $5 per book');
    const row = f.sqlite.prepare('SELECT subtotal, shipping, tax, total FROM orders WHERE order_number=?').get(id);
    assert.deepEqual({ ...row }, { subtotal: 20, shipping: 10, tax: 0, total: 30 });
    assert.equal(f.sqlite.prepare('SELECT total FROM orders WHERE order_number=?').get(f.orderNumber).total, 25, 'historical order unchanged');
  });
}

test('missing Square credentials still disables checkout without creating orders', async () => {
  const { f, worker, submitted } = checkoutFixture();
  delete f.env.SQUARE_LOCATION_ID;
  const catalog = await (await worker.default.fetch(new Request(origin + '/api/store/books'), f.env, {})).json();
  assert.equal(catalog.checkout.available, false);
  const response = await worker.default.fetch(request('/api/store/checkout', { cart: JSON.stringify([{ sku: 'SKU1', quantity: 1 }]) }), f.env, {});
  assert.equal(response.status, 503);
  assert.equal(submitted.length, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
});

test('sponsorship charges exactly the package amount without a platform surcharge', async () => {
  const { f, worker, submitted } = checkoutFixture();
  const response = await worker.default.fetch(request('/api/sponsors/checkout', { package: 'pagePal', payerName: 'Reader', payerEmail: 'reader@example.org' }), f.env, {});
  assert.equal(response.status, 200);
  assertNoExtraCharges(submitted[0]);
  assert.equal(submitted[0].order.line_items.length, 1);
  assert.equal(submitted[0].order.line_items[0].base_price_money.amount, 10000);
  assert.equal(f.sqlite.prepare('SELECT amount_cents FROM sponsor_payments').get().amount_cents, 10000);
});

test('settlement uses gross customer payment, preserves provider fees, and rejects extra customer charges', async () => {
  const f = fixture();
  const { review } = loadWorker(f.squareFetch);
  for (const amount of [2563, 2650]) {
    await assert.rejects(review.recordPaidOrderFromSquarePayment(f.env, 'bad-' + amount, { ...f.payment, amount_money: { amount, currency: 'USD' } }), /does not match/);
  }
  const payment = { ...f.payment, processing_fee: [{ amount_money: { amount: 103, currency: 'USD' }, type: 'INITIAL' }] };
  const before = JSON.stringify(payment.processing_fee);
  await review.recordPaidOrderFromSquarePayment(f.env, 'paid', payment);
  assert.equal(JSON.stringify(payment.processing_fee), before);
  assert.equal(f.sqlite.prepare('SELECT amount_cents FROM order_settlements').get().amount_cents, 2500);
  assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get().payment_status, 'Paid');
});

test('release checks pass without tax setup in production or sandbox', () => {
  const config = JSON.parse(readFileSync(root + '/cloudflare/wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  for (const vars of [config.vars, config.env.sandbox.vars]) {
    assert.equal(Object.keys(vars).some(key => key.startsWith('STORE_TAX_')), false);
  }
  const result = spawnSync(process.execPath, ['scripts/check-release.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
