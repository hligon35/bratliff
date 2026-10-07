import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {root} from './helpers/worker-harness.mjs';

const source=readFileSync(path.join(root,'assets/site.js'),'utf8').replace(/\r\n/g,'\n');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('public form retries keep a receipt ID after network failure; edited forms start a new request',async()=>{
  const requests=[],messages=[],button={textContent:'Send'},form={dataset:{formType:'contact'},reset(){},querySelector:()=>button};
  let message='Original',failure=true;
  class FakeFormData {entries(){return [['name','Offline'],['email','offline@example.org'],['message',message],['cf-turnstile-response','fresh-token']][Symbol.iterator]()}}
  const context={formEndpoint:'/api/forms/submit',clearFormMessage(){},isConfiguredUrl:()=>true,setFormMessage:(...args)=>messages.push(args),trackEvent(){},crypto:globalThis.crypto,FormData:FakeFormData,URLSearchParams,window:{location:{origin:'https://example.org',pathname:'/contact'},JPPTurnstile:{reset(){}}},fetch:async(url,o)=>{requests.push(new URLSearchParams(o.body));if(failure)throw new Error('lost response');return Response.json({ok:true})}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function submitLiveForm('),source.indexOf('\n}\n',source.indexOf('async function submitLiveForm('))+2),context);
  await context.submitLiveForm(form);await context.submitLiveForm(form);
  assert.equal(requests[0].get('requestId'),requests[1].get('requestId'));
  message='Edited';await context.submitLiveForm(form);
  assert.notEqual(requests[1].get('requestId'),requests[2].get('requestId'));
  failure=false;await context.submitLiveForm(form);
  assert.equal(requests[2].get('requestId'),requests[3].get('requestId'));
  assert.equal(form.dataset.submissionRequestId,undefined);
});

function sponsorship(paid,search='',packages=false) {
  const alerts=[],requests=[],events={};
  const backdrop={classList:{remove(){}},setAttribute(){}};
  const window={location:{origin:'https://example.org',pathname:'/read-it-forward',search,hash:''},history:{replaceState(){}},addEventListener:(type,fn)=>events[type]=fn,alert:value=>alerts.push(value),JPPDialog:{close(){}}};
  const document={querySelector:s=>s==='.sponsor-modal-backdrop'?backdrop:null,querySelectorAll:()=>packages?[{addEventListener(){}}]:[]};
  const context={window,document,URLSearchParams,resolvePublicApiBase:()=>window.location.origin,fetch:async(url,o)=>{requests.push({url,body:JSON.parse(o.body)});return Response.json({ok:true,paid,pending:!paid})}};
  vm.runInNewContext(source.slice(source.indexOf('function initSponsorProgram()'))+'\ninitSponsorProgram();',context);
  return {alerts,requests,events,window};
}

test('a sponsorship success URL displays payment received only after backend confirmation',async()=>{
  for(const paid of [false,true]) {
    const app=sponsorship(paid,'?sponsor=success&sponsorId=SP-ABCDEF12-A');await tick();
    assert.equal(app.requests.length,1);assert.equal(app.requests[0].url,'https://example.org/api/sponsors/confirm-checkout');
    assert.equal(app.alerts.some(a=>a.includes('payment was received')),paid);
  }
  const missing=sponsorship(true,'?sponsor=success');await tick();
  assert.equal(missing.requests.length,0);assert.ok(!missing.alerts.some(a=>a.includes('payment was received')));
});

test('same-origin popup notifications still require backend payment confirmation',async()=>{
  const app=sponsorship(false,'',true);
  app.events.message({origin:'https://attacker.example',data:{type:'jrpp-sponsor-return',sponsorId:'SP-ABCDEF12-A'}});await tick();assert.equal(app.requests.length,0);
  app.events.message({origin:app.window.location.origin,data:{type:'jrpp-sponsor-return',sponsorId:'SP-ABCDEF12-A'}});await tick();
  assert.equal(app.requests.length,1);assert.ok(!app.alerts.some(a=>a.includes('payment was received')));
});
