import type { Env } from "./types";

type SyncOptions = { bookId?: string; force?: boolean; limit?: number };
type SyncRow = { bookId: string; variationId: string; desiredStock: number };
type SquareError = { detail?: string; code?: string };
type SquarePayload = { errors?: SquareError[]; objects?: CatalogObject[]; cursor?: string; counts?: InventoryCount[] };
type CatalogObject = {
  id?: string;
  type?: string;
  is_deleted?: boolean;
  item_data?: {
    name?: string;
    description?: string;
    variations?: CatalogObject[];
  };
  item_variation_data?: {
    name?: string;
    sku?: string;
    price_money?: { amount?: number; currency?: string };
    track_inventory?: boolean;
    location_overrides?: Array<{ location_id?: string; track_inventory?: boolean; price_money?: { amount?: number; currency?: string } }>;
  };
};
type InventoryCount = {
  catalog_object_id?: string;
  location_id?: string;
  quantity?: string;
  state?: string;
};
export type SquareCatalogVariation = {
  itemId: string;
  itemName: string;
  variationId: string;
  variationName: string;
  sku: string;
  priceCents: number | null;
  currency: string;
  trackInventory: boolean | null;
  quantity: number | null;
  linkedBookId: string;
  linkedBookTitle: string;
};
const MAX_BATCH = 100;

function clean(value: unknown, length = 400): string {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, length);
}
function squareBase(env: Env): string {
  return env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}
async function squareRequest<T extends SquarePayload>(
  env: Env,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  const token = String(env.SQUARE_ACCESS_TOKEN || "").trim();
  if (!token || token.startsWith("replace-")) throw new Error("Square access token is not configured.");
  const response = await fetch(squareBase(env) + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Square-Version": env.SQUARE_API_VERSION || "2024-10-17",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({})) as T;
  if (!response.ok || payload.errors?.length) {
    const detail = payload.errors?.map((error) => error.detail || error.code).filter(Boolean).join("; ");
    throw new Error(clean(detail || "Square returned HTTP " + response.status));
  }
  return payload;
}

export async function listSquareCatalog(env: Env, cursor = "") {
  const params = new URLSearchParams({ types: "ITEM" });
  if (cursor) params.set("cursor", cursor);
  const catalog = await squareRequest<SquarePayload>(env, "/v2/catalog/list?" + params.toString(), "GET");
  const items = (catalog.objects || []).filter((item) => item.type === "ITEM" && !item.is_deleted && item.id);
  const variationIds = items.flatMap((item) => (item.item_data?.variations || [])
    .filter((variation) => variation.type === "ITEM_VARIATION" && variation.id)
    .map((variation) => variation.id as string));
  const quantityByVariation = new Map<string, number>();
  const locationId = String(env.SQUARE_LOCATION_ID || "").trim();
  if (variationIds.length && locationId) {
    for (let offset = 0; offset < variationIds.length; offset += 1000) {
      let countCursor = "";
      do {
        const body: Record<string, unknown> = {
          catalog_object_ids: variationIds.slice(offset, offset + 1000),
          location_ids: [locationId],
          states: ["IN_STOCK"],
          limit: 1000,
        };
        if (countCursor) body.cursor = countCursor;
        const inventory = await squareRequest<SquarePayload>(env, "/v2/inventory/counts/batch-retrieve", "POST", body);
        for (const count of inventory.counts || []) {
          if (count.catalog_object_id && count.state === "IN_STOCK" && count.location_id === locationId) {
            quantityByVariation.set(count.catalog_object_id, (quantityByVariation.get(count.catalog_object_id) || 0) + Number(count.quantity || 0));
          }
        }
        countCursor = inventory.cursor || "";
      } while (countCursor);
    }
  }
  const variations: SquareCatalogVariation[] = [];
  for (const item of items) {
    const itemName = clean(item.item_data?.name, 250);
    for (const variation of item.item_data?.variations || []) {
      const data = variation.item_variation_data;
      if (variation.type !== "ITEM_VARIATION" || !variation.id || !data) continue;
      const locationOverride = data.location_overrides?.find((entry) => entry.location_id === locationId);
      const variationPrice = locationOverride?.price_money || data.price_money;
      const inventoryTracking = locationOverride && typeof locationOverride.track_inventory === "boolean"
        ? locationOverride.track_inventory
        : data.track_inventory;
      variations.push({
        itemId: item.id as string,
        itemName,
        variationId: variation.id,
        variationName: clean(data.name, 200),
        sku: clean(data.sku, 120),
        priceCents: Number.isFinite(Number(variationPrice?.amount)) ? Number(variationPrice?.amount) : null,
        currency: clean(variationPrice?.currency || "USD", 3),
        trackInventory: typeof inventoryTracking === "boolean" ? inventoryTracking : null,
        quantity: quantityByVariation.has(variation.id) ? quantityByVariation.get(variation.id)! : null,
        linkedBookId: "",
        linkedBookTitle: "",
      });
    }
  }
  const links = new Map<string, { bookId: string; title: string }>();
  for (let offset = 0; offset < variations.length; offset += 80) {
    const ids = variations.slice(offset, offset + 80).map((variation) => variation.variationId);
    if (!ids.length) continue;
    const placeholders = ids.map((_, index) => "?" + (index + 1)).join(",");
    const linked = await env.DB.prepare("SELECT id AS bookId, title, square_catalog_variation_id AS variationId FROM books WHERE square_catalog_variation_id IN (" + placeholders + ")")
      .bind(...ids).all<{ bookId: string; title: string; variationId: string }>();
    for (const row of linked.results || []) links.set(row.variationId, { bookId: row.bookId, title: row.title });
  }
  return {
    variations: variations.map((variation) => ({
      ...variation,
      linkedBookId: links.get(variation.variationId)?.bookId || "",
      linkedBookTitle: links.get(variation.variationId)?.title || "",
    })),
    nextCursor: catalog.cursor || "",
    locationId,
  };
}

export async function setSquareVariationCount(env: Env, variationId: string, quantity: number) {
  const locationId = String(env.SQUARE_LOCATION_ID || "").trim();
  if (!locationId || locationId.startsWith("replace-")) throw new Error("Square location is not configured.");
  if (!variationId || variationId.length > 200) throw new Error("A valid Square catalog variation is required.");
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000) throw new Error("Enter a whole-number stock count from 0 to 1,000,000.");
  await squareRequest<SquarePayload>(env, "/v2/inventory/changes/batch-create", "POST", {
    idempotency_key: crypto.randomUUID(),
    changes: [{
      type: "PHYSICAL_COUNT",
      physical_count: {
        catalog_object_id: variationId,
        location_id: locationId,
        quantity: String(quantity),
        state: "IN_STOCK",
        occurred_at: new Date().toISOString(),
      },
    }],
  });
}

