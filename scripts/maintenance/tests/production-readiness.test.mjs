import assert from 'node:assert/strict';
import test from 'node:test';
import { pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixture, loadWorker, root } from './helpers/worker-harness.mjs';
import { signValue } from '../../../cloudflare/src/utils.ts';
const origin = 'https://jackrabbitpunkinpublishing.com';
const request = (path, body, extra = {}) => new Request(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.8', ...extra }, body: JSON.stringify(body) });
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const user = { id: 'reader', email: 'reader@example.org', displayName: 'Reader', shippingAddress: '', createdAt: '', updatedAt: '', lastLoginAt: '', tokenSubject: 'reader' };
function legacyAccount(f) {
  const salt = Buffer.alloc(16, 7).toString('base64url');
  const hash = pbkdf2Sync('Original password', Buffer.alloc(16, 7), 120000, 32, 'sha256').toString('base64url');
  f.sqlite.prepare('INSERT INTO customer_accounts(id,email,password_salt,password_hash) VALUES(?,?,?,?)').run(user.id, user.email, salt, hash);
  return { salt, hash };
}

test('versioned password hashes preserve legacy credentials without the native iteration ceiling', async () => {
  const { review } = loadWorker();
  const f = fixture(), old = legacyAccount(f);
  const deriveBits = crypto.subtle.deriveBits;
  crypto.subtle.deriveBits = () => { throw new Error('Native PBKDF2 unavailable'); };
  try {
    assert.equal(await review.verifyCustomerPassword('Original password', old.salt, old.hash), true);
    assert.equal(await review.verifyCustomerPassword('wrong', old.salt, old.hash), false);
    const fresh = await review.deriveCustomerPassword('Original password', new Uint8Array(16).fill(7));
    const expected = pbkdf2Sync('Original password', Buffer.alloc(16,7),600000,32,'sha256').toString('base64url');
    assert.equal(fresh.hash, 'pbkdf2-sha256$600000$' + expected);
    assert.equal(await review.verifyCustomerPassword('Original password', fresh.salt, fresh.hash), true);
    assert.equal(await review.verifyCustomerPassword('Original password', fresh.salt, 'pbkdf2-sha256$999999999$' + expected), false);
  } finally { crypto.subtle.deriveBits = deriveBits; }
});

test('successful legacy login upgrades the hash and issues a working versioned session', async () => {
  const f = fixture(); legacyAccount(f); f.env.TURNSTILE_SECRET_KEY = 'offline';
  const worker = loadWorker(async url => {
    assert.match(String(url), /turnstile/);
    return Response.json({success:true, action:'customer_login', hostname:new URL(origin).hostname});
  });
  const response = await worker.default.fetch(request('/api/customer/auth/login', {email:user.email,password:'Original password','cf-turnstile-response':'offline'}),f.env,{});
  assert.equal(response.status,200);
  assert.match(f.sqlite.prepare('SELECT password_hash FROM customer_accounts').get().password_hash,/^pbkdf2-sha256\$600000\$/);
  const session = await worker.default.fetch(new Request(origin + '/api/customer/auth/session',{headers:{Cookie:cookie(response)}}), f.env, {});
  assert.equal((await session.json()).authenticated,true);
});

test('password reset is single-use, invalidates older sessions, and preserves the account', async () => {
  const f = fixture(); legacyAccount(f); const worker = loadWorker();
  const oldCookie = cookie(await worker.review.issueCustomerSessionCookie(Response.json({}),f.env,user));
  const tokenHash = await signValue('reset-token',f.env.CUSTOMER_SESSION_SECRET);
  f.sqlite.prepare("UPDATE customer_accounts SET reset_token_hash=?, reset_expires_at=datetime('now','+1 hour')").run(tokenHash);
  const responses = await Promise.all([1,2].map(()=>worker.default.fetch(request('/api/customer/auth/reset-password',{email:user.email,token:'reset-token',password:'Replacement password'}),f.env,{})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);
  assert.equal(f.sqlite.prepare('SELECT session_version FROM customer_accounts').get().session_version,1);
  const oldSession = await worker.default.fetch(new Request(origin+'/api/customer/auth/session',{headers:{Cookie:oldCookie}}),f.env,{});
  assert.equal((await oldSession.json()).authenticated,false);
  const newSession = await worker.default.fetch(new Request(origin+'/api/customer/auth/session',{headers:{Cookie:cookie(responses.find(r=>r.status===200))}}),f.env,{});
  assert.equal((await newSession.json()).authenticated,true);
  // A login that verified credentials before this reset must not mint a cookie
  // with the newer version simply because issuance read the account again.
  await assert.rejects(worker.review.issueCustomerSessionCookie(Response.json({}), f.env, user, 0), /Please sign in again/);
});

test('login rate limits apply across different IPs before expensive credential verification',async()=>{
  const f=fixture();f.env.TURNSTILE_SECRET_KEY='offline';
  const worker=loadWorker(async()=>Response.json({success:true,action:'customer_login',hostname:new URL(origin).hostname}));
  for(let i=0;i<10;i++) assert.equal((await worker.default.fetch(request('/api/customer/auth/login',{email:'missing@example.org',password:'wrong','cf-turnstile-response':'offline'},{'CF-Connecting-IP':'192.0.2.'+i}),f.env,{})).status,401);
  assert.equal((await worker.default.fetch(request('/api/customer/auth/login',{email:'missing@example.org',password:'wrong','cf-turnstile-response':'offline'},{'CF-Connecting-IP':'192.0.2.100'}),f.env,{})).status,429);
});

test('profile password changes are atomic and revoke prior sessions and reset links', async () => {
  const f = fixture(); legacyAccount(f); const worker = loadWorker();
  const oldCookie = cookie(await worker.review.issueCustomerSessionCookie(Response.json({}), f.env, user));
  f.sqlite.exec("UPDATE customer_accounts SET reset_token_hash='pending-reset', reset_expires_at=datetime('now','+1 hour')");
  const update = (password) => new Request(origin + '/api/customer/profile', {
    method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: oldCookie },
    body: JSON.stringify({ email: user.email, displayName: 'Changed Reader', shippingAddress: 'Updated address', currentPassword: password, newPassword: 'Replacement password' }),
  });
  assert.equal((await worker.default.fetch(update('wrong'), f.env, {})).status, 400);
  const unchanged = f.sqlite.prepare('SELECT * FROM customer_accounts').get();
  assert.equal(unchanged.display_name, ''); assert.equal(unchanged.shipping_address, '');
  assert.equal(unchanged.session_version, 0); assert.equal(unchanged.reset_token_hash, 'pending-reset');
  const response = await worker.default.fetch(update('Original password'), f.env, {});
  assert.equal(response.status, 200);
  const updated = f.sqlite.prepare('SELECT * FROM customer_accounts').get();
  assert.equal(updated.display_name, 'Changed Reader'); assert.equal(updated.shipping_address, 'Updated address');
  assert.equal(updated.session_version, 1); assert.equal(updated.reset_token_hash, '');
  const session = async value => (await worker.default.fetch(new Request(origin + '/api/customer/auth/session', { headers: { Cookie: value } }), f.env, {})).json();
  assert.equal((await session(oldCookie)).authenticated, false);
  assert.equal((await session(cookie(response))).authenticated, true);
});

test('account profile saves show success and clear password fields', async () => {
  const handlers = {}, elements = { displayName: {}, email: {}, shippingAddress: {}, currentPassword: { value: 'old' }, newPassword: { value: 'new' } };
  const status = { textContent: '', classList: { toggle() {} } }, button = { disabled: false };
  const form = { elements, addEventListener(name, handler) { handlers[name] = handler; }, querySelector() { return button; } };
  const list = { innerHTML: '' };
  const rootElement = { innerHTML: '', querySelector(selector) {
    return ({ '[data-account-turnstile]': null, '[data-account-name]': {}, '[data-profile-form]': form, '[data-account-page-logout]': { addEventListener() {} }, '[data-account-form-message]': status, '[data-purchase-list]': list })[selector];
  }};
  const window = { location: { origin, href: origin + '/account', search: '' }, JPPTurnstile: { remove() {} }, JRPPAccount: { refresh() {} } };
  const fetch = async url => Response.json(url.endsWith('/session') ? { authenticated: true, user } : url.endsWith('/purchases') ? { purchases: [] } : { ok: true, user });
  vm.runInNewContext(readFileSync(root + '/assets/account.js', 'utf8'), { document: { querySelector: () => rootElement }, window, fetch, URL, URLSearchParams, FormData: class { entries() { return [['email', user.email]]; } } });
  await new Promise(resolve => setImmediate(resolve));
  await handlers.submit({ preventDefault() {}, currentTarget: form });
  assert.equal(status.textContent, 'Your profile has been saved.');
  assert.equal(elements.currentPassword.value, ''); assert.equal(elements.newPassword.value, '');
  assert.equal(button.disabled, false);
});

test('analytics rejects hostile origins, drops sensitive metadata/query strings, and limits writes',async()=>{
  const f=fixture(), worker=loadWorker(), payload={eventType:'page_view',pagePath:'/account?reset=secret',meta:JSON.stringify({email:'private@example.org',formType:'contact',itemCount:2})};
  assert.equal((await worker.default.fetch(request('/api/analytics/event',payload,{Origin:'https://hostile.example'}),f.env,{})).status,403);
  assert.equal((await worker.default.fetch(request('/api/analytics/event',payload),f.env,{})).status,200);
  const saved=f.sqlite.prepare('SELECT * FROM analytics_events').get();
  assert.equal(saved.page_path,'/account');assert.deepEqual(JSON.parse(saved.meta_json),{formType:'contact',itemCount:2});
  f.sqlite.exec('UPDATE public_rate_limits SET requests=120');
  assert.equal((await worker.default.fetch(request('/api/analytics/event',payload),f.env,{})).status,429);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n,1);
});

