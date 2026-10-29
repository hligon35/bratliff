import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHmac } from 'node:crypto';
import { fixture, loadWorker } from './helpers/worker-harness.mjs';

function setup(provider) {
  const f = fixture(); const sent = [];
  f.env.SQUARE_ACCESS_TOKEN = '';
  Object.assign(f.env, { TURNSTILE_SECRET_KEY: 'offline-turnstile', ADMIN_AUTH_MODE: 'google', GOOGLE_CLIENT_ID: 'offline.apps.googleusercontent.com', ADMIN_BOOTSTRAP_EMAILS: 'owner@example.org' });
  const worker = loadWorker(async (url, options) => {
    if (String(url).includes('turnstile')) return Response.json({ success: true, action: 'turnstile-spin-v1', hostname: new URL(f.env.SITE_URL).hostname });
    assert.equal(String(url), 'https://api.resend.com/emails');
    sent.push({ body: JSON.parse(options.body), key: options.headers.get('Idempotency-Key') });
    return provider ? provider(sent) : Response.json({ id: 'mail-' + sent.length });
  });
  const jobs = [];
  const request = async (route, body, authenticated = true) => {
    const payload = Buffer.from(JSON.stringify({ email: 'owner@example.org', role: 'owner', sub: 'offline', exp: Math.floor(Date.now()/1000)+300 })).toString('base64url');
    const signature = createHmac('sha256', f.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
    return worker.default.fetch(new Request(f.env.SITE_URL + route, { method: body ? 'POST' : 'GET', headers: { Origin: f.env.SITE_URL, 'Content-Type': 'application/json', ...(authenticated ? { Cookie: '__Host-jrpp_admin_session=' + payload + '.' + signature } : {}) }, body: body ? JSON.stringify(body) : undefined }), f.env, { waitUntil: job => jobs.push(job) });
  };
  function signup(title = 'A book', email = 'reader@example.org', fields = {}) {
    const id = randomUUID();
    f.sqlite.prepare("INSERT INTO form_submissions(id,identity_key,form_type,name,email,title,consent,status) VALUES (?,'offline','bookNotification','Maya Jones',?,?,?,?)")
      .run(id, email, title, fields.consent ?? 1, fields.status || 'New');
    return id;
  }
  const deliveries = () => f.sqlite.prepare('SELECT * FROM book_notification_email_deliveries ORDER BY email').all();
  return { ...f, worker, sent, signup, request, deliveries, flush: async () => { while (jobs.length) await Promise.all(jobs.splice(0)); }, run: () => worker.review.runBookNotifications(f.env) };
}

test('admin inventory publication automatically emails the matching legacy list in the background', async () => {
  const f = setup(); f.signup('  A   BOOK  '); f.signup('A book sequel', 'other@example.org');
  const response = await f.request('/api/admin/books', { sku: 'NEW', title: 'A book', status: 'Published', stock: '4', format: 'Paperback' });
  assert.equal(response.status, 200); await f.flush();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].body.to[0], 'reader@example.org');
  assert.match(f.sent[0].body.text, /Hi Maya,/); assert.match(f.sent[0].body.text, /books#store-book-/);
  assert.match(f.sent[0].body.html, /Unsubscribe/);
  assert.equal(f.deliveries()[0].status, 'Sent');
  const state = await (await f.request('/api/admin/books')).json();
  assert.equal(state.notifications[0].status, 'Sent'); assert.equal(state.notificationLists.length, 2);
});

test('draft, coming soon, preorder and zero-stock products cannot trigger availability announcements', async () => {
  for (const patch of ["status='Draft'", "status='Coming Soon'", 'coming_soon=1', 'preorder=1', 'stock=0', 'price=0']) {
    const f = setup(); f.signup(); f.sqlite.exec('UPDATE books SET ' + patch);
    await f.run(); assert.equal(f.sent.length, 0, patch); assert.equal(f.deliveries().length, 0);
  }
});

test('repeated inventory saves, duplicate signups, formats and concurrent workers send once per title/reader', async () => {
  const f = setup(); f.signup(); f.signup('A book', 'READER@example.org');
  f.sqlite.exec("INSERT INTO books(id,sku,title,stock,price,status) VALUES ('hardcover','HC','A book',3,25,'Published')");
  await Promise.all([f.run(), f.run()]); await f.run();
  assert.equal(f.sent.length, 1); assert.equal(f.deliveries().length, 1);
  assert.equal(f.sent[0].key, f.deliveries()[0].id);
});

test('an explicit list title connects a renamed product and persists across edits', async () => {
  const f = setup(); f.signup('The Fading Lighthouse');
  const body = { sku: 'NEW', title: 'Battles Beyond the Waves: The Fading Lighthouse', notificationTitle: 'The Fading Lighthouse', status: 'Published', stock: '4', format: 'Paperback' };
  const response = await f.request('/api/admin/books', body); const { book } = await response.json(); await f.flush();
  assert.equal(f.sent.length, 1); assert.match(f.sent[0].body.subject, /Battles Beyond the Waves/);
  const saved = await f.worker.review.saveBook(f.env, { email: 'owner@example.org' }, { ...body, bookId: book.bookId, notificationTitle: undefined });
  assert.equal(saved.notificationTitle, 'The Fading Lighthouse');
});

test('new public signup for a title already in inventory gets its receipt and availability email', async () => {
  const f = setup();
  const response = await f.request('/api/forms/submit', { formType: 'bookNotification', firstName: 'Maya', lastName: 'Jones', email: 'new@example.org', title: 'A book', requestId: randomUUID(), 'cf-turnstile-response': 'test-token' }, false);
  assert.equal(response.status, 200); await f.flush();
  assert.equal(f.sent.length, 2); assert.equal(f.deliveries()[0].status, 'Sent');
  assert.equal(f.sqlite.prepare("SELECT book_notification_key FROM form_submissions WHERE email='new@example.org'").get().book_notification_key, 'a book');
});

