import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fixture, loadWorker, database, root } from './helpers/worker-harness.mjs';
const origin = 'https://jackrabbitpunkinpublishing.com';
const catalog = JSON.parse(readFileSync(root + '/assets/published-books.json', 'utf8'));
const checkoutRequest = cart => new Request(origin + '/api/store/checkout', {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({cart:JSON.stringify(cart),total:1,shipping:0})});

test('all six catalog formats start with no invented stock and correct direct prices', () => {
  const {sqlite} = database();
  for (const book of catalog) for (const format of book.formats) {
    const row = sqlite.prepare('SELECT * FROM books WHERE isbn=?').get(format.isbn);
    assert.equal(row.title,book.title); assert.equal(row.format,format.format);
    assert.equal(row.price,format.directPrice); assert.equal(row.stock,0);
    assert.equal(row.status,'Out of Stock'); assert.equal(row.publication_date,book.releaseDate);
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM books WHERE featured=1').get().n,1);
});

for (const count of [1,2,3,4]) test(`${count} mixed-format books charge exactly $${count*5} shipping and show formats to Square`, async () => {
  const {sqlite,env} = fixture(); env.SQUARE_LOCATION_ID='test-location';
  sqlite.exec("UPDATE books SET stock=20,status='Published' WHERE sku LIKE 'JPP-%'");
  const payloads=[];
  const worker=loadWorker(async(url,options)=>{payloads.push(JSON.parse(options.body));return Response.json({payment_link:{id:'link',order_id:'sq-new',url:'https://square.link/test'}});});
  const pb='JPP-1972028022', hc='JPP-1972028316';
  const cart=count===1?[{sku:pb,quantity:1}]:[{sku:pb,quantity:1},{sku:hc,quantity:count-1}];
  const response=await worker.default.fetch(checkoutRequest(cart),env,{}); assert.equal(response.status,200);
  const {id}=await response.json(); const payload=payloads[0];
  assert.equal(payload.checkout_options.ask_for_shipping_address,true);
  assert.equal(payload.order.line_items.at(-1).base_price_money.amount,count*500);
  assert.match(payload.order.line_items[0].name,/Paperback$/);
  if(count>1) assert.match(payload.order.line_items[1].name,/Hardcover$/);
  const row=sqlite.prepare('SELECT * FROM orders WHERE order_number=?').get(id);
  assert.equal(row.shipping,count*5); assert.equal(row.tax,0);assert.equal(row.total,20+(count-1)*25+count*5);
  const items=JSON.parse(sqlite.prepare('SELECT cart_json FROM checkout_sessions WHERE session_id=?').get(id).cart_json);
  assert.equal(items[0].format,'Paperback');
});

test('a confirmed payment durably queues one publisher email with complete fulfillment and payment details', async () => {
  const f=fixture(); f.env.ORDER_NOTIFICATION_EMAIL='publisher@example.org';
  f.sqlite.exec("UPDATE checkout_sessions SET cart_json=json_set(cart_json,'$[0].format','Paperback')");
  const sent=[];let failed=true;
  const worker=loadWorker(async(url,options)=>{
    if(String(url).includes('api.resend.com')) {
      sent.push({body:JSON.parse(options.body),key:options.headers.get('Idempotency-Key')});
      return failed?Response.json({message:'try later'},{status:503}):Response.json({id:'sent'});
    }
    return f.squareFetch(url,options);
  });
  await worker.review.recordPaidOrderFromSquarePayment(f.env,'event',f.payment);
  await worker.review.recordPaidOrderFromSquarePayment(f.env,'event-duplicate',f.payment);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_email_deliveries').get().n,1);
  assert.equal(f.sqlite.prepare('SELECT format FROM order_items').get().format,'Paperback');
  await worker.review.queueOrderEmails(f.env);
  await worker.review.processSubmissionEmails(f.env,'','orders');
  assert.equal(f.sqlite.prepare('SELECT status FROM order_email_deliveries').get().status,'Pending');
  const body=sent[0].body;
  assert.deepEqual(body.to,['publisher@example.org']);
  for(const text of ['A book','Paperback','Quantity: 2','Guest Buyer','guest@example.org','1 Main St','30301','pay1','$25.00']) assert.ok(body.text.includes(text),text);
  assert.ok(body.html.includes('/admin/#orders'));
  failed=false;
  f.sqlite.exec("UPDATE order_email_deliveries SET next_attempt_at=datetime('now','-1 minute')");
  await Promise.all([worker.review.processSubmissionEmails(f.env,'','orders'),worker.review.processSubmissionEmails(f.env,'','orders')]);
  assert.equal(sent.length,2);assert.equal(sent[0].key,sent[1].key);assert.deepEqual(sent[0].body,sent[1].body);
  assert.equal(f.sqlite.prepare('SELECT status FROM order_email_deliveries').get().status,'Sent');
  await worker.review.processSubmissionEmails(f.env,'','orders');assert.equal(sent.length,2);
});

test('unpaid or mismatched payments never queue publisher emails', async () => {
  const f=fixture();const worker=loadWorker(f.squareFetch);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_email_deliveries').get().n,0);
  await assert.rejects(worker.review.recordPaidOrderFromSquarePayment(f.env,'wrong',{...f.payment,amount_money:{amount:1,currency:'USD'}}),/does not match/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_email_deliveries').get().n,0);
});

test('published catalog survives missing inventory and includes the authorized Amazon hardcover', () => {
  const html=readFileSync(root+'/books.html','utf8');
  const cards=html.split('<!-- published-catalog:start -->')[1].split('<!-- published-catalog:end -->')[0];
  const ids=[...cards.matchAll(/<article class="store-card" id="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,catalog.map(b=>b.id));
  assert.doesNotMatch(html,/Direct ordering is opening soon/);
  assert.equal((html.match(/href="https:\/\/www\.amazon\.com\/Adventures-D-D-Reuel-Great-Mystery\/dp\/1972028324\/ref=tmm_hrd_swatch_0"/g) || []).length,2);
  const upcoming=html.split('<h2>Coming Soon</h2>')[1];
  assert.doesNotMatch(upcoming,/pieMystery|battles2/);assert.match(upcoming,/February 4, 2027/);
  for(const book of catalog)for(const format of book.formats)for(const retailer of format.retailers)assert.ok(cards.includes(retailer.url.replaceAll('&','&amp;')));
});

test('catalog metadata migration preserves existing inventory, IDs and Square links', () => {
  const {sqlite}=database();
  sqlite.exec("UPDATE books SET sku='LEGACY-PIE-PB',stock=13,status='Published',square_catalog_item_id='existing-item',square_catalog_variation_id='existing-variation' WHERE isbn='1972028022'");
  sqlite.exec(readFileSync(root+'/cloudflare/migrations/0023_published_catalog.sql','utf8'));
  const row=sqlite.prepare("SELECT * FROM books WHERE isbn='1972028022'").get();
  assert.equal(row.id,'jpp-1972028022');assert.equal(row.sku,'LEGACY-PIE-PB');assert.equal(row.stock,13);
  assert.equal(row.square_catalog_item_id,'existing-item');assert.equal(row.square_catalog_variation_id,'existing-variation');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM books WHERE isbn='1972028022'").get().n,1);
});