test('WWW protected pages redirect to the canonical Access host, while public APIs remain available',async()=>{
  const f=fixture();f.env.ADMIN_AUTH_MODE='access';const worker=loadWorker();
  for(const path of ['/admin/','/admin/store.html','/login/?returnTo=%2Fadmin%2F']) {
    const response=await worker.default.fetch(new Request('https://www.jackrabbitpunkinpublishing.com'+path),f.env,{});
    assert.equal(response.status,308);assert.equal(new URL(response.headers.get('location')).origin,origin);
  }
  assert.equal((await worker.default.fetch(new Request(origin+'/api/store/books'),f.env,{})).status,200);
  assert.equal((await worker.default.fetch(request('/api/auth/google',{credential:'untrusted'}),f.env,{})).status,409);
});

test('the server launch switch controls home independently of browser storage, without redirect loops',async()=>{
  const f=fixture();f.env.ASSETS={fetch:async()=>new Response('homepage')}; const worker=loadWorker();
  const closed=await worker.default.fetch(new Request(origin+'/'),f.env,{});assert.equal(closed.status,302);assert.equal(closed.headers.get('location'),origin+'/coming-soon');assert.equal(closed.headers.get('cache-control'),'no-store');
  f.env.SITE_LAUNCH_STATE='open';assert.equal(await (await worker.default.fetch(new Request(origin+'/'),f.env,{})).text(),'homepage');
  assert.equal((await worker.default.fetch(new Request(origin+'/index.html'),f.env,{})).headers.get('location'),origin+'/');
});

