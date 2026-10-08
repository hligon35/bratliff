import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {root} from './helpers/worker-harness.mjs';

const book={sku:'SKU1',bookId:'b1',title:'Battles Beyond the Waves',format:'Paperback',price:20,stock:1,status:'Published'};
function storefront(saved, books=[book], available=true, blocked=false) {
  const nodes=new Map(),events={},requests=[];let catalog={ok:true,books,checkout:{available}};
  for(const s of ['.store-cart-backdrop','[data-cart-items]','[data-cart-total]','[data-checkout]','[data-store-grid]','.store-toast'])nodes.set(s,{classList:{add(){},remove(){}},setAttribute(){},querySelector(){return {}}});
  const window={siteConfig:{storeBooksEndpoint:'/api/store/books',storeCheckoutEndpoint:'/api/store/checkout'},location:{href:'https://example.org/books',origin:'https://example.org',search:''},JPPDialog:{open(){},close(){}}};
  const document={querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn,body:{insertAdjacentHTML(){},classList:{add(){},remove(){}}},readyState:'loading'};
  let stored=JSON.stringify(saved);
  vm.runInNewContext(readFileSync(path.join(root,'assets/store.js'),'utf8'),{window,document,URL,URLSearchParams,Intl,setTimeout(){},clearTimeout(){},fetch:async(url,options)=>{requests.push({url,options});return Response.json(catalog)},localStorage:{getItem(){return stored},setItem(k,v){if(blocked)throw new Error('blocked');stored=v}}});
  return {...window.JRPPStore,nodes,events,requests,setCatalog(data){catalog=data},cart:()=>JSON.parse(stored)};
}

test('restored carts use current prices, clamp stock, update checkout and persist reconciliation',async()=>{
  const app=storefront([{sku:'SKU1',title:'Old',price:10,quantity:2,max:5}]);await app.init();app.openCart();
  assert.equal(app.nodes.get('[data-checkout]').disabled,false);
  assert.equal(app.nodes.get('[data-cart-total]').textContent,'$20.00');
  assert.deepEqual(app.cart(),[{sku:'SKU1',title:book.title,price:20,imageUrl:'',quantity:1,max:1}]);
});

test('catalog refresh removes unavailable items and coalesces duplicate saved SKUs',async()=>{
  const app=storefront([{sku:'SKU1',quantity:1},{sku:'SKU1',quantity:2},{sku:'DELETED',quantity:1}],[{...book,stock:5}]);await app.init();
  assert.equal(app.cart().length,1);assert.equal(app.cart()[0].quantity,3);
  app.setCatalog({ok:true,books:[{...book,status:'Out of Stock',stock:0}],checkout:{available:true}});await app.refresh();
  assert.deepEqual(app.cart(),[]);assert.equal(app.nodes.get('[data-checkout]').disabled,true);
});

test('invalid saved data and unavailable browser storage cannot break the store',async()=>{
  for(const saved of [{sku:'SKU1'},null,[null,{sku:'SKU1',quantity:-1},{sku:'SKU1',quantity:'2'}]]){
    const app=storefront(saved);await app.init();assert.equal(app.nodes.get('[data-checkout]').disabled,true);
  }
  const app=storefront([], [book],true,true);await app.init();app.addToCart('SKU1');
  assert.equal(app.nodes.get('[data-checkout]').disabled,false);
});

test('featured paperback purchase opens its Square item checkout directly',()=>{
  const html=readFileSync(path.join(root,'books.html'),'utf8');
  assert.match(html,/<a\s+class="purchase-button direct"\s+href="https:\/\/square\.link\/u\/llSOK4s4"\s+target="_blank"\s+rel="noopener noreferrer"[^>]*>Buy Direct from JPP<\/a\s*>/);
  assert.doesNotMatch(html,/data-store-direct-(?:title|sku)/);
});
