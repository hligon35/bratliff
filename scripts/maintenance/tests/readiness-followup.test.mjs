import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fixture, loadWorker, root } from './helpers/worker-harness.mjs';

const count = (f, table) => f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
function adminFixture() {
  const f = fixture();
  Object.assign(f.env, {ADMIN_AUTH_MODE:'google', GOOGLE_CLIENT_ID:'offline.apps.googleusercontent.com', ADMIN_BOOTSTRAP_EMAILS:'owner@example.org,target@example.org', ADMIN_DEVELOPER_EMAILS:'developer@example.org'});
  const worker = loadWorker();
  f.request = (route, method='GET', email='owner@example.org', body) => {
    const payload = Buffer.from(JSON.stringify({email,role:'owner',sub:'offline',exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
    const signature = createHmac('sha256', f.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
    return worker.default.fetch(new Request(f.env.SITE_URL+route, {method, headers:{Origin:f.env.SITE_URL, Cookie:'__Host-jrpp_admin_session='+payload+'.'+signature, 'Content-Type':'application/json'}, body:body?JSON.stringify(body):undefined}), f.env, {});
  };
  return f;
}

test('revoked bootstrap owners and developers cannot return; role edits remain durable and audited', async () => {
  const f=adminFixture();
  assert.equal((await f.request('/api/admin/me')).status,200);
  assert.equal((await f.request('/api/admin/admins','POST','owner@example.org',{email:'target@example.org',role:'manager'})).status,200);
  assert.equal((await (await f.request('/api/admin/me','GET','target@example.org')).json()).viewer.role,'manager');
  for (const email of ['target@example.org','developer@example.org']) {
    assert.equal((await f.request('/api/admin/admins/'+encodeURIComponent(email),'DELETE')).status,200);
    assert.equal((await f.request('/api/admin/me','GET',email)).status,403);
  }
  assert.equal(count(f,'admin_bootstrap_state'),1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('admin_saved','admin_removed')").get().n,3);
  assert.equal((await f.request('/api/admin/admins','POST','owner@example.org',{email:'target@example.org',role:'manager'})).status,200);
  assert.equal((await f.request('/api/admin/me','GET','target@example.org')).status,200,'an explicit regrant is allowed');
});

test('the last owner cannot be demoted through the API or removed through competing database mutations', async () => {
  const f=adminFixture();await f.request('/api/admin/me');
  await f.request('/api/admin/admins/target%40example.org','DELETE');
  assert.equal((await f.request('/api/admin/admins','POST','owner@example.org',{email:'owner@example.org',role:'manager'})).status,409);
  assert.throws(()=>f.sqlite.exec("DELETE FROM admins WHERE email='owner@example.org'"),/last owner/);
  assert.equal(f.sqlite.prepare("SELECT role FROM admins WHERE email='owner@example.org'").get().role,'owner');
});

test('upgrading an existing database does not regrant previously removed bootstrap accounts or change roles', () => {
  const sqlite=new DatabaseSync(':memory:');
  const migrations=readdirSync(path.join(root,'cloudflare/migrations')).filter(n=>n.endsWith('.sql')).sort();
  for (const name of migrations.filter(n=>!n.startsWith('0016'))) sqlite.exec(readFileSync(path.join(root,'cloudflare/migrations',name),'utf8'));
  sqlite.exec("INSERT INTO admins (email,role) VALUES ('existing@example.org','owner'),('developer@example.org','manager')");
  sqlite.exec(readFileSync(path.join(root,'cloudflare/migrations/0016_readiness_followup.sql'),'utf8'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM admin_bootstrap_state').get().n,1);
  assert.equal(sqlite.prepare("SELECT role FROM admins WHERE email='developer@example.org'").get().role,'manager');
});

test('incomplete Access configuration never accepts a Google cookie; invalid modes fail closed', async () => {
  const f=adminFixture();await f.request('/api/admin/me');f.env.ADMIN_AUTH_MODE='access';
  assert.equal((await f.request('/api/admin/me')).status,503);
  f.env.CF_ACCESS_AUD='offline-audience';
  assert.equal((await f.request('/api/admin/me')).status,503);
  f.env.ADMIN_AUTH_MODE='';
  assert.equal((await f.request('/api/admin/me')).status,503,'partial inferred Access configuration also fails closed');
  f.env.ADMIN_AUTH_MODE='typo';
  assert.equal((await f.request('/api/admin/me')).status,503);
  f.env.ADMIN_AUTH_MODE='google';
  assert.equal((await f.request('/api/admin/me')).status,200);
});

function forms(handler=()=>Response.json({id:'offline'})) {
  const f=fixture();f.env.TURNSTILE_SECRET_KEY='offline';const sent=[];let verified=0;
  const worker=loadWorker(async (url, options) => {
    if (String(url).includes('turnstile')) {verified++;return Response.json({success:true,action:'turnstile-spin-v1',hostname:new URL(f.env.SITE_URL).host});}
    sent.push({message:JSON.parse(options.body),key:options.headers.get('Idempotency-Key')});return handler(sent.at(-1));
  });
  const submit=(changes={})=>worker.default.fetch(new Request(f.env.SITE_URL+'/api/forms/submit',{method:'POST',headers:{Origin:f.env.SITE_URL,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.8'},body:JSON.stringify({formType:'contact',name:'Offline',email:'offline@example.org',subject:'Question',message:'Fixture only','cf-turnstile-response':randomUUID(),...changes})}),f.env,{});
  return {...f,worker,sent,submit,verified:()=>verified};
}

test('concurrent distinct valid tokens create one submission and one notification pair', async () => {
  const f=forms();const responses=await Promise.all([f.submit(),f.submit()]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,429]);
  assert.equal(count(f,'form_submissions'),1);assert.equal(count(f,'submission_email_deliveries'),2);assert.equal(f.sent.length,2);
  assert.ok(f.sent.every(m=>m.key));
});

test('lost responses and simultaneous requests with the same request ID return the original receipt', async () => {
  const f=forms(),requestId=randomUUID();
  const responses=await Promise.all([f.submit({requestId}),f.submit({requestId})]);
  assert.ok(responses.every(r=>r.status===200));
  const receipts=await Promise.all(responses.map(r=>r.json()));assert.equal(receipts[0].submissionId,receipts[1].submissionId);
  const before=f.verified();const retry=await f.submit({requestId,'cf-turnstile-response':'already-consumed'});
  assert.equal(retry.status,200);assert.equal((await retry.json()).duplicate,true);assert.equal(f.verified(),before);
  assert.equal((await f.submit({requestId,message:'Changed content'})).status,409);
  assert.equal(count(f,'form_submissions'),1);assert.equal(f.sent.length,2);
});

test('changing email addresses cannot bypass the shared IP submission limit', async () => {
  const f=forms();
  for(let i=0;i<10;i++)assert.equal((await f.submit({email:`offline${i}@example.org`})).status,200);
  assert.equal((await f.submit({email:'another@example.org'})).status,429);
  assert.equal(count(f,'form_submissions'),10);
  assert.ok(!f.sqlite.prepare('SELECT identity_key FROM public_rate_limits').get().identity_key.includes('192.0.2.8'));
});

test('partial email failure retries only the unfinished frozen delivery and preserves the form', async () => {
  let failed=false;const f=forms(({message})=>message.to[0]==='offline@example.org'&&!failed?(failed=true,new Response('temporary',{status:503})):Response.json({id:'offline'}));
  const response=await f.submit();assert.equal(response.status,200);assert.equal((await response.json()).emailSent,false);
  assert.equal(count(f,'form_submissions'),1);assert.equal(f.sent.length,2);
  const original=f.sent.find(m=>m.message.to[0]==='offline@example.org');
  f.sqlite.exec("UPDATE submission_email_deliveries SET next_attempt_at=datetime('now','-1 minute') WHERE status='Pending'");
  f.env.MAIL_FROM_EMAIL='changed@example.org';
  await Promise.all([f.worker.review.processSubmissionEmails(f.env),f.worker.review.processSubmissionEmails(f.env)]);
  assert.equal(f.sent.length,3);assert.equal(f.sent[2].key,original.key);assert.deepEqual(f.sent[2].message,original.message);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM submission_email_deliveries WHERE status='Sent'").get().n,2);
});

test('submission and outbox writes roll back together if persistence fails', async () => {
  const f=forms();f.sqlite.exec("CREATE TRIGGER simulated_outbox_failure BEFORE INSERT ON submission_email_deliveries BEGIN SELECT RAISE(ABORT,'simulated'); END");
  assert.equal((await f.submit({requestId:randomUUID()})).status,500);
  assert.equal(count(f,'form_submissions'),0);assert.equal(count(f,'submission_email_deliveries'),0);assert.equal(f.sent.length,0);
});

test('uncertain submission deliveries stop before the provider idempotency window expires', async () => {
  const f=forms(()=>new Response('temporary',{status:503}));await f.submit();const attempts=f.sent.length;
  f.sqlite.exec("UPDATE submission_email_deliveries SET status='Sending',lock_until=datetime('now','-1 minute'),first_attempt_at=datetime('now','-24 hours')");
  await f.worker.review.processSubmissionEmails(f.env);
  assert.equal(f.sent.length,attempts);assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM submission_email_deliveries WHERE status='Failed'").get().n,2);
});

test('sponsorship confirmation requires persisted paid state and exposes no payer details', async () => {
  const f=fixture(),worker=loadWorker(),id='SP-ABCDEF12-A';
  f.sqlite.prepare("INSERT INTO sponsors (id,package,payer_email) VALUES (?,'pagePal','private@example.org')").run(id);
  f.sqlite.prepare("INSERT INTO sponsor_payments (id,sponsor_id,amount_cents,status) VALUES ('sp1',?,10000,'pending')").run(id);
  const confirm=()=>worker.default.fetch(new Request(f.env.SITE_URL+'/api/sponsors/confirm-checkout',{method:'POST',headers:{Origin:f.env.SITE_URL,'Content-Type':'application/json'},body:JSON.stringify({sponsorId:id})}),f.env,{});
  assert.equal((await (await confirm()).json()).paid,false);
  f.sqlite.exec("UPDATE sponsor_payments SET status='paid' WHERE id='sp1'");
  assert.deepEqual(await (await confirm()).json(),{ok:true,paid:true,pending:false});
  f.sqlite.exec("UPDATE sponsor_payments SET status='refunded' WHERE id='sp1'");
  assert.equal((await (await confirm()).json()).paid,false);
});

test('book release notifications require first and last name and greet the reader by first name', async () => {
  const f=forms();
  const response=await f.submit({formType:'bookNotification',name:'',firstName:'Maya',lastName:'Jones',title:'The Fading Lighthouse'});
  assert.equal(response.status,200);
  assert.equal(f.sqlite.prepare("SELECT name FROM form_submissions WHERE form_type='bookNotification'").get().name,'Maya Jones');
  const reply=f.sent.find(({message})=>message.to[0]==='offline@example.org');
  assert.ok(reply);
  assert.match(reply.message.text,/Hi Maya,/);
  assert.match(reply.message.html,/Hi Maya,/);

  const missingName=forms();
  assert.equal((await missingName.submit({formType:'bookNotification',name:'',firstName:'Maya',lastName:'',title:'The Fading Lighthouse'})).status,400);
  assert.equal(count(missingName,'form_submissions'),0);
});

