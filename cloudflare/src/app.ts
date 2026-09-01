import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { ADMIN_ROLE_ORDER, FORM_ROUTES, NEWSLETTER_DEFAULTS } from "./config";
import type {
  AdminRole,
  AdminUser,
  AppHandler,
  AuthenticatedAdmin,
  BookRecord,
  CartLineItem,
  CheckoutSessionRecord,
  Env,
  FormType,
  JsonValue,
  NewsletterCampaignRecord,
} from "./types";
import {
  base64UrlEncode,
  buildIdentityKey,
  buildPublicBookImageUrl,
  bytesToHex,
  clampInt,
  cleanInput,
  constantTimeEqual,
  createBookId,
  createOrderNumber,
  decodeBase64Url,
  escapeHtml,
  formatStripeAddress,
  getErrorMessage,
  getFirstName,
  HttpError,
  isValidEmail,
  json,
  linkValue,
  money,
  parseBody,
  safeUrl,
  signJwtWithPem,
  signValue,
  splitEmails,
  text,
  toBoolean,
  withCors,
} from "./utils";

const app: AppHandler = {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return withCors(request, env, new Response(null, { status: 204 }));
      }

      if (url.pathname === "/healthz") {
        return json(request, env, { ok: true, service: "bratliff-platform" });
      }

      if (url.pathname.startsWith("/media/books/")) {
        return serveBookImage(url, env);
      }

      if (url.pathname === "/stripe/webhook") {
        return handleStripeWebhook(request, env);
      }

      if (url.pathname.startsWith("/api/admin/")) {
        return handleAdminApi(request, env, ctx, url);
      }

      if (url.pathname === "/api/forms/submit") {
        return handleFormRequest(request, env);
      }

      if (url.pathname === "/api/store/books") {
        return json(request, env, { ok: true, books: await listPublishedStoreBooks(env) });
      }

      if (url.pathname === "/api/store/book") {
        const book = await getStoreBookById(env, url.searchParams.get("id") || "");
        if (!book || !isPublicBookStatus(book.status)) {
          return json(request, env, { ok: false, error: "Book not found." }, 404);
        }
        return json(request, env, { ok: true, book });
      }

      if (url.pathname === "/api/store/checkout") {
        if (request.method !== "POST") {
          return json(request, env, { ok: false, error: "Method not allowed." }, 405);
        }
        return handleStoreCheckout(request, env, await parseBody(request));
      }

      if (url.pathname === "/" || url.pathname === "/index" || url.pathname === "") {
        return handleCompatibilityRoot(request, env, url);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json(request, env, { ok: false, error: getErrorMessage(error) }, status);
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledTasks(env));
  },
};

export default app;

async function handleCompatibilityRoot(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method === "GET") {
    const action = String(url.searchParams.get("action") || "").trim();
    if (action === "store-books") {
      return json(request, env, { ok: true, books: await listPublishedStoreBooks(env) });
    }
    if (action === "store-book") {
      const book = await getStoreBookById(env, url.searchParams.get("id") || "");
      if (!book || !isPublicBookStatus(book.status)) {
        return json(request, env, { ok: false, error: "Book not found." }, 404);
      }
      return json(request, env, { ok: true, book });
    }
    if (action === "store-health") {
      return json(request, env, { ok: true, service: "Publisher Store Manager" });
    }
    if (action === "unsubscribe") {
      return handleUnsubscribe(request, env, url.searchParams);
    }
    return json(request, env, { ok: true, service: "Jackrabbit Punkin Publishing platform" });
  }

  if (request.method === "POST") {
    const payload = await parseBody(request);
    if (text(payload.action, 80) === "store-checkout") {
      return handleStoreCheckout(request, env, payload);
    }
    if (payload.formType) {
      return handleFormSubmission(request, env, payload);
    }
  }

  return json(request, env, { ok: false, error: "Unsupported route." }, 404);
}

async function handleFormRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json(request, env, { ok: false, error: "Method not allowed." }, 405);
  }
  return handleFormSubmission(request, env, await parseBody(request));
}

async function handleFormSubmission(
  request: Request,
  env: Env,
  payload: Record<string, string>,
): Promise<Response> {
  const formType = text(payload.formType, 80) as FormType;
  const route = FORM_ROUTES[formType];
  if (!route) throw new HttpError(400, "Unknown form type.");
  if (payload.website) return json(request, env, { ok: true, emailSent: false });

  for (const field of route.required) {
    if (!cleanInput(payload[field], 5000)) throw new HttpError(400, "Missing required field: " + field);
  }

  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM form_submissions WHERE form_type = ?1 AND identity_key = ?2 AND created_at > datetime('now', ?3)",
  )
    .bind(formType, buildIdentityKey(request, payload), "-" + route.rateLimitWindowSeconds + " seconds")
    .first<{ count: number }>();
  if (Number(recent?.count || 0) > 0) throw new HttpError(429, "Please wait before submitting again.");

  const record = normalizeFormRecord(payload);
  const submissionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO form_submissions (
      id, form_type, created_at, identity_key, status,
      name, email, phone, subject, message, organization, event_type,
      event_date, location, audience, details, group_name, group_size,
      preferred_format, request_text, notes, title, page_url, user_agent, consent
    ) VALUES (?1, ?2, datetime('now'), ?3, 'New', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)`,
  )
    .bind(
      submissionId,
      formType,
      buildIdentityKey(request, payload),
      record.name,
      record.email,
      record.phone,
      record.subject,
      record.message,
      record.organization,
      record.eventType,
      record.eventDate,
      record.location,
      record.audience,
      record.details,
      record.groupName,
      record.groupSize,
      record.preferredFormat,
      record.requestText,
      record.notes,
      record.title,
      record.pageUrl,
      record.userAgent,
      record.consent ? 1 : 0,
    )
    .run();

  if (formType === "newsletter") {
    await env.DB.prepare(
      `INSERT INTO newsletter_subscribers (
        email, first_seen_at, last_seen_at, consent, status, source, notes
      ) VALUES (?1, datetime('now'), datetime('now'), ?2, ?3, ?4, '')
      ON CONFLICT(email) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        consent = excluded.consent,
        status = CASE WHEN excluded.consent = 1 THEN 'active' ELSE newsletter_subscribers.status END,
        source = excluded.source`,
    )
      .bind(record.email.toLowerCase(), record.consent ? 1 : 0, record.consent ? "active" : "pending", record.pageUrl || env.SITE_URL)
      .run();
  }

  let emailSent = false;
  try {
    await sendSubmissionEmails(env, formType, record);
    emailSent = true;
  } catch (error) {
    console.error(JSON.stringify({ type: "submission_email_failed", formType, error: getErrorMessage(error) }));
  }

  return json(request, env, { ok: true, emailSent, submissionId });
}

function normalizeFormRecord(payload: Record<string, string>) {
  return {
    name: cleanInput(payload.name, 250),
    email: cleanInput(payload.email, 320),
    phone: cleanInput(payload.phone, 80),
    subject: cleanInput(payload.subject, 200),
    message: cleanInput(payload.message, 5000),
    organization: cleanInput(payload.organization, 250),
    eventType: cleanInput(payload.type, 120),
    eventDate: cleanInput(payload.date, 120),
    location: cleanInput(payload.location, 250),
    audience: cleanInput(payload.audience, 250),
    details: cleanInput(payload.details, 5000),
    groupName: cleanInput(payload.group, 250),
    groupSize: cleanInput(payload.size, 120),
    preferredFormat: cleanInput(payload.format, 120),
    requestText: cleanInput(payload.request, 5000),
    notes: cleanInput(payload.notes, 2000),
    title: cleanInput(payload.title, 200),
    pageUrl: cleanInput(payload.pageUrl, 1000),
    userAgent: cleanInput(payload.userAgent, 1000),
    consent: toBoolean(payload.consent || "true"),
  };
}

async function handleStoreCheckout(
  request: Request,
  env: Env,
  payload: Record<string, string>,
): Promise<Response> {
  let cart: unknown[] = [];
  try {
    cart = JSON.parse(String(payload.cart || "[]"));
  } catch {
    throw new HttpError(400, "Invalid cart data.");
  }
  const items = await validateOrderItems(env, cart);
  if (!items.length) throw new HttpError(400, "Your cart is empty.");
  if (!env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.startsWith("replace-")) {
    throw new HttpError(503, "Stripe is not configured yet.");
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", env.ORDER_SUCCESS_URL);
  params.set("cancel_url", env.ORDER_CANCEL_URL);
  params.set("shipping_address_collection[allowed_countries][0]", "US");
  params.set("metadata[source]", "jackrabbit-punkin-store");

  items.forEach((item, index) => {
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
    params.set(`line_items[${index}][price_data][currency]`, env.STRIPE_CURRENCY.toLowerCase());
    params.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(item.unitPrice * 100)));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.title);
    params.set(`line_items[${index}][price_data][product_data][metadata][sku]`, item.sku);
    params.set(`line_items[${index}][price_data][product_data][metadata][book_id]`, item.bookId);
  });

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: params.toString(),
  });
  const stripeData = (await stripeResponse.json()) as Record<string, JsonValue>;
  if (!stripeResponse.ok || typeof stripeData.url !== "string") {
    const message =
      typeof stripeData.error === "object" && stripeData.error && "message" in stripeData.error
        ? String((stripeData.error as Record<string, JsonValue>).message || "")
        : "Checkout could not be started.";
    throw new HttpError(502, message);
  }

  await env.DB.prepare(
    "INSERT INTO checkout_sessions (session_id, cart_json, created_at) VALUES (?1, ?2, datetime('now'))",
  )
    .bind(String(stripeData.id || ""), JSON.stringify(items))
    .run();

  return json(request, env, { ok: true, id: stripeData.id, url: stripeData.url });
}

async function validateOrderItems(env: Env, cart: unknown[]): Promise<CartLineItem[]> {
  const items = Array.isArray(cart) ? cart : [];
  const result: CartLineItem[] = [];
  for (const entry of items) {
    const data = (entry || {}) as Record<string, unknown>;
    const sku = text(data.sku, 100).toUpperCase();
    const quantity = Math.max(1, Math.floor(Number(data.quantity || 1)));
    const row = await env.DB.prepare(
      "SELECT id AS bookId, sku, title, price, stock, preorder, status FROM books WHERE upper(sku) = ?1",
    )
      .bind(sku)
      .first<Record<string, unknown>>();
    if (!row) throw new HttpError(400, "Book not found for SKU " + sku + ".");
    const status = text(row.status, 40);
    const preorder = Boolean(Number(row.preorder || 0));
    const stock = Number(row.stock || 0);
    if (status !== "Published" && !(preorder && status !== "Archived")) {
      throw new HttpError(400, text(row.title, 300) + " is not currently available for purchase.");
    }
    if (!preorder && quantity > stock) {
      throw new HttpError(400, "Only " + stock + " copies of " + text(row.title, 300) + " are available.");
    }
    const unitPrice = money(Number(row.price || 0));
    result.push({
      bookId: text(row.bookId, 120),
      sku,
      title: text(row.title, 300),
      quantity,
      unitPrice,
      lineTotal: money(unitPrice * quantity),
      preorder,
    });
  }
  return result;
}

async function handleUnsubscribe(
  _request: Request,
  env: Env,
  params: URLSearchParams,
): Promise<Response> {
  const encodedEmail = text(params.get("e"), 1000);
  const suppliedSignature = text(params.get("sig"), 1000);
  const expectedSignature = await signValue(encodedEmail, env.UNSUBSCRIBE_SECRET);
  if (!encodedEmail || !suppliedSignature || !constantTimeEqual(suppliedSignature, expectedSignature)) {
    return renderUnsubscribePage(false, "This unsubscribe link is invalid. Please contact us if you still need help.");
  }
  const email = decodeBase64Url(encodedEmail).trim().toLowerCase();
  if (!isValidEmail(email)) {
    return renderUnsubscribePage(false, "This unsubscribe link is invalid. Please contact us if you still need help.");
  }
  await env.DB.prepare(
    `UPDATE newsletter_subscribers
     SET consent = 0,
         status = 'unsubscribed',
         notes = trim(coalesce(notes, '') || CASE WHEN coalesce(notes, '') = '' THEN '' ELSE '\n' END || ?2),
         last_seen_at = datetime('now')
     WHERE email = ?1`,
  )
    .bind(email, "Unsubscribed through email link on " + new Date().toISOString() + ".")
    .run();
  await env.DB.prepare(
    "UPDATE form_submissions SET status = 'Unsubscribed' WHERE form_type = 'newsletter' AND lower(email) = ?1",
  )
    .bind(email)
    .run();
  return renderUnsubscribePage(true, "You have been removed from the Jackrabbit Punkin Publishing subscriber list.");
}

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get("stripe-signature") || "";
  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("Invalid signature", { status: 400 });
  }
  const event = JSON.parse(payload) as { id: string; type: string; data?: { object?: Record<string, JsonValue> } };
  const alreadyProcessed = await env.DB.prepare("SELECT event_id FROM webhook_events WHERE event_id = ?1")
    .bind(event.id)
    .first();
  if (alreadyProcessed) return new Response("Already processed", { status: 200 });

  await env.DB.prepare(
    "INSERT INTO webhook_events (event_id, event_type, processed_at, status) VALUES (?1, ?2, datetime('now'), 'processing')",
  )
    .bind(event.id, event.type)
    .run();

  try {
    if (event.type === "checkout.session.completed") {
      await recordPaidOrderFromSession(env, event.id, event.data?.object || {});
    }
    await env.DB.prepare("UPDATE webhook_events SET status = 'processed' WHERE event_id = ?1")
      .bind(event.id)
      .run();
    return new Response("OK", { status: 200 });
  } catch (error) {
    await env.DB.prepare("UPDATE webhook_events SET status = ?2 WHERE event_id = ?1")
      .bind(event.id, getErrorMessage(error).slice(0, 500))
      .run();
    return new Response(getErrorMessage(error), { status: 500 });
  }
}

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  if (!parts.t || !parts.v1) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${payload}`));
  return constantTimeEqual(bytesToHex(new Uint8Array(signature)), parts.v1);
}

