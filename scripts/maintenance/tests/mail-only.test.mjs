import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, loadWorker } from './helpers/worker-harness.mjs';

const admin = { email: 'admin@example.org', role: 'manager', displayName: 'Admin', token: {} };
const other = { ...admin, email: 'other@example.org' };
const params = (values = {}) => new URLSearchParams(values);
function setup() {
  const f = fixture(), sql = f.sqlite;
  sql.exec("INSERT INTO form_submissions (id,form_type,identity_key,name,email,message) VALUES ('form1','contact','form-only-identity','Website Visitor','visitor@example.org','form-only-content'), ('form2','speaking','speaking-identity','Speaker','speaker@example.org','speaking-only-content')");
  sql.exec("INSERT INTO sponsors (id,package,payer_name,payer_email) VALUES ('sponsor1','Community','Sponsor purchase','sponsor@example.org')");
  sql.exec("INSERT INTO sponsor_payments (id,sponsor_id,amount_cents,status) VALUES ('sponsor-payment','sponsor1',2500,'paid')");
  sql.prepare("UPDATE orders SET customer_name='Order-only customer', customer_email='buyer@example.org', notes='purchase-only-content' WHERE order_number=?").run(f.orderNumber);
  for (const [uid, subject] of [['received1','Hello'],['received2','Question about my book order'],['received3','Sponsor receipt email']]) {
    sql.prepare("INSERT INTO mailbox_external_messages (uid,from_name,from_email,subject,body,received_at) VALUES (?,'Mail sender','sender@example.org',?,'actual mail content','2026-01-02 10:00:00')").run(uid, subject);
  }
  for (const [id, link, status, owner] of [
    ['sent1','','Accepted',admin.email], ['sent2','email:received1','Accepted',admin.email],
    ['legacy-order',`order:${f.orderNumber}`,'Accepted',admin.email], ['legacy-form','submission:form1','Accepted',admin.email],
    ['failed1','email:received1','Failed',admin.email], ['pending1','','Sending',admin.email],
    ['private1','','Accepted',other.email],
  ]) sql.prepare("INSERT INTO mailbox_outbound (id,item_key,recipient,subject,body,admin_email,status,idempotency_key,created_at) VALUES (?,?,'recipient@example.org','Actual outgoing mail','Message body',?,?,?,'2026-01-02 10:00:00')").run(id, link, owner, status, 'key-'+id);
  sql.prepare("INSERT INTO mailbox_state (admin_email,item_key,folder,is_read,starred) VALUES (?,'submission:form1','archive',0,1)").run(admin.email);
  sql.prepare("INSERT INTO mailbox_state (admin_email,item_key,folder,is_read,starred) VALUES (?,?,'inbox',0,1)").run(admin.email, 'order:'+f.orderNumber);
  return { ...f, worker: loadWorker().review };
}

test('mailbox folders, global counts and searches contain mail only', async () => {
  const { env, worker } = setup();
  const all = await worker.listMailboxItems(env, admin, params({folder:'all'}));
  assert.equal(all.total,9);
  assert.ok(all.items.every(x => ['email','outbound'].includes(x.sourceType)));
  assert.equal(all.counts.inbox,3); assert.equal(all.counts.unread,3);
  assert.equal(all.counts.sent,4); assert.equal(all.counts.failed,1); assert.equal(all.counts.outbox,1);
  assert.equal(all.counts.archive,0); assert.equal(all.counts.trash,0);
  for (const folder of ['inbox','starred','archive','trash','all','sent','failed','outbox']) {
    const result = await worker.listMailboxItems(env, admin, params({folder}));
    assert.ok(result.items.every(x => /^(email|outbound):/.test(x.itemKey)),folder);
  }
  for (const search of ['purchase-only-content','form-only-content','Sponsor purchase']) {
    assert.equal((await worker.listMailboxItems(env, admin, params({folder:'all',search}))).total,0);
  }
  // Purchase-related subjects remain visible when they came from the mail server.
  assert.equal((await worker.listMailboxItems(env, admin, params({search:'book order'}))).total,1);
  assert.equal((await worker.listMailboxItems(env, admin, params({search:'Sponsor receipt'}))).total,1);
  assert.equal((await worker.listMailboxItems(env, admin, params({folder:'all',type:'email'}))).total,9);
});

test('sent/failed include actual replies and legacy-linked sends with stable pagination and admin isolation', async () => {
  const { env, worker } = setup();
  const sent = await worker.listStandaloneMailboxEmail(env, admin, params({pageSize:'2'}),true);
  const second = await worker.listStandaloneMailboxEmail(env, admin, params({page:'2',pageSize:'2'}),true);
  assert.equal(sent.total,4); assert.equal(second.total,4);
  assert.equal(new Set([...sent.items,...second.items].map(x=>x.itemKey)).size,4);
  assert.equal(sent.counts.unread,3); assert.equal(sent.counts.inbox,3);
  const filtered = await worker.listStandaloneMailboxEmail(env, admin, params({search:'no-such-message'}),true);
  assert.equal(filtered.total,0); assert.equal(filtered.counts.sent,4);
  const failed = await worker.listStandaloneMailboxEmail(env, admin, params());
  assert.deepEqual(failed.items.map(x=>x.id),['failed1']);
  const own = await worker.listMailboxItems(env, other, params({folder:'sent'}));
  assert.deepEqual(own.items.map(x=>x.id),['private1']);
  await assert.rejects(worker.getMailboxItem(env,admin,'outbound:private1'),e=>e.status===404);
});

