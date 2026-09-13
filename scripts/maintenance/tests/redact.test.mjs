import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../lib/redact.mjs";

test("redacts Bearer authorization headers", () => {
  const input = "Authorization: Bearer abcdEFGH12345678";
  assert.doesNotMatch(redact(input), /abcdEFGH12345678/);
});

test("redacts JWT-looking values", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpc2lzYXNpZ25hdHVyZQ";
  const output = redact(`session=${jwt}`);
  assert.doesNotMatch(output, /eyJhbGciOiJIUzI1NiJ9/);
  assert.match(output, /REDACTED_JWT/);
});

test("redacts Square-style access tokens", () => {
  // Built by concatenation (not a single literal) so this synthetic test
  // fixture doesn't get flagged by GitHub push protection / secret scanners
  // as a real committed credential.
  const fakeToken = "sq0atp-" + "abcdefghij1234567890AB";
  const output = redact(`token: ${fakeToken}`);
  assert.doesNotMatch(output, new RegExp(fakeToken));
});

test("redacts KEY=value style secret env lines", () => {
  const output = redact("SQUARE_ACCESS_TOKEN=supersecretvalue123\nSAFE_VALUE=hello");
  assert.doesNotMatch(output, /supersecretvalue123/);
  assert.match(output, /SAFE_VALUE=hello/);
});

test("redacts email addresses (PII)", () => {
  const output = redact("Contact hligon@getsparqd.com for details.");
  assert.doesNotMatch(output, /hligon@getsparqd\.com/);
  assert.match(output, /REDACTED_EMAIL/);
});

test("leaves ordinary non-secret text untouched", () => {
  const input = "npm outdated found 3 packages; TypeScript compiled with 0 errors.";
  assert.equal(redact(input), input);
});