test('public PDFs permit the same-origin document viewer while other assets retain framing denial',async()=>{
  const f=fixture(),worker=loadWorker();f.env.ASSETS={fetch:async()=>new Response('PDF',{headers:{'Content-Type':'application/pdf','Content-Security-Policy':"frame-ancestors 'none'"}})};
  const pdf=await worker.default.fetch(new Request(origin+'/assets/documents/press.pdf'),f.env,{});assert.equal(pdf.headers.get('X-Frame-Options'),'SAMEORIGIN');assert.match(pdf.headers.get('Content-Security-Policy'),/frame-ancestors 'self'/);
  const ordinary=await worker.default.fetch(new Request(origin+'/assets/other.pdf'),f.env,{});assert.equal(ordinary.headers.get('X-Frame-Options'),'DENY');
});

function checkoutFixture(mode) {
  const f=fixture();f.env.STORE_TAX_MODE=mode;f.env.STORE_TAX_PERCENTAGE='7.5';f.env.STORE_TAX_SHIPPING='false';f.env.SQUARE_LOCATION_ID='offline-location';
  let submitted, calls=0;
  const worker=loadWorker(async(url,options)=>{
    calls++;
    if(String(url).endsWith('/payment-links')) { submitted=JSON.parse(options.body);return Response.json({payment_link:{id:'link',order_id:'tax-order',url:'https://square.link/offline'}}); }
    const subtotal=submitted.order.line_items.reduce((sum,item)=>sum+Number(item.quantity)*item.base_price_money.amount,0);
    const tax=Math.round(2000*0.075);
    return Response.json({order:{id:'tax-order',reference_id:submitted.order.reference_id,total_money:{amount:subtotal+tax,currency:'USD'},total_tax_money:{amount:tax,currency:'USD'},total_discount_money:{amount:0,currency:'USD'}}});
  });
  return {f,worker,submitted:()=>submitted,calls:()=>calls};
}
test('unconfigured tax policy prevents provider calls and leaves no new orders or reservations',async()=>{
  const c=checkoutFixture('unconfigured');const before=c.f.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  const response=await c.worker.default.fetch(request('/api/store/checkout',{cart:JSON.stringify([{sku:'SKU1',quantity:2}])}),c.f.env,{});
  assert.equal(response.status,503);assert.equal(c.calls(),0);assert.equal(c.f.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n,before);
});
test('explicit fixed tax is sent to Square and provider-verified totals are stored without amount mismatches',async()=>{
  const c=checkoutFixture('fixed');const response=await c.worker.default.fetch(request('/api/store/checkout',{cart:JSON.stringify([{sku:'SKU1',quantity:2}])}),c.f.env,{});assert.equal(response.status,200);
  const data=await response.json();const submitted=c.submitted();assert.equal(submitted.order.taxes[0].percentage,'7.5');assert.equal(submitted.order.line_items[0].applied_taxes[0].tax_uid,'store-tax');assert.equal(submitted.order.line_items[1].applied_taxes,undefined);
  const row=c.f.sqlite.prepare('SELECT * FROM orders WHERE order_number=?').get(data.id);assert.equal(row.tax,1.5);assert.equal(row.total,row.subtotal+row.shipping+row.tax);
});
test('an explicitly reviewed no-tax mode sends no tax and requires no provider tax lookup',async()=>{
  const c=checkoutFixture('none');const response=await c.worker.default.fetch(request('/api/store/checkout',{cart:JSON.stringify([{sku:'SKU1',quantity:2}])}),c.f.env,{});assert.equal(response.status,200);assert.equal(c.calls(),1);assert.equal(c.submitted().order.taxes,undefined);
});