test('business keys and old record filters cannot read, organize, draft or send through mailbox APIs', async () => {
  const { env, worker, orderNumber, sqlite } = setup();
  for (const key of ['order:'+orderNumber,'submission:form1','sponsor:sponsor1','email:../received1']) {
    for (const call of [
      () => worker.getMailboxItem(env,admin,key),
      () => worker.updateMailboxState(env,admin,{itemKey:key,action:'trash'}),
      () => worker.resolveMailboxDraftKey(env,key,admin.email),
      () => worker.sendMailboxEmail(new Request('https://example.org'),env,admin,{itemKey:key,to:'recipient@example.org',subject:'test',body:'test',idempotencyKey:'new-mail-key'}),
    ]) await assert.rejects(call(),e=>e.status===400,key);
  }
  for (const type of ['orders','submissions','sponsors']) await assert.rejects(worker.listMailboxItems(env,admin,params({type})),e=>e.status===400);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM form_submissions').get().n,2);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sponsors').get().n,1);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sponsor_payments').get().n,1);
  const draft='draft:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert.equal(await worker.resolveMailboxDraftKey(env,draft,admin.email),draft);
});

test('email state, read badges and reply threads remain scoped; outbound restore uses its delivery folder', async () => {
  const { env, worker } = setup();
  const item = await worker.getMailboxItem(env,admin,'email:received1');
  assert.equal(item.outbound.length,2);
  await worker.updateMailboxState(env,admin,{itemKey:item.itemKey,action:'read'});
  await worker.updateMailboxState(env,admin,{itemKey:item.itemKey,action:'star'});
  assert.equal((await worker.listMailboxItems(env,admin,params())).counts.unread,2);
  assert.equal((await worker.listMailboxItems(env,other,params())).counts.unread,3);
  await worker.updateMailboxState(env,admin,{itemKey:item.itemKey,action:'archive'});
  assert.equal((await worker.listMailboxItems(env,admin,params({folder:'archive'}))).total,1);
  assert.equal((await worker.listMailboxItems(env,admin,params({folder:'starred'}))).total,1);
  await worker.updateMailboxState(env,admin,{itemKey:item.itemKey,action:'trash'});
  assert.equal((await worker.listMailboxItems(env,admin,params({folder:'starred'}))).total,0);
  for (const [key, folder] of [['outbound:sent2','sent'],['outbound:failed1','failed'],['outbound:pending1','outbox']]) {
    await worker.updateMailboxState(env,admin,{itemKey:key,action:'archive'});
    assert.equal((await worker.getMailboxItem(env,admin,key)).folder,'archive');
    await worker.updateMailboxState(env,admin,{itemKey:key,action:'restore'});
    assert.equal((await worker.getMailboxItem(env,admin,key)).folder,folder);
    assert.ok((await worker.listMailboxItems(env,admin,params({folder}))).items.some(x=>x.itemKey===key));
  }
});

test('website submissions stay accessible in their own paginated module with existing per-admin state', async () => {
  const { env, worker } = setup();
  const all=await worker.listSubmissionRecords(env,admin,params({folder:'all',pageSize:'1'}));
  const second=await worker.listSubmissionRecords(env,admin,params({folder:'all',page:'2',pageSize:'1'}));
  assert.equal(all.total,2); assert.equal(second.total,2);
  assert.equal(new Set([...all.items,...second.items].map(x=>x.itemKey)).size,2);
  const archived=await worker.listSubmissionRecords(env,admin,params({folder:'archive'}));
  assert.deepEqual(archived.items.map(x=>x.itemKey),['submission:form1']);
  assert.equal((await worker.listSubmissionRecords(env,other,params())).total,2);
  const item=await worker.getSubmissionRecord(env,admin,'submission:form2');
  assert.equal(item.body,'speaking-only-content'); assert.equal(item.subject,'Speaking request');
  assert.equal((await worker.listSubmissionRecords(env,admin,params({search:'speaking-only',formType:'speaking'}))).total,1);
  await worker.updateCorrespondenceState(env,admin,item.itemKey,'read','submission');
  assert.equal((await worker.getSubmissionRecord(env,admin,item.itemKey)).isRead,true);
  assert.equal((await worker.listMailboxItems(env,admin,params())).counts.unread,3);
  for(const key of ['email:received1','order:any','outbound:sent1'])await assert.rejects(worker.getSubmissionRecord(env,admin,key),e=>e.status===400);
});