async function recordPaidOrderFromSession(
  env: Env,
  stripeEventId: string,
  session: Record<string, JsonValue>,
): Promise<void> {
  const sessionId = text(session.id, 200);
  const existing = await env.DB.prepare(
    "SELECT order_number FROM orders WHERE stripe_session_id = ?1 OR stripe_event_id = ?2",
  )
    .bind(sessionId, stripeEventId)
    .first();
  if (existing) return;

  const stored = await env.DB.prepare(
    "SELECT session_id AS sessionId, cart_json AS cartJson, created_at AS createdAt FROM checkout_sessions WHERE session_id = ?1",
  )
    .bind(sessionId)
    .first<CheckoutSessionRecord>();
  if (!stored) throw new Error("No local checkout session was found for the Stripe event.");

  const items = JSON.parse(stored.cartJson) as CartLineItem[];
  const orderNumber = createOrderNumber();
  const subtotal = Number(session.amount_subtotal || 0) / 100 || items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = Number(session.amount_total || 0) / 100 || subtotal;
  const totalDetails = ((session.total_details as Record<string, JsonValue>) || {}) as Record<string, JsonValue>;
  const tax = Number(totalDetails.amount_tax || 0) / 100;
  const shipping = Math.max(0, money(total - subtotal - tax));
  const customerDetails = ((session.customer_details as Record<string, JsonValue>) || {}) as Record<string, JsonValue>;
  const shippingDetails = ((session.shipping_details as Record<string, JsonValue>) || {}) as Record<string, JsonValue>;
  const customerName = text(customerDetails.name, 250);
  const customerEmail = text(customerDetails.email, 320).toLowerCase();
  const shippingAddress = formatStripeAddress(((shippingDetails.address as Record<string, unknown>) || (customerDetails.address as Record<string, unknown>) || {}) as Record<string, unknown>);

  await env.DB.prepare(
    `INSERT INTO orders (
      order_number, stripe_session_id, stripe_payment_id, stripe_event_id,
      created_at, customer_name, customer_email, subtotal, shipping, tax, total,
      payment_status, fulfillment_status, tracking_number, shipping_address, notes
    ) VALUES (?1, ?2, ?3, ?4, datetime('now'), ?5, ?6, ?7, ?8, ?9, ?10, 'Paid', 'Unfulfilled', '', ?11, '')`,
  )
    .bind(orderNumber, sessionId, text(session.payment_intent, 300), stripeEventId, customerName, customerEmail, money(subtotal), money(shipping), money(tax), money(total), shippingAddress)
    .run();

  for (const item of items) {
    const book = await getStoreBookById(env, item.bookId);
    if (!book) throw new Error("Inventory book record is missing for " + item.sku + ".");
    const previous = Number(book.stock || 0);
    if (!item.preorder) {
      const updateResult = await env.DB.prepare(
        `UPDATE books
         SET stock = stock - ?2,
             status = CASE
               WHEN preorder = 1 THEN status
               WHEN stock - ?2 <= 0 AND status != 'Draft' AND status != 'Archived' THEN 'Out of Stock'
               WHEN status != 'Draft' AND status != 'Archived' THEN 'Published'
               ELSE status
             END,
             updated_at = datetime('now')
         WHERE id = ?1 AND stock >= ?2`,
      )
        .bind(book.bookId, item.quantity)
        .run();
      if (Number(updateResult.meta?.changes || 0) !== 1) {
        throw new Error("Insufficient inventory for " + item.title + ".");
      }
    }
    await env.DB.prepare(
      "INSERT INTO order_items (order_number, book_id, sku, title, quantity, unit_price, line_total) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
      .bind(orderNumber, item.bookId, item.sku, item.title, item.quantity, money(item.unitPrice), money(item.lineTotal))
      .run();
    await env.DB.prepare(
      "INSERT INTO inventory_events (id, created_at, book_id, sku, title, change_qty, previous_qty, new_qty, reason, order_number, admin_email, notes) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, 'Online sale', ?8, 'Stripe', '')",
    )
      .bind(crypto.randomUUID(), item.bookId, item.sku, item.title, -Math.abs(item.quantity), previous, item.preorder ? previous : previous - item.quantity, orderNumber)
      .run();
  }
}

async function handleAdminApi(
  request: Request,
  env: Env,
  _ctx: unknown,
  url: URL,
): Promise<Response> {
  const admin = await authorizeAdmin(request, env);
  const path = url.pathname.replace(/^\/api\/admin\/?/, "");

  if (request.method === "GET" && path === "bootstrap") {
    return json(request, env, { ok: true, ...(await buildAdminBootstrap(env, admin)) });
  }
  if (request.method === "GET" && path === "submissions") {
    return json(request, env, {
      ok: true,
      rows: await listSubmissions(env, text(url.searchParams.get("formType"), 40), clampInt(url.searchParams.get("limit"), 1, 200, 50)),
    });
  }
  if (request.method === "GET" && path === "books") {
    return json(request, env, { ok: true, books: await listAllStoreBooks(env) });
  }
  if (request.method === "POST" && path === "books") {
    requireRole(admin, "editor");
    return json(request, env, { ok: true, book: await saveBook(env, admin, await parseBody(request)) });
  }
  if (request.method === "POST" && path === "inventory/adjust") {
    requireRole(admin, "fulfillment");
    return json(request, env, { ok: true, book: await adjustInventory(env, admin, await parseBody(request)) });
  }
  if (request.method === "GET" && path === "inventory") {
    return json(request, env, { ok: true, rows: await getInventorySummary(env) });
  }
  if (request.method === "GET" && path === "orders") {
    return json(request, env, { ok: true, orders: await listOrders(env, 100) });
  }
  if (request.method === "POST" && path.startsWith("orders/") && path.endsWith("/fulfillment")) {
    requireRole(admin, "fulfillment");
    const orderNumber = decodeURIComponent(path.slice("orders/".length, -"/fulfillment".length));
    return json(request, env, { ok: true, order: await updateFulfillment(env, orderNumber, await parseBody(request)) });
  }
  if (request.method === "GET" && path === "newsletter/state") {
    return json(request, env, { ok: true, ...(await getNewsletterBuilderState(env, admin)) });
  }
  if (request.method === "POST" && path === "newsletter/campaigns") {
    requireRole(admin, "marketing");
    return json(request, env, { ok: true, campaign: await saveNewsletterCampaign(env, await parseBody(request)) });
  }
  if (request.method === "POST" && path === "newsletter/test") {
    requireRole(admin, "marketing");
    const body = await parseBody(request);
    const campaign = await saveNewsletterCampaign(env, body);
    const email = text(body.testEmail, 320).toLowerCase();
    if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid test email address.");
    const unsubscribeUrl = await getUnsubscribeUrl(env, email);
    await sendEmail(env, {
      to: email,
      subject: "[TEST] " + campaign.subject,
      text: buildNewsletterPlainText(campaign, unsubscribeUrl),
      html: buildNewsletterEmailHtml(env, campaign, unsubscribeUrl),
      replyTo: env.ADMIN_NOTIFICATION_EMAIL,
      fromName: campaign.fromName || "Jackrabbit Punkin Publishing LLC",
    });
    return json(request, env, { ok: true, campaignId: campaign.campaignId, message: "Test email sent." });
  }
  if (request.method === "GET" && path === "newsletter/subscribers") {
    const rows = await env.DB.prepare(
      "SELECT email, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt, consent, status, source, notes FROM newsletter_subscribers ORDER BY last_seen_at DESC LIMIT 500",
    ).all();
    return json(request, env, { ok: true, subscribers: rows.results || [] });
  }
  if (request.method === "GET" && path === "admins") {
    requireRole(admin, "owner");
    return json(request, env, { ok: true, admins: await listAdmins(env) });
  }
  if (request.method === "POST" && path === "admins") {
    requireRole(admin, "owner");
    return json(request, env, { ok: true, admin: await saveAdmin(env, await parseBody(request)) });
  }
  if (request.method === "DELETE" && path.startsWith("admins/")) {
    requireRole(admin, "owner");
    await env.DB.prepare("DELETE FROM admins WHERE lower(email) = ?1").bind(decodeURIComponent(path.slice("admins/".length)).toLowerCase()).run();
    return json(request, env, { ok: true });
  }
  if (request.method === "POST" && path === "exports/sheets") {
    requireRole(admin, "owner");
    await exportReportingSheets(env);
    return json(request, env, { ok: true, message: "Google Sheets export completed." });
  }
  if (request.method === "POST" && path.startsWith("books/") && path.endsWith("/image")) {
    requireRole(admin, "editor");
    const bookId = decodeURIComponent(path.slice("books/".length, -"/image".length));
    return json(request, env, { ok: true, ...(await uploadBookImage(request, env, bookId)) });
  }
  if (request.method === "DELETE" && path.startsWith("books/") && path.endsWith("/image")) {
    requireRole(admin, "editor");
    const bookId = decodeURIComponent(path.slice("books/".length, -"/image".length));
    await removeBookImage(env, bookId);
    return json(request, env, { ok: true });
  }
  return json(request, env, { ok: false, error: "Admin route not found." }, 404);
}

async function authorizeAdmin(request: Request, env: Env): Promise<AuthenticatedAdmin> {
  await ensureBootstrapAdmins(env);
  if (!env.POLICY_AUD || !env.TEAM_DOMAIN) throw new HttpError(503, "Cloudflare Access is not configured yet.");
  const token = request.headers.get("cf-access-jwt-assertion") || "";
  if (!token) throw new HttpError(401, "Cloudflare Access authentication is required.");
  const teamDomain = env.TEAM_DOMAIN.replace(/\/$/, "");
  const jwks = createRemoteJWKSet(new URL(teamDomain + "/cdn-cgi/access/certs"));
  let payload: JWTPayload;
  try {
    payload = (await jwtVerify(token, jwks, { issuer: teamDomain, audience: env.POLICY_AUD })).payload;
  } catch (error) {
    throw new HttpError(403, "Invalid Cloudflare Access token: " + getErrorMessage(error));
  }
  const email = text(payload.email, 320).toLowerCase();
  if (!isValidEmail(email)) throw new HttpError(403, "No verified Google identity was present.");
  const admin = await env.DB.prepare(
    "SELECT email, role, display_name AS displayName, created_at AS createdAt, updated_at AS updatedAt FROM admins WHERE lower(email) = ?1",
  )
    .bind(email)
    .first<AdminUser>();
  if (!admin) throw new HttpError(403, "This Google account is not authorized for admin access.");
  return { email: admin.email, role: admin.role, displayName: admin.displayName, token: payload as Record<string, unknown> };
}

async function ensureBootstrapAdmins(env: Env) {
  for (const email of splitEmails(env.ADMIN_BOOTSTRAP_EMAILS)) {
    await env.DB.prepare(
      `INSERT INTO admins (email, role, display_name, created_at, updated_at)
       VALUES (?1, 'owner', '', datetime('now'), datetime('now'))
       ON CONFLICT(email) DO UPDATE SET updated_at = datetime('now')`,
    )
      .bind(email)
      .run();
  }
}

function requireRole(admin: AuthenticatedAdmin, required: AdminRole) {
  if (ADMIN_ROLE_ORDER.indexOf(admin.role) < ADMIN_ROLE_ORDER.indexOf(required)) {
    throw new HttpError(403, "This account does not have permission for that action.");
  }
}

async function buildAdminBootstrap(env: Env, admin: AuthenticatedAdmin) {
  const submissions = await countQuery(env, "SELECT COUNT(*) AS count FROM form_submissions");
  const subscribers = await countQuery(env, "SELECT COUNT(*) AS count FROM newsletter_subscribers WHERE status = 'active' AND consent = 1");
  const orders = await countQuery(env, "SELECT COUNT(*) AS count FROM orders");
  const books = await countQuery(env, "SELECT COUNT(*) AS count FROM books");
  const campaigns = await countQuery(env, "SELECT COUNT(*) AS count FROM newsletter_campaigns");
  const lowStock = await countQuery(env, "SELECT COUNT(*) AS count FROM books WHERE status = 'Published' AND stock <= low_stock_threshold");
  const revenue = await env.DB.prepare("SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE lower(payment_status) = 'paid'").first<{ total: number }>();
  const latestCampaigns = await env.DB.prepare(
    "SELECT campaign_id AS campaignId, title, subject, status, updated_at AS updatedAt FROM newsletter_campaigns ORDER BY updated_at DESC LIMIT 10",
  ).all();
  return {
    viewer: { email: admin.email, role: admin.role, displayName: admin.displayName },
    metrics: { submissions, subscribers, orders, books, campaigns, lowStock, revenue: money(Number(revenue?.total || 0)) },
    recentSubmissions: await listSubmissions(env, "", 12),
    recentOrders: await listOrders(env, 12),
    lowStock: (await getInventorySummary(env)).filter((row) => row.lowStock).slice(0, 10),
    latestCampaigns: latestCampaigns.results || [],
    endpoints: { publicApiUrl: env.PUBLIC_API_URL, adminUrl: env.PUBLIC_ADMIN_URL },
  };
}

async function listSubmissions(env: Env, formType: string, limit: number) {
  const query = formType
    ? "SELECT id, form_type AS formType, created_at AS createdAt, name, email, subject, title, organization, group_name AS groupName, status, page_url AS pageUrl FROM form_submissions WHERE form_type = ?1 ORDER BY created_at DESC LIMIT ?2"
    : "SELECT id, form_type AS formType, created_at AS createdAt, name, email, subject, title, organization, group_name AS groupName, status, page_url AS pageUrl FROM form_submissions ORDER BY created_at DESC LIMIT ?1";
  const rows = formType ? await env.DB.prepare(query).bind(formType, limit).all() : await env.DB.prepare(query).bind(limit).all();
  return (rows.results || []).map((row) => ({
    ...row,
    summary:
      row.formType === "contact"
        ? row.subject
        : row.formType === "bookNotification"
          ? row.title
          : row.formType === "speaking"
            ? row.organization
            : row.formType === "bookClub"
              ? row.groupName
              : "Newsletter signup",
  }));
}

async function listPublishedStoreBooks(env: Env): Promise<BookRecord[]> {
  const rows = await env.DB.prepare(
    `SELECT
      id AS bookId,
      sku,
      isbn,
      title,
      subtitle,
      author,
      synopsis,
      short_description AS shortDescription,
      format,
      category,
      price,
      compare_price AS comparePrice,
      stock,
      low_stock_threshold AS lowStockThreshold,
      image_key AS imageKey,
      image_url AS imageUrl,
      featured,
      coming_soon AS comingSoon,
      preorder,
      status,
      publication_date AS publicationDate,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM books
    WHERE status IN ('Published', 'Coming Soon', 'Out of Stock')
    ORDER BY featured DESC, datetime(updated_at) DESC`,
  ).all<Record<string, unknown>>();
  return (rows.results || []).map(mapBookRecord);
}

async function listAllStoreBooks(env: Env): Promise<BookRecord[]> {
  const rows = await env.DB.prepare(
    `SELECT
      id AS bookId,
      sku,
      isbn,
      title,
      subtitle,
      author,
      synopsis,
      short_description AS shortDescription,
      format,
      category,
      price,
      compare_price AS comparePrice,
      stock,
      low_stock_threshold AS lowStockThreshold,
      image_key AS imageKey,
      image_url AS imageUrl,
      featured,
      coming_soon AS comingSoon,
      preorder,
      status,
      publication_date AS publicationDate,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM books
    ORDER BY featured DESC, datetime(updated_at) DESC`,
  ).all<Record<string, unknown>>();
  return (rows.results || []).map(mapBookRecord);
}

async function getStoreBookById(env: Env, bookId: string): Promise<BookRecord | null> {
  const row = await env.DB.prepare(
    `SELECT
      id AS bookId,
      sku,
      isbn,
      title,
      subtitle,
      author,
      synopsis,
      short_description AS shortDescription,
      format,
      category,
      price,
      compare_price AS comparePrice,
      stock,
      low_stock_threshold AS lowStockThreshold,
      image_key AS imageKey,
      image_url AS imageUrl,
      featured,
      coming_soon AS comingSoon,
      preorder,
      status,
      publication_date AS publicationDate,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM books WHERE id = ?1`,
  )
    .bind(text(bookId, 120))
    .first<Record<string, unknown>>();
  return row ? mapBookRecord(row) : null;
}

function mapBookRecord(row: Record<string, unknown>): BookRecord {
  return {
    bookId: text(row.bookId, 120),
    sku: text(row.sku, 120),
    isbn: text(row.isbn, 80),
    title: text(row.title, 300),
    subtitle: text(row.subtitle, 300),
    author: text(row.author, 200),
    synopsis: text(row.synopsis, 12000),
    shortDescription: text(row.shortDescription, 1000),
    format: text(row.format, 100),
    category: text(row.category, 150),
    price: Number(row.price || 0),
    comparePrice: Number(row.comparePrice || 0),
    stock: Number(row.stock || 0),
    lowStockThreshold: Number(row.lowStockThreshold || 5),
    imageKey: text(row.imageKey, 300),
    imageUrl: text(row.imageUrl, 1000),
    featured: Boolean(Number(row.featured || 0)),
    comingSoon: Boolean(Number(row.comingSoon || 0)),
    preorder: Boolean(Number(row.preorder || 0)),
    status: text(row.status, 40) || "Draft",
    publicationDate: text(row.publicationDate, 50),
    createdAt: text(row.createdAt, 50),
    updatedAt: text(row.updatedAt, 50),
  };
}

function isPublicBookStatus(status: string) {
  return ["Published", "Coming Soon", "Out of Stock"].includes(status);
}

async function saveBook(env: Env, admin: AuthenticatedAdmin, body: Record<string, string>): Promise<BookRecord> {
  const existing = body.bookId ? await getStoreBookById(env, body.bookId) : null;
  const bookId = existing?.bookId || createBookId();
  const sku = text(body.sku, 100).toUpperCase();
  const title = text(body.title, 300);
  if (!sku) throw new HttpError(400, "SKU is required.");
  if (!title) throw new HttpError(400, "Book title is required.");
  const duplicate = await env.DB.prepare("SELECT id FROM books WHERE upper(sku) = ?1 AND id != ?2").bind(sku, bookId).first();
  if (duplicate) throw new HttpError(400, "That SKU is already in use.");
  const stock = Math.max(0, Math.floor(Number(body.stock || existing?.stock || 0)));
  const preorder = toBoolean(body.preorder);
  const statusInput = text(body.status, 40) || "Draft";
  const status = statusInput === "Published" && stock <= 0 && !preorder ? "Out of Stock" : statusInput;

  await env.DB.prepare(
    `INSERT INTO books (
      id, sku, isbn, title, subtitle, author, synopsis, short_description,
      format, category, price, compare_price, stock, low_stock_threshold,
      image_key, image_url, featured, coming_soon, preorder, status,
      publication_date, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, COALESCE((SELECT created_at FROM books WHERE id = ?1), datetime('now')), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      sku = excluded.sku,
      isbn = excluded.isbn,
      title = excluded.title,
      subtitle = excluded.subtitle,
      author = excluded.author,
      synopsis = excluded.synopsis,
      short_description = excluded.short_description,
      format = excluded.format,
      category = excluded.category,
      price = excluded.price,
      compare_price = excluded.compare_price,
      stock = excluded.stock,
      low_stock_threshold = excluded.low_stock_threshold,
      featured = excluded.featured,
      coming_soon = excluded.coming_soon,
      preorder = excluded.preorder,
      status = excluded.status,
      publication_date = excluded.publication_date,
      updated_at = datetime('now')`,
  )
    .bind(bookId, sku, text(body.isbn, 80), title, text(body.subtitle, 300), text(body.author, 200), text(body.synopsis, 12000), text(body.shortDescription, 1000), text(body.format, 100), text(body.category, 150), money(Number(body.price || 0)), money(Number(body.comparePrice || 0)), stock, Math.max(0, Math.floor(Number(body.lowStockThreshold || 5))), existing?.imageKey || "", existing?.imageUrl || "", toBoolean(body.featured) ? 1 : 0, toBoolean(body.comingSoon) ? 1 : 0, preorder ? 1 : 0, status, text(body.publicationDate, 50))
    .run();

  if (existing && existing.stock !== stock) {
    await env.DB.prepare(
      "INSERT INTO inventory_events (id, created_at, book_id, sku, title, change_qty, previous_qty, new_qty, reason, order_number, admin_email, notes) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, 'Admin adjustment', '', ?8, '')",
    )
      .bind(crypto.randomUUID(), bookId, sku, title, stock - existing.stock, existing.stock, stock, admin.email)
      .run();
  }

  const saved = await getStoreBookById(env, bookId);
  if (!saved) throw new Error("Book could not be reloaded after saving.");
  return saved;
}

async function uploadBookImage(request: Request, env: Env, bookId: string) {
  const book = await getStoreBookById(env, bookId);
  if (!book) throw new HttpError(404, "Book not found.");
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image file.");
  const mimeType = file.type.toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) throw new HttpError(400, "Use a PNG, JPG, JPEG, or WebP image.");
  if (file.size > 6 * 1024 * 1024) throw new HttpError(400, "Image must be 6 MB or smaller.");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const imageKey = `books/${bookId}/${crypto.randomUUID()}.${extension}`;
  await env.BOOK_ASSETS.put(imageKey, await file.arrayBuffer(), { httpMetadata: { contentType: mimeType } });
  const imageUrl = buildPublicBookImageUrl(env, imageKey);
  if (book.imageKey) await env.BOOK_ASSETS.delete(book.imageKey);
  await env.DB.prepare("UPDATE books SET image_key = ?2, image_url = ?3, updated_at = datetime('now') WHERE id = ?1")
    .bind(bookId, imageKey, imageUrl)
    .run();
  return { imageKey, imageUrl };
}

