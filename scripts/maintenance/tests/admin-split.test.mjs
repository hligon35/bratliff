import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import ts from "typescript";
import { adminPages, buildBundle, buildStyles } from "../../build-admin-assets.mjs";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8").replace(/\r\n/g, "\n");

test("committed admin bundles and stylesheets match their sources", () => {
  for (const page of adminPages) {
    assert.equal(read(`assets/admin-${page}.js`), buildBundle(page), `${page} script is stale; run npm run admin:build`);
    assert.equal(read(`assets/admin-${page}.css`), buildStyles(page), `${page} styles are stale; run npm run admin:build`);
  }
});

test("each admin page loads only its own script and stylesheet", () => {
  for (const page of adminPages) {
    const html = read(`admin/${page}.html`);
    assert.ok(html.includes(`assets/admin-${page}.js`), page);
    assert.ok(html.includes(`assets/admin-${page}.css`), page);
    for (const other of adminPages.filter((name) => name !== page)) {
      assert.ok(!html.includes(`assets/admin-${other}.js`) && !html.includes(`assets/admin-${other}.css`), `${page} loads ${other} assets`);
    }
    assert.ok(!/assets\/admin\.(js|css)/.test(html), page);
  }
  assert.equal(existsSync(new URL("assets/admin.js", root)), false);
  assert.equal(existsSync(new URL("assets/admin.css", root)), false);
});

test("bundles reference no undefined names and exclude the retired dashboard", () => {
  for (const page of adminPages) {
    const file = `assets/admin-${page}.js`;
    const program = ts.createProgram([new URL(file, root).pathname.replace(/^\/([A-Za-z]:)/, "$1")], {
      allowJs: true, checkJs: true, noEmit: true, lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], types: [], skipLibCheck: true,
    });
    const missing = ts.getPreEmitDiagnostics(program).filter((d) => d.file && d.file.fileName.endsWith(file) && [2304, 2552].includes(d.code));
    assert.deepEqual(missing.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), [], page);
    assert.doesNotMatch(read(file), /renderDashboard|loadDashboard|hydrateCachedDashboard/, page);
  }
});

test("per-page admin payloads stay well below the retired single-file size", () => {
  for (const page of adminPages) {
    assert.ok(statSync(new URL(`assets/admin-${page}.js`, root)).size < 64 * 1024, `${page} script`);
    assert.ok(statSync(new URL(`assets/admin-${page}.css`, root)).size < 24 * 1024, `${page} styles`);
  }
});

test("the shared core keeps bulk delete and icon scanning bounded", () => {
  const core = read("assets/admin-src/core.js");
  assert.match(core, /const bulkConfigs = \{\}/);
  assert.doesNotMatch(read("assets/admin-src/boot.js"), /observe\(document\.body/);
  assert.match(read("assets/admin-src/boot.js"), /requestAnimationFrame/);
});