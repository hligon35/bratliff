import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { root } from './helpers/worker-harness.mjs';
import path from 'node:path';

function workspace(handler = () => ({draft:null})) {
  const elements=new Map(), storage=new Map(), requests=[], historyCalls=[], timers=[];
  function element(id) { if(!elements.has(id))elements.set(id,{dataset:{},value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this[type]=fn},showModal(){this.open=true},close(){this.open=false}}); return elements.get(id); }
  const location={href:'https://example.org/admin/index.html?view=mailbox',origin:'https://example.org',pathname:'/admin/index.html',search:'?view=mailbox',hash:'',replace(){}};
  const window={siteConfig:{},adminShell:{setActive(){},setConnection(){},setViewer(){},closeMobile(){}},addEventListener(){},confirm:()=>true};
  const document={body:{classList:{add(){},remove(){}}},querySelector(s){return /^#[\w]+$/.test(s)?element(s.slice(1)):null},querySelectorAll(){return []},addEventListener(){}};
  const source=readFileSync(path.join(root,'assets/admin-workspace.js'),'utf8').replace(/bootstrap\(\);\r?\n\}\)\(\);/,'window.testWorkspace={state,setView,openCompose,loadMail,loadMailDetail,applyLocation,loadSubmissionDetail,sendMessage};\n})();');
  const fetch=async (url, options={})=>{requests.push({url:String(url),options});return Response.json(await handler(String(url),options))};
  vm.runInNewContext(source,{window,document,location,history:{pushState(...args){historyCalls.push(args)},replaceState(...args){historyCalls.push(args)}},navigator:{},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:globalThis.crypto,fetch,URL,URLSearchParams,Intl,Date,console,setTimeout:(fn)=>{timers.push(fn);return timers.length},clearTimeout(){},innerWidth:1000});
  return {...window.testWorkspace,element,storage,requests,historyCalls,location,timers};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const received={itemKey:'email:1',sourceType:'email',email:'sender@example.org',name:'Sender',subject:'Hello',body:'Mail',folder:'inbox',isRead:true,outbound:[]};

test('order and website contact compose uses standalone drafts; only received mail uses reply keys', async()=>{
  const app=workspace();
  app.openCompose({composeContext:'order:123',email:'buyer@example.org',name:'Buyer',subject:'Order 123'});
  const orderDraft=app.element('composeForm').dataset.itemKey;
  assert.match(orderDraft,/^draft:[a-f0-9-]{36}$/);
  assert.equal(app.element('composeTo').value,'buyer@example.org');
  app.openCompose({itemKey:'submission:456',sourceType:'submission',email:'visitor@example.org',subject:'Contact'});
  const formDraft=app.element('composeForm').dataset.itemKey;
  assert.match(formDraft,/^draft:[a-f0-9-]{36}$/); assert.notEqual(formDraft,orderDraft);
  app.openCompose(null); assert.notEqual(app.element('composeForm').dataset.itemKey,formDraft);
  app.openCompose(received); assert.equal(app.element('composeForm').dataset.itemKey,'email:1');
  await tick();
  assert.ok(app.requests.every(r=>!/[?&]key=(order|submission)%3A/.test(r.url)));
});

test('switching modules while a mail detail loads cannot rewrite the active view', async()=>{
  let release;
  const app=workspace((url)=>url.includes('mail/item?')?new Promise(resolve=>{release=resolve}):{items:[],total:0});
  app.state.view='mailbox';
  const pending=app.loadMailDetail('email:1');
  app.setView('submissions',true);
  release({item:received}); await pending; await tick();
  assert.equal(app.state.view,'submissions');
  assert.ok(app.historyCalls.every(args=>!String(args[2]).includes('view=mailbox')));
  assert.equal(app.state.detail,null);
});

test('sent mailbox retains global unread/inbox badges, and labels only actual email', async()=>{
  const outgoing={...received,itemKey:'outbound:2',sourceType:'outbound',status:'Accepted'};
  const app=workspace(url=>url.includes('mail/item?')?{item:outgoing}:{items:[outgoing],total:1,counts:{inbox:7,unread:3,sent:4,failed:2,outbox:1}});
  app.state.view='mailbox';app.state.folder='sent';await app.loadMail();
  assert.equal(app.state.unreadCount,3);assert.equal(app.element('mailNavCount').textContent,'3');
  assert.equal(app.element('inboxCount').textContent,'(7)');assert.equal(app.element('sentCount').textContent,'(4)');
  assert.equal(app.element('mailResultCount').textContent,'1 messages');
  assert.match(app.element('mailList').innerHTML,/Sent email/);
  assert.doesNotMatch(app.element('mailList').innerHTML,/Website submission|BOOKSTORE ORDER|record-total/);
});

test('legacy business-record mailbox links route to the appropriate admin module', async()=>{
  const app=workspace(url=>url.includes('submissions/item?')?{item:{...received,itemKey:'submission:456',sourceType:'submission',formType:'contact'}}:{items:[],total:0,counts:{}});
  app.location.search='?view=mailbox&item=order:123';app.applyLocation();
  assert.equal(app.state.view,'orders');assert.equal(app.state.selectedOrder,'123');
  app.location.search='?view=mailbox&item=submission:456';app.applyLocation();await tick();
  assert.equal(app.state.view,'submissions');assert.equal(app.state.selectedSubmission,'submission:456');
  assert.ok(app.requests.every(r=>!r.url.includes('mail/item?')));
});

test('refreshing or organizing an unread message does not automatically mark it read again',async()=>{
  const unread={...received,isRead:false};
  const app=workspace(url=>url.includes('mail/item?')?{item:unread}:url.includes('mail/sync')?{configured:false}:{items:[unread],total:1,counts:{inbox:1,unread:1}});
  app.state.view='mailbox';await app.loadMail();
  assert.equal(app.state.unreadCount,1);
  assert.ok(!app.requests.some(r=>r.url.includes('mail/item/state')));
  await app.loadMailDetail('email:1');await tick();
  assert.ok(app.requests.some(r=>r.url.includes('mail/item/state')));
  assert.equal(app.state.unreadCount,0);
});