async function removeBookImage(env: Env, bookId: string) {
  const book = await getStoreBookById(env, bookId);
  if (!book) throw new HttpError(404, "Book not found.");
  if (book.imageKey) await env.BOOK_ASSETS.delete(book.imageKey);
  await env.DB.prepare("UPDATE books SET image_key = '', image_url = '', updated_at = datetime('now') WHERE id = ?1")
    .bind(bookId)
    .run();
}

async function serveBookImage(url: URL, env: Env): Promise<Response> {
  const object = await env.BOOK_ASSETS.get(decodeURIComponent(url.pathname.slice("/media/books/".length)));
  if (!object || !object.body) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=86400");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function getInventorySummary(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT id AS bookId, sku, title, stock, low_stock_threshold AS lowStockThreshold, status, CASE WHEN status = 'Published' AND stock <= low_stock_threshold THEN 1 ELSE 0 END AS lowStock FROM books ORDER BY title COLLATE NOCASE",
  ).all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({
    bookId: text(row.bookId, 120),
    sku: text(row.sku, 120),
    title: text(row.title, 300),
    stock: Number(row.stock || 0),
    lowStockThreshold: Number(row.lowStockThreshold || 0),
    status: text(row.status, 40),
    lowStock: Boolean(Number(row.lowStock || 0)),
  }));
}

