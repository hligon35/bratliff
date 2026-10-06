import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { fixture, database, loadWorker, root } from './helpers/worker-harness.mjs';

const value = (db, sql, ...args) => db.prepare(sql).get(...args);
const refund = (id, amount) => ({ id, payment_id: 'pay1', status: 'COMPLETED', amount_money: { amount, currency: 'USD' } });

test('public media routes cannot retrieve private R2 guides, avatars or cross-prefix keys', async () => {
  const worker = loadWorker(); let gets = 0;
  const env = { BOOK_ASSETS: { async get() { gets++; return { body: '<svg/>', writeHttpMetadata(h) { h.set('Content-Type', 'image/svg+xml'); } }; } }, ASSETS: { fetch() { throw new Error('Unexpected asset access'); } } };
  for (const route of ['books','sponsors','authors']) {
    for (const key of ['resource-guides/private.pdf','admin-avatars/user/avatar.png','books/b1/../../resource-guides/private.pdf','sponsors/s1/logo.png','books/b1/a.svg/extra','books/b1/a.svg%00','books/b1/a.svg\\private']) {
      if (route === 'sponsors' && key === 'sponsors/s1/logo.png') continue;
      const response = await worker.default.fetch(new Request('https://site.example/media/' + route + '/' + encodeURIComponent(key)), env, {});
      assert.equal(response.status, 404, route + ': ' + key);
    }
    const bad = await worker.default.fetch(new Request('https://site.example/media/' + route + '/%ZZ'), env, {});
    assert.equal(bad.status,404);
  }
  assert.equal(gets,0);
  const valid = await worker.default.fetch(new Request('https://site.example/media/sponsors/' + encodeURIComponent('sponsors/s1/logo.svg')), env, {});
  assert.equal(valid.status,200); assert.equal(gets,1);
  assert.match(valid.headers.get('Content-Security-Policy'), /sandbox/);
});

test('settlement atomically writes guest details, items, stock, audit and Paid state; duplicates have no side effects', async () => {
  const f = fixture(); const { review } = loadWorker(f.squareFetch);
  await review.recordPaidOrderFromSquarePayment(f.env,'evt1',f.payment);
  await Promise.all([review.recordPaidOrderFromSquarePayment(f.env,'evt2',f.payment),review.recordPaidOrderFromSquarePayment(f.env,'evt3',f.payment)]);
  assert.equal(value(f.sqlite,'SELECT stock FROM books').stock,3);
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM order_items').n,1);
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM inventory_events').n,1);
  const order = value(f.sqlite,'SELECT * FROM orders');
  assert.equal(order.payment_status,'Paid'); assert.equal(order.customer_email,'guest@example.org'); assert.equal(order.customer_name,'Guest Buyer'); assert.match(order.shipping_address,/1 Main St.*30301/);
});

