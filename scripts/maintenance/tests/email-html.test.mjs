import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../../cloudflare/src/email-html.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sanitizeEmailHtml, htmlToText, cleanLegacyEmailText } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

test("sanitizer removes scripts, handlers and dangerous urls", () => {
  const out = sanitizeEmailHtml('<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="&#106;avascript:alert(1)">bad2</a><iframe src="https://e.com"></iframe>');
  assert.doesNotMatch(out, /script|onclick|javascript|iframe|alert/i);
  assert.match(out, /Hi/);
});

test("sanitizer keeps safe links with hardened rel and styles", () => {
  const out = sanitizeEmailHtml('<style>p{color:red}</style><a href="https://example.com">x</a>');
  assert.match(out, /rel="noopener noreferrer nofollow"/);
  assert.match(out, /target="_blank"/);
  assert.match(out, /color:red/);
});

test("sanitizer blocks css imports and escapes stray angle brackets", () => {
  const out = sanitizeEmailHtml('<style>@import url(https://evil.test/x.css);p{color:blue}</style>1 < 2');
  assert.doesNotMatch(out, /@import/i);
  assert.doesNotMatch(out, /1 < 2/);
});

test("htmlToText drops styles and keeps readable text", () => {
  const out = htmlToText("<style>p{color:red}</style><p>Hello</p><p>World</p>");
  assert.doesNotMatch(out, /color/);
  assert.match(out, /Hello\s+World/);
});

test("cleanLegacyEmailText strips stylesheet text from legacy bodies", () => {
  const legacy = "Renewal Notice\n\n/* Reset */\nbody {\n margin: 0;\n}\n@media only screen and (max-width: 600px) {\n .c {\n width: 100% !important;\n }\n}\nPlease pay invoice 7867601.";
  const cleaned = cleanLegacyEmailText(legacy);
  assert.equal(cleaned, "Renewal Notice\n\nPlease pay invoice 7867601.");
  assert.equal(cleanLegacyEmailText("Plain message, no styles."), "Plain message, no styles.");
});