async function adjustInventory(env: Env, admin: AuthenticatedAdmin, body: Record<string, string>) {
  const bookId = text(body.bookId, 120);
  const book = await getStoreBookById(env, bookId);
  if (!book) throw new HttpError(404, "Book not found.");
  const delta = Math.trunc(Number(body.change || 0));
  if (!delta) throw new HttpError(400, "Enter an inventory adjustment other than zero.");
  const next = book.stock + delta;
  if (next < 0) throw new HttpError(400, "Inventory cannot be reduced below zero.");
  const nextStatus = !book.preorder && book.status !== "Draft" && book.status !== "Archived" ? (next > 0 ? "Published" : "Out of Stock") : book.status;
  await env.DB.prepare("UPDATE books SET stock = ?2, status = ?3, updated_at = datetime('now') WHERE id = ?1")
    .bind(bookId, next, nextStatus)
    .run();
  await env.DB.prepare(
    "INSERT INTO inventory_events (id, created_at, book_id, sku, title, change_qty, previous_qty, new_qty, reason, order_number, admin_email, notes) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', ?9, ?10)",
  )
    .bind(crypto.randomUUID(), bookId, book.sku, book.title, delta, book.stock, next, text(body.reason, 200) || "Admin adjustment", admin.email, text(body.notes, 1000))
    .run();
  return getStoreBookById(env, bookId);
}

async function listOrders(env: Env, limit: number) {
  const rows = await env.DB.prepare(
    "SELECT order_number AS orderNumber, stripe_session_id AS stripeSessionId, stripe_payment_id AS stripePaymentId, created_at AS date, customer_name AS customer, customer_email AS email, subtotal, shipping, tax, total, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, tracking_number AS trackingNumber, shipping_address AS shippingAddress, notes FROM orders ORDER BY datetime(created_at) DESC LIMIT ?1",
  ).bind(limit).all();
  return rows.results || [];
}

