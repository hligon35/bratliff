#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
dotenv.config({ path: ".secrets.sandbox", override: true });

const REVIEWER = "hligon@getsparqd.com";
const DATABASE = "bratliff-platform-sandbox";
const WRANGLER_CONFIG = "cloudflare/wrangler.jsonc";
// The review generator ignores deployment URL values in .env; all site/API traffic is pinned here.
const SITE_URL = "https://jrpp.alphazonelabs.com";
if (new URL(SITE_URL).hostname !== "jrpp.alphazonelabs.com") throw new Error("Sandbox host mismatch.");
const COUNT = parseCountArg();
const runId = parseRunIdArg() || makeRunId();
const apply = process.argv.includes("--apply");
const cleanupId = parseCleanupArg();

const formKinds = [
  "contact",
  "newsletter",
  "speaking",
  "bookClub",
  "bookNotification",
];

function parseCountArg() {
  const i = process.argv.indexOf("--count");
  if (i === -1) return 10;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 10 || n > 100) {
    throw new Error("--count must be an integer from 10 to 100.");
  }
  return n;
}
function parseRunIdArg() {
  const i = process.argv.indexOf("--run-id");
  if (i === -1) return "";
  const value = String(process.argv[i + 1] || "");
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(value)) {
    throw new Error("--run-id must be 4–40 letters, numbers, dashes, or underscores.");
  }
  return value;
}
function parseCleanupArg() {
  const arg = process.argv.find((value) => value.startsWith("--cleanup="));
  if (!arg) return "";
  const value = arg.slice("--cleanup=".length);
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(value)) {
    throw new Error("--cleanup requires a valid run ID, for example --cleanup=20260925_120000_ab12.");
  }
  return value;
}
function makeRunId() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const salt = Math.random().toString(36).slice(2, 6);
  return stamp + "_" + salt;
}
function q(value) {
  return "'" + String(value == null ? "" : value).replace(/'/g, "''") + "'";
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function sqlInsert(table, columns, values) {
  return "INSERT OR IGNORE INTO " + table + " (" + columns.join(", ") + ") VALUES (" +
    values.map((value) => q(value)).join(", ") + ");";
}
function sampleEmail(id) {
  return "test+" + runId + "." + id + "@example.invalid";
}
function sampleForm(type, n) {
  const label = pad(n);
  const email = sampleEmail(type + "." + label);
  const common = {
    formType: type,
    name: "QA Test Person " + label,
    email,
    phone: "555-010-" + String(n).padStart(4, "0"),
    subject: "Other",
    message: "[TEST DATA " + runId + "] Contact form review entry " + label + ".",
    organization: "Sandbox QA Group " + label,
    type: ["Keynote", "Panel Discussion", "Workshop", "Book Club", "Author Visit", "Interview/Podcast", "Community Event", "Other"][n % 8],
    date: "2026-10-" + pad((n % 28) + 1),
    location: "Virtual",
    audience: "Community readers",
    details: "[TEST DATA " + runId + "] Generated speaking request " + label + ".",
    preferredSpeaker: ["Barbara J. Ratliff", "Charles Ratliff", "Either", "Not Sure"][n % 4],
    speakingBudget: ["Budget Available", "Community or Nonprofit Request", "Not Yet Determined"][n % 3],
    group: "Sandbox Book Club " + label,
    size: String(8 + n),
    format: ["In Person", "Virtual", "Not Sure Yet"][n % 3],
    request: ["Discussion Guide", "Book Club Visit", "Autographed Copies", "Read It Forward Information", "Other", "Battles Beyond the Waves", "Other / Not Sure Yet"][n % 7],
    notes: "[TEST DATA " + runId + "] Book club test notes " + label + ".",
    title: "Sandbox QA Book " + label,
    pageUrl: SITE_URL + "/" + (type === "speaking" ? "speaking.html" : type === "bookClub" ? "book-club.html" : type === "bookNotification" ? "books.html" : "contact.html"),
    userAgent: "JPP sandbox QA data generator",
    consent: "false",
  };
  if (type === "newsletter") {
    common.name = "";
    common.phone = "";
    common.subject = "";
    common.message = "";
    common.consent = "false";
  }
  if (type === "bookNotification") {
    common.name = "";
    common.phone = "";
    common.subject = "";
    common.message = "";
    common.title = "Sandbox QA Book " + pad(((n - 1) % COUNT) + 1);
  }
  return common;
}
function makeForms() {
  const rows = [];
  for (const type of formKinds) {
    for (let n = 1; n <= COUNT; n += 1) {
      rows.push(sampleForm(type, n));
    }
  }
  return rows;
}
function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
}

function makeSeedSql(forms) {
  const statements = [];
  const prefix = "TEST-" + runId + "-";
  const books = [];

  for (let n = 1; n <= COUNT; n += 1) {
    const id = prefix + "BOOK-" + pad(n);
    const sku = prefix + "SKU-" + pad(n);
    const title = "Sandbox QA Book " + pad(n);
    books.push({ id, sku, title, price: 12 + n });
    statements.push(sqlInsert("books",
      ["id", "sku", "isbn", "title", "subtitle", "author", "synopsis", "short_description", "format", "category", "price", "compare_price", "stock", "low_stock_threshold", "image_url", "featured", "coming_soon", "preorder", "status", "publication_date"],
      [id, sku, "", title, "[TEST DATA]", "JPP QA Generator", "Generated sandbox catalog entry. Not a retail or publisher purchase.", "Sandbox review catalog item.", "Paperback", "QA Test Data", 12 + n, 0, 25, 5, "assets/bookFeature.png", 0, 0, 0, "Published", "2026-01-01"]));
    statements.push(sqlInsert("inventory_events",
      ["id", "book_id", "sku", "title", "change_qty", "previous_qty", "new_qty", "reason", "order_number", "admin_email", "notes"],
      [prefix + "INV-" + pad(n), id, sku, title, 5, 20, 25, "QA test inventory adjustment", "", "test-data@example.invalid", "[TEST DATA " + runId + "] No physical stock changed."]));
    statements.push(sqlInsert("authors",
      ["id", "name", "title", "short_intro", "biography", "portrait_url", "portrait_alt", "website_url", "social_links", "related_book_ids", "cta_label", "cta_url", "status", "display_order"],
      [prefix + "AUTHOR-" + pad(n), "Sandbox QA Author " + pad(n), "Test author profile", "[TEST DATA] Draft profile for sandbox review.", "Generated author entry for reviewing the admin editor. This is not a real author profile.", "assets/femaleFeature.png", "Sandbox QA sample portrait", "", "[]", JSON.stringify([id]), "Read more", SITE_URL + "/about.html", "Draft", n]));
    statements.push(sqlInsert("newsletter_campaigns",
      ["campaign_id", "status", "title", "subject", "preview_text", "audience", "from_name", "hero_message", "closing_note"],
      [prefix + "CAMPAIGN-" + pad(n), "Draft", "[TEST DATA " + runId + "] QA Campaign " + pad(n), "Sandbox newsletter preview " + pad(n), "Synthetic draft. Do not send.", "all", "JPP Sandbox QA", "Generated campaign content for admin review.", "Test campaign only; do not send."]));
    statements.push(sqlInsert("contacts",
      ["id", "email", "display_name", "source", "newsletter_consent", "unsubscribed", "suppressed", "tags", "notes", "is_sponsor", "is_customer"],
      [prefix + "CONTACT-" + pad(n), sampleEmail("contact." + pad(n)), "Sandbox QA Contact " + pad(n), "review_data_generator", 0, 0, 0, JSON.stringify(["TEST DATA", runId]), "[TEST DATA " + runId + "] Synthetic contact; no marketing consent.", 0, 0]));
    statements.push(sqlInsert("newsletter_subscribers",
      ["email", "consent", "status", "source", "notes"],
      [sampleEmail("subscriber." + pad(n)), 0, "inactive", "review_data_generator", "[TEST DATA " + runId + "] Inactive synthetic record; excluded from sends."]));
    statements.push(sqlInsert("analytics_events",
      ["id", "event_type", "page_path", "referrer_category", "device_category", "book_id", "meta_json", "visitor_hash"],
      [prefix + "ANALYTICS-" + pad(n), ["page_view", "book_view", "add_to_cart", "checkout_start"][n % 4], ["/", "/books.html", "/read-it-forward.html"][n % 3], "test", ["desktop", "mobile", "tablet"][n % 3], id, JSON.stringify({ testData: true, runId, sequence: n }), prefix + "VISITOR-" + pad(n)]));
    statements.push(sqlInsert("audit_log",
      ["id", "admin_email", "action", "entity_type", "entity_id", "detail"],
      [prefix + "AUDIT-" + pad(n), "test-data@example.invalid", ["test_book_created", "test_author_created", "test_campaign_created"][n % 3], ["book", "author", "newsletter_campaign"][n % 3], id, "[TEST DATA " + runId + "] Synthetic admin activity entry."]));
  }

  for (let n = 1; n <= COUNT; n += 1) {
    statements.push(sqlInsert("book_interests",
      ["id", "contact_id", "book_id", "source_page", "status"],
      [prefix + "INTEREST-" + pad(n), prefix + "CONTACT-" + pad(n), books[n - 1].id, SITE_URL + "/books.html", "Active"]));
  }

  // Create real Square Sandbox checkout sessions through the site API after seeding its catalog.

  // Sponsor records are created by the sandbox checkout API below.

  for (let i = 0; i < forms.length; i += 1) {
    const form = forms[i];
    const index = pad((i % COUNT) + 1);
    const id = prefix + "FORM-" + form.formType + "-" + index;
    statements.push(sqlInsert("form_submissions",
      ["id", "form_type", "created_at", "identity_key", "status", "name", "email", "phone", "subject", "message", "organization", "event_type", "event_date", "location", "audience", "details", "group_name", "group_size", "preferred_format", "request_text", "notes", "title", "page_url", "user_agent", "consent", "preferred_speaker", "speaking_budget"],
      [id, form.formType, "2026-09-25 13:" + pad(i % 60) + ":00", prefix + "IDENTITY-" + String(i + 1).padStart(4, "0"), "New", form.name, form.email, form.phone, form.subject, form.message, form.organization, form.type, form.date, form.location, form.audience, form.details, form.group, form.size, form.format, form.request, form.notes, form.title, form.pageUrl, form.userAgent, 0, form.preferredSpeaker, form.speakingBudget]));
  }

  return statements.join("\n") + "\n";
}

function makeCleanupSql(id) {
  const prefix = "TEST-" + id + "-";
  const subscriber = "test+" + id + ".%";
  const marker = q("%[TEST DATA " + id + "]%");
  return [
    "DELETE FROM order_items WHERE order_number IN (SELECT order_number FROM orders WHERE notes LIKE " + marker + ");",
    "DELETE FROM checkout_sessions WHERE session_id IN (SELECT order_number FROM orders WHERE notes LIKE " + marker + ");",
    "DELETE FROM orders WHERE notes LIKE " + marker + ";",
    "DELETE FROM sponsor_payments WHERE sponsor_id IN (SELECT id FROM sponsors WHERE admin_notes LIKE " + marker + ");",
    "DELETE FROM sponsors WHERE admin_notes LIKE " + marker + " OR id GLOB " + q(prefix + "SPONSOR-*") + ";",
    "DELETE FROM inventory_events WHERE id GLOB " + q(prefix + "INV-*") + ";",
    "DELETE FROM book_interests WHERE id GLOB " + q(prefix + "INTEREST-*") + ";",
    "DELETE FROM authors WHERE id GLOB " + q(prefix + "AUTHOR-*") + ";",
    "DELETE FROM newsletter_campaigns WHERE campaign_id GLOB " + q(prefix + "CAMPAIGN-*") + ";",
    "DELETE FROM analytics_events WHERE id GLOB " + q(prefix + "ANALYTICS-*") + ";",
    "DELETE FROM audit_log WHERE id GLOB " + q(prefix + "AUDIT-*") + ";",
    "DELETE FROM form_submissions WHERE id GLOB " + q(prefix + "FORM-*") + ";",
    "DELETE FROM newsletter_subscribers WHERE email GLOB " + q(subscriber.replace("%", "*")) + " AND source = 'review_data_generator';",
    "DELETE FROM contacts WHERE id GLOB " + q(prefix + "CONTACT-*") + ";",
    "DELETE FROM books WHERE id GLOB " + q(prefix + "BOOK-*") + ";",
  ].join("\n") + "\n";
}

function quoteWindowsShellArg(value) {
  const text = String(value);
  return '"' + text.replace(/"/g, '\\"') + '"';
}
function wranglerArgs(args) {
  const values = ["wrangler", ...args];
  return process.platform === "win32" ? values.map(quoteWindowsShellArg) : values;
}
function runWrangler(args) {
  const result = spawnSync("npx", wranglerArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Wrangler exited with code " + result.status + ".");
}
async function sendReviewDigest(forms, bookOrders, sponsorResults, failures) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.REVIEW_FROM_EMAIL || process.env.MAIL_FROM_EMAIL || "no-reply@jackrabbitpunkinpublishing.com";
  if (!apiKey) throw new Error("Set RESEND_API_KEY before applying.");
  const groups = formKinds.map((type) => ({ type, rows: forms.filter((form) => form.formType === type) }));
  const htmlGroups = groups.map((group) => "<h2>" + htmlEscape(group.type) + " (" + group.rows.length + ")</h2><ol>" +
    group.rows.map((form) => "<li>" + Object.entries(form).filter(([key]) => key !== "formType").map(([key, value]) => "<strong>" + htmlEscape(key) + ":</strong> " + htmlEscape(value)).join("<br>") + "</li>").join("") + "</ol>").join("");
  const textGroups = groups.map((group) => group.type + " (" + group.rows.length + ")\n" +
    group.rows.map((form, index) => (index + 1) + ". " + Object.entries(form).filter(([key]) => key !== "formType").map(([key, value]) => key + ": " + value).join(" | ")).join("\n")).join("\n\n");
  const summary = "Run: " + runId + "\nSandbox: " + SITE_URL + "\nPaid Square Sandbox book orders: " + bookOrders.length +
    "\nPaid sponsor Sandbox payments: " + sponsorResults.length + "\nSynthetic form submissions: " + forms.length + " (" + COUNT + " per type).\n" +
    "No real funds were used. IngramSpark and Amazon purchase paths were not called.\n\nPublished sponsor names:\n" +
    sponsorResults.map((item) => item.package + ": " + item.displayName).join("\n") +
    "\n\nCompleted book orders:\n" + bookOrders.map((item) => item.orderNumber + " (payment " + item.paymentId + ")").join("\n") +
    (failures.length ? "\n\nItems needing attention:\n" + failures.join("\n") : "");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Jackrabbit Punkin Publishing Sandbox <" + fromEmail + ">",
      to: [REVIEWER],
      subject: "Sandbox QA review data — " + runId + " (" + forms.length + " form submissions)",
      text: summary + "\n\n" + textGroups,
      html: "<main><h1>Sandbox QA review data</h1><p>Run " + htmlEscape(runId) + " on " + htmlEscape(SITE_URL) +
        "<br>" + forms.length + " generated form submissions; " + sponsorResults.length + " paid/published sponsor samples.</p>" +
        "<h2>Completed book orders</h2><ul>" + bookOrders.map((item) => "<li>" + htmlEscape(item.orderNumber) + " — payment " + htmlEscape(item.paymentId) + "</li>").join("") + "</ul>" +
        "<h2>Published test sponsors</h2><ul>" + sponsorResults.map((item) => "<li>" + htmlEscape(item.package) + ": " + htmlEscape(item.displayName) + "</li>").join("") + "</ul>" +
        (failures.length ? "<h2>Items needing attention</h2><ul>" + failures.map((item) => "<li>" + htmlEscape(item) + "</li>").join("") + "</ul>" : "") +
        "<p>Square Sandbox only; no real funds. IngramSpark and Amazon purchase paths excluded.</p>" + htmlGroups + "</main>",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Review digest email failed (" + response.status + "): " + JSON.stringify(payload));
  console.log("Review digest sent to " + REVIEWER + " (Resend id: " + (payload.id || "unknown") + ").");
}
const SPONSOR_PACKAGES = ["pagePal", "chapterChampion", "bookshelfBuilder", "literacyTrailblazer"];
const SQUARE_SANDBOX_API = "https://connect.squareupsandbox.com/v2";
async function assertSandboxTarget() {
  const response = await fetch(SITE_URL + "/healthz", { cache: "no-store" });
  const health = await response.json().catch(() => ({}));
  if (!response.ok || health.environment !== "sandbox") {
    throw new Error(
      "Refusing to generate review data: " + SITE_URL +
      " did not identify itself as the sandbox Worker (environment: " +
      String(health.environment || "unknown") + "). Resolve the jrpp domain route before retrying.",
    );
  }
}
function wranglerOutput(args) {
  const result = spawnSync("npx", wranglerArgs(args), { cwd: process.cwd(), encoding: "utf8", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Sandbox D1 operation failed: " + (result.stderr || result.stdout || result.status));
  return result.stdout || "";
}
function readFirstRow(sql) {
  const output = wranglerOutput(["d1", "execute", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox", "--command", sql, "--json"]);
  let parsed; try { parsed = JSON.parse(output); } catch { throw new Error("Unable to parse sandbox D1 query output."); }
  const walk = (value) => {
    if (Array.isArray(value)) { for (const item of value) { const found = walk(item); if (found) return found; } }
    if (value && typeof value === "object") {
      if (Array.isArray(value.results)) return value.results[0] || null;
      for (const item of Object.values(value)) { const found = walk(item); if (found) return found; }
    }
    return null;
  };
  return walk(parsed);
}
function deterministicKey(label) {
  return createHash("sha256").update(runId + "|" + label).digest("hex");
}

// CreateOrder defaults to OPEN. Payment Links instead create DRAFT orders until
// a buyer finishes hosted checkout, so scripted Sandbox card payments use Orders API.
async function createSquareSandboxOrder(referenceId, lineItems, label) {
  const response = await fetch(SQUARE_SANDBOX_API + "/orders", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.SQUARE_ACCESS_TOKEN,
      "Square-Version": process.env.SQUARE_API_VERSION || "2024-10-17",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: deterministicKey("order:" + label),
      order: {
        location_id: process.env.SQUARE_LOCATION_ID,
        reference_id: referenceId,
        line_items,
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  const order = result.order || {};
  if (!response.ok || !order.id) {
    throw new Error("Square Sandbox order creation failed for " + label + " (" + response.status + "): " + JSON.stringify(result.errors || result));
  }
  if (order.state !== "OPEN" && order.state !== "COMPLETED") {
    throw new Error("Square Sandbox order " + order.id + " has state " + String(order.state || "unknown") + "; expected OPEN.");
  }
  return { id: order.id, amountCents: Number(order.total_money?.amount || 0), state: order.state };
}

async function completeSandboxPayment(orderId, amountCents, label) {
  const response = await fetch(SQUARE_SANDBOX_API + "/payments", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.SQUARE_ACCESS_TOKEN,
      "Square-Version": process.env.SQUARE_API_VERSION || "2024-10-17",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_id: "cnon:card-nonce-ok",
      idempotency_key: deterministicKey("payment:" + label),
      amount_money: { amount: amountCents, currency: "USD" },
      location_id: process.env.SQUARE_LOCATION_ID,
      order_id: orderId,
      autocomplete: true,
      note: "[TEST DATA " + runId + "] " + label,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.payment?.id || result.payment.status !== "COMPLETED") {
    throw new Error("Square Sandbox payment failed for " + label + " (" + response.status + "): " + JSON.stringify(result.errors || result));
  }
  return result.payment;
}
async function waitForSql(sql, expected, label) {
  for (let n = 0; n < 30; n += 1) {
    const row = readFirstRow(sql);
    if (row?.status === expected) return row;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for Square webhook to reconcile " + label + " at " + SITE_URL + "/square/webhook.");
}
const SPONSOR_DEFINITIONS = [
  { key: "pagePal", label: "Page Pal", books: 5, amountCents: 10000 },
  { key: "chapterChampion", label: "Chapter Champion", books: 12, amountCents: 25000 },
  { key: "bookshelfBuilder", label: "Bookshelf Builder", books: 25, amountCents: 50000 },
  { key: "literacyTrailblazer", label: "Literacy Trailblazer", books: 50, amountCents: 100000 },
];

async function seedAndPaySponsor(definition, n) {
  const sequence = pad(n);
  const suffix = definition.key + "." + sequence;
  const sponsorId = "TEST-" + runId + "-SPONSOR-" + definition.key + "-" + sequence;
  const localPaymentId = "TEST-" + runId + "-SPAY-" + definition.key + "-" + sequence;
  const payerName = "Sandbox QA Sponsor " + definition.label + " " + sequence;
  const displayName = "Sandbox QA " + definition.label + " " + sequence;
  const payerEmail = sampleEmail("paid-sponsor." + suffix);
  const mailingAddress = definition.key === "literacyTrailblazer"
    ? "123 Sandbox Test Lane, QA City, IN 00000"
    : "";
  const order = await createSquareSandboxOrder(sponsorId, [{
    name: "Read It Forward sponsorship - " + definition.label + " (" + definition.books + " books)",
    quantity: "1",
    base_price_money: { amount: definition.amountCents, currency: "USD" },
  }], "sponsor-" + suffix);
  if (order.amountCents !== definition.amountCents) {
    throw new Error("Square Sandbox order total did not match " + definition.label + " for " + sequence + ".");
  }

  wranglerOutput([
    "d1", "execute", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox",
    "--command",
    "INSERT OR IGNORE INTO sponsors (id, package, books_sponsored, amount_paid_cents, payer_name, payer_email, display_name, entity_type, anonymous, publish_permission, mailing_address, recognition_status, admin_notes, created_at, updated_at) VALUES (" +
      [sponsorId, definition.key, definition.books, definition.amountCents, payerName, payerEmail, displayName, "organization", 0, 1, mailingAddress, "Awaiting Payment", "[TEST DATA " + runId + "] Square Sandbox QA sponsor", "datetime('now')", "datetime('now')"].map((value, index) => index >= 13 ? value : q(value)).join(", ") +
    ")",
  ]);
  wranglerOutput([
    "d1", "execute", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox",
    "--command",
    "INSERT OR IGNORE INTO sponsor_payments (id, sponsor_id, square_order_id, amount_cents, status, created_at, updated_at) VALUES (" +
      [localPaymentId, sponsorId, order.id, definition.amountCents, "pending", "datetime('now')", "datetime('now')"].map((value, index) => index >= 5 ? value : q(value)).join(", ") +
    ")",
  ]);

  const prior = readFirstRow("SELECT status, square_payment_id AS paymentId FROM sponsor_payments WHERE id = " + q(localPaymentId));
  let payment = null;
  if (prior?.status !== "paid") {
    payment = await completeSandboxPayment(order.id, definition.amountCents, "sponsor-" + suffix);
    await waitForSql("SELECT status FROM sponsor_payments WHERE id = " + q(localPaymentId), "paid", "sponsor " + sponsorId);
  }
  const publishSql = "UPDATE sponsors SET recognition_status = 'Published', updated_at = datetime('now') WHERE id = " + q(sponsorId) +
    " AND EXISTS (SELECT 1 FROM sponsor_payments WHERE id = " + q(localPaymentId) + " AND status = 'paid')";
  wranglerOutput(["d1", "execute", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox", "--command", publishSql]);
  return {
    package: definition.key,
    displayName,
    sponsorId,
    paymentId: payment?.id || prior?.paymentId || "",
    amountCents: definition.amountCents,
  };
}

async function createSquareSponsorPayments() {
  const results = [];
  const errors = [];
  for (const definition of SPONSOR_DEFINITIONS) {
    for (let n = 1; n <= COUNT; n += 1) {
      try {
        results.push(await seedAndPaySponsor(definition, n));
      } catch (error) {
        const message = error?.message || String(error);
        errors.push("Sponsor " + definition.key + " " + pad(n) + ": " + message);
        console.error("Sponsor sample failed: " + message);
        if (message.includes("Timed out waiting for Square webhook")) return { results, errors, stoppedForWebhook: true };
      }
    }
  }
  return { results, errors, stoppedForWebhook: false };
}

async function seedAndPayBookOrder(n) {
  const sequence = pad(n);
  const prefix = "TEST-" + runId + "-";
  const orderNumber = prefix + "ORDER-" + sequence;
  const bookId = prefix + "BOOK-" + sequence;
  const sku = prefix + "SKU-" + sequence;
  const title = "Sandbox QA Book " + sequence;
  const unitPrice = 12 + n;
  const shipping = 5;
  const subtotalCents = Math.round(unitPrice * 100);
  const totalCents = subtotalCents + shipping * 100;
  const cart = [{
    bookId,
    sku,
    title,
    quantity: 1,
    unitPrice,
    lineTotal: unitPrice,
    preorder: false,
  }];
  const order = await createSquareSandboxOrder(orderNumber, [
    {
      name: title,
      quantity: "1",
      base_price_money: { amount: subtotalCents, currency: "USD" },
      metadata: { sku, bookId },
    },
    {
      name: "U.S. Shipping & Handling",
      quantity: "1",
      base_price_money: { amount: shipping * 100, currency: "USD" },
      metadata: { type: "shipping", perBookCents: "500" },
    },
  ], "book-" + sequence);
  if (order.amountCents !== totalCents) {
    throw new Error("Square Sandbox order total did not match the seeded book and shipping for " + sequence + ".");
  }

  const customerName = "Sandbox QA Buyer " + sequence;
  const customerEmail = sampleEmail("paid-book-order." + sequence);
  const notes = "[TEST DATA " + runId + "] Square Sandbox QA bookstore order " + sequence;
  wranglerOutput([
    "d1", "execute", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox",
    "--command",
    "INSERT OR IGNORE INTO orders (order_number, provider, square_order_id, created_at, customer_name, customer_email, subtotal, shipping, tax, total, payment_status, fulfillment_status, notes) VALUES (" +
      [orderNumber, "square", order.id, "datetime('now')", customerName, customerEmail, unitPrice, shipping, 0, unitPrice + shipping, "Pending", "Unfulfilled", notes].map((value, index) => index === 3 ? value : q(value)).join(", ") +
    ")",
  ]);
  wranglerOutput([
    "d1", "execute", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox",
    "--command",
    "INSERT OR IGNORE INTO checkout_sessions (session_id, cart_json, created_at) VALUES (" +
      [orderNumber, JSON.stringify(cart), "datetime('now')"].map((value, index) => index === 2 ? value : q(value)).join(", ") +
    ")",
  ]);

  const prior = readFirstRow("SELECT payment_status AS status, square_payment_id AS paymentId FROM orders WHERE order_number = " + q(orderNumber));
  let payment = null;
  if (prior?.status !== "Paid") {
    payment = await completeSandboxPayment(order.id, totalCents, "book-" + sequence);
    await waitForSql("SELECT payment_status AS status FROM orders WHERE order_number = " + q(orderNumber), "Paid", "book order " + orderNumber);
  }
  return { orderNumber, paymentId: payment?.id || prior?.paymentId || "", amountCents: totalCents };
}

async function createSquareSandboxBookOrders() {
  const results = [];
  const errors = [];
  for (let n = 1; n <= COUNT; n += 1) {
    try {
      results.push(await seedAndPayBookOrder(n));
    } catch (error) {
      const message = error?.message || String(error);
      errors.push("Book order " + pad(n) + ": " + message);
      console.error("Book order sample failed: " + message);
      if (message.includes("Timed out waiting for Square webhook")) return { results, errors, stoppedForWebhook: true };
    }
  }
  return { results, errors, stoppedForWebhook: false };
}

async function main() {
  if (cleanupId) {
    const sql = makeCleanupSql(cleanupId);
    if (!apply) {
      console.log("Dry run: would remove only synthetic seed records for run " + cleanupId + " from " + DATABASE + ".");
      console.log("Pass --apply to execute this cleanup against the sandbox database.");
      return;
    }
    const file = ".review-data-cleanup-" + cleanupId + ".sql";
    try {
      writeFileSync(file, sql, "utf8");
      runWrangler(["d1", "execute", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox", "--file", file]);
      const remaining = readFirstRow(
        "SELECT COUNT(*) AS remaining FROM books WHERE id GLOB " + q("TEST-" + cleanupId + "-BOOK-*"),
      );
      if (Number(remaining?.remaining) !== 0) {
        throw new Error(
          "Cleanup did not remove all synthetic books for run " + cleanupId +
          " (" + Number(remaining?.remaining || 0) + " remain). Check that the run ID is exact.",
        );
      }
    } finally {
      try { unlinkSync(file); } catch {}
    }
    console.log("Removed synthetic records for run " + cleanupId + " from the sandbox.");
    return;
  }

  const forms = makeForms();
  const counts = {
    publicForms: forms.length,
    eachPublicForm: COUNT,
    books: COUNT,
    inventoryEvents: COUNT,
    authors: COUNT,
    draftCampaigns: COUNT,
    contacts: COUNT,
    inactiveSubscribers: COUNT,
    bookInterests: COUNT,
    squareSandboxCheckouts: COUNT,
    sponsorSandboxPayments: COUNT * SPONSOR_PACKAGES.length,
    sponsorRecords: COUNT * SPONSOR_PACKAGES.length,
    analyticsEvents: COUNT,
    auditEntries: COUNT,
  };
  if (!apply) {
    console.log("Dry run only. No database writes or email sent.");
    console.log("Target: Cloudflare D1 " + DATABASE + " (sandbox environment only).");
    console.log("Run ID: " + runId);
    console.log(JSON.stringify(counts, null, 2));
    console.log("To create the seed records and email the form digest to " + REVIEWER + ": npm run review-data:generate -- --apply --run-id " + runId);
    console.log("Cleanup command: npm run review-data:generate -- --apply --cleanup=" + runId);
    return;
  }
  if (!process.env.RESEND_API_KEY) throw new Error("Set RESEND_API_KEY before applying.");
  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) throw new Error("Set Square Sandbox SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in .env.local before applying.");
  if (process.env.SQUARE_ENVIRONMENT && process.env.SQUARE_ENVIRONMENT !== "sandbox") throw new Error("SQUARE_ENVIRONMENT must be sandbox.");
  await assertSandboxTarget();

  console.log("Starting review data generation; run ID: " + runId);
  const sql = makeSeedSql(forms);
  const file = ".review-data-seed-" + runId + ".sql";
  try {
    writeFileSync(file, sql, "utf8");
    runWrangler(["d1", "migrations", "apply", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox"]);
    runWrangler(["d1", "execute", DATABASE, "--remote", "--config", WRANGLER_CONFIG, "--env", "sandbox", "--file", file]);
  } finally {
    try { unlinkSync(file); } catch {}
  }

  // Create sponsors first so the public wall is populated before the bookstore
  // phase can encounter an unrelated payment problem.
  const sponsorRun = await createSquareSponsorPayments();
  const bookRun = sponsorRun.stoppedForWebhook
    ? { results: [], errors: ["Book orders skipped because Square webhook reconciliation did not complete."], stoppedForWebhook: true }
    : await createSquareSandboxBookOrders();
  const failures = [...sponsorRun.errors, ...bookRun.errors];

  console.log("Review data run " + runId + ": " + forms.length + " form submissions, " +
    sponsorRun.results.length + " paid/published sponsors, and " + bookRun.results.length + " paid book orders.");
  console.log(JSON.stringify(counts, null, 2));
  await sendReviewDigest(forms, bookRun.results, sponsorRun.results, failures);
  if (failures.length) {
    throw new Error(failures.length + " sample item(s) need attention. See the review digest sent to " + REVIEWER + ".");
  }
}

main().catch((error) => {
  console.error("Review data generation failed for run " + runId + ": " + (error?.message || String(error)));
  process.exitCode = 1;
});
