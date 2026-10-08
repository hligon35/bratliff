import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("Square catalog products remain visible when inventory counts fail", async () => {
  const source = readFileSync(path.join(REPO_ROOT, "cloudflare/src/square-inventory.ts"), "utf8");
  const javascript = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  const moduleUrl = "data:text/javascript;base64," + Buffer.from(javascript).toString("base64");
  const { listSquareCatalog } = await import(moduleUrl);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/v2/catalog/list")) {
      return new Response(JSON.stringify({ objects: [{
        id: "ITEM-1",
        type: "ITEM",
        item_data: {
          name: "Test Book",
          variations: [{
            id: "VARIATION-1",
            type: "ITEM_VARIATION",
            item_variation_data: {
              name: "Paperback",
              sku: "TEST-BOOK",
              price_money: { amount: 1200, currency: "USD" },
              track_inventory: true,
            },
          }],
        },
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ errors: [{ code: "INSUFFICIENT_SCOPES", detail: "Inventory read is unavailable." }] }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const db = { prepare() { return { bind() { return { all: async () => ({ results: [] }) }; } }; } };
    const result = await listSquareCatalog({
      DB: db,
      SQUARE_ACCESS_TOKEN: "test-token",
      SQUARE_ENVIRONMENT: "production",
      SQUARE_LOCATION_ID: "LOCATION-1",
      SQUARE_API_VERSION: "2026-09-16",
    });
    assert.equal(result.variations.length, 1);
    assert.equal(result.variations[0].itemName, "Test Book");
    assert.equal(result.variations[0].quantity, null);
    assert.match(result.inventoryError, /inventory counts could not be read/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