async function updateFulfillment(env: Env, orderNumber: string, body: Record<string, string>) {
  await env.DB.prepare("UPDATE orders SET fulfillment_status = ?2, tracking_number = ?3, notes = ?4 WHERE order_number = ?1")
    .bind(text(orderNumber, 120), text(body.fulfillmentStatus, 80) || "Unfulfilled", text(body.trackingNumber, 200), text(body.notes, 4000))
    .run();
  const rows = await env.DB.prepare(
    "SELECT order_number AS orderNumber, stripe_session_id AS stripeSessionId, stripe_payment_id AS stripePaymentId, created_at AS date, customer_name AS customer, customer_email AS email, subtotal, shipping, tax, total, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, tracking_number AS trackingNumber, shipping_address AS shippingAddress, notes FROM orders WHERE order_number = ?1",
  ).bind(text(orderNumber, 120)).first();
  return rows;
}

async function getNewsletterBuilderState(env: Env, admin: AuthenticatedAdmin) {
  const books = (await listAllStoreBooks(env)).filter((book) => book.status !== "Archived").map((book) => ({ bookId: book.bookId, title: book.title, author: book.author, shortDescription: book.shortDescription || book.synopsis, imageUrl: book.imageUrl, status: book.status }));
  const campaigns = await env.DB.prepare(
    "SELECT campaign_id AS campaignId, created_at AS createdAt, updated_at AS updatedAt, status, title, subject, preview_text AS previewText, audience, from_name AS fromName, hero_message AS heroMessage, hero_cta_label AS heroCtaLabel, hero_cta_url AS heroCtaUrl, featured_book_id AS featuredBookId, featured_book_title AS featuredBookTitle, featured_book_description AS featuredBookDescription, featured_book_image_url AS featuredBookImageUrl, featured_cta_label AS featuredCtaLabel, featured_cta_url AS featuredCtaUrl, quick1_title AS quick1Title, quick1_text AS quick1Text, quick1_url AS quick1Url, quick2_title AS quick2Title, quick2_text AS quick2Text, quick2_url AS quick2Url, closing_note AS closingNote, send_date AS sendDate, send_time AS sendTime, time_zone AS timeZone, scheduled_at AS scheduledAt, sent_at AS sentAt, recipients, sent, failed, last_error AS lastError FROM newsletter_campaigns ORDER BY updated_at DESC LIMIT 30",
  ).all();
  return {
    subscriberCount: await countQuery(env, "SELECT COUNT(*) AS count FROM newsletter_subscribers WHERE status = 'active' AND consent = 1"),
    adminEmail: admin.email,
    siteUrl: env.SITE_URL,
    books,
    campaigns: campaigns.results || [],
    defaults: { ...NEWSLETTER_DEFAULTS, fromName: "Jackrabbit Punkin Publishing LLC", heroCtaUrl: env.SITE_URL, quick1Url: env.SITE_URL, quick2Url: env.SITE_URL },
  };
}

async function saveNewsletterCampaign(env: Env, body: Record<string, string>): Promise<NewsletterCampaignRecord> {
  const campaignId = text(body.campaignId, 120) || "NL-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const normalized = normalizeNewsletterPayload(body);
  await env.DB.prepare(
    `INSERT INTO newsletter_campaigns (
      campaign_id, created_at, updated_at, status, title, subject, preview_text,
      audience, from_name, hero_message, hero_cta_label, hero_cta_url,
      featured_book_id, featured_book_title, featured_book_description, featured_book_image_url,
      featured_cta_label, featured_cta_url, quick1_title, quick1_text, quick1_url,
      quick2_title, quick2_text, quick2_url, closing_note, send_date, send_time,
      time_zone, scheduled_at, sent_at, recipients, sent, failed, last_error
    ) VALUES (?1, COALESCE((SELECT created_at FROM newsletter_campaigns WHERE campaign_id = ?1), datetime('now')), datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, COALESCE((SELECT sent_at FROM newsletter_campaigns WHERE campaign_id = ?1), ''), COALESCE((SELECT recipients FROM newsletter_campaigns WHERE campaign_id = ?1), 0), COALESCE((SELECT sent FROM newsletter_campaigns WHERE campaign_id = ?1), 0), COALESCE((SELECT failed FROM newsletter_campaigns WHERE campaign_id = ?1), 0), '')
    ON CONFLICT(campaign_id) DO UPDATE SET
      updated_at = datetime('now'),
      status = excluded.status,
      title = excluded.title,
      subject = excluded.subject,
      preview_text = excluded.preview_text,
      audience = excluded.audience,
      from_name = excluded.from_name,
      hero_message = excluded.hero_message,
      hero_cta_label = excluded.hero_cta_label,
      hero_cta_url = excluded.hero_cta_url,
      featured_book_id = excluded.featured_book_id,
      featured_book_title = excluded.featured_book_title,
      featured_book_description = excluded.featured_book_description,
      featured_book_image_url = excluded.featured_book_image_url,
      featured_cta_label = excluded.featured_cta_label,
      featured_cta_url = excluded.featured_cta_url,
      quick1_title = excluded.quick1_title,
      quick1_text = excluded.quick1_text,
      quick1_url = excluded.quick1_url,
      quick2_title = excluded.quick2_title,
      quick2_text = excluded.quick2_text,
      quick2_url = excluded.quick2_url,
      closing_note = excluded.closing_note,
      send_date = excluded.send_date,
      send_time = excluded.send_time,
      time_zone = excluded.time_zone,
      scheduled_at = excluded.scheduled_at,
      last_error = ''`,
  )
    .bind(campaignId, normalized.status, normalized.title, normalized.subject, normalized.previewText, normalized.audience, normalized.fromName, normalized.heroMessage, normalized.heroCtaLabel, normalized.heroCtaUrl, normalized.featuredBookId, normalized.featuredBookTitle, normalized.featuredBookDescription, normalized.featuredBookImageUrl, normalized.featuredCtaLabel, normalized.featuredCtaUrl, normalized.quick1Title, normalized.quick1Text, normalized.quick1Url, normalized.quick2Title, normalized.quick2Text, normalized.quick2Url, normalized.closingNote, normalized.sendDate, normalized.sendTime, normalized.timeZone, normalized.scheduledAt)
    .run();
  const campaign = await env.DB.prepare(
    "SELECT campaign_id AS campaignId, created_at AS createdAt, updated_at AS updatedAt, status, title, subject, preview_text AS previewText, audience, from_name AS fromName, hero_message AS heroMessage, hero_cta_label AS heroCtaLabel, hero_cta_url AS heroCtaUrl, featured_book_id AS featuredBookId, featured_book_title AS featuredBookTitle, featured_book_description AS featuredBookDescription, featured_book_image_url AS featuredBookImageUrl, featured_cta_label AS featuredCtaLabel, featured_cta_url AS featuredCtaUrl, quick1_title AS quick1Title, quick1_text AS quick1Text, quick1_url AS quick1Url, quick2_title AS quick2Title, quick2_text AS quick2Text, quick2_url AS quick2Url, closing_note AS closingNote, send_date AS sendDate, send_time AS sendTime, time_zone AS timeZone, scheduled_at AS scheduledAt, sent_at AS sentAt, recipients, sent, failed, last_error AS lastError FROM newsletter_campaigns WHERE campaign_id = ?1",
  ).bind(campaignId).first<NewsletterCampaignRecord>();
  if (!campaign) throw new Error("Campaign could not be reloaded after saving.");
  return campaign;
}

function normalizeNewsletterPayload(body: Record<string, string>) {
  const subject = text(body.subject, 180);
  if (!subject) throw new HttpError(400, "Email subject is required.");
  const sendDate = text(body.sendDate, 20);
  const sendTime = text(body.sendTime, 20);
  return {
    status: text(body.status, 40) || (sendDate && sendTime ? "Scheduled" : "Draft"),
    title: text(body.title, 180) || NEWSLETTER_DEFAULTS.title,
    subject,
    previewText: text(body.previewText, 240),
    audience: text(body.audience, 120) || NEWSLETTER_DEFAULTS.audience,
    fromName: text(body.fromName, 120) || "Jackrabbit Punkin Publishing LLC",
    heroMessage: text(body.heroMessage, 3000),
    heroCtaLabel: text(body.heroCtaLabel, 100),
    heroCtaUrl: safeUrl(body.heroCtaUrl),
    featuredBookId: text(body.featuredBookId, 120),
    featuredBookTitle: text(body.featuredBookTitle, 240),
    featuredBookDescription: text(body.featuredBookDescription, 3000),
    featuredBookImageUrl: safeUrl(body.featuredBookImageUrl),
    featuredCtaLabel: text(body.featuredCtaLabel, 100),
    featuredCtaUrl: safeUrl(body.featuredCtaUrl),
    quick1Title: text(body.quick1Title, 180),
    quick1Text: text(body.quick1Text, 1500),
    quick1Url: safeUrl(body.quick1Url),
    quick2Title: text(body.quick2Title, 180),
    quick2Text: text(body.quick2Text, 1500),
    quick2Url: safeUrl(body.quick2Url),
    closingNote: text(body.closingNote, 2000),
    sendDate,
    sendTime,
    timeZone: text(body.timeZone, 80) || NEWSLETTER_DEFAULTS.timeZone,
    scheduledAt: sendDate && sendTime ? new Date(`${sendDate}T${sendTime}:00`).toISOString() : "",
  };
}

async function listAdmins(env: Env): Promise<AdminUser[]> {
  const rows = await env.DB.prepare(
    "SELECT email, role, display_name AS displayName, created_at AS createdAt, updated_at AS updatedAt FROM admins ORDER BY email ASC",
  ).all<AdminUser>();
  return rows.results || [];
}