test('a mid-settlement database failure rolls back all effects and remains retryable', async () => {
  const f=fixture(); const { review }=loadWorker(f.squareFetch);
  f.sqlite.exec("CREATE TRIGGER simulated_failure BEFORE UPDATE ON books BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  await assert.rejects(review.recordPaidOrderFromSquarePayment(f.env,'evt1',f.payment),/simulated failure/);
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM order_settlements').n,0);
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM order_items').n,0);
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM inventory_events').n,0);
  assert.equal(value(f.sqlite,'SELECT payment_status FROM orders').payment_status,'Pending');
  f.sqlite.exec('DROP TRIGGER simulated_failure');
  await review.recordPaidOrderFromSquarePayment(f.env,'retry',f.payment);
  assert.equal(value(f.sqlite,'SELECT stock FROM books').stock,3);
});

test('stock reservations serialize competing checkouts and failed batches leave no partial orders', async () => {
  const f=fixture(); const DB=f.env.DB;
  await DB.prepare("INSERT INTO checkout_reservations VALUES (?1,'b1',4,datetime('now','+30 minutes'))").bind(f.orderNumber).run();
  await assert.rejects(DB.batch([
    DB.prepare("INSERT INTO orders (order_number) VALUES ('competing')"),
    DB.prepare("INSERT INTO checkout_reservations VALUES ('competing','b1',2,datetime('now','+30 minutes'))"),
  ]),/Insufficient available inventory/);
  assert.equal(value(f.sqlite,"SELECT COUNT(*) AS n FROM orders WHERE order_number='competing'").n,0);
  const { review }=loadWorker(f.squareFetch);
  await review.recordPaidOrderFromSquarePayment(f.env,'evt1',f.payment);
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM checkout_reservations').n,0);
});

test('late payments with insufficient stock enter Payment Review, without partial fulfillment or negative stock', async () => {
  const f=fixture(); f.sqlite.exec('UPDATE books SET stock=1');
  await assert.rejects(loadWorker(f.squareFetch).review.recordPaidOrderFromSquarePayment(f.env,'evt1',f.payment),/Insufficient inventory/);
  assert.equal(value(f.sqlite,'SELECT payment_status FROM orders').payment_status,'Payment Review');
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM order_items').n,0);
  assert.equal(value(f.sqlite,'SELECT stock FROM books').stock,1);
});

test('settlement recovers a missing Square ID via the order reference and rejects mismatched amounts', async () => {
  const f=fixture(); f.sqlite.exec("UPDATE orders SET square_order_id=''"); const {review}=loadWorker(f.squareFetch);
  await assert.rejects(review.recordPaidOrderFromSquarePayment(f.env,'evt1',{...f.payment,amount_money:{amount:1,currency:'USD'}}),/does not match/);
  assert.equal(value(f.sqlite,'SELECT payment_status FROM orders').payment_status,'Pending');
  await review.recordPaidOrderFromSquarePayment(f.env,'evt2',f.payment);
  assert.equal(value(f.sqlite,'SELECT payment_status FROM orders').payment_status,'Paid');
});

test('partial, repeated, full and out-of-order refunds track money without restocking books', async () => {
  const f=fixture(); const { review }=loadWorker(f.squareFetch);
  await review.recordRefundFromSquareEvent(f.env,refund('refund1',500));
  await review.recordRefundFromSquareEvent(f.env,refund('refund1',500));
  let order=value(f.sqlite,'SELECT * FROM orders'); assert.equal(order.refunded_cents,500); assert.equal(order.payment_status,'Partially Refunded');
  await review.recordRefundFromSquareEvent(f.env,refund('refund2',2000));
  order=value(f.sqlite,'SELECT * FROM orders'); assert.equal(order.refunded_cents,2500); assert.equal(order.payment_status,'Refunded');
  await review.recordPaidOrderFromSquarePayment(f.env,'late-payment',f.payment);
  assert.equal(value(f.sqlite,'SELECT stock FROM books').stock,3);
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM inventory_events').n,1);
  assert.equal(value(f.sqlite,'SELECT COUNT(*) AS n FROM square_refunds').n,2);
});

test('invalid quantities are rejected and duplicate cart SKUs are coalesced before inventory checks', async () => {
  const f=fixture(); const {review}=loadWorker();
  for (const quantity of [NaN,Infinity,1.5,-1,0,100,'2']) await assert.rejects(review.validateOrderItems(f.env,[{sku:'SKU1',quantity}]),/quantit|copies|cart/i);
  const items=await review.validateOrderItems(f.env,[{sku:'SKU1',quantity:1},{sku:'SKU1',quantity:2}]);
  assert.equal(items.length,1);assert.equal(items[0].quantity,3);
});

test('local inventory authority never imports Square counts', async () => {
  const f=fixture(); f.sqlite.exec("UPDATE books SET square_catalog_variation_id='linked'");
  assert.equal(await loadWorker().review.syncBookInventoryFromSquare(f.env),0);
  assert.equal(value(f.sqlite,'SELECT stock FROM books').stock,5);
});

test('public abuse limits share durable counters across Worker instances, without storing raw IPs', async () => {
  const f=fixture(); const req=new Request('https://site.example',{headers:{'CF-Connecting-IP':'192.0.2.1'}});
  await loadWorker().review.enforcePublicRateLimit(req,f.env,'test',2,600);
  await loadWorker().review.enforcePublicRateLimit(req,f.env,'test',2,600);
  await assert.rejects(loadWorker().review.enforcePublicRateLimit(req,f.env,'test',2,600),error=>error.status===429);
  assert.notEqual(value(f.sqlite,'SELECT identity_key FROM public_rate_limits').identity_key,'test:192.0.2.1');
});

test('both new and already-emailed legacy unsubscribe URLs reach the Worker while home still serves its static gate', async () => {
  const f=fixture(); const worker=loadWorker();
  f.sqlite.exec("INSERT INTO newsletter_subscribers(email,consent) VALUES ('a@example.org',1)");
  f.env.ASSETS={fetch:async()=>new Response('intentional homepage gate')};
  const link=await worker.review.getUnsubscribeUrl(f.env,'a@example.org');
  const url=new URL(link);url.pathname='/api/unsubscribe';
  assert.equal((await worker.default.fetch(new Request(url),f.env,{})).status,200);
  f.sqlite.exec("UPDATE newsletter_subscribers SET status='active'");
  url.pathname='/';url.searchParams.set('action','unsubscribe');
  assert.equal((await worker.default.fetch(new Request(url),f.env,{})).status,200);
  assert.equal(value(f.sqlite,'SELECT status FROM newsletter_subscribers').status,'unsubscribed');
  assert.match(await (await worker.default.fetch(new Request('https://jackrabbitpunkinpublishing.com/'),f.env,{})).text(),/homepage gate/);
});

async function queuedCampaign(f,worker) {
  f.sqlite.exec("INSERT INTO newsletter_subscribers(email,consent) VALUES ('a@example.org',1),('b@example.org',1)");
  const campaign=await worker.review.saveNewsletterCampaign(f.env,{subject:'Original subject',heroMessage:'Original content'});
  await worker.review.queueNewsletterCampaign(f.env,campaign);
  return campaign;
}

test('newsletter resumes only unfinished recipients with immutable payloads after throttling, and rejects duplicate sends/edits', async () => {
  const f=fixture();const attempts=[];let throttled=true;
  const worker=loadWorker(async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(init.body);attempts.push({body,key:init.headers.get('Idempotency-Key')});if(body.to[0]==='b@example.org'&&throttled)return new Response('throttled',{status:429});return Response.json({id:'sent'});});
  const campaign=await queuedCampaign(f,worker);
  await assert.rejects(worker.review.queueNewsletterCampaign(f.env,campaign),error=>error.status===409);
  await assert.rejects(worker.review.saveNewsletterCampaign(f.env,{campaignId:campaign.campaignId,subject:'Changed'}),error=>error.status===409);
  await worker.review.processNewsletterQueue(f.env);
  assert.equal(value(f.sqlite,"SELECT status FROM newsletter_deliveries WHERE email='a@example.org'").status,'Sent');
  assert.equal(value(f.sqlite,"SELECT status FROM newsletter_deliveries WHERE email='b@example.org'").status,'Pending');
  f.sqlite.exec("UPDATE newsletter_deliveries SET next_attempt_at=datetime('now','-1 minute')");
  f.env.SITE_URL='https://changed.example';f.env.MAIL_FROM_EMAIL='changed@example.org';f.env.UNSUBSCRIBE_SECRET='changed-secret';throttled=false;
  await worker.review.processNewsletterQueue(f.env);
  assert.equal(attempts.length,3);assert.equal(attempts[1].key,attempts[2].key);assert.deepEqual(attempts[1].body,attempts[2].body);
  const row=value(f.sqlite,'SELECT * FROM newsletter_campaigns');assert.equal(row.sent,2);assert.equal(row.failed,0);assert.equal(row.status,'Sent');
});