test('simultaneous Turnstile consumers share one loader and render each element once; failed loads can retry',async()=>{
  const scripts=[],rendered=[],elements=new Map();
  const window={siteConfig:{turnstileSiteKey:'offline-key'}};
  const document={head:{appendChild(script){scripts.push(script);}},createElement(){return {dataset:{},remove(){}};}};
  vm.runInNewContext(readFileSync(root+'/assets/turnstile.js','utf8'),{window,document,WeakMap,Promise,String,Error});
  const el={isConnected:true,clientWidth:250,dataset:{},classList:{add(){}}};
  const one=window.JPPTurnstile.render(el),two=window.JPPTurnstile.render(el);
  assert.equal(scripts.length,1);
  window.turnstile={render(element,options){rendered.push(options);return 'widget';},reset(id){elements.set(id,'reset');}};scripts[0].onload();
  assert.equal(await one,'widget');assert.equal(await two,'widget');assert.equal(rendered.length,1);assert.equal(rendered[0].size,'compact');
  window.JPPTurnstile.reset({matches:()=>false,querySelectorAll:()=>[el]});assert.equal(elements.get('widget'),'reset');
  delete window.turnstile; // A separate fresh helper instance tests network recovery.
  vm.runInNewContext(readFileSync(root+'/assets/turnstile.js','utf8'),{window,document,WeakMap,Promise,String,Error});
  const failed=window.JPPTurnstile.load();scripts[1].onerror();await assert.rejects(failed,/could not load/);
  const retry=window.JPPTurnstile.load();assert.equal(scripts.length,3);window.turnstile={};scripts[2].onload();await retry;
});

test('Turnstile uses content-sized normal widgets and switches to compact only below 300 pixels', async () => {
  const rendered = [];
  const window = {
    siteConfig: { turnstileSiteKey: 'offline-key' },
    turnstile: { render(element, options) { rendered.push(options); return String(rendered.length); } },
  };
  vm.runInNewContext(readFileSync(root + '/assets/turnstile.js', 'utf8'), { window, document: {} });
  for (const [width, size] of [[0, 'normal'], [150, 'compact'], [299, 'compact'], [300, 'normal'], [900, 'normal']]) {
    const classes = new Set();
    const element = { isConnected: true, clientWidth: width, dataset: {}, classList: { add: name => classes.add(name) } };
    await window.JPPTurnstile.render(element, { action: 'customer_login', theme: 'light' });
    assert.equal(rendered.at(-1).size, size);
    assert.equal(element.dataset.widgetSize, size);
    assert.equal(classes.has('turnstile-widget'), true);
    assert.equal(rendered.at(-1).action, 'customer_login');
    assert.equal(rendered.at(-1).theme, 'light');
  }
  const element = { isConnected: true, clientWidth: 900, dataset: {}, classList: { add() {} } };
  await window.JPPTurnstile.render(element, { size: 'compact' });
  assert.equal(rendered.at(-1).size, 'compact');
  assert.equal(element.dataset.widgetSize, 'compact');
  const detached = { isConnected: false };
  assert.equal(await window.JPPTurnstile.render(detached), null);
  assert.equal(rendered.length, 6);
  delete window.siteConfig.turnstileSiteKey;
  await assert.rejects(window.JPPTurnstile.render({ isConnected: true }), /not configured/);
});