async function saveAdmin(env: Env, body: Record<string, string>): Promise<AdminUser> {
  const email = text(body.email, 320).toLowerCase();
  const role = text(body.role, 40) as AdminRole;
  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!ADMIN_ROLE_ORDER.includes(role)) throw new HttpError(400, "Select a valid admin role.");
  await env.DB.prepare(
    `INSERT INTO admins (email, role, display_name, created_at, updated_at)
     VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
     ON CONFLICT(email) DO UPDATE SET role = excluded.role, display_name = excluded.display_name, updated_at = datetime('now')`,
  )
    .bind(email, role, text(body.displayName, 200))
    .run();
  const admin = await env.DB.prepare(
    "SELECT email, role, display_name AS displayName, created_at AS createdAt, updated_at AS updatedAt FROM admins WHERE email = ?1",
  ).bind(email).first<AdminUser>();
  if (!admin) throw new Error("Admin could not be reloaded after saving.");
  return admin;
}

async function sendSubmissionEmails(env: Env, formType: FormType, record: ReturnType<typeof normalizeFormRecord>) {
  const submitterEmail = record.email.toLowerCase();
  const adminMessage = buildAdminMessage(formType, record, env.SITE_URL);
  const userMessage = buildUserMessage(formType, record, env.SITE_URL, await getUnsubscribeUrl(env, submitterEmail));
  await sendEmail(env, { to: env.ADMIN_NOTIFICATION_EMAIL, subject: adminMessage.subject, html: adminMessage.html, text: adminMessage.text, replyTo: isValidEmail(submitterEmail) ? submitterEmail : env.ADMIN_NOTIFICATION_EMAIL, fromName: "Jackrabbit Punkin Publishing Website" });
  if (isValidEmail(submitterEmail)) {
    await sendEmail(env, { to: submitterEmail, subject: userMessage.subject, html: userMessage.html, text: userMessage.text, replyTo: env.ADMIN_NOTIFICATION_EMAIL, fromName: "Jackrabbit Punkin Publishing LLC" });
  }
}

async function sendEmail(
  env: Env,
  message: { to: string; subject: string; text: string; html: string; replyTo: string; fromName: string },
) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM_EMAIL) throw new Error("Email provider is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${message.fromName} <${env.MAIL_FROM_EMAIL}>`, to: [message.to], subject: message.subject, text: message.text, html: message.html, reply_to: message.replyTo }),
  });
  if (!response.ok) throw new Error(await response.text());
}

function buildAdminMessage(formType: FormType, record: ReturnType<typeof normalizeFormRecord>, siteUrl: string) {
  const subjectMap: Record<FormType, string> = {
    contact: "[Website] New Contact Inquiry - " + record.subject,
    newsletter: "[Website] New Newsletter Subscriber",
    speaking: "[Website] New Speaking Request - " + record.organization,
    bookClub: "[Website] New Book Club Request - " + record.groupName,
    bookNotification: "[Website] New Book Notification - " + record.title,
  };
  const details = [
    ["Name", record.name],
    ["Email", record.email],
    ["Phone", record.phone],
    ["Subject", record.subject],
    ["Message", record.message],
    ["Organization", record.organization],
    ["Event type", record.eventType],
    ["Preferred date", record.eventDate],
    ["Location", record.location],
    ["Audience", record.audience],
    ["Event details", record.details],
    ["Book club / group", record.groupName],
    ["Group size", record.groupSize],
    ["Preferred format", record.preferredFormat],
    ["Request", record.requestText],
    ["Notes", record.notes],
    ["Book title", record.title],
    ["Marketing consent", record.consent ? "Yes" : "No"],
    ["Submitted from", record.pageUrl],
    ["Browser / device", record.userAgent],
  ].filter((entry) => entry[1]);
  return {
    subject: subjectMap[formType],
    text: ["NEW WEBSITE SUBMISSION", "", FORM_ROUTES[formType].summaryLabel, "A new submission was received from the Jackrabbit Punkin Publishing website.", "", ...details.map(([label, value]) => `${label}: ${value}`), "", "Website: " + siteUrl].join("\n"),
    html: buildEmailHtml({ eyebrow: "NEW WEBSITE SUBMISSION", heading: FORM_ROUTES[formType].summaryLabel, intro: "A new submission was received from the Jackrabbit Punkin Publishing website.", details, buttonLabel: "Open website", buttonUrl: siteUrl, footer: "This administrative notification was generated automatically by the website." }),
  };
}

function buildUserMessage(formType: FormType, record: ReturnType<typeof normalizeFormRecord>, siteUrl: string, unsubscribeUrl: string) {
  const copies: Record<FormType, { subject: string; heading: string; paragraphs: string[]; footer: string }> = {
    contact: { subject: "We received your message | Jackrabbit Punkin Publishing", heading: "Your message is on its way", paragraphs: ["Thank you for contacting Jackrabbit Punkin Publishing LLC. We received your message and will review it shortly.", "You can expect a response within 2-3 business days."], footer: "You received this confirmation because you submitted the contact form on our website." },
    newsletter: { subject: "Welcome to Jackrabbit Punkin Publishing", heading: "You're on the list", paragraphs: ["Thank you for joining our community. We'll share new releases, author news, events, and Read It Forward updates with you."], footer: "You received this confirmation because you subscribed on our website." },
    speaking: { subject: "Speaking request received | Jackrabbit Punkin Publishing", heading: "Thank you for the invitation", paragraphs: ["We received your speaking request and appreciate your interest.", "Our team will review the event details and follow up about fit, availability, and format."], footer: "You received this confirmation because you submitted a speaking request on our website." },
    bookClub: { subject: "Book club request received | Jackrabbit Punkin Publishing", heading: "We received your book club request", paragraphs: ["Thank you for inviting Jackrabbit Punkin Publishing to connect with your reading community.", "Our team will review your request and follow up using the contact information you provided."], footer: "You received this confirmation because you submitted a book club request on our website." },
    bookNotification: { subject: "Book update requested | Jackrabbit Punkin Publishing", heading: "We'll keep you posted", paragraphs: [`You're on the notification list for \"${record.title}.\"`, "We'll let you know when meaningful release news becomes available."], footer: "You received this confirmation because you requested a book notification on our website." },
  };
  const copy = copies[formType];
  const firstName = getFirstName(record.name);
  return {
    subject: copy.subject,
    text: [copy.heading, "", "Hi " + firstName + ",", "", copy.paragraphs.join("\n\n"), "", "Visit our website: " + siteUrl, "", "Stories That Inspire. Books That Endure.", "Jackrabbit Punkin Publishing LLC", "", copy.footer, formType === "newsletter" && unsubscribeUrl ? "\nUnsubscribe: " + unsubscribeUrl : ""].join("\n"),
    html: buildEmailHtml({ eyebrow: "THANK YOU", heading: copy.heading, intro: "Hi " + firstName + ",", paragraphs: copy.paragraphs, buttonLabel: "Visit our website", buttonUrl: siteUrl, footer: copy.footer, unsubscribeUrl: formType === "newsletter" ? unsubscribeUrl : "" }),
  };
}

