import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function storeUI(fail = false) {
  const listeners = {}, calls = [], nodes = new Map([
    ['#squareCatalogStatus', {}], ['#squareCatalogList', {}],
  ]);
  const context = {
    state: { page: 'store' }, bulkConfigs: {}, pageLoaders: {},
    window: { history: { replaceState() {} } },
    document: { addEventListener(type, listener) { listeners[type] = listener; } },
    qs: selector => nodes.get(selector) || null, qsa: () => [],
    api: async route => {
      calls.push(route);
      if (fail) throw new Error('Square rejected the configured access token.');
      return { variations: [{itemName:'Existing Square book',variationId:'v1',sku:'SQ1'}],locationId:'loc1' };
    },
    tableMarkup: (style, columns, rows) => JSON.stringify(rows),
  };
  vm.runInNewContext(readFileSync(new URL('../../../assets/admin-src/store.js', import.meta.url), 'utf8'), context);
  return { calls, nodes, click: name => listeners.click({ target: { closest: selector => selector === '[data-store-tab]' ? {getAttribute: () => name} : null } }) };
}

test('opening Book Catalog loads existing Square products into its Square panel', async () => {
  const app = storeUI();
  await app.click('books');
  assert.deepEqual(app.calls, ['inventory/square-catalog']);
  assert.match(app.nodes.get('#squareCatalogList').innerHTML, /Existing Square book/);
  assert.match(app.nodes.get('#squareCatalogStatus').textContent, /1 Square catalog variations loaded/);
});

test('opening Inventory does not load products into the hidden Book Catalog panel', async () => {
  const app = storeUI(); await app.click('inventory');
  assert.equal(app.calls.length, 0);
});

test('Book Catalog displays Square connection failures instead of pretending the list is empty', async () => {
  const app = storeUI(true); await app.click('books');
  assert.equal(app.nodes.get('#squareCatalogStatus').className, 'status error');
  assert.match(app.nodes.get('#squareCatalogStatus').textContent, /access token/);
});