test('book-only unsubscribe link suppresses queued availability email without a newsletter subscriber row', async () => {
  const f = setup(); f.signup();
  await f.worker.review.queueBookNotifications(f.env, async () => ({ to: 'reader@example.org', subject: 'Available', text: '', html: '', replyTo: '', fromName: '' }));
  const url = await f.worker.review.getUnsubscribeUrl(f.env, 'reader@example.org');
  assert.equal((await f.worker.default.fetch(new Request(url), f.env, {})).status, 200);
  await f.run();
  assert.equal(f.sent.length, 0); assert.equal(f.deliveries()[0].status, 'Skipped');
  assert.equal(f.deliveries()[0].attempts, 0);
});

test('nonconsenting, unsubscribed and globally opted-out readers are never queued', async () => {
  const f = setup(); f.signup('A book', 'no@example.org', {consent: 0}); f.signup('A book','unsub@example.org', {status:'Unsubscribed'}); f.signup('A book','global@example.org');
  f.sqlite.exec("INSERT INTO newsletter_subscribers(email,status,consent) VALUES ('global@example.org','unsubscribed',0)");
  await f.run(); assert.equal(f.sent.length, 0); assert.equal(f.deliveries().length, 0);
});

test('provider throttling retries the original payload/key and cannot repeat a successful send', async () => {
  const f = setup(sent => sent.length === 1 ? new Response('slow down', {status:429}) : Response.json({id:'accepted'})); f.signup();
  await f.run(); assert.equal(f.deliveries()[0].status, 'Pending');
  f.sqlite.exec("UPDATE book_notification_email_deliveries SET next_attempt_at = datetime('now','-1 minute')");
  await f.run(); await f.run();
  assert.equal(f.sent.length, 2); assert.equal(f.sent[0].key, f.sent[1].key);
  assert.deepEqual(f.sent[0].body, f.sent[1].body); assert.equal(f.deliveries()[0].status,'Sent');
});

test('out-of-stock after queueing pauses delivery and restocking resumes without a misleading email', async () => {
  const f = setup(); f.signup();
  await f.worker.review.queueBookNotifications(f.env, async () => ({ to: 'reader@example.org', subject: 'Available', text: '', html: '', replyTo: '', fromName: '' }));
  f.sqlite.exec('UPDATE books SET stock=0'); await f.run();
  assert.equal(f.sent.length, 0); assert.equal(f.deliveries()[0].status,'Pending'); assert.equal(f.deliveries()[0].attempts,0);
  f.sqlite.exec("UPDATE books SET stock=3; UPDATE book_notification_email_deliveries SET next_attempt_at=datetime('now','-1 minute')");
  await f.run(); assert.equal(f.sent.length,1);
});

test('permanent errors and uncertain retries beyond the provider window remain visible without resending', async () => {
  const f = setup(() => new Response('unverified domain', {status:422})); f.signup();
  await f.run(); assert.equal(f.deliveries()[0].status, 'Failed'); await f.run(); assert.equal(f.sent.length,1);
  f.sqlite.exec("UPDATE book_notification_email_deliveries SET status='Sending', lock_until=datetime('now','-1 minute'), first_attempt_at=datetime('now','-24 hours')");
  await f.run(); assert.equal(f.sent.length,1); assert.match(f.deliveries()[0].last_error,/Retry window exhausted/);
});

test('unauthorized inventory mutation cannot trigger notifications', async () => {
  const f = setup(); f.signup();
  assert.equal((await f.request('/api/admin/books', {sku:'NEW',title:'A book',stock:'4',status:'Published'}, false)).status,401);
  await f.flush(); assert.equal(f.sent.length,0);
});

test('restocking through inventory adjustment starts matching alerts promptly', async () => {
  const f = setup(); f.signup(); f.sqlite.exec("UPDATE books SET stock=0,status='Out of Stock'");
  const response = await f.request('/api/admin/inventory/adjust', {bookId:'b1', change:'3', reason:'Stock received'});
  assert.equal(response.status,200, await response.clone().text()); await f.flush(); assert.equal(f.sent.length,1);
});

test('explicit book resubscription restores only that list after a never-attempted opt-out', async () => {
  const f = setup(); f.signup(); f.signup('Other book', 'reader@example.org');
  await f.worker.review.queueBookNotifications(f.env, async () => ({ to:'reader@example.org',subject:'Available',text:'',html:'',replyTo:'',fromName:'' }));
  const url = await f.worker.review.getUnsubscribeUrl(f.env,'reader@example.org');
  await f.worker.default.fetch(new Request(url),f.env,{}); await f.run();
  assert.equal(f.deliveries()[0].status,'Skipped');
  const response = await f.request('/api/forms/submit',{formType:'bookNotification',firstName:'Maya',lastName:'Jones',email:'reader@example.org',title:'A book',requestId:randomUUID(),'cf-turnstile-response':'test-token'},false);
  assert.equal(response.status,200); await f.flush();
  assert.equal(f.deliveries()[0].status,'Sent'); assert.equal(f.sent.length,2);
  assert.equal(f.sqlite.prepare("SELECT consent FROM form_submissions WHERE title='Other book'").get().consent,0);
  const newsletter = f.sqlite.prepare("SELECT consent,status FROM newsletter_subscribers WHERE email='reader@example.org'").get();
  assert.equal(newsletter.consent,0); assert.equal(newsletter.status,'pending');
});