function buildEmailHtml(options: { eyebrow: string; heading: string; intro: string; paragraphs?: string[]; details?: string[][]; buttonLabel: string; buttonUrl: string; footer: string; unsubscribeUrl?: string }) {
  const paragraphs = (options.paragraphs || []).map((paragraph) => '<p style="margin:0 0 18px;color:#26354a;font-size:16px;line-height:1.65;">' + escapeHtml(paragraph) + "</p>").join("");
  const details = (options.details || []).map(([label, value], index) => "<tr>" + '<td style="' + (index ? "border-top:1px solid #e7dfd0;" : "") + 'padding:12px 14px;width:32%;color:#542476;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;vertical-align:top;">' + escapeHtml(label) + "</td>" + '<td style="' + (index ? "border-top:1px solid #e7dfd0;" : "") + 'padding:12px 14px;color:#26354a;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;">' + linkValue(value) + "</td></tr>").join("");
  const content = paragraphs || (details ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7dfd0;border-radius:8px;border-collapse:separate;overflow:hidden;">' + details + "</table>" : "");
  const unsubscribe = options.unsubscribeUrl ? '<br><br><a href="' + escapeHtml(options.unsubscribeUrl) + '" style="color:#542476;text-decoration:underline;">Unsubscribe from these emails</a>' : "";
  return '<!doctype html><html><body style="margin:0;padding:0;background:#fbf8f1;font-family:Arial,Helvetica,sans-serif;">' + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf8f1;"><tr><td align="center" style="padding:28px 12px;">' + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e7dfd0;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(10,22,40,.08);">' + '<tr><td style="background:#0a1628;padding:28px 32px;">' + '<table role="presentation" cellspacing="0" cellpadding="0"><tr>' + '<td style="width:52px;height:52px;border:2px solid #d4ad55;border-radius:50%;color:#d4ad55;text-align:center;font-family:Georgia,serif;font-size:19px;font-weight:700;">JP</td>' + '<td style="padding-left:16px;color:#ffffff;"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;line-height:1.2;">Jackrabbit Punkin Publishing</div><div style="margin-top:5px;color:#d4ad55;font-size:12px;letter-spacing:.6px;">Stories That Inspire. Books That Endure.</div></td>' + '</tr></table></td></tr><tr><td style="height:5px;background:#d4ad55;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:36px 32px 32px;">' + '<div style="margin-bottom:10px;color:#542476;font-size:12px;font-weight:700;letter-spacing:1.6px;">' + escapeHtml(options.eyebrow) + '</div><h1 style="margin:0 0 18px;color:#0a1628;font-family:Georgia,serif;font-size:30px;line-height:1.2;">' + escapeHtml(options.heading) + '</h1><p style="margin:0 0 20px;color:#26354a;font-size:16px;line-height:1.65;">' + escapeHtml(options.intro) + '</p>' + content + '<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px;"><tr><td style="border-radius:999px;background:#542476;"><a href="' + escapeHtml(options.buttonUrl) + '" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">' + escapeHtml(options.buttonLabel) + '</a></td></tr></table></td></tr><tr><td style="background:#f4efe5;padding:22px 32px;color:#687386;font-size:12px;line-height:1.55;">' + escapeHtml(options.footer) + '<br><span style="color:#0a1628;font-weight:700;">Jackrabbit Punkin Publishing LLC</span>' + unsubscribe + "</td></tr></table></td></tr></table></body></html>";
}

async function getUnsubscribeUrl(env: Env, email: string) {
  const normalized = text(email, 320).toLowerCase();
  if (!isValidEmail(normalized)) return "";
  const encodedEmail = base64UrlEncode(normalized);
  const signature = await signValue(encodedEmail, env.UNSUBSCRIBE_SECRET);
  return `${env.PUBLIC_API_URL.replace(/\/$/, "")}/?action=unsubscribe&e=${encodeURIComponent(encodedEmail)}&sig=${encodeURIComponent(signature)}`;
}

function buildNewsletterPlainText(campaign: NewsletterCampaignRecord, unsubscribeUrl: string) {
  const lines = [campaign.title, campaign.subject, "", campaign.heroMessage, ""];
  if (campaign.heroCtaLabel && campaign.heroCtaUrl) lines.push(campaign.heroCtaLabel + ": " + campaign.heroCtaUrl, "");
  if (campaign.featuredBookTitle) {
    lines.push("FEATURED TITLE", campaign.featuredBookTitle, campaign.featuredBookDescription || "");
    if (campaign.featuredCtaUrl) lines.push(campaign.featuredCtaUrl);
    lines.push("");
  }
  if (campaign.quick1Title || campaign.quick1Text) lines.push(campaign.quick1Title, campaign.quick1Text, campaign.quick1Url || "", "");
  if (campaign.quick2Title || campaign.quick2Text) lines.push(campaign.quick2Title, campaign.quick2Text, campaign.quick2Url || "", "");
  lines.push(campaign.closingNote, "", "Jackrabbit Punkin Publishing LLC", unsubscribeUrl ? "Unsubscribe: " + unsubscribeUrl : "");
  return lines.filter((line, index, array) => line !== "" || array[index - 1] !== "").join("\n");
}

function buildNewsletterEmailHtml(env: Env, campaign: NewsletterCampaignRecord, unsubscribeUrl: string) {
  const preview = campaign.previewText ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + escapeHtml(campaign.previewText) + "</div>" : "";
  const heroButton = campaign.heroCtaLabel && campaign.heroCtaUrl ? '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px auto 0;"><tr><td style="border-radius:999px;background:#542476;"><a href="' + escapeHtml(campaign.heroCtaUrl) + '" style="display:inline-block;padding:12px 20px;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">' + escapeHtml(campaign.heroCtaLabel) + "</a></td></tr></table>" : "";
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f3f0e9;font-family:Arial,Helvetica,sans-serif;">' + preview + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0e9;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;background:#fff;border:1px solid #e2dccf;border-radius:12px;overflow:hidden;"><tr><td style="background:#0a1628;padding:20px 28px;border-bottom:5px solid #d4ad55;"><div style="color:#fff;font-family:Georgia,serif;font-size:20px;font-weight:700;">Jackrabbit Punkin Publishing</div><div style="margin-top:4px;color:#d4ad55;font-size:11px;letter-spacing:.5px;">Stories That Inspire. Books That Endure.</div></td></tr><tr><td align="center" style="padding:34px 34px 29px;background:#fbf8f1;"><div style="color:#542476;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">' + escapeHtml(campaign.title) + '</div><h1 style="margin:10px 0 13px;color:#0a1628;font-family:Georgia,serif;font-size:31px;line-height:1.18;">' + escapeHtml(campaign.subject) + '</h1><p style="margin:0;color:#485365;font-size:16px;line-height:1.65;">' + escapeHtml(campaign.heroMessage) + '</p>' + heroButton + '</td></tr><tr><td style="padding:24px 34px;background:#f4efe5;border-top:1px solid #e7dfcf;"><p style="margin:0 0 9px;color:#4e596c;font-size:15px;line-height:1.65;">' + escapeHtml(campaign.closingNote) + '</p><div style="color:#0a1628;font-family:Georgia,serif;font-weight:700;">- Jackrabbit Punkin Publishing LLC</div></td></tr><tr><td align="center" style="padding:18px 26px;background:#0a1628;color:#bfc5cf;font-size:11px;line-height:1.65;"><span style="color:#d4ad55;font-weight:700;">Jackrabbit Punkin Publishing LLC</span><br>Stories That Inspire. Books That Endure.<br><a href="' + escapeHtml(env.SITE_URL) + '" style="color:#fff;">Visit website</a> &nbsp;|&nbsp; <a href="' + escapeHtml(unsubscribeUrl) + '" style="color:#fff;">Unsubscribe</a></td></tr></table></td></tr></table></body></html>';
}

function renderUnsubscribePage(success: boolean, message: string) {
  const title = success ? "You're unsubscribed" : "We need a little help";
  const eyebrow = success ? "PREFERENCES UPDATED" : "UNSUBSCRIBE REQUEST";
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + '</title></head><body style="margin:0;background:#fbf8f1;font-family:Arial,Helvetica,sans-serif;color:#26354a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:40px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e7dfd0;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(10,22,40,.08);"><tr><td style="background:#0a1628;padding:28px 32px;color:#fff;font-family:Georgia,serif;font-size:22px;font-weight:700;">Jackrabbit Punkin Publishing</td></tr><tr><td style="height:5px;background:#d4ad55;font-size:0;">&nbsp;</td></tr><tr><td style="padding:42px 32px;"><div style="color:#542476;font-size:12px;font-weight:700;letter-spacing:1.5px;">' + eyebrow + '</div><h1 style="margin:10px 0 18px;color:#0a1628;font-family:Georgia,serif;font-size:32px;">' + escapeHtml(title) + '</h1><p style="margin:0 0 26px;font-size:16px;line-height:1.65;">' + escapeHtml(message) + '</p><a href="/" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#542476;color:#fff;text-decoration:none;font-weight:700;">Return to our website</a></td></tr><tr><td style="background:#f4efe5;padding:20px 32px;color:#687386;font-size:12px;">Stories That Inspire. Books That Endure.</td></tr></table></td></tr></table></body></html>';
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

async function runScheduledTasks(env: Env) {
  await sendDueCampaigns(env);
  await exportReportingSheets(env);
}

async function sendDueCampaigns(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT campaign_id AS campaignId, created_at AS createdAt, updated_at AS updatedAt, status, title, subject, preview_text AS previewText, audience, from_name AS fromName, hero_message AS heroMessage, hero_cta_label AS heroCtaLabel, hero_cta_url AS heroCtaUrl, featured_book_id AS featuredBookId, featured_book_title AS featuredBookTitle, featured_book_description AS featuredBookDescription, featured_book_image_url AS featuredBookImageUrl, featured_cta_label AS featuredCtaLabel, featured_cta_url AS featuredCtaUrl, quick1_title AS quick1Title, quick1_text AS quick1Text, quick1_url AS quick1Url, quick2_title AS quick2Title, quick2_text AS quick2Text, quick2_url AS quick2Url, closing_note AS closingNote, send_date AS sendDate, send_time AS sendTime, time_zone AS timeZone, scheduled_at AS scheduledAt, sent_at AS sentAt, recipients, sent, failed, last_error AS lastError FROM newsletter_campaigns WHERE status = 'Scheduled' AND scheduled_at != '' AND sent_at = '' AND datetime(scheduled_at) <= datetime('now') ORDER BY datetime(scheduled_at) ASC LIMIT 5",
  ).all<NewsletterCampaignRecord>();
  for (const campaign of rows.results || []) {
    try {
      await sendNewsletterCampaign(env, campaign);
    } catch (error) {
      await env.DB.prepare(
        "UPDATE newsletter_campaigns SET failed = failed + 1, last_error = ?2, updated_at = datetime('now') WHERE campaign_id = ?1",
      )
        .bind(campaign.campaignId, getErrorMessage(error).slice(0, 2000))
        .run();
      console.error(JSON.stringify({ type: "campaign_send_failed", campaignId: campaign.campaignId, error: getErrorMessage(error) }));
    }
  }
}

async function sendNewsletterCampaign(env: Env, campaign: NewsletterCampaignRecord) {
  const rows = await env.DB.prepare(
    "SELECT email FROM newsletter_subscribers WHERE status = 'active' AND consent = 1 ORDER BY last_seen_at DESC",
  ).all<{ email: string }>();
  const subscribers = (rows.results || []).map((row) => text(row.email, 320).toLowerCase()).filter(isValidEmail);
  if (!subscribers.length) {
    await env.DB.prepare(
      "UPDATE newsletter_campaigns SET status = 'Sent', sent_at = datetime('now'), recipients = 0, sent = 0, failed = 0, last_error = '', updated_at = datetime('now') WHERE campaign_id = ?1",
    )
      .bind(campaign.campaignId)
      .run();
    return;
  }

  let sent = 0;
  let failed = 0;
  for (let index = 0; index < subscribers.length; index += 20) {
    const batch = subscribers.slice(index, index + 20);
    const results = await Promise.allSettled(
      batch.map(async (email) => {
        const unsubscribeUrl = await getUnsubscribeUrl(env, email);
        await sendEmail(env, {
          to: email,
          subject: campaign.subject,
          text: buildNewsletterPlainText(campaign, unsubscribeUrl),
          html: buildNewsletterEmailHtml(env, campaign, unsubscribeUrl),
          replyTo: env.ADMIN_NOTIFICATION_EMAIL,
          fromName: campaign.fromName || "Jackrabbit Punkin Publishing LLC",
        });
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") sent += 1;
      else failed += 1;
    }
  }

  await env.DB.prepare(
    "UPDATE newsletter_campaigns SET status = ?2, sent_at = datetime('now'), recipients = ?3, sent = ?4, failed = ?5, last_error = '', updated_at = datetime('now') WHERE campaign_id = ?1",
  )
    .bind(campaign.campaignId, failed ? "Sent with Errors" : "Sent", subscribers.length, sent, failed)
    .run();
}

async function exportReportingSheets(env: Env) {
  if (String(env.SHEETS_EXPORT_ENABLED || "false").toLowerCase() !== "true") return;
  if (!env.SHEETS_EXPORT_SPREADSHEET_ID) return;
  const token = await getGoogleAccessToken(env);
  const spreadsheetId = env.SHEETS_EXPORT_SPREADSHEET_ID;
  const sheetDefinitions = await buildSheetExports(env);
  const metaResponse = await googleApi(token, `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`, { method: "GET" });
  const titles = new Set((((metaResponse as Record<string, JsonValue>).sheets as JsonValue[]) || []).map((sheet) => String(((sheet as Record<string, JsonValue>).properties as Record<string, JsonValue>)?.title || "")).filter(Boolean));
  const addRequests = sheetDefinitions.filter((sheet) => !titles.has(sheet.title)).map((sheet) => ({ addSheet: { properties: { title: sheet.title } } }));
  if (addRequests.length) {
    await googleApi(token, `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: addRequests }) });
  }
  for (const sheet of sheetDefinitions) {
    await googleApi(token, `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheet.title + "!A:ZZ")}:clear`, { method: "POST", body: "{}" });
    await googleApi(token, `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheet.title + "!A1")}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: sheet.values }) });
  }
}