test('newsletter campaign claim prevents concurrent cron delivery and respects consent revoked after queueing', async () => {
  const f=fixture(); let sends=0;
  const worker=loadWorker(async()=>{sends++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({id:'sent'});});
  await queuedCampaign(f,worker);f.sqlite.exec("UPDATE newsletter_subscribers SET status='unsubscribed' WHERE email='b@example.org'");
  await Promise.all([worker.review.processNewsletterQueue(f.env),worker.review.processNewsletterQueue(f.env)]);
  assert.equal(sends,1);assert.equal(value(f.sqlite,"SELECT status FROM newsletter_deliveries WHERE email='b@example.org'").status,'Skipped');
});

test('permanent newsletter errors and expired retry windows stop without automatic duplicate sends', async () => {
  const f=fixture();let sends=0; const worker=loadWorker(async()=>{sends++;return new Response('invalid domain',{status:422});});
  await queuedCampaign(f,worker);
  f.sqlite.exec("UPDATE newsletter_deliveries SET attempts=1,first_attempt_at=datetime('now','-24 hours') WHERE email='b@example.org'");
  await worker.review.processNewsletterQueue(f.env);assert.equal(sends,1);
  const row=value(f.sqlite,'SELECT * FROM newsletter_campaigns');assert.equal(row.failed,2);assert.equal(row.status,'Sent with Errors');
});

