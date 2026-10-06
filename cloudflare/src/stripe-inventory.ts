import type { Env } from "./types";

type BookSnapshot = {
  bookId: string; sku: string; title: string; synopsis: string; shortDescription: string;
  stock: number; status: string; price: number; stripeProductId: string;
  desiredStock: number; desiredStatus: string;
};
type SyncOptions = { bookId?: string; limit?: number; force?: boolean };
type StripeProduct = { id?: string };
type StripeSearch = { data?: StripeProduct[]; error?: { message?: string } };
const STRIPE_API = "https://api.stripe.com/v1";
const MAX_BATCH = 100;

function clipped(value: unknown, length = 400): string {
  return String(value || "Stripe inventory sync failed.").replace(/[\r\n\t]+/g, " ").slice(0, length);
}
function formFor(book: BookSnapshot): URLSearchParams {
  const form = new URLSearchParams();
  form.set("name", book.title.slice(0, 250) || book.sku);
  const description = (book.shortDescription || book.synopsis || "").slice(0, 500);
  if (description) form.set("description", description);
  form.set("active", book.status !== "Archived" ? "true" : "false");
  form.set("metadata[jpp_book_id]", book.bookId);
  form.set("metadata[jpp_sku]", book.sku);
  form.set("metadata[jpp_stock_quantity]", String(Math.max(0, Math.floor(book.desiredStock))));
  form.set("metadata[jpp_inventory_status]", book.desiredStatus.slice(0, 100));
  form.set("metadata[jpp_inventory_source]", "jackrabbitpunkinpublishing.com");
  return form;
}
async function stripeRequest<T>(env: Env, path: string, method: "GET" | "POST", body?: URLSearchParams, idempotencyKey?: string): Promise<T> {
  const token = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!token || token.startsWith("replace-")) throw new Error("STRIPE_SECRET_KEY is not configured.");
  const headers = new Headers({ Authorization: "Bearer " + token });
  if (body) headers.set("Content-Type", "application/x-www-form-urlencoded");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey.slice(0, 240));
  const response = await fetch(STRIPE_API + path, { method, headers, body: body?.toString(), signal: AbortSignal.timeout(12000) });
  const data = await response.json().catch(() => ({})) as T & StripeSearch;
  if (!response.ok) throw new Error(clipped(data.error?.message || "Stripe returned HTTP " + response.status));
  return data;
}
async function findOrCreateProduct(env: Env, book: BookSnapshot): Promise<{ id: string; created: boolean }> {
  if (book.stripeProductId) return { id: book.stripeProductId, created: false };
  const values = [
    ["jpp_book_id", book.bookId],
    ["jpp_sku", book.sku],
    ["sku", book.sku],
  ];
  for (const [key, value] of values) {
    const query = "metadata['" + key + "']:'" + value.replace(/['\\]/g, "") + "'";
    const search = await stripeRequest<StripeSearch>(env, "/products/search?query=" + encodeURIComponent(query) + "&limit=1", "GET");
    const existing = search.data?.[0]?.id;
    if (existing) return { id: existing, created: false };
  }
  const created = await stripeRequest<StripeProduct>(env, "/products", "POST", formFor(book), "jpp-inventory-product-" + book.bookId);
  if (!created.id) throw new Error("Stripe did not return a product ID.");
  return { id: created.id, created: true };
}
async function updateProduct(env: Env, productId: string, book: BookSnapshot) {
  const value = [book.bookId, book.sku, book.title, book.shortDescription || book.synopsis, book.desiredStock, book.desiredStatus].join("\0");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  await stripeRequest<StripeProduct>(env, "/products/" + encodeURIComponent(productId), "POST", formFor(book), "jpp-inventory-" + book.bookId + "-" + key);
}
export async function syncStripeInventory(env: Env, options: SyncOptions = {}) {
  const token = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!token || token.startsWith("replace-")) {
    return { configured: false, requested: 0, synced: 0, failed: 0, message: "Stripe inventory sync is waiting for STRIPE_SECRET_KEY." };
  }
  const limit = Math.max(1, Math.min(MAX_BATCH, Math.floor(options.limit || 25)));
  const force = Boolean(options.force);
  const statement = options.bookId
    ? env.DB.prepare("SELECT m.book_id AS bookId, m.stripe_product_id AS stripeProductId, m.desired_stock AS desiredStock, m.desired_status AS desiredStatus, b.sku, b.title, b.synopsis, b.short_description AS shortDescription, b.stock, b.status, b.price FROM stripe_inventory_mirror m JOIN books b ON b.id = m.book_id WHERE m.book_id = ?1").bind(options.bookId)
    : env.DB.prepare("SELECT m.book_id AS bookId, m.stripe_product_id AS stripeProductId, m.desired_stock AS desiredStock, m.desired_status AS desiredStatus, b.sku, b.title, b.synopsis, b.short_description AS shortDescription, b.stock, b.status, b.price FROM stripe_inventory_mirror m JOIN books b ON b.id = m.book_id WHERE (?1 = 1 OR m.sync_status = 'pending' OR (m.sync_status = 'error' AND datetime(m.last_attempt_at) <= datetime('now', '-15 minutes'))) AND (m.sync_status != 'syncing' OR datetime(m.last_attempt_at) <= datetime('now', '-2 minutes')) ORDER BY CASE m.sync_status WHEN 'pending' THEN 0 ELSE 1 END, m.updated_at LIMIT ?2").bind(force ? 1 : 0, limit);
  const result = await statement.all<BookSnapshot>();
  const books = result.results || [];
  let synced = 0;
  let failed = 0;
  for (const book of books) {
    const claim = await env.DB.prepare("UPDATE stripe_inventory_mirror SET sync_status = 'syncing', last_attempt_at = datetime('now'), last_error = '' WHERE book_id = ?1 AND (?2 = 1 OR sync_status = 'pending' OR (sync_status = 'error' AND datetime(last_attempt_at) <= datetime('now', '-15 minutes'))) AND (sync_status != 'syncing' OR datetime(last_attempt_at) <= datetime('now', '-2 minutes')) RETURNING book_id").bind(book.bookId, force ? 1 : 0).first<{ book_id: string }>();
    if (!claim) continue;
    try {
      let product = await findOrCreateProduct(env, book);
      if (!product.created) {
        try {
          await updateProduct(env, product.id, book);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!book.stripeProductId || !/no such product|resource_missing/i.test(message)) throw error;
          product = await findOrCreateProduct(env, { ...book, stripeProductId: "" });
          if (!product.created) await updateProduct(env, product.id, book);
        }
      }
      const productId = product.id;
      const saved = await env.DB.prepare("UPDATE stripe_inventory_mirror SET stripe_product_id = ?2, synced_stock = ?3, sync_status = 'synced', last_synced_at = datetime('now'), last_error = '', updated_at = datetime('now') WHERE book_id = ?1 AND sync_status = 'syncing' AND desired_stock = ?3 AND desired_status = ?4").bind(book.bookId, productId, book.desiredStock, book.desiredStatus).run();
      if (Number(saved.meta?.changes || 0) === 1) synced += 1;
    } catch (error) {
      failed += 1;
      await env.DB.prepare("UPDATE stripe_inventory_mirror SET sync_status = 'error', last_error = ?2, updated_at = datetime('now') WHERE book_id = ?1 AND sync_status = 'syncing' AND desired_stock = ?3 AND desired_status = ?4").bind(book.bookId, clipped(error instanceof Error ? error.message : error), book.desiredStock, book.desiredStatus).run();
    }
  }
  return { configured: true, requested: books.length, synced, failed, message: failed ? "Some Stripe products need another sync attempt." : "Stripe product inventory metadata is up to date." };
}
