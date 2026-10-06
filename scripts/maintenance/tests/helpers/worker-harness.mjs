import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const nativeRequire = createRequire(import.meta.url);

// Exercise the actual Worker functions with local SQLite and mock providers.
// The added exports exist only in this in-memory test module, never in the bundle.
export function loadWorker(fetchMock = () => { throw new Error('Unexpected network access'); }, socketMock) {
  const cache = new Map();
  const sandbox = vm.createContext({
    console, Request, Response, Headers, URL, URLSearchParams, FormData, File,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, ReadableStream, WritableStream,
    crypto: globalThis.crypto, atob, btoa, AbortSignal, fetch: fetchMock,
    // Remove pacing delays in unit tests, while leaving deadline behavior intact.
    setTimeout: (fn, ms) => ms === 1000 ? setTimeout(fn, 0) : setTimeout(fn, ms),
    clearTimeout,
  });
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    let source = readFileSync(filename, 'utf8');
    if (/[\\/]app\.ts$/.test(filename)) source += '\nexport const review = { recordPaidOrderFromSquarePayment, recordRefundFromSquareEvent, recordPaidSponsorFromSquarePayment, queueNewsletterCampaign, processNewsletterQueue, saveNewsletterCampaign, validateOrderItems, enforcePublicRateLimit, syncBookInventoryFromSquare, getUnsubscribeUrl, deriveCustomerPassword, verifyCustomerPassword, issueCustomerSessionCookie, handleCustomerApi, sendMailboxEmail, listMailboxItems, listStandaloneMailboxEmail, getMailboxItem, updateMailboxState, resolveMailboxDraftKey, listSubmissionRecords, getSubmissionRecord, updateCorrespondenceState, sendSponsorCertificateIfEligible };';
    if (/[\\/]namecheap-mail\.ts$/.test(filename)) source += '\nexport const review = { parseEmail, ProtocolReader };';
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    function requireLocal(name) {
      if (name === 'cloudflare:sockets') return { connect: socketMock || (() => { throw new Error('Unexpected socket access'); }) };
      if (name === 'jose') return { createRemoteJWKSet: () => ({}), jwtVerify: () => { throw new Error('JWT provider access is not permitted in offline tests'); } };
      if (name.startsWith('.')) {
        let resolved = path.resolve(path.dirname(filename), name);
        if (resolved.endsWith('.json')) return JSON.parse(readFileSync(resolved, 'utf8'));
        if (!resolved.endsWith('.ts')) resolved += '.ts';
        return load(resolved);
      }
      return nativeRequire(name);
    }
    vm.runInContext('(function(require,module,exports){' + js + '\n})', sandbox, { filename })(requireLocal, mod, mod.exports);
    return mod.exports;
  }
  return { ...load(path.join(root, 'cloudflare/src/app.ts')), mail: load(path.join(root, 'cloudflare/src/namecheap-mail.ts')) };
}

export function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(path.join(root, 'cloudflare/migrations')).filter(n => n.endsWith('.sql')).sort()) sqlite.exec(readFileSync(path.join(root, 'cloudflare/migrations', name), 'utf8'));
  sqlite.exec('PRAGMA foreign_keys = ON');
  function prepare(sql) {
    let args = [];
    return {
      sql,
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
  }
  const DB = { prepare, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  return { sqlite, DB };
}

export function fixture() {
  const { sqlite, DB } = database();
  const env = { DB, SITE_URL: 'https://jackrabbitpunkinpublishing.com', PUBLIC_API_URL: 'https://jackrabbitpunkinpublishing.com', PUBLIC_ADMIN_URL: 'https://jackrabbitpunkinpublishing.com/admin/', MAIL_FROM_EMAIL: 'no-reply@jackrabbitpunkinpublishing.com', ADMIN_NOTIFICATION_EMAIL: 'admin@example.org', ADMIN_SESSION_SECRET: 'offline-only-secret', CUSTOMER_SESSION_SECRET: 'offline-customer-secret', UNSUBSCRIBE_SECRET: 'offline-unsubscribe-secret', SQUARE_ACCESS_TOKEN: 'offline-square-token', SQUARE_ENVIRONMENT: 'sandbox', RESEND_API_KEY: 'offline-resend-key', INVENTORY_AUTHORITY: 'local' };
  sqlite.exec("INSERT INTO books (id,sku,title,stock,price,status) VALUES ('b1','SKU1','A book',5,10,'Published')");
  const cart = [{ bookId: 'b1', sku: 'SKU1', title: 'A book', quantity: 2, unitPrice: 10, lineTotal: 20, preorder: false }];
  const orderNumber = 'JRPP-20260101010101-ABCDEF01';
  sqlite.prepare("INSERT INTO orders (order_number,provider,square_order_id,total) VALUES (?,'square','sq-order',25)").run(orderNumber);
  sqlite.prepare('INSERT INTO checkout_sessions (session_id,cart_json) VALUES (?,?)').run(orderNumber, JSON.stringify(cart));
  const payment = { id: 'pay1', order_id: 'sq-order', status: 'COMPLETED', amount_money: { amount: 2500, currency: 'USD' }, buyer_email_address: 'guest@example.org' };
  const squareOrder = { id: 'sq-order', reference_id: orderNumber, fulfillments: [{ shipment_details: { recipient: { display_name: 'Guest Buyer', email_address: 'guest@example.org', address: { address_line_1: '1 Main St', locality: 'Atlanta', administrative_district_level_1: 'GA', postal_code: '30301', country: 'US' } } } }] };
  const squareFetch = async (url) => {
    if (String(url).endsWith('/orders/sq-order')) return Response.json({ order: squareOrder });
    if (String(url).endsWith('/payments/pay1')) return Response.json({ payment });
    throw new Error('Unexpected provider request: ' + url);
  };
  return { sqlite, env, orderNumber, payment, squareOrder, squareFetch };
}