test('Namecheap MIME parsing returns sanitized HTML and its format for D1 storage', () => {
  const {mail}=loadWorker();
  const raw='From: Buyer <buyer@example.org>\r\nSubject: Hello\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello</p><script>bad()</script>';
  const parsed=mail.review.parseEmail(new TextEncoder().encode(raw),'12');
  assert.equal(parsed.bodyFormat,'html');assert.match(parsed.bodyHtml,/Hello/);assert.doesNotMatch(parsed.bodyHtml,/<script/);
});

test('SMTP QUIT failure preserves acceptance, while lost DATA acknowledgement stays uncertain', async () => {
  function socket(acknowledged) {
    let reads=0;const lines=['220 ready\r\n','250 hello\r\n','334 auth\r\n','334 password\r\n','235 ok\r\n','250 sender\r\n','250 recipient\r\n','354 data\r\n'];
    if(acknowledged) lines.push('250 accepted\r\n');
    return {opened:Promise.resolve(), readable:new ReadableStream({pull(controller){if(reads<lines.length)controller.enqueue(new TextEncoder().encode(lines[reads++]));else controller.error(new Error('connection lost'));}}),writable:new WritableStream({write(){}}),close:async()=>{}};
  }
  const env={NAMECHEAP_EMAIL_ADDRESS:'publisher@example.org',NAMECHEAP_EMAIL_PASSWORD:'offline'};
  const message={to:'buyer@example.org',subject:'Hello',text:'hello',html:'<p>hello</p>',fromName:'Publisher',replyTo:'publisher@example.org'};
  await loadWorker(undefined,()=>socket(true)).mail.sendNamecheapEmail(env,message);
  await assert.rejects(loadWorker(undefined,()=>socket(false)).mail.sendNamecheapEmail(env,message),/outcome is uncertain/);
});

test('production config honors environment values and rejects placeholders or sandbox origins', () => {
  const temp=mkdtempSync(path.join(os.tmpdir(),'bratliff-config-'));
  try {
    mkdirSync(path.join(temp,'scripts'));mkdirSync(path.join(temp,'assets'));
    cpSync(path.join(root,'scripts/write-site-config.js'),path.join(temp,'scripts/write-site-config.js'));cpSync(path.join(root,'.env.example'),path.join(temp,'.env.example'));
    const baseEnv={...process.env,NODE_PATH:path.join(root,'node_modules'),GOOGLE_CLIENT_ID:'production-client',TURNSTILE_SITE_KEY:'production-turnstile',ADMIN_NOTIFICATION_EMAIL:'admin@site.org',SITE_URL:'https://jackrabbitpunkinpublishing.com'};
    const run=(changes)=>spawnSync(process.execPath,['scripts/write-site-config.js','--production'],{cwd:temp,env:{...baseEnv,...changes},encoding:'utf8'});
    assert.equal(run({}).status,0); const context={window:{}};vm.runInNewContext(readFileSync(path.join(temp,'assets/site-config.js'),'utf8'),context);
    assert.equal(context.window.siteConfig.googleClientId,'production-client');assert.equal(context.window.siteConfig.turnstileSiteKey,'production-turnstile');assert.equal(context.window.siteConfig.storeConfirmEndpoint,'/api/store/confirm-checkout');
    assert.notEqual(run({SITE_URL:'https://sandbox.example.net'}).status,0);assert.notEqual(run({TURNSTILE_SITE_KEY:'replace-with-site-key'}).status,0);
  } finally {rmSync(temp,{recursive:true,force:true});}
});

