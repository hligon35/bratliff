import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../assets/site.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function customerAccountPanelMarkup()'), source.indexOf('function initCustomerAccount()')), context);

function field(value) {
  const input = {
    type: 'password', value, name: 'password', autocomplete: 'current-password',
    setAttribute(name, value) { this[name] = value; },
  };
  const attributes = { 'aria-label': 'Show password', 'aria-pressed': 'false' };
  let click;
  const button = {
    closest: () => ({ querySelector: () => input }),
    addEventListener(type, listener) { assert.equal(type, 'click'); click = listener; },
    setAttribute(name, value) { attributes[name] = value; },
  };
  return { input, attributes, button, click: () => click() };
}

test('header login starts masked with a non-submit, accessible eye button', () => {
  const markup = context.customerAccountPanelMarkup();
  assert.match(markup, /type="password" name="password" autocomplete="current-password" required/);
  assert.match(markup, /type="button" data-password-toggle aria-label="Show password" aria-pressed="false"/);
  assert.match(markup, /<svg[^>]*aria-hidden="true" focusable="false"/);
  assert.match(source, /root\.innerHTML = customerAccountPanelMarkup\(\);\s+initPasswordVisibility\(root\);/);
});

test('eye toggle reveals and masks without changing credentials or affecting another login panel', () => {
  const desktop = field('Reader password');
  const mobile = field('');
  context.initPasswordVisibility({ querySelectorAll: () => [desktop.button, mobile.button] });
  assert.equal(desktop.input['aria-label'], 'Password');
  desktop.click();
  assert.equal(desktop.input.type, 'text');
  assert.equal(desktop.attributes['aria-label'], 'Hide password');
  assert.equal(desktop.attributes['aria-pressed'], 'true');
  assert.equal(desktop.input.value, 'Reader password');
  assert.equal(desktop.input.name, 'password');
  assert.equal(desktop.input.autocomplete, 'current-password');
  assert.equal(mobile.input.type, 'password');
  desktop.click();
  assert.equal(desktop.input.type, 'password');
  assert.equal(desktop.attributes['aria-label'], 'Show password');
  assert.equal(desktop.attributes['aria-pressed'], 'false');
  mobile.click();
  assert.equal(mobile.input.type, 'text');
  assert.equal(mobile.input.value, '');
});

test('visibility binding tolerates a missing field and an empty panel', () => {
  context.initPasswordVisibility({ querySelectorAll: () => [] });
  context.initPasswordVisibility({ querySelectorAll: () => [{ closest: () => null }] });
});

test('mobile login escapes the blurred header and remains scrollable within the dynamic viewport', () => {
  const setup = source.slice(source.indexOf('function initCustomerAccount()'), source.indexOf('  let currentUser = null;'));
  const overlay = {};
  const appended = [];
  const prefix = setup.slice(setup.indexOf('  const shell'));
  vm.runInNewContext('(function () {\n' + prefix + '\n})();', {
    document: {
      querySelector(selector) { return selector === '[data-account-overlay]' ? overlay : {}; },
      body: { appendChild(element) { appended.push(element); } },
    },
  });
  assert.deepEqual(appended, [overlay]);
  const styles = readFileSync(new URL('../../../assets/styles.css', import.meta.url), 'utf8');
  const card = styles.match(/\.account-overlay-card \{([^}]+)\}/)[1];
  assert.match(card, /max-height: min\(700px, calc\(100dvh - 2rem\)\)/);
  assert.match(card, /overflow: auto/);
});