async function buildSheetExports(env: Env) {
  const submissions = (await env.DB.prepare("SELECT form_type AS formType, created_at AS createdAt, status, name, email, phone, subject, message, organization, event_type AS eventType, event_date AS eventDate, location, audience, details, group_name AS groupName, group_size AS groupSize, preferred_format AS preferredFormat, request_text AS requestText, notes, title, page_url AS pageUrl, user_agent AS userAgent, consent FROM form_submissions ORDER BY datetime(created_at) DESC").all<Record<string, unknown>>()).results || [];
  const byType = (type: FormType) => submissions.filter((row) => row.formType === type);
  const subscribers = (await env.DB.prepare("SELECT email, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt, consent, status, source, notes FROM newsletter_subscribers ORDER BY datetime(last_seen_at) DESC").all<Record<string, unknown>>()).results || [];
  const campaigns = (await env.DB.prepare("SELECT * FROM newsletter_campaigns ORDER BY datetime(updated_at) DESC").all<Record<string, unknown>>()).results || [];
  const books = await listAllStoreBooks(env);
  const orders = await listOrders(env, 5000);
  const orderItems = (await env.DB.prepare("SELECT order_number AS orderNumber, book_id AS bookId, sku, title, quantity, unit_price AS unitPrice, line_total AS lineTotal FROM order_items ORDER BY id DESC").all<Record<string, unknown>>()).results || [];
  const inventory = (await env.DB.prepare("SELECT created_at AS createdAt, sku, title, change_qty AS changeQty, previous_qty AS previousQty, new_qty AS newQty, reason, order_number AS orderNumber, admin_email AS adminEmail, notes FROM inventory_events ORDER BY datetime(created_at) DESC").all<Record<string, unknown>>()).results || [];
  const admins = await listAdmins(env);
  return [
    { title: "Contact", values: [["Submitted", "Name", "Email", "Phone", "Subject", "Message", "Page URL", "User Agent", "Status"], ...byType("contact").map((row) => [row.createdAt, row.name, row.email, row.phone, row.subject, row.message, row.pageUrl, row.userAgent, row.status])] },
    { title: "Newsletter", values: [["Submitted", "Email", "Page URL", "Consent", "Status"], ...byType("newsletter").map((row) => [row.createdAt, row.email, row.pageUrl, row.consent ? "TRUE" : "FALSE", row.status])] },
    { title: "Speaking Requests", values: [["Submitted", "Name", "Organization", "Email", "Phone", "Event Type", "Preferred Date", "Location", "Audience", "Details", "Page URL", "User Agent", "Status"], ...byType("speaking").map((row) => [row.createdAt, row.name, row.organization, row.email, row.phone, row.eventType, row.eventDate, row.location, row.audience, row.details, row.pageUrl, row.userAgent, row.status])] },
    { title: "Book Club Requests", values: [["Submitted", "Group", "Name", "Email", "Size", "Format", "Date", "Request", "Notes", "Page URL", "User Agent", "Status"], ...byType("bookClub").map((row) => [row.createdAt, row.groupName, row.name, row.email, row.groupSize, row.preferredFormat, row.eventDate, row.requestText, row.notes, row.pageUrl, row.userAgent, row.status])] },
    { title: "Book Notifications", values: [["Submitted", "Email", "Title", "Page URL", "User Agent", "Status"], ...byType("bookNotification").map((row) => [row.createdAt, row.email, row.title, row.pageUrl, row.userAgent, row.status])] },
    { title: "Newsletter Subscribers", values: [["Email", "First Seen", "Last Seen", "Consent", "Status", "Source", "Notes"], ...subscribers.map((row) => [row.email, row.firstSeenAt, row.lastSeenAt, row.consent ? "TRUE" : "FALSE", row.status, row.source, row.notes])] },
    { title: "Newsletter Campaigns", values: [["Campaign ID", "Created", "Updated", "Status", "Title", "Subject", "Preview Text", "Audience", "From Name", "Hero Message", "Hero CTA Label", "Hero CTA URL", "Featured Book ID", "Featured Book Title", "Featured Book Description", "Featured Book Image URL", "Featured CTA Label", "Featured CTA URL", "Quick Update 1 Title", "Quick Update 1 Text", "Quick Update 1 URL", "Quick Update 2 Title", "Quick Update 2 Text", "Quick Update 2 URL", "Closing Note", "Send Date", "Send Time", "Time Zone", "Scheduled At", "Sent At", "Recipients", "Sent", "Failed", "Last Error"], ...campaigns.map((row) => [row.campaign_id, row.created_at, row.updated_at, row.status, row.title, row.subject, row.preview_text, row.audience, row.from_name, row.hero_message, row.hero_cta_label, row.hero_cta_url, row.featured_book_id, row.featured_book_title, row.featured_book_description, row.featured_book_image_url, row.featured_cta_label, row.featured_cta_url, row.quick1_title, row.quick1_text, row.quick1_url, row.quick2_title, row.quick2_text, row.quick2_url, row.closing_note, row.send_date, row.send_time, row.time_zone, row.scheduled_at, row.sent_at, row.recipients, row.sent, row.failed, row.last_error])] },
    { title: "Books", values: [["Book ID", "SKU", "ISBN", "Title", "Subtitle", "Author", "Synopsis", "Short Description", "Format", "Category", "Price", "Compare Price", "Stock", "Low Stock Threshold", "Image Key", "Image URL", "Featured", "Coming Soon", "Preorder", "Status", "Publication Date", "Created", "Updated"], ...books.map((row) => [row.bookId, row.sku, row.isbn, row.title, row.subtitle, row.author, row.synopsis, row.shortDescription, row.format, row.category, row.price, row.comparePrice, row.stock, row.lowStockThreshold, row.imageKey, row.imageUrl, row.featured ? "TRUE" : "FALSE", row.comingSoon ? "TRUE" : "FALSE", row.preorder ? "TRUE" : "FALSE", row.status, row.publicationDate, row.createdAt, row.updatedAt])] },
    { title: "Orders", values: [["Order #", "Stripe Session ID", "Stripe Payment ID", "Date", "Customer", "Email", "Subtotal", "Shipping", "Tax", "Total", "Payment Status", "Fulfillment Status", "Tracking #", "Shipping Address", "Notes"], ...orders.map((row) => [row.orderNumber, row.stripeSessionId, row.stripePaymentId, row.date, row.customer, row.email, row.subtotal, row.shipping, row.tax, row.total, row.paymentStatus, row.fulfillmentStatus, row.trackingNumber, row.shippingAddress, row.notes])] },
    { title: "Order Items", values: [["Order #", "Book ID", "SKU", "Title", "Quantity", "Unit Price", "Line Total"], ...orderItems.map((row) => [row.orderNumber, row.bookId, row.sku, row.title, row.quantity, row.unitPrice, row.lineTotal])] },
    { title: "Inventory Log", values: [["Date", "SKU", "Title", "Change", "Previous Qty", "New Qty", "Reason", "Order #", "Admin", "Notes"], ...inventory.map((row) => [row.createdAt, row.sku, row.title, row.changeQty, row.previousQty, row.newQty, row.reason, row.orderNumber, row.adminEmail, row.notes])] },
    { title: "Admin Users", values: [["Email", "Role", "Display Name", "Created", "Updated"], ...admins.map((row) => [row.email, row.role, row.displayName, row.createdAt, row.updatedAt])] },
  ];
}

async function getGoogleAccessToken(env: Env) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64UrlEncode(JSON.stringify({ iss: env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets", aud: env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI, exp: now + 3600, iat: now }))}`;
  const assertion = `${unsigned}.${await signJwtWithPem(unsigned, env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)}`;
  const response = await fetch(env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  if (!response.ok) throw new Error("Google token request failed: " + (await response.text()));
  const data = (await response.json()) as Record<string, JsonValue>;
  return String(data.access_token || "");
}

async function googleApi(token: string, path: string, init: RequestInit) {
  const response = await fetch("https://sheets.googleapis.com" + path, { ...init, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!response.ok) throw new Error("Google Sheets API request failed: " + (await response.text()));
  return (await response.json()) as JsonValue;
}

async function countQuery(env: Env, query: string) {
  const row = await env.DB.prepare(query).first<{ count: number }>();
  return Number(row?.count || 0);
}