test('newsletter schedules use the chosen time zone and reject nonexistent daylight-saving times', async () => {
  const f=fixture();const {review}=loadWorker();
  const campaign=await review.saveNewsletterCampaign(f.env,{subject:'Scheduled',status:'Scheduled',sendDate:'2026-07-01',sendTime:'09:00',timeZone:'America/New_York'});
  assert.equal(campaign.scheduledAt,'2026-07-01T13:00:00.000Z');
  await assert.rejects(review.saveNewsletterCampaign(f.env,{subject:'Gap',sendDate:'2026-03-08',sendTime:'02:30',timeZone:'America/New_York'}),error=>error.status===400);
  await assert.rejects(review.saveNewsletterCampaign(f.env,{subject:'Bad zone',sendDate:'2026-07-01',sendTime:'09:00',timeZone:'Not/AZone'}),error=>error.status===400);
});

test('unverified signup cannot claim guest purchase history by matching an email address', async () => {
  const f=fixture();const worker=loadWorker();
  f.sqlite.exec("INSERT INTO customer_accounts (id,email,password_salt,password_hash) VALUES ('c1','guest@example.org','salt','hash'); UPDATE orders SET payment_status='Paid',customer_email='guest@example.org'; INSERT INTO orders(order_number,customer_id,customer_email,payment_status) VALUES ('own','c1','guest@example.org','Paid');");
  const response=await worker.review.issueCustomerSessionCookie(new Response(),f.env,{id:'c1',email:'guest@example.org'});
  const req=new Request('https://jackrabbitpunkinpublishing.com/api/customer/purchases',{headers:{Cookie:response.headers.get('Set-Cookie').split(';')[0]}});
  const result=await worker.default.fetch(req,f.env,{}); const data=await result.json();
  assert.equal(result.status,200);assert.equal(data.purchases.length,1);assert.equal(data.purchases[0].orderNumber,'own');
});

test('password reset requests use different provider keys and valid branded links for each token', async () => {
  const f=fixture();const calls=[];
  f.sqlite.exec("INSERT INTO customer_accounts(id,email,password_salt,password_hash) VALUES ('c1','reader@example.org','salt','hash')");
  const worker=loadWorker(async(_url,init)=>{calls.push({key:init.headers.get('Idempotency-Key'),body:JSON.parse(init.body)});return Response.json({id:'mock-email'});});
  const request=()=>new Request('https://jackrabbitpunkinpublishing.com/api/customer/auth/forgot-password',{method:'POST',headers:{Origin:'https://jackrabbitpunkinpublishing.com','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.2'},body:JSON.stringify({email:'reader@example.org'})});
  assert.equal((await worker.default.fetch(request(),f.env,{})).status,200);
  const first=value(f.sqlite,'SELECT reset_token_hash FROM customer_accounts').reset_token_hash;
  assert.equal((await worker.default.fetch(request(),f.env,{})).status,429);
  f.sqlite.exec('DELETE FROM public_rate_limits');
  assert.equal((await worker.default.fetch(request(),f.env,{})).status,200);
  assert.equal(calls.length,2);assert.notEqual(calls[0].key,calls[1].key);assert.notEqual(first,value(f.sqlite,'SELECT reset_token_hash FROM customer_accounts').reset_token_hash);
  assert.match(calls[1].body.html,/Jackrabbit Punkin Publishing/);assert.match(calls[1].body.html,/account\.html\?reset=/);
});

test('Access mode exposes its login mode and directs logout through the Access session endpoint', async () => {
  const f=fixture();f.env.ADMIN_AUTH_MODE='access';f.env.CF_ACCESS_TEAM_DOMAIN='example.cloudflareaccess.com';f.env.CF_ACCESS_AUD='aud';
  const worker=loadWorker();
  const config=await worker.default.fetch(new Request('https://jackrabbitpunkinpublishing.com/api/auth/config'),f.env,{});
  assert.equal((await config.json()).mode,'access');
  const logout=await worker.default.fetch(new Request('https://jackrabbitpunkinpublishing.com/api/auth/logout',{method:'POST',headers:{Origin:f.env.SITE_URL}}),f.env,{});
  assert.equal((await logout.json()).logoutUrl,'/cdn-cgi/access/logout');assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});