export async function syncSquareInventory(env: Env, options: SyncOptions = {}) {
  const token = String(env.SQUARE_ACCESS_TOKEN || "").trim();
  const locationId = String(env.SQUARE_LOCATION_ID || "").trim();
  if (!token || token.startsWith("replace-") || !locationId || locationId.startsWith("replace-")) {
    return { configured: false, requested: 0, synced: 0, failed: 0, unlinked: 0, message: "Square inventory sync needs SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID." };
  }
  const force = Boolean(options.force);
  const limit = Math.max(1, Math.min(MAX_BATCH, Math.floor(options.limit || MAX_BATCH)));
  const statement = options.bookId
    ? env.DB.prepare("SELECT book_id AS bookId, variation_id AS variationId, desired_stock AS desiredStock FROM square_inventory_sync WHERE book_id=?1 AND (?2=1 OR (sync_status='pending' OR (sync_status='error' AND datetime(last_attempt_at)<=datetime('now','-5 minutes'))))").bind(options.bookId, force ? 1 : 0)
    : env.DB.prepare("SELECT book_id AS bookId, variation_id AS variationId, desired_stock AS desiredStock FROM square_inventory_sync WHERE (?1=1 OR (sync_status='pending' OR (sync_status='error' AND datetime(last_attempt_at)<=datetime('now','-5 minutes'))) OR (sync_status='syncing' AND datetime(last_attempt_at)<=datetime('now','-2 minutes'))) ORDER BY updated_at LIMIT ?2").bind(force ? 1 : 0, limit);
  const result = await statement.all<SyncRow>();
  const rows = result.results || [];
  let synced = 0, failed = 0, unlinked = 0;
  const batchRows: SyncRow[] = [];
  for (const row of rows) {
    if (!row.variationId) {
      await env.DB.prepare("UPDATE square_inventory_sync SET sync_status='unlinked',last_error='Add the Square Catalog Variation ID to this book.',updated_at=datetime('now') WHERE book_id=?1").bind(row.bookId).run();
      unlinked++;
      continue;
    }
    const claimed = await env.DB.prepare("UPDATE square_inventory_sync SET sync_status='syncing',last_attempt_at=datetime('now'),updated_at=datetime('now') WHERE book_id=?1 AND (?2=1 OR (sync_status='pending' OR (sync_status='error' AND datetime(last_attempt_at)<=datetime('now','-5 minutes'))) OR (sync_status='syncing' AND datetime(updated_at)<=datetime('now','-2 minutes'))) RETURNING book_id").bind(row.bookId, force ? 1 : 0).first();
    if (claimed) batchRows.push(row);
  }
  for (let offset = 0; offset < batchRows.length; offset += MAX_BATCH) {
    const batch = batchRows.slice(offset, offset + MAX_BATCH);
    try {
      await squareRequest<SquarePayload>(env, "/v2/inventory/changes/batch-create", "POST", {
        idempotency_key: crypto.randomUUID(),
        changes: batch.map((row) => ({
          type: "PHYSICAL_COUNT",
          physical_count: {
            catalog_object_id: row.variationId,
            location_id: locationId,
            quantity: String(Math.max(0, Math.floor(row.desiredStock))),
            state: "IN_STOCK",
            occurred_at: new Date().toISOString(),
          },
        })),
      });
      for (const row of batch) {
        const saved = await env.DB.prepare("UPDATE square_inventory_sync SET sync_status='synced',synced_stock=?2,last_synced_at=datetime('now'),last_error='',updated_at=datetime('now') WHERE book_id=?1 AND sync_status='syncing' AND desired_stock=?2 AND variation_id=?3")
          .bind(row.bookId, row.desiredStock, row.variationId).run();
        if (Number(saved.meta?.changes || 0) === 1) synced++;
      }
    } catch (error) {
      failed += batch.length;
      for (const row of batch) {
        await env.DB.prepare("UPDATE square_inventory_sync SET sync_status='error',last_error=?2,updated_at=datetime('now') WHERE book_id=?1 AND sync_status='syncing' AND desired_stock=?3 AND variation_id=?4")
          .bind(row.bookId, clean(error instanceof Error ? error.message : error), row.desiredStock, row.variationId).run();
      }
    }
  }
  return { configured: true, requested: rows.length, synced, failed, unlinked, message: failed ? "Some Square inventory counts need retry." : unlinked ? "Link unlinked books to Square catalog variations." : "Square inventory counts match the bookstore." };
}