test('replayed sponsor payment cannot undo a partial refund, and payment/recognition state change atomically', async () => {
  const f=fixture();const worker=loadWorker(f.squareFetch);
  f.sqlite.exec("INSERT INTO sponsors(id,package,payer_email,recognition_status) VALUES ('s1','pagePal','sponsor@example.org','Awaiting Payment'); INSERT INTO sponsor_payments(id,sponsor_id,square_order_id,amount_cents,status) VALUES ('sp1','s1','sq-sponsor',1000,'pending');");
  const payment={id:'sponsor-pay',order_id:'sq-sponsor',amount_money:{amount:1000,currency:'USD'}};
  f.sqlite.exec("CREATE TRIGGER simulated_sponsor_failure BEFORE UPDATE ON sponsors BEGIN SELECT RAISE(ABORT, 'sponsor failure'); END;");
  await assert.rejects(worker.review.recordPaidSponsorFromSquarePayment(f.env,'evt1',payment),/sponsor failure/);
  assert.equal(value(f.sqlite,'SELECT status FROM sponsor_payments').status,'pending');
  f.sqlite.exec('DROP TRIGGER simulated_sponsor_failure');
  await worker.review.recordPaidSponsorFromSquarePayment(f.env,'evt2',payment);
  await worker.review.recordRefundFromSquareEvent(f.env,{id:'sr1',payment_id:'sponsor-pay',status:'COMPLETED',amount_money:{amount:500,currency:'USD'}});
  await worker.review.recordPaidSponsorFromSquarePayment(f.env,'late',payment);
  assert.equal(value(f.sqlite,'SELECT status FROM sponsor_payments').status,'partially_refunded');assert.equal(value(f.sqlite,'SELECT recognition_status FROM sponsors').recognition_status,'Partially Refunded');
});

test('storefront confirmation calls the read-only endpoint and keeps carts when payment is pending or fails', async () => {
  for (const paid of [true,false,'error']) {
    const requests=[];const elements=new Map();const storage=new Map([['jrpp_store_cart_v1',JSON.stringify([{sku:'SKU1',quantity:2,title:'A book',price:10}])]]);
    const document={readyState:'loading',addEventListener(){},querySelectorAll(){return []},querySelector(selector){if(!elements.has(selector))elements.set(selector,{textContent:'',innerHTML:'',classList:{add(){},remove(){}}});return elements.get(selector);}};
    const window={location:{origin:'https://site.example',href:'https://site.example/books.html?checkout=success&orderNumber=JRPP-test',search:'?checkout=success&orderNumber=JRPP-test'},siteConfig:{storeCheckoutEndpoint:'/api/store/checkout'}};
    const context={window,document,URL,URLSearchParams,Intl,localStorage:{getItem:key=>storage.get(key),setItem:(key,val)=>storage.set(key,val)},setTimeout:()=>0,clearTimeout(){},fetch:async(url)=>{requests.push(url);if(paid==='error')throw new Error('provider pending');return Response.json({ok:true,paid});}};
    const source=readFileSync(path.join(root,'assets/store.js'),'utf8').replace('  window.JRPPStore =','  window.review = { confirmCheckoutReturn, state };\n  window.JRPPStore =');vm.runInNewContext(source,context);
    await window.review.confirmCheckoutReturn();assert.deepEqual(requests,['/api/store/confirm-checkout']);
    assert.equal(JSON.parse(storage.get('jrpp_store_cart_v1')).length,paid===true?0:1);
    if(paid!==true)assert.doesNotMatch(elements.get('.store-toast').textContent,/Payment confirmed/);
  }
});

test('sponsor settlement recovers a checkout interrupted before its Square IDs were persisted', async () => {
  const f=fixture();const sponsorId='SP-ABCDEFAB-1';
  f.sqlite.prepare("INSERT INTO sponsors(id,package,payer_email,recognition_status) VALUES (?,'pagePal','sponsor@example.org','Awaiting Payment')").run(sponsorId);
  f.sqlite.prepare("INSERT INTO sponsor_payments(id,sponsor_id,amount_cents,status) VALUES ('sp1',?,1000,'pending')").run(sponsorId);
  const worker=loadWorker(async()=>Response.json({order:{reference_id:sponsorId}}));
  await worker.review.recordPaidSponsorFromSquarePayment(f.env,'evt1',{id:'sponsor-pay',order_id:'sq-sponsor',amount_money:{amount:1000,currency:'USD'}});
  assert.equal(value(f.sqlite,'SELECT square_order_id FROM sponsor_payments').square_order_id,'sq-sponsor');assert.equal(value(f.sqlite,'SELECT status FROM sponsor_payments').status,'paid');
});

test('mailbox preserves uncertain SMTP and database acknowledgement outcomes without sending again', async () => {
  for(const outcome of ['smtp-uncertain','db-failure']) {
    const f=fixture();const worker=loadWorker();let sends=0;
    f.env.NAMECHEAP_EMAIL_ADDRESS='publisher@example.org';f.env.NAMECHEAP_EMAIL_PASSWORD='offline';
    worker.mail.sendNamecheapEmail=async()=>{sends++;if(outcome==='smtp-uncertain')throw new worker.mail.MailDeliveryUncertainError('uncertain');};
    if(outcome==='db-failure')f.sqlite.exec("CREATE TRIGGER simulated_mail_failure BEFORE UPDATE ON mailbox_outbound WHEN NEW.status='Accepted' BEGIN SELECT RAISE(ABORT,'mail acceptance write failed'); END;");
    const admin={email:'admin@example.org',role:'manager'};const req=new Request(f.env.SITE_URL+'/api/admin/mail/send');
    const body={to:'buyer@example.org',subject:'Hello',body:'Message',idempotencyKey:'offline-send-key'};
    const result=await worker.review.sendMailboxEmail(req,f.env,admin,body);assert.equal((await result.json()).status,'Sending');
    assert.equal(value(f.sqlite,'SELECT status FROM mailbox_outbound').status,'Sending');
    await worker.review.sendMailboxEmail(req,f.env,admin,body);assert.equal(sends,1);
    await assert.rejects(worker.review.sendMailboxEmail(req,f.env,admin,{...body,body:'Different'}),error=>error.status===409);
  }
});

test('failed mailbox retries have an atomic claim so simultaneous requests send only once', async () => {
  const f=fixture();let sends=0;const worker=loadWorker(async()=>{sends++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({id:'mock-email'});});
  f.sqlite.exec("INSERT INTO mailbox_outbound(id,item_key,recipient,subject,body,admin_email,status,idempotency_key) VALUES ('m1','','buyer@example.org','Hello','Message','admin@example.org','Failed','offline-send-key')");
  const req=new Request(f.env.SITE_URL+'/api/admin/mail/send');const admin={email:'admin@example.org',role:'manager'};const body={to:'buyer@example.org',subject:'Hello',body:'Message',idempotencyKey:'offline-send-key'};
  await Promise.all([worker.review.sendMailboxEmail(req,f.env,admin,body),worker.review.sendMailboxEmail(req,f.env,admin,body)]);
  assert.equal(sends,1);assert.equal(value(f.sqlite,'SELECT status FROM mailbox_outbound').status,'Accepted');
});

test('certificate notifications serialize concurrent sends and stop at the provider retry-window boundary', async () => {
  const f=fixture();let sends=0;const worker=loadWorker(async()=>{sends++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({id:'mock-email'});});
  f.sqlite.exec("INSERT INTO sponsors(id,package,payer_name,payer_email,mailing_address,certificate_status) VALUES ('s1','literacyTrailblazer','Supporter','supporter@example.org','1 Main St','pending');");
  f.env.ASSETS={fetch:async()=>new Response(readFileSync(path.join(root,'assets/documents/JPP_Certificate_of_Appreciation_v1.pdf')))};
  const outcomes=await Promise.allSettled([worker.review.sendSponsorCertificateIfEligible(f.env,'s1','2026-01-01T12:00:00Z'),worker.review.sendSponsorCertificateIfEligible(f.env,'s1','2026-01-01T12:00:00Z')]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(sends,2);assert.equal(value(f.sqlite,'SELECT certificate_status FROM sponsors').certificate_status,'sent');
  f.sqlite.exec("UPDATE sponsors SET certificate_status='error',certificate_first_attempt_at=datetime('now','-24 hours')");
  await assert.rejects(worker.review.sendSponsorCertificateIfEligible(f.env,'s1','2026-01-01T12:00:00Z'),/provider review/);assert.equal(sends,2);
  f.sqlite.exec("UPDATE sponsors SET certificate_first_attempt_at=''");
  await assert.rejects(worker.review.sendSponsorCertificateIfEligible(f.env,'s1','2026-01-01T12:00:00Z'),/provider review/);assert.equal(sends,2);
});
