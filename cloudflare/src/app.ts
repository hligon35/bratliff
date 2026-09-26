import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { ADMIN_ROLE_ORDER, FORM_ROUTES, NEWSLETTER_DEFAULTS, SPONSOR_MAX_BOOKS, SPONSOR_PACKAGES, STORE_SHIPPING_PER_BOOK_CENTS } from "./config";
import type {
  AdminRole,
  AdminUser,
  AppHandler,
  AuthenticatedAdmin,
  AuthorRecord,
  BookRecord,
  CartLineItem,
  CheckoutSessionRecord,
  Env,
  FormType,
  JsonValue,
  NewsletterCampaignRecord,
  SponsorPackageKey,
  SponsorRecord,
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
  firstUrlValue,
  getErrorMessage,
  getFirstName,
  HttpError,
  isValidEmail,
  json,
  linkValue,
  matchOriginUrl,
  money,
  parseBody,
  safeUrl,
  signValue,
  splitEmails,
  splitUrlList,
  text,
  toBoolean,
  verifySquareSignature,
  withCors,
} from "./utils";


const ADMIN_SESSION_COOKIE = "__Host-jrpp_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;
const GOOGLE_ID_TOKEN_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const PREFERRED_SPEAKERS = new Set(["Barbara J. Ratliff", "Charles Ratliff", "Either", "Not Sure"]);
const SPONSOR_CERTIFICATE_ASSET_PATH = "/assets/JPP_Certificate_of_Appreciation_09222026.pdf";
const SPONSOR_CERTIFICATE_TIME_ZONE = "America/New_York"; // Atlanta, GA
const SPONSOR_CERTIFICATE_PACKAGES = new Set<SponsorPackageKey>([
  "literacyTrailblazer",
]);
const SPEAKING_BUDGETS = new Set(["Budget Available", "Community or Nonprofit Request", "Not Yet Determined"]);

type VerifiedGoogleIdentity = {
  email: string;
  role: AdminRole;
  displayName: string;
  name: string;
  avatarUrl: string;
  token: Record<string, unknown>;
  sub: string;
};

type VerifiedAccessIdentity = {
  email: string;
  sub: string;
  token: Record<string, unknown>;
};

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
        if (!env.BOOK_ASSETS) {
          return new Response("Not found", { status: 404 });
        }
        return await serveBookImage(url, env);
      }

      if (url.pathname.startsWith("/media/sponsors/")) {
        if (!env.BOOK_ASSETS) {
          return new Response("Not found", { status: 404 });
        }
        return await serveSponsorLogo(url, env);
      }

      if (url.pathname.startsWith("/media/authors/")) {
        if (!env.BOOK_ASSETS) {
          return new Response("Not found", { status: 404 });
        }
        return await serveAuthorPortrait(url, env);
      }

      if (url.pathname.startsWith("/media/admin-avatars/")) {
        return await serveAdminAvatar(request, url, env);
      }

      if (url.pathname === "/square/sandbox") {
        const target = env.SQUARE_ENVIRONMENT === "production"
          ? "https://jrpp.alphazonelabs.com/"
          : new URL("/", url).toString();
        return Response.redirect(target, 302);
      }

      if (url.pathname === "/square/webhook") {
        if (!env.DB) {
          return new Response("Not configured", { status: 404 });
        }
        return await handleSquareWebhook(request, env);
      }

      if (url.pathname === "/api/auth/google") {
        return await handleGoogleAuthRequest(request, env);
      }

      if (url.pathname === "/api/auth/session") {
        return await handleAdminSessionRequest(request, env);
      }

      if (url.pathname === "/api/auth/logout") {
        return await handleAdminLogoutRequest(request, env);
      }

      if (url.pathname.startsWith("/api/admin/")) {
        return await handleAdminApi(request, env, ctx, url);
      }

      if (url.pathname === "/api/forms/submit") {
        return await handleFormRequest(request, env);
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
        return await handleStoreCheckout(request, env, await parseBody(request));
      }

      if (url.pathname === "/api/store/confirm-checkout") {
        if (request.method !== "POST") {
          return json(request, env, { ok: false, error: "Method not allowed." }, 405);
        }
        return await handleConfirmCheckout(request, env);
      }

      if (url.pathname === "/api/sponsors") {
        if (request.method !== "GET") {
          return json(request, env, { ok: false, error: "Method not allowed." }, 405);
        }
        return json(request, env, { ok: true, ...(await listPublicSponsors(env, url.searchParams)) });
      }

      if (url.pathname === "/api/sponsors/checkout") {
        if (request.method !== "POST") {
          return json(request, env, { ok: false, error: "Method not allowed." }, 405);
        }
        return await handleSponsorCheckout(request, env);
      }

      if (url.pathname === "/api/authors/featured") {
        if (request.method !== "GET") {
          return json(request, env, { ok: false, error: "Method not allowed." }, 405);
        }
        return json(request, env, { ok: true, author: await getPublicFeaturedAuthor(env) });
      }

      if (url.pathname === "/api/analytics/event") {
        if (request.method !== "POST") {
          return json(request, env, { ok: false, error: "Method not allowed." }, 405);
        }
        return await handleAnalyticsEvent(request, env);
      }

      if (url.pathname === "/" || url.pathname === "/index" || url.pathname === "") {
        return await handleCompatibilityRoot(request, env, url);
      }

      return await env.ASSETS.fetch(request);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json(request, env, { ok: false, error: getErrorMessage(error) }, status);
    }
  },

  async scheduled(_controller, env, ctx) {
    if (!env.DB) return;
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

function hasGoogleClientId(env: Env) {
  const clientId = text(env.GOOGLE_CLIENT_ID, 320);
  return Boolean(clientId && !/^replace-with-/i.test(clientId) && /\.apps\.googleusercontent\.com$/i.test(clientId));
}

function hasCloudflareAccessConfig(env: Env) {
  return Boolean(text(env.CF_ACCESS_TEAM_DOMAIN, 200) && text(env.CF_ACCESS_AUD, 200));
}

async function verifyCloudflareAccessJwt(token: string, env: Env): Promise<VerifiedAccessIdentity> {
  const teamDomain = text(env.CF_ACCESS_TEAM_DOMAIN, 200).replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  let payload: JWTPayload;
  try {
    payload = (
      await jwtVerify(token, jwks, { audience: text(env.CF_ACCESS_AUD, 200), issuer })
    ).payload;
  } catch (error) {
    throw new HttpError(403, "Invalid Cloudflare Access token: " + getErrorMessage(error));
  }
  const email = text(payload.email, 320).toLowerCase();
  if (!isValidEmail(email)) {
    throw new HttpError(403, "The Cloudflare Access identity did not include a verified email.");
  }
  return { email, sub: text(payload.sub, 200), token: payload as Record<string, unknown> };
}

function hasAdminSessionConfig(env: Env) {
  return hasGoogleClientId(env) && Boolean(text(env.ADMIN_SESSION_SECRET, 500));
}

function getGoogleClientId(env: Env) {
  return hasGoogleClientId(env) ? text(env.GOOGLE_CLIENT_ID, 320) : "";
}

async function handleGoogleAuthRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return json(request, env, { ok: false, error: "Method not allowed." }, 405);
  }
  if (!hasAdminSessionConfig(env)) {
    throw new HttpError(503, "Google sign-in is not configured yet.");
  }
  const payload = await parseBody(request);
  const credential = text(payload.credential, 6000);
  if (!credential) throw new HttpError(400, "A Google credential is required.");
  const identity = await verifyGoogleIdentityToken(credential, env);
  const viewer = await authorizeAdminIdentity(env, identity);
  await writeAuditLog(env, viewer, "admin_login", "admin", viewer.email, "Admin signed in with Google.");
  const response = json(request, env, {
    ok: true,
    viewer,
    redirectUrl: buildPostLoginRedirect(request, env, payload.returnTo),
  });
  return issueAdminSessionCookie(response, env, viewer, identity.sub);
}

async function handleAdminSessionRequest(request: Request, env: Env) {
  if (request.method !== "GET") {
    return json(request, env, { ok: false, error: "Method not allowed." }, 405);
  }
  const viewer = await authorizeAdmin(request, env);
  return json(request, env, { ok: true, viewer });
}

async function handleAdminLogoutRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return json(request, env, { ok: false, error: "Method not allowed." }, 405);
  }
  try {
    const viewer = await authorizeAdmin(request, env);
    await writeAuditLog(env, viewer, "admin_logout", "admin", viewer.email, "Admin signed out.");
  } catch (error) {
    console.warn(JSON.stringify({ type: "admin_logout_activity_failed", error: getErrorMessage(error) }));
  }
  return clearAdminSessionCookie(json(request, env, { ok: true }));
}

async function verifyGoogleIdentityToken(token: string, env: Env): Promise<VerifiedGoogleIdentity> {
  if (!hasGoogleClientId(env)) throw new HttpError(503, "GOOGLE_CLIENT_ID is not configured yet.");
  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  let payload: JWTPayload;
  try {
    payload = (await jwtVerify(token, jwks, { audience: getGoogleClientId(env) })).payload;
  } catch (error) {
    throw new HttpError(403, "Invalid Google sign-in token: " + getErrorMessage(error));
  }
  if (!GOOGLE_ID_TOKEN_ISSUERS.has(text(payload.iss, 200))) {
    throw new HttpError(403, "The Google sign-in issuer was not recognized.");
  }
  const email = text(payload.email, 320).toLowerCase();
  if (!isValidEmail(email) || !toBoolean(payload.email_verified)) {
    throw new HttpError(403, "The selected Google account is not verified.");
  }
  return {
    email,
    displayName: text(payload.name || payload.nickname || payload.email, 200) || email,
    name: text(payload.name || payload.nickname || payload.email, 200) || email,
    avatarUrl: "",
    role: "manager",
    token: payload as Record<string, unknown>,
    sub: text(payload.sub, 200),
  };
}

async function authorizeAdminIdentity(env: Env, identity: VerifiedGoogleIdentity): Promise<AuthenticatedAdmin> {
  return resolveDatabaseAdminIdentity(env, identity);
}

async function resolveDatabaseAdminIdentity(env: Env, identity: AuthenticatedAdmin): Promise<AuthenticatedAdmin> {
  if (!env.DB) throw new HttpError(503, "The admin database is not configured for this environment.");
  await ensureBootstrapAdmins(env);
  const admin = await env.DB.prepare(
    "SELECT email, role, display_name AS displayName, full_name AS name, avatar_key AS avatarKey, avatar_url AS avatarUrl, created_at AS createdAt, updated_at AS updatedAt FROM admins WHERE lower(email) = ?1",
  )
    .bind(identity.email)
    .first<AdminUser>();
  if (!admin) throw new HttpError(403, "This Google account is not authorized for admin access.");
  return { email: admin.email, role: admin.role, displayName: admin.displayName, name: admin.name || admin.displayName, avatarKey: admin.avatarKey || "", avatarUrl: admin.avatarUrl || "", token: identity.token };
}

function buildPostLoginRedirect(request: Request, env: Env, returnTo: unknown) {
  const fallback = (() => {
    try {
      const url = new URL(matchOriginUrl(env.PUBLIC_ADMIN_URL, request, "/admin/"), request.url);
      return url.pathname + url.search + url.hash;
    } catch {
      return "/admin/";
    }
  })();
  const value = text(returnTo, 500);
  if (!value) return fallback;
  try {
    const requestedUrl = new URL(value, request.url);
    const currentOrigin = new URL(request.url).origin;
    if (requestedUrl.origin !== currentOrigin) return fallback;
    return requestedUrl.pathname + requestedUrl.search + requestedUrl.hash;
  } catch {
    return fallback;
  }
}

async function issueAdminSessionCookie(response: Response, env: Env, viewer: AuthenticatedAdmin, subject: string) {
  const payload = base64UrlEncode(JSON.stringify({
    sub: text(subject, 200),
    email: viewer.email,
    role: viewer.role,
    displayName: viewer.displayName,
    name: viewer.name,
    avatarUrl: viewer.avatarUrl,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
  }));
  const signature = await signValue(payload, env.ADMIN_SESSION_SECRET);
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `${ADMIN_SESSION_COOKIE}=${payload}.${signature}; Max-Age=${ADMIN_SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return new Response(response.body, { status: response.status, headers });
}

function clearAdminSessionCookie(response: Response) {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return new Response(response.body, { status: response.status, headers });
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.get("Cookie") || "";
  for (const entry of raw.split(/;\s*/)) {
    const index = entry.indexOf("=");
    if (index <= 0) continue;
    const key = entry.slice(0, index).trim();
    if (key !== name) continue;
    return entry.slice(index + 1).trim();
  }
  return "";
}

async function requireAdminSession(request: Request, env: Env): Promise<AuthenticatedAdmin> {
  if (!hasAdminSessionConfig(env)) {
    throw new HttpError(503, "Google sign-in is not configured yet.");
  }
  const cookie = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!cookie) throw new HttpError(401, "Please sign in with Google to continue.");
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) throw new HttpError(401, "The admin session is invalid. Please sign in again.");
  const expected = await signValue(payload, env.ADMIN_SESSION_SECRET);
  if (!constantTimeEqual(signature, expected)) {
    throw new HttpError(401, "The admin session is invalid. Please sign in again.");
  }
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
  } catch {
    throw new HttpError(401, "The admin session could not be read. Please sign in again.");
  }
  const exp = Number(claims.exp || 0);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, "Your admin session has expired. Please sign in again.");
  }
  const email = text(claims.email, 320).toLowerCase();
  const role = text(claims.role, 40) as AdminRole;
  if (!isValidEmail(email) || !ADMIN_ROLE_ORDER.includes(role)) {
    throw new HttpError(401, "The admin session is invalid. Please sign in again.");
  }
  return {
    email,
    role,
    displayName: text(claims.displayName, 200) || email,
    name: text(claims.name, 200) || text(claims.displayName, 200) || email,
    avatarUrl: text(claims.avatarUrl, 1000),
    token: {
      provider: "google",
      sub: text(claims.sub, 200),
      exp,
    },
  };
}

async function handleFormRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json(request, env, { ok: false, error: "Method not allowed." }, 405);
  }
  return handleFormSubmission(request, env, await parseBody(request));
}

function validateFormPayload(payload: Record<string, string>): FormType {
  const formType = text(payload.formType, 80) as FormType;
  const route = FORM_ROUTES[formType];
  if (!route) throw new HttpError(400, "Unknown form type.");
  for (const field of route.required) {
    if (!cleanInput(payload[field], 5000)) {
      throw new HttpError(400, "Missing required field: " + field);
    }
  }
  if (formType === "speaking") {
    if (!PREFERRED_SPEAKERS.has(cleanInput(payload.preferredSpeaker, 120))) {
      throw new HttpError(400, "Select a valid preferred speaker.");
    }
    if (!SPEAKING_BUDGETS.has(cleanInput(payload.speakingBudget, 120))) {
      throw new HttpError(400, "Select a valid speaking budget.");
    }
  }
  return formType;
}

async function verifyTurnstile(env: Env, token: string, remoteIp: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY || !token) return false;
  const params = new URLSearchParams();
  params.set("secret", env.TURNSTILE_SECRET_KEY);
  params.set("response", token);
  if (remoteIp) params.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: params.toString(),
  });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean };
  return data.success === true;
}

async function handleFormSubmission(
  request: Request,
  env: Env,
  payload: Record<string, string>,
): Promise<Response> {
  if (payload.website) return json(request, env, { ok: true, emailSent: false });
  const turnstileToken = text(payload["cf-turnstile-response"], 2000);
  if (!(await verifyTurnstile(env, turnstileToken, request.headers.get("CF-Connecting-IP")))) {
    throw new HttpError(400, "Verification failed. Please try again.");
  }
  const formType = validateFormPayload(payload);
  const route = FORM_ROUTES[formType];

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
      preferred_format, request_text, notes, title, page_url, user_agent, consent,
      preferred_speaker, speaking_budget
    ) VALUES (?1, ?2, datetime('now'), ?3, 'New', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)`,
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
      record.preferredSpeaker,
      record.speakingBudget,
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
      .bind(record.email.toLowerCase(), record.consent ? 1 : 0, record.consent ? "active" : "pending", record.pageUrl || firstUrlValue(env.SITE_URL))
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
    preferredSpeaker: cleanInput(payload.preferredSpeaker, 120),
    speakingBudget: cleanInput(payload.speakingBudget, 120),
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

function squareApiBase(env: Env) {
  return env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

async function createSquarePaymentLink(
  env: Env,
  body: Record<string, unknown>,
): Promise<{ url: string; orderId: string; checkoutId: string }> {
  const response = await fetch(`${squareApiBase(env)}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.SQUARE_ACCESS_TOKEN,
      "Content-Type": "application/json",
      "Square-Version": env.SQUARE_API_VERSION || "2024-10-17",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, JsonValue>;
  if (!response.ok) {
    const errors = Array.isArray(data.errors) ? (data.errors as Record<string, JsonValue>[]) : [];
    const message = errors.length ? text(errors[0].detail, 300) : "Checkout could not be started.";
    throw new HttpError(502, message);
  }
  const link = (data.payment_link as Record<string, JsonValue>) || {};
  return {
    url: text(link.url, 1000),
    orderId: text(link.order_id, 200),
    checkoutId: text(link.id, 200),
  };
}

async function fetchSquareInventoryCounts(env: Env, catalogObjectIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const ids = catalogObjectIds.filter(Boolean);
  if (!ids.length) return counts;
  const response = await fetch(`${squareApiBase(env)}/v2/inventory/batch-retrieve-counts`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.SQUARE_ACCESS_TOKEN,
      "Content-Type": "application/json",
      "Square-Version": env.SQUARE_API_VERSION || "2024-10-17",
    },
    body: JSON.stringify({
      catalog_object_ids: ids,
      location_ids: env.SQUARE_LOCATION_ID ? [env.SQUARE_LOCATION_ID] : undefined,
      states: ["IN_STOCK"],
    }),
  });
  if (!response.ok) return counts;
  const data = (await response.json()) as Record<string, JsonValue>;
  const rows = Array.isArray(data.counts) ? (data.counts as Record<string, JsonValue>[]) : [];
  for (const row of rows) {
    const id = text(row.catalog_object_id, 200);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + Number(row.quantity || 0));
  }
  return counts;
}

// Books with a Square catalog variation linked are treated as Square-managed inventory:
// their `stock` column is a periodically-refreshed cache of Square's own count, kept in
// sync here (on the scheduled cron) and via the manual "Sync Square Stock" admin action,
// rather than requiring staff to re-enter counts by hand.
async function syncBookInventoryFromSquare(env: Env): Promise<number> {
  if (!env.SQUARE_ACCESS_TOKEN || env.SQUARE_ACCESS_TOKEN.startsWith("replace-")) return 0;
  const rows = await env.DB.prepare(
    "SELECT id AS bookId, sku, title, stock, preorder, status, square_catalog_variation_id AS variationId FROM books WHERE square_catalog_variation_id != '' AND status != 'Archived'",
  ).all<Record<string, unknown>>();
  const books = rows.results || [];
  if (!books.length) return 0;

  const counts = await fetchSquareInventoryCounts(env, books.map((book) => text(book.variationId, 200)));
  let updated = 0;
  for (const book of books) {
    const variationId = text(book.variationId, 200);
    if (!counts.has(variationId)) continue;
    const bookId = text(book.bookId, 120);
    const previous = Number(book.stock || 0);
    const next = Math.max(0, Math.floor(counts.get(variationId) || 0));
    if (next === previous) continue;
    const preorder = Boolean(Number(book.preorder || 0));
    const status = text(book.status, 40);
    const nextStatus = !preorder && status !== "Draft" && status !== "Archived" ? (next > 0 ? "Published" : "Out of Stock") : status;
    await env.DB.prepare("UPDATE books SET stock = ?2, status = ?3, updated_at = datetime('now') WHERE id = ?1")
      .bind(bookId, next, nextStatus)
      .run();
    await env.DB.prepare(
      "INSERT INTO inventory_events (id, created_at, book_id, sku, title, change_qty, previous_qty, new_qty, reason, order_number, admin_email, notes) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, 'Square inventory sync', '', 'Square', '')",
    )
      .bind(crypto.randomUUID(), bookId, text(book.sku, 120), text(book.title, 300), next - previous, previous, next)
      .run();
    updated += 1;
  }
  return updated;
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
  if (!env.SQUARE_ACCESS_TOKEN || env.SQUARE_ACCESS_TOKEN.startsWith("replace-")) {
    throw new HttpError(503, "Square is not configured yet.");
  }

  const orderNumber = createOrderNumber();
  const subtotal = money(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const bookCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const shipping = money((bookCount * STORE_SHIPPING_PER_BOOK_CENTS) / 100);
  const total = money(subtotal + shipping);

  await env.DB.prepare(
    `INSERT INTO orders (
      order_number, provider, created_at, subtotal, shipping, tax, total,
      payment_status, fulfillment_status, tracking_number, shipping_address, notes
    ) VALUES (?1, 'square', datetime('now'), ?2, ?3, 0, ?4, 'Pending', 'Unfulfilled', '', '', '')`,
  )
    .bind(orderNumber, subtotal, shipping, total)
    .run();

  await env.DB.prepare(
    "INSERT INTO checkout_sessions (session_id, cart_json, created_at) VALUES (?1, ?2, datetime('now'))",
  )
    .bind(orderNumber, JSON.stringify(items))
    .run();

  const redirectSeparator = env.ORDER_SUCCESS_URL.includes("?") ? "&" : "?";
  const result = await createSquarePaymentLink(env, {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: env.SQUARE_LOCATION_ID,
      reference_id: orderNumber,
      line_items: [
        ...items.map((item) => ({
          name: item.title.slice(0, 500),
          quantity: String(item.quantity),
          base_price_money: { amount: Math.round(item.unitPrice * 100), currency: "USD" },
          metadata: { sku: item.sku, bookId: item.bookId },
        })),
        {
          name: "U.S. Shipping & Handling",
          quantity: "1",
          base_price_money: { amount: Math.round(shipping * 100), currency: "USD" },
          metadata: { type: "shipping", perBookCents: STORE_SHIPPING_PER_BOOK_CENTS },
        },
      ],
    },
    checkout_options: {
      ask_for_shipping_address: true,
      redirect_url: `${env.ORDER_SUCCESS_URL}${redirectSeparator}orderNumber=${encodeURIComponent(orderNumber)}`,
    },
  });

  await env.DB.prepare("UPDATE orders SET square_order_id = ?2, square_checkout_id = ?3 WHERE order_number = ?1")
    .bind(orderNumber, result.orderId, result.checkoutId)
    .run();

  return json(request, env, { ok: true, id: orderNumber, url: result.url });
}

async function handleSponsorCheckout(
  request: Request,
  env: Env,
): Promise<Response> {
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");
  const payload = await parseBody(isMultipart ? request.clone() : request);
  const formData = isMultipart ? await request.formData() : null;
  const submittedLogo = formData?.get("logo");
  const logoFile = submittedLogo instanceof File && submittedLogo.size > 0 ? submittedLogo : null;

  if (!env.SQUARE_ACCESS_TOKEN || env.SQUARE_ACCESS_TOKEN.startsWith("replace-")) {
    throw new HttpError(503, "Square is not configured yet.");
  }
  const packageKey = text(payload.package, 60) as SponsorPackageKey;
  const definition = SPONSOR_PACKAGES[packageKey];
  if (!definition) throw new HttpError(400, "Select a valid sponsorship package.");

  const payerName = text(payload.payerName, 200);
  if (!payerName) throw new HttpError(400, "Enter your name.");
  const payerEmail = text(payload.payerEmail, 320).toLowerCase();
  if (!isValidEmail(payerEmail)) throw new HttpError(400, "Enter a valid email address.");
  if (logoFile && packageKey !== "literacyTrailblazer") {
    throw new HttpError(400, "Logo uploads are available for Literacy Trailblazer sponsorships.");
  }
  if (logoFile) {
    const mimeType = logoFile.type.toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mimeType)) {
      throw new HttpError(400, "Use a PNG, JPG, JPEG, SVG, or WebP image.");
    }
    if (logoFile.size > 3 * 1024 * 1024) throw new HttpError(400, "Logo must be 3 MB or smaller.");
  }
  const displayName = text(payload.displayName, 200) || payerName;
  const anonymous = toBoolean(payload.anonymous);
  const publishPermission = toBoolean(payload.publishPermission);
  const websiteUrl = safeUrl(payload.websiteUrl);
  const entityType = text(payload.entityType, 40) || "individual";
  const mailingAddress = text(payload.mailingAddress, 1200);
  if (packageKey === "literacyTrailblazer" && !mailingAddress) {
    throw new HttpError(400, "Enter a private mailing address for the Literacy Trailblazer certificate.");
  }

  let books = definition.books;
  let amountCents = definition.priceCents;
  if (definition.perBookCents && definition.minBooks) {
    const requestedBooks = Math.floor(Number(payload.books));
    books = Number.isFinite(requestedBooks) && requestedBooks > definition.minBooks ? requestedBooks : definition.minBooks;
    books = Math.min(books, SPONSOR_MAX_BOOKS);
    amountCents = books * definition.perBookCents;
  }
  if (amountCents <= 0) throw new HttpError(400, "Could not determine a sponsorship amount.");

  const sponsorId = "SP-" + crypto.randomUUID().slice(0, 10).toUpperCase();
  await env.DB.prepare(
    `INSERT INTO sponsors (
      id, package, books_sponsored, amount_paid_cents, payer_name, payer_email, display_name,
      entity_type, anonymous, publish_permission, website_url, mailing_address, recognition_status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'Awaiting Payment', datetime('now'), datetime('now'))`,
  )
    .bind(sponsorId, packageKey, books, amountCents, payerName, payerEmail, displayName, entityType, anonymous ? 1 : 0, publishPermission ? 1 : 0, websiteUrl, mailingAddress)
    .run();

  if (logoFile) {
    const mimeType = logoFile.type.toLowerCase();
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : mimeType === "image/svg+xml" ? "svg" : "jpg";
    const logoKey = `sponsors/${sponsorId}/${crypto.randomUUID()}.${extension}`;
    await env.BOOK_ASSETS.put(logoKey, await logoFile.arrayBuffer(), { httpMetadata: { contentType: mimeType } });
    const logoUrl = buildPublicSponsorLogoUrl(env, logoKey);
    await env.DB.prepare("UPDATE sponsors SET logo_key = ?2, logo_url = ?3, logo_alt = ?4, updated_at = datetime('now') WHERE id = ?1")
      .bind(sponsorId, logoKey, logoUrl, text(displayName || "Literacy Trailblazer sponsor logo", 300))
      .run();
  }

  const sponsorSuccessUrl = firstUrlValue(env.SPONSOR_SUCCESS_URL) || firstUrlValue(env.ORDER_SUCCESS_URL);
  const redirectSeparator = sponsorSuccessUrl.includes("?") ? "&" : "?";
  const result = await createSquarePaymentLink(env, {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: env.SQUARE_LOCATION_ID,
      reference_id: sponsorId,
      line_items: [
        {
          name: `Read It Forward sponsorship - ${definition.label} (${books} books)`,
          quantity: "1",
          base_price_money: { amount: amountCents, currency: "USD" },
        },
      ],
    },
    checkout_options: {
      redirect_url: `${sponsorSuccessUrl}${redirectSeparator}sponsor=success&sponsorId=${encodeURIComponent(sponsorId)}`,
    },
  });

  await env.DB.prepare(
    "INSERT INTO sponsor_payments (id, sponsor_id, square_order_id, square_checkout_id, amount_cents, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', datetime('now'), datetime('now'))",
  )
    .bind(crypto.randomUUID(), sponsorId, result.orderId, result.checkoutId, amountCents)
    .run();

  return json(request, env, { ok: true, sponsorId, url: result.url });
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

async function handleSquareWebhook(request: Request, env: Env): Promise<Response> {
  const signatureHeader = request.headers.get("x-square-hmacsha256-signature") || "";
  const rawBody = await request.text();
  const notificationUrl = new URL("/square/webhook", firstUrlValue(env.SITE_URL)).toString();
  if (!(await verifySquareSignature(rawBody, signatureHeader, env.SQUARE_WEBHOOK_SIGNATURE_KEY, notificationUrl))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: { event_id: string; type: string; data?: { object?: Record<string, JsonValue> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  const eventId = text(event.event_id, 200);
  if (!eventId) return new Response("Missing event id", { status: 400 });

  const existingWebhook = await env.DB.prepare(
    "SELECT event_id AS eventId, status FROM webhook_events WHERE event_id = ?1 AND provider = 'square'",
  )
    .bind(eventId)
    .first<{ eventId: string; status: string }>();
  if (existingWebhook?.status === "processed") {
    return new Response("Already processed", { status: 200 });
  }

  if (existingWebhook) {
    await env.DB.prepare(
      "UPDATE webhook_events SET event_type = ?2, processed_at = datetime('now'), status = 'processing', attempt_count = attempt_count + 1, last_error = '' WHERE event_id = ?1 AND provider = 'square'",
    )
      .bind(eventId, event.type)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO webhook_events (event_id, event_type, processed_at, status, provider, attempt_count, last_error) VALUES (?1, ?2, datetime('now'), 'processing', 'square', 1, '')",
    )
      .bind(eventId, event.type)
      .run();
  }

  try {
    const dataObject = event.data?.object || {};
    if (event.type === "payment.created" || event.type === "payment.updated") {
      const payment = (dataObject.payment as Record<string, JsonValue>) || {};
      if (text(payment.status, 40) === "COMPLETED") {
        await recordPaidOrderFromSquarePayment(env, eventId, payment);
        await recordPaidSponsorFromSquarePayment(env, eventId, payment);
      }
    } else if (event.type === "refund.created" || event.type === "refund.updated") {
      const refund = (dataObject.refund as Record<string, JsonValue>) || {};
      await recordRefundFromSquareEvent(env, refund);
    }
    await env.DB.prepare("UPDATE webhook_events SET status = 'processed' WHERE event_id = ?1")
      .bind(eventId)
      .run();
    return new Response("OK", { status: 200 });
  } catch (error) {
    await env.DB.prepare("UPDATE webhook_events SET status = 'error', last_error = ?2 WHERE event_id = ?1")
      .bind(eventId, getErrorMessage(error).slice(0, 500))
      .run();
    return new Response(getErrorMessage(error), { status: 500 });
  }
}

async function recordPaidOrderFromSquarePayment(
  env: Env,
  squareEventId: string,
  payment: Record<string, JsonValue>,
): Promise<void> {
  const squareOrderId = text(payment.order_id, 200);
  const squarePaymentId = text(payment.id, 200);
  if (!squareOrderId) return;

  const order = await env.DB.prepare(
    "SELECT order_number AS orderNumber, payment_status AS paymentStatus FROM orders WHERE square_order_id = ?1",
  )
    .bind(squareOrderId)
    .first<{ orderNumber: string; paymentStatus: string }>();
  if (!order) return; // Not a store order (may belong to a sponsor payment instead).
  if (order.paymentStatus === "Paid") {
    await env.DB.prepare("UPDATE orders SET square_payment_id = ?2, square_event_id = ?3 WHERE order_number = ?1")
      .bind(order.orderNumber, squarePaymentId, squareEventId)
      .run();
    return;
  }

  const stored = await env.DB.prepare(
    "SELECT session_id AS sessionId, cart_json AS cartJson FROM checkout_sessions WHERE session_id = ?1",
  )
    .bind(order.orderNumber)
    .first<CheckoutSessionRecord>();
  if (!stored) throw new Error("No local checkout cart found for order " + order.orderNumber + ".");
  const items = JSON.parse(stored.cartJson) as CartLineItem[];

  const amountMoney = (payment.amount_money as Record<string, JsonValue> | undefined) || {};
  const amountCents = Number(amountMoney.amount || 0);
  const total = amountCents ? money(amountCents / 100) : money(items.reduce((sum, item) => sum + item.lineTotal, 0));

  await env.DB.prepare(
    "UPDATE orders SET square_payment_id = ?2, square_event_id = ?3, payment_status = 'Paid', total = ?4 WHERE order_number = ?1",
  )
    .bind(order.orderNumber, squarePaymentId, squareEventId, total)
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
      .bind(order.orderNumber, item.bookId, item.sku, item.title, item.quantity, money(item.unitPrice), money(item.lineTotal))
      .run();
    await env.DB.prepare(
      "INSERT INTO inventory_events (id, created_at, book_id, sku, title, change_qty, previous_qty, new_qty, reason, order_number, admin_email, notes) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, 'Online sale', ?8, 'Square', '')",
    )
      .bind(crypto.randomUUID(), item.bookId, item.sku, item.title, -Math.abs(item.quantity), previous, item.preorder ? previous : previous - item.quantity, order.orderNumber)
      .run();
  }
}

async function recordPaidSponsorFromSquarePayment(
  env: Env,
  squareEventId: string,
  payment: Record<string, JsonValue>,
): Promise<void> {
  const squareOrderId = text(payment.order_id, 200);
  const squarePaymentId = text(payment.id, 200);
  if (!squareOrderId) return;

  const pending = await env.DB.prepare(
    "SELECT id AS id, sponsor_id AS sponsorId, status FROM sponsor_payments WHERE square_order_id = ?1",
  )
    .bind(squareOrderId)
    .first<{ id: string; sponsorId: string; status: string }>();
  if (!pending) return; // Not a sponsor payment.

  const paymentTimestamp = text(payment.created_at, 80) || new Date().toISOString();
  if (pending.status === "paid") {
    await sendSponsorCertificateIfEligible(env, pending.sponsorId, paymentTimestamp);
    return;
  }

  const amountMoney = (payment.amount_money as Record<string, JsonValue> | undefined) || {};
  const amountCents = Number(amountMoney.amount || 0);

  await env.DB.prepare(
    "UPDATE sponsor_payments SET square_payment_id = ?2, square_event_id = ?3, amount_cents = COALESCE(NULLIF(?4, 0), amount_cents), status = 'paid', updated_at = datetime('now') WHERE id = ?1",
  )
    .bind(pending.id, squarePaymentId, squareEventId, amountCents)
    .run();

  await env.DB.prepare(
    "UPDATE sponsors SET recognition_status = 'Pending Review', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1 AND recognition_status = 'Awaiting Payment'",
  )
    .bind(pending.sponsorId)
    .run();

  await sendSponsorCertificateIfEligible(env, pending.sponsorId, paymentTimestamp);
}

async function recordRefundFromSquareEvent(env: Env, refund: Record<string, JsonValue>): Promise<void> {
  if (text(refund.status, 40) !== "COMPLETED") return;
  const squarePaymentId = text(refund.payment_id, 200);
  if (!squarePaymentId) return;

  const order = await env.DB.prepare(
    "SELECT order_number AS orderNumber FROM orders WHERE square_payment_id = ?1 AND payment_status != 'Refunded'",
  )
    .bind(squarePaymentId)
    .first<{ orderNumber: string }>();
  if (order) {
    await env.DB.prepare("UPDATE orders SET payment_status = 'Refunded' WHERE order_number = ?1")
      .bind(order.orderNumber)
      .run();
    const items = await env.DB.prepare(
      "SELECT book_id AS bookId, sku, title, quantity FROM order_items WHERE order_number = ?1",
    )
      .bind(order.orderNumber)
      .all<Record<string, unknown>>();
    for (const item of items.results || []) {
      const book = await getStoreBookById(env, text(item.bookId, 120));
      if (!book) continue;
      const previous = book.stock;
      const quantity = Number(item.quantity || 0);
      await env.DB.prepare("UPDATE books SET stock = stock + ?2, updated_at = datetime('now') WHERE id = ?1")
        .bind(book.bookId, quantity)
        .run();
      await env.DB.prepare(
        "INSERT INTO inventory_events (id, created_at, book_id, sku, title, change_qty, previous_qty, new_qty, reason, order_number, admin_email, notes) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, 'Refund', ?8, 'Square', '')",
      )
        .bind(crypto.randomUUID(), book.bookId, text(item.sku, 120), text(item.title, 300), Math.abs(quantity), previous, previous + quantity, order.orderNumber)
        .run();
    }
    return;
  }

  const sponsorPayment = await env.DB.prepare(
    "SELECT sponsor_id AS sponsorId FROM sponsor_payments WHERE square_payment_id = ?1 AND status != 'refunded'",
  )
    .bind(squarePaymentId)
    .first<{ sponsorId: string }>();
  if (sponsorPayment) {
    await env.DB.prepare("UPDATE sponsor_payments SET status = 'refunded', updated_at = datetime('now') WHERE square_payment_id = ?1")
      .bind(squarePaymentId)
      .run();
    // A refunded sponsorship must never remain publicly visible without an explicit admin decision.
    await env.DB.prepare("UPDATE sponsors SET recognition_status = 'Refunded', updated_at = datetime('now') WHERE id = ?1")
      .bind(sponsorPayment.sponsorId)
      .run();
  }
}

/**
 * Read-only status check used by the storefront's success page. The Square
 * webhook (handleSquareWebhook) is the sole source of truth for marking an
 * order paid and decrementing inventory; this endpoint never writes.
 */
async function handleConfirmCheckout(request: Request, env: Env): Promise<Response> {
  const payload = await parseBody(request);
  const orderNumber = text(payload.orderNumber || payload.sessionId, 200);
  if (!orderNumber) throw new HttpError(400, "An order number is required.");
  const order = await env.DB.prepare("SELECT payment_status AS paymentStatus FROM orders WHERE order_number = ?1")
    .bind(orderNumber)
    .first<{ paymentStatus: string }>();
  if (!order) return json(request, env, { ok: true, paid: false, pending: true });
  return json(request, env, { ok: true, paid: order.paymentStatus === "Paid", duplicate: order.paymentStatus === "Paid" });
}

async function handleAdminApi(
  request: Request,
  env: Env,
  _ctx: unknown,
  url: URL,
): Promise<Response> {
  const admin = await authorizeAdmin(request, env);
  const path = url.pathname.replace(/^\/api\/admin\/?/, "");

  if (request.method === "GET" && path === "me") {
    return json(request, env, { ok: true, viewer: await getAdminProfile(env, admin) });
  }
  if (request.method === "PUT" && path === "me") {
    const updated = await updateAdminProfile(env, admin, await parseBody(request));
    const response = json(request, env, { ok: true, viewer: updated });
    return issueAdminSessionCookie(response, env, updated, text(admin.token.sub, 200));
  }
  if (request.method === "POST" && path === "me/avatar") {
    return json(request, env, { ok: true, viewer: await uploadAdminAvatar(request, env, admin) });
  }

  if (request.method === "GET" && path === "bootstrap") {
    return json(request, env, { ok: true, ...(await buildAdminBootstrap(env, admin)) });
  }
  if (request.method === "GET" && path === "activity") {
    requireRole(admin, "developer");
    return json(request, env, {
      ok: true,
      activities: await listActivity(
        env,
        text(url.searchParams.get("filter"), 40).toLowerCase(),
        clampInt(url.searchParams.get("limit"), 1, 200, 50),
      ),
    });
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
    requireRole(admin, "manager");
    return json(request, env, { ok: true, book: await saveBook(env, admin, await parseBody(request)) });
  }
  if (request.method === "POST" && path === "inventory/adjust") {
    requireRole(admin, "manager");
    return json(request, env, { ok: true, book: await adjustInventory(env, admin, await parseBody(request)) });
  }
  if (request.method === "POST" && path === "inventory/sync-square") {
    requireRole(admin, "manager");
    const updated = await syncBookInventoryFromSquare(env);
    return json(request, env, { ok: true, updated, books: await listAllStoreBooks(env) });
  }
  if (request.method === "GET" && path === "inventory") {
    return json(request, env, { ok: true, rows: await getInventorySummary(env) });
  }
  if (request.method === "GET" && path === "orders") {
    return json(request, env, { ok: true, orders: await listOrders(env, 100) });
  }
  if (request.method === "POST" && path.startsWith("orders/") && path.endsWith("/fulfillment")) {
    requireRole(admin, "manager");
    const orderNumber = decodeURIComponent(path.slice("orders/".length, -"/fulfillment".length));
    return json(request, env, { ok: true, order: await updateFulfillment(env, orderNumber, await parseBody(request)) });
  }
  if (request.method === "GET" && path === "newsletter/state") {
    return json(request, env, { ok: true, ...(await getNewsletterBuilderState(env, admin)) });
  }
  if (request.method === "POST" && path === "newsletter/campaigns") {
    requireRole(admin, "manager");
    const body = await parseBody(request);
    const campaign = await saveNewsletterCampaign(env, body);
    const status = text(body.status, 40).toLowerCase();
    await writeAuditLog(
      env,
      admin,
      status === "scheduled" ? "newsletter_scheduled" : "newsletter_saved",
      "newsletter_campaign",
      campaign.campaignId,
      status === "scheduled" ? "Newsletter scheduled: " + text(campaign.title || campaign.subject, 200) : "Newsletter saved: " + text(campaign.title || campaign.subject, 200),
    );
    return json(request, env, { ok: true, campaign });
  }
  if (request.method === "POST" && path === "newsletter/test") {
    requireRole(admin, "manager");
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
    await writeAuditLog(env, admin, "newsletter_test_sent", "newsletter_campaign", campaign.campaignId, "Newsletter test sent to " + email + ".");
    return json(request, env, { ok: true, campaignId: campaign.campaignId, message: "Test email sent." });
  }
  if (request.method === "POST" && path === "newsletter/send") {
    requireRole(admin, "manager");
    const body = await parseBody(request);
    const campaign = await saveNewsletterCampaign(env, { ...body, status: "Sending" });
    await sendNewsletterCampaign(env, campaign);
    await writeAuditLog(env, admin, "newsletter_sent", "newsletter_campaign", campaign.campaignId, "Newsletter sent: " + text(campaign.title || campaign.subject, 200) + ".");
    return json(request, env, { ok: true, campaignId: campaign.campaignId, message: "Newsletter sent." });
  }
  if (request.method === "POST" && path.startsWith("newsletter/campaigns/") && path.endsWith("/cancel")) {
    requireRole(admin, "manager");
    const campaignId = decodeURIComponent(path.slice("newsletter/campaigns/".length, -"/cancel".length));
    const campaign = await env.DB.prepare("SELECT campaign_id AS campaignId, title, subject, status FROM newsletter_campaigns WHERE campaign_id = ?1")
      .bind(campaignId)
      .first<{ campaignId: string; title: string; subject: string; status: string }>();
    if (!campaign) throw new HttpError(404, "Newsletter campaign not found.");
    await env.DB.prepare("UPDATE newsletter_campaigns SET status = 'Cancelled', scheduled_at = '', updated_at = datetime('now') WHERE campaign_id = ?1")
      .bind(campaignId)
      .run();
    await writeAuditLog(env, admin, "newsletter_cancelled", "newsletter_campaign", campaignId, "Newsletter schedule cancelled: " + text(campaign.title || campaign.subject, 200) + ".");
    return json(request, env, { ok: true, campaignId, message: "Schedule cancelled." });
  }
  if (request.method === "GET" && path === "newsletter/subscribers") {
    const rows = await env.DB.prepare(
      "SELECT email, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt, consent, status, source, notes FROM newsletter_subscribers ORDER BY last_seen_at DESC LIMIT 500",
    ).all();
    return json(request, env, { ok: true, subscribers: rows.results || [] });
  }
  if (request.method === "GET" && path === "sponsors") {
    return json(request, env, {
      ok: true,
      ...(await listAdminSponsors(env, {
        status: text(url.searchParams.get("status"), 60),
        package: text(url.searchParams.get("package"), 60),
        page: clampInt(url.searchParams.get("page"), 1, 10000, 1),
        pageSize: clampInt(url.searchParams.get("pageSize"), 1, 100, 25),
      })),
    });
  }
  if (request.method === "GET" && path.startsWith("sponsors/")) {
    const sponsorId = decodeURIComponent(path.slice("sponsors/".length));
    const sponsor = await getSponsorById(env, sponsorId);
    if (!sponsor) throw new HttpError(404, "Sponsor not found.");
    return json(request, env, { ok: true, sponsor });
  }
  if (request.method === "POST" && path === "sponsors") {
    requireRole(admin, "manager");
    return json(request, env, { ok: true, sponsor: await saveAdminSponsor(env, admin, await parseBody(request)) });
  }
  if (request.method === "POST" && path.startsWith("sponsors/") && path.endsWith("/publish")) {
    requireRole(admin, "manager");
    const sponsorId = decodeURIComponent(path.slice("sponsors/".length, -"/publish".length));
    return json(request, env, { ok: true, sponsor: await setSponsorRecognitionStatus(env, admin, sponsorId, "Published") });
  }
  if (request.method === "POST" && path.startsWith("sponsors/") && path.endsWith("/hide")) {
    requireRole(admin, "manager");
    const sponsorId = decodeURIComponent(path.slice("sponsors/".length, -"/hide".length));
    return json(request, env, { ok: true, sponsor: await setSponsorRecognitionStatus(env, admin, sponsorId, "Hidden") });
  }
  if (request.method === "POST" && path.startsWith("sponsors/") && path.endsWith("/image")) {
    requireRole(admin, "manager");
    const sponsorId = decodeURIComponent(path.slice("sponsors/".length, -"/image".length));
    return json(request, env, { ok: true, ...(await uploadSponsorLogo(request, env, sponsorId)) });
  }
  if (request.method === "DELETE" && path.startsWith("sponsors/") && path.endsWith("/image")) {
    requireRole(admin, "manager");
    const sponsorId = decodeURIComponent(path.slice("sponsors/".length, -"/image".length));
    await removeSponsorLogo(env, sponsorId);
    return json(request, env, { ok: true });
  }
  if (request.method === "DELETE" && path.startsWith("sponsors/")) {
    requireRole(admin, "manager");
    const sponsorId = decodeURIComponent(path.slice("sponsors/".length));
    await deleteSponsor(env, admin, sponsorId);
    return json(request, env, { ok: true });
  }
  if (request.method === "GET" && path === "authors") {
    return json(request, env, { ok: true, authors: await listAdminAuthors(env, text(url.searchParams.get("status"), 60)) });
  }
  if (request.method === "GET" && path.startsWith("authors/")) {
    const authorId = decodeURIComponent(path.slice("authors/".length));
    const author = await getAuthorById(env, authorId);
    if (!author) throw new HttpError(404, "Author not found.");
    return json(request, env, { ok: true, author });
  }
  if (request.method === "POST" && path === "authors") {
    requireRole(admin, "manager");
    return json(request, env, { ok: true, author: await saveAdminAuthor(env, admin, await parseBody(request)) });
  }
  if (request.method === "POST" && path.startsWith("authors/") && path.endsWith("/publish")) {
    requireRole(admin, "manager");
    const authorId = decodeURIComponent(path.slice("authors/".length, -"/publish".length));
    return json(request, env, { ok: true, author: await setAuthorStatus(env, admin, authorId, "Published") });
  }
  if (request.method === "POST" && path.startsWith("authors/") && path.endsWith("/hide")) {
    requireRole(admin, "manager");
    const authorId = decodeURIComponent(path.slice("authors/".length, -"/hide".length));
    return json(request, env, { ok: true, author: await setAuthorStatus(env, admin, authorId, "Draft") });
  }
  if (request.method === "POST" && path.startsWith("authors/") && path.endsWith("/portrait")) {
    requireRole(admin, "manager");
    const authorId = decodeURIComponent(path.slice("authors/".length, -"/portrait".length));
    return json(request, env, { ok: true, ...(await uploadAuthorPortrait(request, env, authorId)) });
  }
  if (request.method === "DELETE" && path.startsWith("authors/") && path.endsWith("/portrait")) {
    requireRole(admin, "manager");
    const authorId = decodeURIComponent(path.slice("authors/".length, -"/portrait".length));
    await removeAuthorPortrait(env, authorId);
    return json(request, env, { ok: true });
  }
  if (request.method === "DELETE" && path.startsWith("authors/")) {
    requireRole(admin, "manager");
    const authorId = decodeURIComponent(path.slice("authors/".length));
    await deleteAuthor(env, authorId);
    return json(request, env, { ok: true });
  }
  if (request.method === "GET" && path === "analytics/summary") {
    requireRole(admin, "developer");
    return json(request, env, {
      ok: true,
      ...(await getAnalyticsSummary(env, clampInt(url.searchParams.get("days"), 1, 90, 30))),
    });
  }
  if (request.method === "GET" && path === "admins") {
    requireRole(admin, "developer");
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
  if (request.method === "POST" && path.startsWith("books/") && path.endsWith("/image")) {
    requireRole(admin, "manager");
    const bookId = decodeURIComponent(path.slice("books/".length, -"/image".length));
    return json(request, env, { ok: true, ...(await uploadBookImage(request, env, bookId)) });
  }
  if (request.method === "DELETE" && path.startsWith("books/") && path.endsWith("/image")) {
    requireRole(admin, "manager");
    const bookId = decodeURIComponent(path.slice("books/".length, -"/image".length));
    await removeBookImage(env, bookId);
    return json(request, env, { ok: true });
  }
  if (request.method === "DELETE" && path.startsWith("books/")) {
    requireRole(admin, "manager");
    const bookId = decodeURIComponent(path.slice("books/".length));
    const result = await deleteBook(env, bookId);
    await writeAuditLog(env, admin, result.action === "archived" ? "book_archived" : "book_deleted", "book", bookId, result.message);
    return json(request, env, { ok: true, ...result });
  }
  return json(request, env, { ok: false, error: "Admin route not found." }, 404);
}

async function getAdminProfile(env: Env, admin: AuthenticatedAdmin): Promise<AuthenticatedAdmin> {
  const row = await env.DB.prepare(
    "SELECT email, role, display_name AS displayName, full_name AS name, avatar_key AS avatarKey, avatar_url AS avatarUrl FROM admins WHERE lower(email) = ?1",
  ).bind(admin.email).first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "Admin profile not found.");
  return {
    email: text(row.email, 320).toLowerCase(),
    role: text(row.role, 40) as AdminRole,
    displayName: text(row.displayName, 200),
    name: text(row.name, 200) || text(row.displayName, 200),
    avatarKey: text(row.avatarKey, 300),
    avatarUrl: text(row.avatarUrl, 1000),
    token: admin.token,
  };
}

async function updateAdminProfile(
  env: Env,
  admin: AuthenticatedAdmin,
  body: Record<string, string>,
): Promise<AuthenticatedAdmin> {
  const current = await getAdminProfile(env, admin);
  const email = text(body.email, 320).toLowerCase() || current.email;
  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (email !== current.email) {
    const conflict = await env.DB.prepare("SELECT email FROM admins WHERE lower(email) = ?1").bind(email).first();
    if (conflict) throw new HttpError(409, "That email already has admin access.");
  }
  const displayName = typeof body.displayName === "string" ? text(body.displayName, 200) : current.displayName;
  const name = typeof body.name === "string" ? text(body.name, 200) : current.name;
  await env.DB.prepare(
    "UPDATE admins SET email = ?1, display_name = ?2, full_name = ?3, updated_at = datetime('now') WHERE lower(email) = ?4",
  ).bind(email, displayName, name, current.email).run();
  return getAdminProfile(env, { ...current, email });
}

async function uploadAdminAvatar(request: Request, env: Env, admin: AuthenticatedAdmin): Promise<AuthenticatedAdmin> {
  if (!env.BOOK_ASSETS) throw new HttpError(503, "Image storage is not configured.");
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image file.");
  const mimeType = file.type.toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new HttpError(400, "Use a PNG, JPG, JPEG, or WebP image.");
  }
  if (file.size > 2 * 1024 * 1024) throw new HttpError(400, "Avatar must be 2 MB or smaller.");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const avatarKey = `admin-avatars/${crypto.randomUUID()}.${extension}`;
  await env.BOOK_ASSETS.put(avatarKey, await file.arrayBuffer(), { httpMetadata: { contentType: mimeType } });
  const current = await getAdminProfile(env, admin);
  if (current.avatarKey) await env.BOOK_ASSETS.delete(current.avatarKey);
  const avatarUrl = firstUrlValue(env.PUBLIC_API_URL).replace(/\/$/, "") + "/media/admin-avatars/" + encodeURIComponent(avatarKey);
  await env.DB.prepare("UPDATE admins SET avatar_key = ?1, avatar_url = ?2, updated_at = datetime('now') WHERE lower(email) = ?3")
    .bind(avatarKey, avatarUrl, current.email).run();
  return getAdminProfile(env, current);
}

async function serveAdminAvatar(request: Request, url: URL, env: Env): Promise<Response> {
  await authorizeAdmin(request, env);
  if (!env.BOOK_ASSETS) return new Response("Not found", { status: 404 });
  const key = decodeURIComponent(url.pathname.slice("/media/admin-avatars/".length));
  if (!key.startsWith("admin-avatars/")) return new Response("Not found", { status: 404 });
  const object = await env.BOOK_ASSETS.get(key);
  if (!object || !object.body) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(object.body, { headers });
}

async function authorizeAdmin(request: Request, env: Env): Promise<AuthenticatedAdmin> {
  if (hasCloudflareAccessConfig(env)) {
    const accessJwt = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!accessJwt) {
      throw new HttpError(401, "Cloudflare Access did not present a verified identity for this request.");
    }
    const identity = await verifyCloudflareAccessJwt(accessJwt, env);
    return resolveDatabaseAdminIdentity(env, {
      email: identity.email,
      role: "manager",
      displayName: identity.email,
      name: identity.email,
      avatarUrl: "",
      token: { provider: "cloudflare-access", sub: identity.sub },
    });
  }
  return resolveDatabaseAdminIdentity(env, await requireAdminSession(request, env));
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
  const formCountRows = await env.DB.prepare(
    "SELECT form_type AS formType, COUNT(*) AS count FROM form_submissions GROUP BY form_type",
  ).all<{ formType: string; count: number }>();
  const formCounts: Record<string, number> = {};
  for (const row of formCountRows.results || []) {
    formCounts[String(row.formType || "")] = Number(row.count || 0);
  }
  return {
    viewer: { email: admin.email, role: admin.role, displayName: admin.displayName, name: admin.name, avatarUrl: admin.avatarUrl },
    metrics: { submissions, subscribers, orders, books, campaigns, lowStock, revenue: money(Number(revenue?.total || 0)) },
    formCounts,
    endpoints: { publicApiUrl: firstUrlValue(env.PUBLIC_API_URL), adminUrl: firstUrlValue(env.PUBLIC_ADMIN_URL) },
  };
}

async function listActivity(env: Env, filter: string, limit: number) {
  const filters: Record<string, string> = {
    auth: "action IN ('admin_login', 'admin_logout')",
    newsletter: "action LIKE 'newsletter_%'",
    newsletter_saved: "action = 'newsletter_saved'",
    newsletter_sent: "action IN ('newsletter_sent', 'newsletter_test_sent')",
    newsletter_scheduled: "action = 'newsletter_scheduled'",
  };
  const where = filters[filter] ? " WHERE " + filters[filter] : "";
  const rows = await env.DB.prepare(
    "SELECT id, created_at AS createdAt, admin_email AS adminEmail, action, entity_type AS entityType, entity_id AS entityId, detail FROM audit_log" +
      where +
      " ORDER BY datetime(created_at) DESC LIMIT ?1",
  )
    .bind(limit)
    .all();
  return rows.results || [];
}

async function listSubmissions(env: Env, formType: string, limit: number) {
  const query = formType
    ? "SELECT id, form_type AS formType, created_at AS createdAt, name, email, subject, title, organization, preferred_speaker AS preferredSpeaker, speaking_budget AS speakingBudget, group_name AS groupName, status, page_url AS pageUrl FROM form_submissions WHERE form_type = ?1 ORDER BY created_at DESC LIMIT ?2"
    : "SELECT id, form_type AS formType, created_at AS createdAt, name, email, subject, title, organization, preferred_speaker AS preferredSpeaker, speaking_budget AS speakingBudget, group_name AS groupName, status, page_url AS pageUrl FROM form_submissions ORDER BY created_at DESC LIMIT ?1";
  const rows = formType ? await env.DB.prepare(query).bind(formType, limit).all() : await env.DB.prepare(query).bind(limit).all();
  return (rows.results || []).map((row) => ({
    ...row,
    summary:
      row.formType === "contact"
        ? row.subject
        : row.formType === "bookNotification"
          ? row.title
          : row.formType === "speaking"
            ? [row.preferredSpeaker, row.organization, row.speakingBudget].filter(Boolean).join(" - ")
            : row.formType === "bookClub"
              ? [row.groupName, row.title].filter(Boolean).join(" - ")
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
      square_catalog_item_id AS squareCatalogItemId,
      square_catalog_variation_id AS squareCatalogVariationId,
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
      square_catalog_item_id AS squareCatalogItemId,
      square_catalog_variation_id AS squareCatalogVariationId,
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
      square_catalog_item_id AS squareCatalogItemId,
      square_catalog_variation_id AS squareCatalogVariationId,
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
    squareCatalogItemId: text(row.squareCatalogItemId, 200),
    squareCatalogVariationId: text(row.squareCatalogVariationId, 200),
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
      publication_date, square_catalog_item_id, square_catalog_variation_id, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, COALESCE((SELECT created_at FROM books WHERE id = ?1), datetime('now')), datetime('now'))
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
      square_catalog_item_id = excluded.square_catalog_item_id,
      square_catalog_variation_id = excluded.square_catalog_variation_id,
      updated_at = datetime('now')`,
  )
    .bind(bookId, sku, text(body.isbn, 80), title, text(body.subtitle, 300), text(body.author, 200), text(body.synopsis, 12000), text(body.shortDescription, 1000), text(body.format, 100), text(body.category, 150), money(Number(body.price || 0)), money(Number(body.comparePrice || 0)), stock, Math.max(0, Math.floor(Number(body.lowStockThreshold || 5))), existing?.imageKey || "", existing?.imageUrl || "", toBoolean(body.featured) ? 1 : 0, toBoolean(body.comingSoon) ? 1 : 0, preorder ? 1 : 0, status, text(body.publicationDate, 50), text(body.squareCatalogItemId, 200), text(body.squareCatalogVariationId, 200))
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

async function deleteBook(env: Env, bookId: string): Promise<{ action: "archived" | "deleted"; message: string }> {
  const book = await getStoreBookById(env, bookId);
  if (!book) throw new HttpError(404, "Book not found.");

  const [orderReferences, inventoryReferences] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM order_items WHERE book_id = ?1").bind(bookId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM inventory_events WHERE book_id = ?1").bind(bookId).first<{ count: number }>(),
  ]);
  const hasHistory = Number(orderReferences?.count || 0) > 0 || Number(inventoryReferences?.count || 0) > 0;

  if (hasHistory) {
    await env.DB.prepare(
      "UPDATE books SET status = 'Archived', featured = 0, coming_soon = 0, preorder = 0, updated_at = datetime('now') WHERE id = ?1",
    ).bind(bookId).run();
    return {
      action: "archived",
      message: "This book has order or inventory history, so it was archived instead of permanently deleted.",
    };
  }

  if (book.imageKey) await env.BOOK_ASSETS.delete(book.imageKey);
  await env.DB.prepare("DELETE FROM books WHERE id = ?1").bind(bookId).run();
  return { action: "deleted", message: "Book permanently deleted." };
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

async function serveSponsorLogo(url: URL, env: Env): Promise<Response> {
  const object = await env.BOOK_ASSETS.get(decodeURIComponent(url.pathname.slice("/media/sponsors/".length)));
  if (!object || !object.body) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=86400");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

function buildPublicSponsorLogoUrl(env: Env, logoKey: string) {
  const base = firstUrlValue(env.PUBLIC_API_URL).replace(/\/$/, "");
  return `${base}/media/sponsors/${encodeURIComponent(logoKey)}`;
}

async function writeAuditLog(
  env: Env,
  admin: AuthenticatedAdmin,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_log (id, created_at, admin_email, action, entity_type, entity_id, detail) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6)",
    )
      .bind(crypto.randomUUID(), admin.email, action, entityType, entityId, text(detail, 2000))
      .run();
  } catch (error) {
    console.error(JSON.stringify({ type: "activity_log_write_failed", action, error: getErrorMessage(error) }));
  }
}

function mapSponsorRecord(row: Record<string, unknown>): SponsorRecord {
  return {
    id: text(row.id, 60),
    package: text(row.package, 60),
    booksSponsored: Number(row.booksSponsored || 0),
    amountPaidCents: Number(row.amountPaidCents || 0),
    payerName: text(row.payerName, 200),
    payerEmail: text(row.payerEmail, 320),
    displayName: text(row.displayName, 200),
    entityType: text(row.entityType, 40) || "individual",
    anonymous: Boolean(Number(row.anonymous || 0)),
    publishPermission: Boolean(Number(row.publishPermission || 0)),
    logoKey: text(row.logoKey, 300),
    logoUrl: text(row.logoUrl, 1000),
    logoAlt: text(row.logoAlt, 300),
    websiteUrl: text(row.websiteUrl, 1000),
    recognitionStatus: text(row.recognitionStatus, 40) || "Awaiting Payment",
    adminNotes: text(row.adminNotes, 4000),
    displayOrder: Number(row.displayOrder || 0),
    approvedBy: text(row.approvedBy, 320),
    paidAt: text(row.paidAt, 50),
    approvedAt: text(row.approvedAt, 50),
    publishedAt: text(row.publishedAt, 50),
    createdAt: text(row.createdAt, 50),
    updatedAt: text(row.updatedAt, 50),
  };
}

const SPONSOR_SELECT = `SELECT
  id, package, books_sponsored AS booksSponsored, amount_paid_cents AS amountPaidCents,
  payer_name AS payerName, payer_email AS payerEmail, display_name AS displayName,
  entity_type AS entityType, anonymous, publish_permission AS publishPermission,
  logo_key AS logoKey, logo_url AS logoUrl, logo_alt AS logoAlt, website_url AS websiteUrl,
  recognition_status AS recognitionStatus, admin_notes AS adminNotes, display_order AS displayOrder,
  approved_by AS approvedBy, paid_at AS paidAt, approved_at AS approvedAt, published_at AS publishedAt,
  created_at AS createdAt, updated_at AS updatedAt
FROM sponsors`;

async function getSponsorById(env: Env, sponsorId: string): Promise<SponsorRecord | null> {
  const row = await env.DB.prepare(`${SPONSOR_SELECT} WHERE id = ?1`)
    .bind(text(sponsorId, 60))
    .first<Record<string, unknown>>();
  return row ? mapSponsorRecord(row) : null;
}

async function listAdminSponsors(
  env: Env,
  filters: { status: string; package: string; page: number; pageSize: number },
): Promise<{ sponsors: SponsorRecord[]; total: number; page: number; pageSize: number }> {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  if (filters.status) {
    conditions.push(`recognition_status = ?${bindings.length + 1}`);
    bindings.push(filters.status);
  }
  if (filters.package) {
    conditions.push(`package = ?${bindings.length + 1}`);
    bindings.push(filters.package);
  }
  if (!filters.status) conditions.push("recognition_status != 'Deleted'");
  const whereClause = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM sponsors${whereClause}`)
    .bind(...bindings)
    .first<{ count: number }>();
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await env.DB.prepare(
    `${SPONSOR_SELECT}${whereClause} ORDER BY datetime(created_at) DESC LIMIT ?${bindings.length + 1} OFFSET ?${bindings.length + 2}`,
  )
    .bind(...bindings, filters.pageSize, offset)
    .all<Record<string, unknown>>();
  return {
    sponsors: (rows.results || []).map(mapSponsorRecord),
    total: Number(totalRow?.count || 0),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

async function saveAdminSponsor(
  env: Env,
  admin: AuthenticatedAdmin,
  body: Record<string, string>,
): Promise<SponsorRecord> {
  const existing = body.sponsorId ? await getSponsorById(env, body.sponsorId) : null;
  const sponsorId = existing?.id || "SP-" + crypto.randomUUID().slice(0, 10).toUpperCase();
  const payerEmail = text(body.payerEmail, 320).toLowerCase();
  if (payerEmail && !isValidEmail(payerEmail)) throw new HttpError(400, "Enter a valid sponsor email address.");

  await env.DB.prepare(
    `INSERT INTO sponsors (
      id, package, books_sponsored, amount_paid_cents, payer_name, payer_email, display_name,
      entity_type, anonymous, publish_permission, website_url, recognition_status, admin_notes,
      display_order, approved_by, paid_at, approved_at, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
      COALESCE((SELECT created_at FROM sponsors WHERE id = ?1), datetime('now')), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      package = excluded.package,
      books_sponsored = excluded.books_sponsored,
      amount_paid_cents = excluded.amount_paid_cents,
      payer_name = excluded.payer_name,
      payer_email = excluded.payer_email,
      display_name = excluded.display_name,
      entity_type = excluded.entity_type,
      anonymous = excluded.anonymous,
      publish_permission = excluded.publish_permission,
      website_url = excluded.website_url,
      recognition_status = excluded.recognition_status,
      admin_notes = excluded.admin_notes,
      display_order = excluded.display_order,
      updated_at = datetime('now')`,
  )
    .bind(
      sponsorId,
      text(body.package, 60) || existing?.package || "pagePal",
      Math.max(0, Math.floor(Number(body.booksSponsored || existing?.booksSponsored || 0))),
      Math.max(0, Math.floor(Number(body.amountPaidCents || existing?.amountPaidCents || 0))),
      text(body.payerName, 200) || existing?.payerName || "",
      payerEmail || existing?.payerEmail || "",
      text(body.displayName, 200) || existing?.displayName || "",
      text(body.entityType, 40) || existing?.entityType || "individual",
      toBoolean(body.anonymous ?? String(existing?.anonymous ?? "")) ? 1 : 0,
      toBoolean(body.publishPermission ?? String(existing?.publishPermission ?? "")) ? 1 : 0,
      safeUrl(body.websiteUrl) || existing?.websiteUrl || "",
      text(body.recognitionStatus, 40) || existing?.recognitionStatus || "Awaiting Payment",
      text(body.adminNotes, 4000),
      Math.max(0, Math.floor(Number(body.displayOrder || existing?.displayOrder || 0))),
      existing?.approvedBy || "",
      existing?.paidAt || "",
      existing?.approvedAt || "",
    )
    .run();

  await writeAuditLog(env, admin, existing ? "sponsor.update" : "sponsor.create", "sponsor", sponsorId, JSON.stringify(body));
  const saved = await getSponsorById(env, sponsorId);
  if (!saved) throw new Error("Sponsor could not be reloaded after saving.");
  return saved;
}

async function setSponsorRecognitionStatus(
  env: Env,
  admin: AuthenticatedAdmin,
  sponsorId: string,
  status: "Published" | "Hidden",
): Promise<SponsorRecord> {
  const sponsor = await getSponsorById(env, sponsorId);
  if (!sponsor) throw new HttpError(404, "Sponsor not found.");
  if (status === "Published") {
    if (!sponsor.publishPermission) throw new HttpError(400, "This sponsor has not granted permission to publish their recognition.");
    if (!sponsor.anonymous && !sponsor.displayName) throw new HttpError(400, "Add a display name before publishing.");
  }
  await env.DB.prepare(
    `UPDATE sponsors SET recognition_status = ?2, approved_by = ?3, approved_at = datetime('now'), published_at = CASE WHEN ?2 = 'Published' THEN datetime('now') ELSE published_at END, updated_at = datetime('now') WHERE id = ?1`,
  )
    .bind(sponsorId, status, admin.email)
    .run();
  await writeAuditLog(env, admin, status === "Published" ? "sponsor.publish" : "sponsor.hide", "sponsor", sponsorId, "");
  const updated = await getSponsorById(env, sponsorId);
  if (!updated) throw new Error("Sponsor could not be reloaded after updating.");
  return updated;
}

async function uploadSponsorLogo(request: Request, env: Env, sponsorId: string) {
  const sponsor = await getSponsorById(env, sponsorId);
  if (!sponsor) throw new HttpError(404, "Sponsor not found.");
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image file.");
  const mimeType = file.type.toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mimeType)) {
    throw new HttpError(400, "Use a PNG, JPG, JPEG, SVG, or WebP image.");
  }
  if (file.size > 3 * 1024 * 1024) throw new HttpError(400, "Logo must be 3 MB or smaller.");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : mimeType === "image/svg+xml" ? "svg" : "jpg";
  const logoKey = `sponsors/${sponsorId}/${crypto.randomUUID()}.${extension}`;
  await env.BOOK_ASSETS.put(logoKey, await file.arrayBuffer(), { httpMetadata: { contentType: mimeType } });
  const logoUrl = buildPublicSponsorLogoUrl(env, logoKey);
  if (sponsor.logoKey) await env.BOOK_ASSETS.delete(sponsor.logoKey);
  await env.DB.prepare("UPDATE sponsors SET logo_key = ?2, logo_url = ?3, logo_alt = ?4, updated_at = datetime('now') WHERE id = ?1")
    .bind(sponsorId, logoKey, logoUrl, text(formData.get("alt"), 300) || sponsor.displayName)
    .run();
  return { logoKey, logoUrl };
}

async function removeSponsorLogo(env: Env, sponsorId: string) {
  const sponsor = await getSponsorById(env, sponsorId);
  if (!sponsor) throw new HttpError(404, "Sponsor not found.");
  if (sponsor.logoKey) await env.BOOK_ASSETS.delete(sponsor.logoKey);
  await env.DB.prepare("UPDATE sponsors SET logo_key = '', logo_url = '', logo_alt = '', updated_at = datetime('now') WHERE id = ?1")
    .bind(sponsorId)
    .run();
}

async function deleteSponsor(env: Env, admin: AuthenticatedAdmin, sponsorId: string) {
  const sponsor = await getSponsorById(env, sponsorId);
  if (!sponsor) throw new HttpError(404, "Sponsor not found.");
  const payments = await env.DB.prepare("SELECT COUNT(*) AS count FROM sponsor_payments WHERE sponsor_id = ?1")
    .bind(sponsorId)
    .first<{ count: number }>();
  const hasPaymentHistory = Number(payments?.count || 0) > 0;

  if (sponsor.logoKey) await env.BOOK_ASSETS.delete(sponsor.logoKey);
  if (hasPaymentHistory) {
    // Preserve payment and audit history while removing the sponsor from all recognition listings.
    await env.DB.prepare(
      "UPDATE sponsors SET recognition_status = 'Deleted', logo_key = '', logo_url = '', logo_alt = '', updated_at = datetime('now') WHERE id = ?1",
    )
      .bind(sponsorId)
      .run();
  } else {
    await env.DB.prepare("DELETE FROM sponsors WHERE id = ?1").bind(sponsorId).run();
  }
  await writeAuditLog(env, admin, "sponsor.delete", "sponsor", sponsorId, hasPaymentHistory ? "soft-delete: payment history preserved" : "hard-delete");
}

async function serveAuthorPortrait(url: URL, env: Env) {
  const object = await env.BOOK_ASSETS.get(decodeURIComponent(url.pathname.slice("/media/authors/".length)));
  if (!object || !object.body) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=86400");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

function buildPublicAuthorPortraitUrl(env: Env, portraitKey: string) {
  const base = firstUrlValue(env.PUBLIC_API_URL).replace(/\/$/, "");
  return `${base}/media/authors/${encodeURIComponent(portraitKey)}`;
}

function mapAuthorRecord(row: Record<string, unknown>): AuthorRecord {
  return {
    id: text(row.id, 60),
    name: text(row.name, 200),
    title: text(row.title, 200),
    shortIntro: text(row.shortIntro, 500),
    biography: text(row.biography, 12000),
    portraitKey: text(row.portraitKey, 300),
    portraitUrl: text(row.portraitUrl, 1000),
    portraitAlt: text(row.portraitAlt, 300),
    portraitFocalX: Number(row.portraitFocalX ?? 50),
    portraitFocalY: Number(row.portraitFocalY ?? 50),
    bookImageKey: text(row.bookImageKey, 300),
    bookImageUrl: text(row.bookImageUrl, 1000),
    bookImageAlt: text(row.bookImageAlt, 300),
    websiteUrl: text(row.websiteUrl, 1000),
    socialLinks: text(row.socialLinks, 2000) || "{}",
    relatedBookIds: text(row.relatedBookIds, 2000) || "[]",
    ctaLabel: text(row.ctaLabel, 100),
    ctaUrl: text(row.ctaUrl, 1000),
    status: text(row.status, 40) || "Draft",
    startAt: text(row.startAt, 50),
    endAt: text(row.endAt, 50),
    displayOrder: Number(row.displayOrder || 0),
    createdAt: text(row.createdAt, 50),
    updatedAt: text(row.updatedAt, 50),
  };
}

const AUTHOR_SELECT = `SELECT
  id, name, title, short_intro AS shortIntro, biography, portrait_key AS portraitKey,
  portrait_url AS portraitUrl, portrait_alt AS portraitAlt, portrait_focal_x AS portraitFocalX,
  portrait_focal_y AS portraitFocalY, book_image_key AS bookImageKey, book_image_url AS bookImageUrl,
  book_image_alt AS bookImageAlt, website_url AS websiteUrl, social_links AS socialLinks,
  related_book_ids AS relatedBookIds, cta_label AS ctaLabel, cta_url AS ctaUrl, status,
  start_at AS startAt, end_at AS endAt, display_order AS displayOrder,
  created_at AS createdAt, updated_at AS updatedAt
FROM authors`;

async function getAuthorById(env: Env, authorId: string): Promise<AuthorRecord | null> {
  const row = await env.DB.prepare(`${AUTHOR_SELECT} WHERE id = ?1`)
    .bind(text(authorId, 60))
    .first<Record<string, unknown>>();
  return row ? mapAuthorRecord(row) : null;
}

async function listAdminAuthors(env: Env, status: string): Promise<AuthorRecord[]> {
  const rows = status
    ? await env.DB.prepare(`${AUTHOR_SELECT} WHERE status = ?1 ORDER BY display_order ASC, datetime(created_at) DESC`).bind(status).all<Record<string, unknown>>()
    : await env.DB.prepare(`${AUTHOR_SELECT} ORDER BY display_order ASC, datetime(created_at) DESC`).all<Record<string, unknown>>();
  return (rows.results || []).map(mapAuthorRecord);
}

async function saveAdminAuthor(
  env: Env,
  admin: AuthenticatedAdmin,
  body: Record<string, string>,
): Promise<AuthorRecord> {
  const existing = body.authorId ? await getAuthorById(env, body.authorId) : null;
  const authorId = existing?.id || "AU-" + crypto.randomUUID().slice(0, 10).toUpperCase();
  const name = text(body.name, 200);
  if (!name) throw new HttpError(400, "Author name is required.");

  let socialLinks: Record<string, string> = {};
  if (typeof body.socialLinks === "string") {
    try {
      const parsed = JSON.parse(body.socialLinks || "{}") as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("object required");
      }
      for (const key of ["facebook", "instagram", "linkedin", "tiktok", "youtube"]) {
        const value = safeUrl(String((parsed as Record<string, unknown>)[key] || ""));
        if (value) socialLinks[key] = value;
      }
    } catch {
      throw new HttpError(400, "Social links must be valid JSON.");
    }
  } else if (existing?.socialLinks) {
    try {
      const parsed = JSON.parse(existing.socialLinks);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) socialLinks = parsed as Record<string, string>;
    } catch {}
  }

  await env.DB.prepare(
    `INSERT INTO authors (
      id, name, title, short_intro, biography, website_url, social_links, related_book_ids,
      cta_label, cta_url, status, start_at, end_at, display_order,
      portrait_focal_x, portrait_focal_y, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '[]', '', '', ?8, ?9, ?10, 0, ?11, ?12,
      COALESCE((SELECT created_at FROM authors WHERE id = ?1), datetime('now')), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      title = excluded.title,
      short_intro = excluded.short_intro,
      biography = excluded.biography,
      website_url = excluded.website_url,
      social_links = excluded.social_links,
      related_book_ids = '[]',
      cta_label = '',
      cta_url = '',
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      display_order = 0,
      portrait_focal_x = excluded.portrait_focal_x,
      portrait_focal_y = excluded.portrait_focal_y,
      updated_at = datetime('now')`,
  )
    .bind(
      authorId,
      name,
      text(body.title, 200),
      text(body.biography, 12000).slice(0, 500),
      text(body.biography, 12000),
      typeof body.websiteUrl === "string" ? safeUrl(body.websiteUrl) : existing?.websiteUrl || "",
      JSON.stringify(socialLinks),
      existing?.status || "Draft",
      typeof body.startAt === "string" ? text(body.startAt, 50) : existing?.startAt || "",
      typeof body.endAt === "string" ? text(body.endAt, 50) : existing?.endAt || "",
      Math.min(100, Math.max(0, Number(existing?.portraitFocalX ?? 50))),
      Math.min(100, Math.max(0, Number(existing?.portraitFocalY ?? 50))),
    )
    .run();

  await writeAuditLog(env, admin, existing ? "author.update" : "author.create", "author", authorId, JSON.stringify(body));
  const saved = await getAuthorById(env, authorId);
  if (!saved) throw new Error("Author could not be reloaded after saving.");
  return saved;
}

async function setAuthorStatus(
  env: Env,
  admin: AuthenticatedAdmin,
  authorId: string,
  status: "Published" | "Draft",
): Promise<AuthorRecord> {
  const author = await getAuthorById(env, authorId);
  if (!author) throw new HttpError(404, "Author not found.");
  if (status === "Published") {
    if (!author.name) throw new HttpError(400, "Add an author name before publishing.");
    // Only one author may be Published at a time (enforced by a partial unique
    // index too); demote any currently-published author first so publishing a
    // new one is a smooth swap instead of a constraint-violation error.
    await env.DB.prepare("UPDATE authors SET status = 'Draft', updated_at = datetime('now') WHERE status = 'Published' AND id != ?1")
      .bind(authorId)
      .run();
  }
  await env.DB.prepare("UPDATE authors SET status = ?2, updated_at = datetime('now') WHERE id = ?1")
    .bind(authorId, status)
    .run();
  await writeAuditLog(env, admin, status === "Published" ? "author.publish" : "author.hide", "author", authorId, "");
  const updated = await getAuthorById(env, authorId);
  if (!updated) throw new Error("Author could not be reloaded after updating.");
  return updated;
}

async function uploadAuthorPortrait(request: Request, env: Env, authorId: string) {
  const author = await getAuthorById(env, authorId);
  if (!author) throw new HttpError(404, "Author not found.");
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image file.");
  const mimeType = file.type.toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new HttpError(400, "Use a PNG, JPG, JPEG, or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "Portrait must be 5 MB or smaller.");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const portraitKey = `authors/${authorId}/${crypto.randomUUID()}.${extension}`;
  await env.BOOK_ASSETS.put(portraitKey, await file.arrayBuffer(), { httpMetadata: { contentType: mimeType } });
  const portraitUrl = buildPublicAuthorPortraitUrl(env, portraitKey);
  if (author.portraitKey) await env.BOOK_ASSETS.delete(author.portraitKey);
  await env.DB.prepare("UPDATE authors SET portrait_key = ?2, portrait_url = ?3, portrait_alt = ?4, updated_at = datetime('now') WHERE id = ?1")
    .bind(authorId, portraitKey, portraitUrl, text(formData.get("alt"), 300) || author.name)
    .run();
  return { portraitKey, portraitUrl };
}

async function uploadAuthorBookImage(request: Request, env: Env, authorId: string) {
  const author = await getAuthorById(env, authorId);
  if (!author) throw new HttpError(404, "Author not found.");
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image file.");
  const mimeType = file.type.toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new HttpError(400, "Use a PNG, JPG, JPEG, or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "Book image must be 5 MB or smaller.");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const bookImageKey = `authors/${authorId}/book-${crypto.randomUUID()}.${extension}`;
  await env.BOOK_ASSETS.put(bookImageKey, await file.arrayBuffer(), { httpMetadata: { contentType: mimeType } });
  const bookImageUrl = buildPublicAuthorPortraitUrl(env, bookImageKey);
  if (author.bookImageKey) await env.BOOK_ASSETS.delete(author.bookImageKey);
  await env.DB.prepare("UPDATE authors SET book_image_key = ?2, book_image_url = ?3, book_image_alt = ?4, updated_at = datetime('now') WHERE id = ?1")
    .bind(authorId, bookImageKey, bookImageUrl, text(formData.get("alt"), 300) || (author.name + " book cover"))
    .run();
  return { bookImageKey, bookImageUrl };
}


async function removeAuthorPortrait(env: Env, authorId: string) {
  const author = await getAuthorById(env, authorId);
  if (!author) throw new HttpError(404, "Author not found.");
  if (author.portraitKey) await env.BOOK_ASSETS.delete(author.portraitKey);
  await env.DB.prepare("UPDATE authors SET portrait_key = '', portrait_url = '', portrait_alt = '', updated_at = datetime('now') WHERE id = ?1")
    .bind(authorId)
    .run();
}

async function deleteAuthor(env: Env, authorId: string) {
  const author = await getAuthorById(env, authorId);
  if (!author) throw new HttpError(404, "Author not found.");
  if (author.portraitKey) await env.BOOK_ASSETS.delete(author.portraitKey);
  if (author.bookImageKey) await env.BOOK_ASSETS.delete(author.bookImageKey);
  await env.DB.prepare("DELETE FROM authors WHERE id = ?1").bind(authorId).run();
}

async function getPublicFeaturedAuthor(env: Env): Promise<Record<string, unknown> | null> {
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `${AUTHOR_SELECT} WHERE status = 'Published'
       AND (start_at = '' OR start_at <= ?1)
       AND (end_at = '' OR end_at >= ?1)
     LIMIT 1`,
  )
    .bind(now)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const author = mapAuthorRecord(row);
  let relatedBooks: Array<{ bookId: string; title: string; imageUrl: string }> = [];
  try {
    const ids = (JSON.parse(author.relatedBookIds || "[]") as unknown[]).map((id) => String(id || "")).filter(Boolean);
    if (ids.length) {
      const books = await listAllStoreBooks(env);
      relatedBooks = ids
        .map((id) => books.find((book) => book.bookId === id && isPublicBookStatus(book.status)))
        .filter((book): book is BookRecord => Boolean(book))
        .map((book) => ({ bookId: book.bookId, title: book.title, imageUrl: book.imageUrl }));
    }
  } catch {
    relatedBooks = [];
  }
  return {
    id: author.id,
    name: author.name,
    title: author.title,
    shortIntro: author.shortIntro,
    biography: author.biography,
    bookImageUrl: author.bookImageUrl,
    bookImageAlt: author.bookImageAlt || (author.name + " book cover"),
    portraitUrl: author.portraitUrl,
    portraitAlt: author.portraitAlt || author.name,
    portraitFocalX: author.portraitFocalX,
    portraitFocalY: author.portraitFocalY,
    websiteUrl: author.websiteUrl,
    socialLinks: (() => {
      try {
        return JSON.parse(author.socialLinks || "[]");
      } catch {
        return {};
      }
    })(),
    ctaLabel: author.ctaLabel,
    ctaUrl: author.ctaUrl,
    relatedBooks,
  };
}

/**
 * Public, redacted sponsor recognition feed for read-it-forward.html. Only
 * Published sponsors are ever returned. Page Pal / Chapter Champion /
 * Bookshelf Builder sponsors are grouped into simple named lists (with
 * anonymous sponsors consolidated into a single count); Literacy Trailblazer
 * sponsors are returned individually since they may show a logo.
 */
async function listPublicSponsors(env: Env, params: URLSearchParams) {
  const lowerPage = clampInt(params.get("lowerPage"), 1, 1000, 1);
  const lowerPageSize = clampInt(params.get("lowerPageSize"), 1, 50, 50);
  const page = clampInt(params.get("page"), 1, 1000, 1);
  const pageSize = clampInt(params.get("pageSize"), 1, 21, 21);

  const namedGroups: Record<string, { names: string[]; anonymousCount: number }> = {
    pagePal: { names: [], anonymousCount: 0 },
    chapterChampion: { names: [], anonymousCount: 0 },
    bookshelfBuilder: { names: [], anonymousCount: 0 },
  };
  const groupRows = await env.DB.prepare(
    SPONSOR_SELECT + " WHERE recognition_status = 'Published' AND package IN ('pagePal','chapterChampion','bookshelfBuilder') ORDER BY display_order ASC, datetime(created_at) ASC",
  ).all<Record<string, unknown>>();
  for (const row of groupRows.results || []) {
    const sponsor = mapSponsorRecord(row);
    const group = namedGroups[sponsor.package];
    if (!group) continue;
    if (sponsor.anonymous || !sponsor.displayName) group.anonymousCount += 1;
    else group.names.push(sponsor.displayName);
  }

  const lowerTotalRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM sponsors WHERE recognition_status = 'Published' AND package IN ('pagePal','chapterChampion','bookshelfBuilder')",
  ).first<{ count: number }>();
  const lowerRows = await env.DB.prepare(
    SPONSOR_SELECT + " WHERE recognition_status = 'Published' AND package IN ('pagePal','chapterChampion','bookshelfBuilder') ORDER BY CASE WHEN paid_at != '' THEN datetime(paid_at) ELSE datetime(created_at) END DESC, datetime(created_at) DESC, id DESC LIMIT ?1 OFFSET ?2",
  )
    .bind(lowerPageSize, (lowerPage - 1) * lowerPageSize)
    .all<Record<string, unknown>>();

  const totalRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM sponsors WHERE recognition_status = 'Published' AND package = 'literacyTrailblazer'",
  ).first<{ count: number }>();
  const trailblazerRows = await env.DB.prepare(
    SPONSOR_SELECT + " WHERE recognition_status = 'Published' AND package = 'literacyTrailblazer' ORDER BY CASE WHEN paid_at != '' THEN datetime(paid_at) ELSE datetime(created_at) END DESC, datetime(created_at) DESC, id DESC LIMIT ?1 OFFSET ?2",
  )
    .bind(pageSize, (page - 1) * pageSize)
    .all<Record<string, unknown>>();

  const packageLabel = (packageKey: SponsorPackageKey | string) =>
    SPONSOR_PACKAGES[packageKey as SponsorPackageKey]?.label || packageKey;

  return {
    // Kept for compatibility with older clients.
    groups: Object.entries(namedGroups).map(([packageKey, group]) => ({
      package: packageKey,
      label: packageLabel(packageKey),
      names: group.names,
      anonymousCount: group.anonymousCount,
    })),
    lowerSponsors: (lowerRows.results || []).map((row) => {
      const sponsor = mapSponsorRecord(row);
      return {
        id: sponsor.id,
        package: sponsor.package,
        packageLabel: packageLabel(sponsor.package),
        displayName: sponsor.anonymous ? "" : sponsor.displayName,
        anonymous: sponsor.anonymous,
      };
    }),
    lowerTotal: Number(lowerTotalRow?.count || 0),
    lowerPage,
    lowerPageSize,
    trailblazers: (trailblazerRows.results || []).map((row) => {
      const sponsor = mapSponsorRecord(row);
      return {
        id: sponsor.id,
        displayName: sponsor.anonymous ? "" : sponsor.displayName,
        anonymous: sponsor.anonymous,
        booksSponsored: sponsor.booksSponsored,
        logoUrl: sponsor.anonymous ? "" : sponsor.logoUrl,
        logoAlt: sponsor.anonymous ? "" : sponsor.logoAlt,
        websiteUrl: sponsor.anonymous ? "" : sponsor.websiteUrl,
      };
    }),
    trailblazerTotal: Number(totalRow?.count || 0),
    total: Number(totalRow?.count || 0),
    page,
    pageSize,
  };
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
    "SELECT order_number AS orderNumber, square_order_id AS squareOrderId, square_payment_id AS squarePaymentId, created_at AS date, customer_name AS customer, customer_email AS email, subtotal, shipping, tax, total, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, tracking_number AS trackingNumber, shipping_address AS shippingAddress, notes FROM orders ORDER BY datetime(created_at) DESC LIMIT ?1",
  ).bind(limit).all<Record<string, unknown>>();
  const orders = rows.results || [];
  if (!orders.length) return orders;

  const orderNumbers = orders.map((order) => text(order.orderNumber, 120));
  const placeholders = orderNumbers.map((_, index) => `?${index + 1}`).join(",");
  const itemRows = await env.DB.prepare(
    `SELECT order_number AS orderNumber, book_id AS bookId, sku, title, quantity, unit_price AS unitPrice, line_total AS lineTotal FROM order_items WHERE order_number IN (${placeholders})`,
  )
    .bind(...orderNumbers)
    .all<Record<string, unknown>>();

  const itemsByOrder = new Map<string, Record<string, unknown>[]>();
  for (const item of itemRows.results || []) {
    const key = text(item.orderNumber, 120);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key)!.push(item);
  }
  return orders.map((order) => ({ ...order, items: itemsByOrder.get(text(order.orderNumber, 120)) || [] }));
}

async function updateFulfillment(env: Env, orderNumber: string, body: Record<string, string>) {
  await env.DB.prepare("UPDATE orders SET fulfillment_status = ?2, tracking_number = ?3, notes = ?4 WHERE order_number = ?1")
    .bind(text(orderNumber, 120), text(body.fulfillmentStatus, 80) || "Unfulfilled", text(body.trackingNumber, 200), text(body.notes, 4000))
    .run();
  const rows = await env.DB.prepare(
    "SELECT order_number AS orderNumber, square_order_id AS squareOrderId, square_payment_id AS squarePaymentId, created_at AS date, customer_name AS customer, customer_email AS email, subtotal, shipping, tax, total, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, tracking_number AS trackingNumber, shipping_address AS shippingAddress, notes FROM orders WHERE order_number = ?1",
  ).bind(text(orderNumber, 120)).first();
  return rows;
}

async function getNewsletterBuilderState(env: Env, admin: AuthenticatedAdmin) {
  const books = (await listAllStoreBooks(env)).filter((book) => book.status !== "Archived").map((book) => ({ bookId: book.bookId, title: book.title, author: book.author, shortDescription: book.shortDescription || book.synopsis, imageUrl: book.imageUrl, status: book.status }));
  const bookBuzzTargets = await env.DB.prepare(
    "SELECT title, COUNT(*) AS signups FROM form_submissions WHERE form_type = 'bookNotification' AND title != '' AND status != 'Unsubscribed' GROUP BY title ORDER BY signups DESC, title ASC",
  ).all<{ title: string; signups: number }>();
  const campaigns = await env.DB.prepare(
    "SELECT campaign_id AS campaignId, created_at AS createdAt, updated_at AS updatedAt, status, title, subject, preview_text AS previewText, audience, target_type AS targetType, target_value AS targetValue, from_name AS fromName, hero_message AS heroMessage, hero_cta_label AS heroCtaLabel, hero_cta_url AS heroCtaUrl, featured_book_id AS featuredBookId, featured_book_title AS featuredBookTitle, featured_book_description AS featuredBookDescription, featured_book_image_url AS featuredBookImageUrl, featured_cta_label AS featuredCtaLabel, featured_cta_url AS featuredCtaUrl, quick1_title AS quick1Title, quick1_text AS quick1Text, quick1_url AS quick1Url, quick2_title AS quick2Title, quick2_text AS quick2Text, quick2_url AS quick2Url, closing_note AS closingNote, send_date AS sendDate, send_time AS sendTime, time_zone AS timeZone, scheduled_at AS scheduledAt, sent_at AS sentAt, recipients, sent, failed, last_error AS lastError FROM newsletter_campaigns ORDER BY updated_at DESC LIMIT 30",
  ).all();
  return {
    subscriberCount: await countQuery(env, "SELECT COUNT(*) AS count FROM newsletter_subscribers WHERE status = 'active' AND consent = 1"),
    adminEmail: admin.email,
    siteUrl: firstUrlValue(env.SITE_URL),
    books,
    bookBuzzTargets: bookBuzzTargets.results || [],
    campaigns: campaigns.results || [],
    defaults: { ...NEWSLETTER_DEFAULTS, fromName: "Jackrabbit Punkin Publishing LLC", heroCtaUrl: firstUrlValue(env.SITE_URL), quick1Url: firstUrlValue(env.SITE_URL), quick2Url: firstUrlValue(env.SITE_URL) },
  };
}

async function saveNewsletterCampaign(env: Env, body: Record<string, string>): Promise<NewsletterCampaignRecord> {
  const campaignId = text(body.campaignId, 120) || "NL-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const normalized = normalizeNewsletterPayload(body);
  await env.DB.prepare(
    `INSERT INTO newsletter_campaigns (
      campaign_id, created_at, updated_at, status, title, subject, preview_text,
      audience, target_type, target_value, from_name, hero_message, hero_cta_label, hero_cta_url,
      featured_book_id, featured_book_title, featured_book_description, featured_book_image_url,
      featured_cta_label, featured_cta_url, quick1_title, quick1_text, quick1_url,
      quick2_title, quick2_text, quick2_url, closing_note, send_date, send_time,
      time_zone, scheduled_at, sent_at, recipients, sent, failed, last_error
    ) VALUES (?1, COALESCE((SELECT created_at FROM newsletter_campaigns WHERE campaign_id = ?1), datetime('now')), datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, COALESCE((SELECT sent_at FROM newsletter_campaigns WHERE campaign_id = ?1), ''), COALESCE((SELECT recipients FROM newsletter_campaigns WHERE campaign_id = ?1), 0), COALESCE((SELECT sent FROM newsletter_campaigns WHERE campaign_id = ?1), 0), COALESCE((SELECT failed FROM newsletter_campaigns WHERE campaign_id = ?1), 0), '')
    ON CONFLICT(campaign_id) DO UPDATE SET
      updated_at = datetime('now'),
      status = excluded.status,
      title = excluded.title,
      subject = excluded.subject,
      preview_text = excluded.preview_text,
      audience = excluded.audience,
      target_type = excluded.target_type,
      target_value = excluded.target_value,
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
    .bind(campaignId, normalized.status, normalized.title, normalized.subject, normalized.previewText, normalized.audience, normalized.targetType, normalized.targetValue, normalized.fromName, normalized.heroMessage, normalized.heroCtaLabel, normalized.heroCtaUrl, normalized.featuredBookId, normalized.featuredBookTitle, normalized.featuredBookDescription, normalized.featuredBookImageUrl, normalized.featuredCtaLabel, normalized.featuredCtaUrl, normalized.quick1Title, normalized.quick1Text, normalized.quick1Url, normalized.quick2Title, normalized.quick2Text, normalized.quick2Url, normalized.closingNote, normalized.sendDate, normalized.sendTime, normalized.timeZone, normalized.scheduledAt)
    .run();
  const campaign = await env.DB.prepare(
    "SELECT campaign_id AS campaignId, created_at AS createdAt, updated_at AS updatedAt, status, title, subject, preview_text AS previewText, audience, target_type AS targetType, target_value AS targetValue, from_name AS fromName, hero_message AS heroMessage, hero_cta_label AS heroCtaLabel, hero_cta_url AS heroCtaUrl, featured_book_id AS featuredBookId, featured_book_title AS featuredBookTitle, featured_book_description AS featuredBookDescription, featured_book_image_url AS featuredBookImageUrl, featured_cta_label AS featuredCtaLabel, featured_cta_url AS featuredCtaUrl, quick1_title AS quick1Title, quick1_text AS quick1Text, quick1_url AS quick1Url, quick2_title AS quick2Title, quick2_text AS quick2Text, quick2_url AS quick2Url, closing_note AS closingNote, send_date AS sendDate, send_time AS sendTime, time_zone AS timeZone, scheduled_at AS scheduledAt, sent_at AS sentAt, recipients, sent, failed, last_error AS lastError FROM newsletter_campaigns WHERE campaign_id = ?1",
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
    targetType: text(body.targetType, 40) === "book_interest" ? "book_interest" : "all",
    targetValue: text(body.targetValue, 240),
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
    "SELECT email, role, display_name AS displayName, full_name AS name, avatar_url AS avatarUrl, created_at AS createdAt, updated_at AS updatedAt FROM admins ORDER BY email ASC",
  ).all<AdminUser>();
  return rows.results || [];
}

async function saveAdmin(env: Env, body: Record<string, string>): Promise<AdminUser> {
  const email = text(body.email, 320).toLowerCase();
  const role = text(body.role, 40) as AdminRole;
  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!ADMIN_ROLE_ORDER.includes(role)) throw new HttpError(400, "Select a valid admin role.");
  await env.DB.prepare(
    `INSERT INTO admins (email, role, display_name, full_name, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
     ON CONFLICT(email) DO UPDATE SET role = excluded.role, display_name = excluded.display_name, full_name = excluded.full_name, updated_at = datetime('now')`,
  )
    .bind(email, role, text(body.displayName, 200), text(body.name, 200) || text(body.displayName, 200))
    .run();
  const admin = await env.DB.prepare(
    "SELECT email, role, display_name AS displayName, full_name AS name, avatar_url AS avatarUrl, created_at AS createdAt, updated_at AS updatedAt FROM admins WHERE email = ?1",
  ).bind(email).first<AdminUser>();
  if (!admin) throw new Error("Admin could not be reloaded after saving.");
  return admin;
}

async function sendSubmissionEmails(env: Env, formType: FormType, record: ReturnType<typeof normalizeFormRecord>) {
  const submitterEmail = record.email.toLowerCase();
  if (formType !== "bookNotification") {
    const adminMessage = buildAdminMessage(formType, record, firstUrlValue(env.SITE_URL));
    await sendEmail(env, { to: env.ADMIN_NOTIFICATION_EMAIL, subject: adminMessage.subject, html: adminMessage.html, text: adminMessage.text, replyTo: isValidEmail(submitterEmail) ? submitterEmail : env.ADMIN_NOTIFICATION_EMAIL, fromName: "Jackrabbit Punkin Publishing Website" });
  }
  if (isValidEmail(submitterEmail)) {
    const userMessage = buildUserMessage(formType, record, firstUrlValue(env.SITE_URL), await getUnsubscribeUrl(env, submitterEmail));
    await sendEmail(env, { to: submitterEmail, subject: userMessage.subject, html: userMessage.html, text: userMessage.text, replyTo: env.ADMIN_NOTIFICATION_EMAIL, fromName: "Jackrabbit Punkin Publishing LLC" });
  }
}

function pdfLatin1ToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function pdfBytesToLatin1(bytes: Uint8Array): string {
  let value = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    for (const byte of chunk) value += String.fromCharCode(byte);
  }
  return value;
}

function pdfString(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/([\\()])/g, "\\$1");
}

function getPdfObject(source: string, objectNumber: number): string {
  const expression = new RegExp(
    `[\\r\\n]${objectNumber} 0 obj[\\r\\n]([\\s\\S]*?)[\\r\\n]endobj`,
  );
  const match = source.match(expression);
  if (!match) throw new Error("Certificate PDF object " + objectNumber + " was not found.");
  return match[1];
}

function buildCertificateAppearance(
  width: number,
  height: number,
  fontSize: number,
  value: string,
  alignment: "left" | "center" = "left",
): string {
  const escaped = pdfString(value);
  const estimatedTextWidth = Math.min(width - 6, value.length * fontSize * 0.52);
  const textX = alignment === "center"
    ? Math.max(3, Math.round((width - estimatedTextWidth) / 2))
    : 3;
  const stream = `q\nBT\n/TiIt ${fontSize} Tf\n0.121569 0.235294 0.533333 rg\n${textX} ${Math.max(4, Math.round((height - fontSize) / 2))} Td\n(${escaped}) Tj\nET\nQ\n`;
  return `<< /BBox [0 0 ${width} ${height}] /FormType 1 /Length ${stream.length} /Matrix [1 0 0 1 0 0] /Resources << /Font << /TiIt 13 0 R >> /ProcSet [/PDF /Text] >> /Subtype /Form /Type /XObject >>\nstream\n${stream}endstream`;
}

function fillSponsorCertificate(template: ArrayBuffer, recipient: string, date: string): Uint8Array {
  const original = pdfBytesToLatin1(new Uint8Array(template));
  const startXrefMatches = [...original.matchAll(/startxref[\r\n]+(\d+)/g)];
  const originalStartXref = startXrefMatches.at(-1)?.[1];
  if (!originalStartXref) throw new Error("Certificate PDF xref pointer was not found.");

  const updatedObjects = new Map<number, string>();
  updatedObjects.set(9, getPdfObject(original, 9).replace(">>/Fields[", ">>/NeedAppearances true/Fields["));
  for (const [objectNumber, value] of [[11, recipient], [15, date]] as const) {
    updatedObjects.set(
      objectNumber,
      getPdfObject(original, objectNumber)
        .replace("/V()", `/V(${pdfString(value)})`)
        .replace("/Ff 0", "/Ff 1"),
    );
  }
  const recipientFontSize = Math.min(23, Math.max(10, Math.floor(340 / Math.max(1, recipient.length * 0.52))));
  updatedObjects.set(12, buildCertificateAppearance(360, 32, recipientFontSize, recipient, "center"));
  updatedObjects.set(16, buildCertificateAppearance(150, 16, 10, date));

  let source = original;
  const objectOffsets = new Map<number, number>();
  for (const objectNumber of [9, 11, 12, 15, 16]) {
    objectOffsets.set(objectNumber, source.length);
    source += `${objectNumber} 0 obj\n${updatedObjects.get(objectNumber)}\nendobj\n`;
  }

  const xrefOffset = source.length;
  const xref = [
    "xref\n",
    "9 1\n",
    String(objectOffsets.get(9)).padStart(10, "0") + " 00000 n \n",
    "11 2\n",
    String(objectOffsets.get(11)).padStart(10, "0") + " 00000 n \n",
    String(objectOffsets.get(12)).padStart(10, "0") + " 00000 n \n",
    "15 2\n",
    String(objectOffsets.get(15)).padStart(10, "0") + " 00000 n \n",
    String(objectOffsets.get(16)).padStart(10, "0") + " 00000 n \n",
  ].join("");
  const sizeMatches = [...original.matchAll(/\/Size(\d+)/g)];
  const pdfSize = sizeMatches.at(-1)?.[1] || "62";
  const trailer = `trailer\n<</Size ${pdfSize}/Root 8 0 R/Prev ${originalStartXref}>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdfLatin1ToBytes(source + xref + trailer);
}

function formatSponsorCertificateDate(value: string): string {
  const date = new Date(value);
  const validDate = Number.isFinite(date.getTime()) ? date : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SPONSOR_CERTIFICATE_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(validDate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.month} ${values.day}, ${values.year} at ${values.hour}:${values.minute} ${values.dayPeriod}`;
}

function pdfBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    for (const byte of chunk) binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function sendSponsorCertificateIfEligible(
  env: Env,
  sponsorId: string,
  paymentTimestamp: string,
): Promise<void> {
  const sponsor = await env.DB.prepare(
    "SELECT package, payer_name AS payerName, payer_email AS payerEmail, mailing_address AS mailingAddress, certificate_status AS certificateStatus FROM sponsors WHERE id = ?1",
  )
    .bind(sponsorId)
    .first<{ package: string; payerName: string; payerEmail: string; mailingAddress: string; certificateStatus: string }>();
  if (!sponsor || !SPONSOR_CERTIFICATE_PACKAGES.has(sponsor.package as SponsorPackageKey)) return;
  if (sponsor.certificateStatus === "sent") return;

  await env.DB.prepare(
    "UPDATE sponsors SET certificate_status = 'sending', certificate_error = '', updated_at = datetime('now') WHERE id = ?1 AND certificate_status != 'sent'",
  )
    .bind(sponsorId)
    .run();

  try {
    if (!isValidEmail(sponsor.payerEmail)) {
      throw new Error("The paid sponsor does not have a valid certificate email address.");
    }
    if (!text(sponsor.mailingAddress, 1200)) {
      throw new Error("The paid Literacy Trailblazer does not have a mailing address for the certificate.");
    }
    if (!isValidEmail(env.ADMIN_NOTIFICATION_EMAIL)) {
      throw new Error("The admin notification email is not configured for certificate preparation.");
    }
    const assetUrl = new URL(SPONSOR_CERTIFICATE_ASSET_PATH, firstUrlValue(env.SITE_URL)).toString();
    const templateResponse = await env.ASSETS.fetch(new Request(assetUrl));
    if (!templateResponse.ok) {
      throw new Error("Certificate template could not be loaded from static assets.");
    }
    const certificateRecipient = text(sponsor.payerName, 100) || "Read It Forward Sponsor";
    const certificateDate = formatSponsorCertificateDate(paymentTimestamp);
    const certificate = fillSponsorCertificate(
      await templateResponse.arrayBuffer(),
      certificateRecipient,
      certificateDate,
    );
    const safeName = escapeHtml(certificateRecipient);
    const safeAddress = escapeHtml(text(sponsor.mailingAddress, 1200)).replace(/\n/g, "<br>");
    await sendEmail(env, {
      to: env.ADMIN_NOTIFICATION_EMAIL,
      subject: "Prepare Literacy Trailblazer Certificate | " + certificateRecipient,
      text: [
        "A Literacy Trailblazer sponsorship has been paid.",
        "Prepare, sign, and mail the attached JPP Certificate of Appreciation within 3–4 business days.",
        "Recipient: " + certificateRecipient,
        "Mailing address:",
        text(sponsor.mailingAddress, 1200),
        "Payment date: " + certificateDate,
      ].join("\n"),
      html: `<p>A <strong>Literacy Trailblazer</strong> sponsorship has been paid.</p><p>Please prepare, sign, and mail the attached JPP Certificate of Appreciation within 3–4 business days.</p><p><strong>Recipient:</strong> ${safeName}<br><strong>Mailing address:</strong><br>${safeAddress}<br><strong>Payment date:</strong> ${certificateDate}</p>`,
      replyTo: sponsor.payerEmail,
      fromName: "Jackrabbit Punkin Publishing LLC",
      idempotencyKey: "sponsor-certificate-admin-" + sponsorId,
      attachments: [{
        filename: "JPP_Certificate_of_Appreciation_09222026.pdf",
        content: pdfBytesToBase64(certificate),
      }],
    });
    await sendEmail(env, {
      to: sponsor.payerEmail,
      subject: "Your JPP Certificate of Appreciation is being prepared",
      text: [
        "Thank you for supporting JPP's Read It Forward Program.",
        "Your personalized Literacy Trailblazer Certificate of Appreciation is being prepared, signed, and will be mailed within 3–4 business days after your sponsorship is confirmed.",
        "Recipient: " + certificateRecipient,
        "Payment date: " + certificateDate,
      ].join("\n"),
      html: `<p>Thank you for supporting JPP's <strong>Read It Forward Program</strong>.</p><p>Your personalized Literacy Trailblazer Certificate of Appreciation is being prepared, signed, and will be mailed within 3–4 business days after your sponsorship is confirmed.</p><p><strong>Recipient:</strong> ${safeName}<br><strong>Payment date:</strong> ${certificateDate}</p>`,
      replyTo: env.ADMIN_NOTIFICATION_EMAIL,
      fromName: "Jackrabbit Punkin Publishing LLC",
      idempotencyKey: "sponsor-certificate-confirmation-" + sponsorId,
    });
    await env.DB.prepare(
      "UPDATE sponsors SET certificate_status = 'sent', certificate_sent_at = datetime('now'), certificate_error = '', updated_at = datetime('now') WHERE id = ?1",
    )
      .bind(sponsorId)
      .run();
  } catch (error) {
    await env.DB.prepare(
      "UPDATE sponsors SET certificate_status = 'error', certificate_error = ?2, updated_at = datetime('now') WHERE id = ?1",
    )
      .bind(sponsorId, getErrorMessage(error).slice(0, 500))
      .run();
    throw error;
  }
}
async function sendEmail(
  env: Env,
  message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo: string;
    fromName: string;
    attachments?: Array<{ filename: string; content: string }>;
    idempotencyKey?: string;
  },
) {
  const headers = new Headers({
    Authorization: "Bearer " + env.RESEND_API_KEY,
    "Content-Type": "application/json",
  });
  if (message.idempotencyKey) headers.set("Idempotency-Key", message.idempotencyKey);
  const body: Record<string, unknown> = {
    from: message.fromName + " <" + env.MAIL_FROM_EMAIL + ">",
    to: [message.to],
    reply_to: message.replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
  if (message.attachments?.length) body.attachments = message.attachments;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("Resend send failed (" + response.status + "): " + (await response.text()));
  }
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
    ["Preferred speaker", record.preferredSpeaker],
    ["Speaking budget", record.speakingBudget],
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
    html: buildEmailHtml({ eyebrow: "NEW WEBSITE SUBMISSION", heading: FORM_ROUTES[formType].summaryLabel, intro: "A new submission was received from the Jackrabbit Punkin Publishing website.", details, buttonLabel: "Open website", buttonUrl: siteUrl, siteUrl, footer: "This administrative notification was generated automatically by the website." }),
  };
}

function buildUserMessage(formType: FormType, record: ReturnType<typeof normalizeFormRecord>, siteUrl: string, unsubscribeUrl: string) {
  const copies: Record<FormType, { subject: string; heading: string; paragraphs: string[]; footer: string }> = {
    contact: { subject: "We received your message | Jackrabbit Punkin Publishing", heading: "Your message is on its way", paragraphs: ["Thank you for contacting Jackrabbit Punkin Publishing LLC. Your message has been received, and a member of JPP will respond as soon as possible."], footer: "You received this confirmation because you submitted the contact form on our website." },
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
    html: buildEmailHtml({ eyebrow: "THANK YOU", heading: copy.heading, intro: "Hi " + firstName + ",", paragraphs: copy.paragraphs, buttonLabel: "Visit our website", buttonUrl: siteUrl, siteUrl, footer: copy.footer, unsubscribeUrl: formType === "newsletter" ? unsubscribeUrl : "" }),
  };
}

function buildEmailHtml(options: { eyebrow: string; heading: string; intro: string; paragraphs?: string[]; details?: string[][]; buttonLabel: string; buttonUrl: string; siteUrl: string; footer: string; unsubscribeUrl?: string }) {
  const paragraphs = (options.paragraphs || []).map((paragraph) => '<p style="margin:0 0 18px;color:#26354a;font-size:16px;line-height:1.65;">' + escapeHtml(paragraph) + "</p>").join("");
  const details = (options.details || []).map(([label, value], index) => "<tr>" + '<td style="' + (index ? "border-top:1px solid #e7dfd0;" : "") + 'padding:12px 14px;width:32%;color:#542476;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;vertical-align:top;">' + escapeHtml(label) + "</td>" + '<td style="' + (index ? "border-top:1px solid #e7dfd0;" : "") + 'padding:12px 14px;color:#26354a;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;">' + linkValue(value) + "</td></tr>").join("");
  const content = paragraphs || (details ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7dfd0;border-radius:8px;border-collapse:separate;overflow:hidden;">' + details + "</table>" : "");
  const unsubscribe = options.unsubscribeUrl ? '<br><br><a href="' + escapeHtml(options.unsubscribeUrl) + '" style="color:#542476;text-decoration:underline;">Unsubscribe from these emails</a>' : "";
  const logoUrl = options.siteUrl.replace(/\/$/, "") + "/assets/jrppLogo2.png";
  return '<!doctype html><html><body style="margin:0;padding:0;background:#fbf8f1;font-family:Arial,Helvetica,sans-serif;">' + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf8f1;"><tr><td align="center" style="padding:28px 12px;">' + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e7dfd0;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(10,22,40,.08);">' + '<tr><td style="background:#0a1628;padding:28px 32px;">' + '<table role="presentation" cellspacing="0" cellpadding="0"><tr>' + '<td style="width:52px;"><img src="' + escapeHtml(logoUrl) + '" width="52" height="52" alt="Jackrabbit Punkin Publishing" style="display:block;border-radius:50%;border:2px solid #d4ad55;" /></td>' + '<td style="padding-left:16px;color:#ffffff;"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;line-height:1.2;">Jackrabbit Punkin Publishing</div><div style="margin-top:5px;color:#d4ad55;font-size:12px;letter-spacing:.6px;">Stories That Inspire. Books That Endure.</div></td>' + '</tr></table></td></tr><tr><td style="height:5px;background:#d4ad55;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:36px 32px 32px;">' + '<div style="margin-bottom:10px;color:#542476;font-size:12px;font-weight:700;letter-spacing:1.6px;">' + escapeHtml(options.eyebrow) + '</div><h1 style="margin:0 0 18px;color:#0a1628;font-family:Georgia,serif;font-size:30px;line-height:1.2;">' + escapeHtml(options.heading) + '</h1><p style="margin:0 0 20px;color:#26354a;font-size:16px;line-height:1.65;">' + escapeHtml(options.intro) + '</p>' + content + '<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px;"><tr><td style="border-radius:999px;background:#542476;"><a href="' + escapeHtml(options.buttonUrl) + '" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">' + escapeHtml(options.buttonLabel) + '</a></td></tr></table></td></tr><tr><td style="background:#f4efe5;padding:22px 32px;color:#687386;font-size:12px;line-height:1.55;">' + escapeHtml(options.footer) + '<br><span style="color:#0a1628;font-weight:700;">Jackrabbit Punkin Publishing LLC</span>' + unsubscribe + "</td></tr></table></td></tr></table></body></html>";
}

async function getUnsubscribeUrl(env: Env, email: string) {
  const normalized = text(email, 320).toLowerCase();
  if (!isValidEmail(normalized)) return "";
  const encodedEmail = base64UrlEncode(normalized);
  const signature = await signValue(encodedEmail, env.UNSUBSCRIBE_SECRET);
  return `${firstUrlValue(env.PUBLIC_API_URL).replace(/\/$/, "")}/?action=unsubscribe&e=${encodeURIComponent(encodedEmail)}&sig=${encodeURIComponent(signature)}`;
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
  const logoUrl = firstUrlValue(env.SITE_URL).replace(/\/$/, "") + "/assets/jrppLogo2.png";
  const heroButton = campaign.heroCtaLabel && campaign.heroCtaUrl ? '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px auto 0;"><tr><td style="border-radius:999px;background:#542476;"><a href="' + escapeHtml(campaign.heroCtaUrl) + '" style="display:inline-block;padding:12px 20px;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">' + escapeHtml(campaign.heroCtaLabel) + "</a></td></tr></table>" : "";
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f3f0e9;font-family:Arial,Helvetica,sans-serif;">' + preview + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0e9;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;background:#fff;border:1px solid #e2dccf;border-radius:12px;overflow:hidden;"><tr><td style="background:#0a1628;padding:20px 28px;border-bottom:5px solid #d4ad55;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:44px;"><img src="' + escapeHtml(logoUrl) + '" width="44" height="44" alt="Jackrabbit Punkin Publishing" style="display:block;border-radius:50%;border:2px solid #d4ad55;" /></td><td style="padding-left:14px;"><div style="color:#fff;font-family:Georgia,serif;font-size:20px;font-weight:700;">Jackrabbit Punkin Publishing</div><div style="margin-top:4px;color:#d4ad55;font-size:11px;letter-spacing:.5px;">Stories That Inspire. Books That Endure.</div></td></tr></table></td></tr><tr><td align="center" style="padding:34px 34px 29px;background:#fbf8f1;"><div style="color:#542476;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">' + escapeHtml(campaign.title) + '</div><h1 style="margin:10px 0 13px;color:#0a1628;font-family:Georgia,serif;font-size:31px;line-height:1.18;">' + escapeHtml(campaign.subject) + '</h1><p style="margin:0;color:#485365;font-size:16px;line-height:1.65;">' + escapeHtml(campaign.heroMessage) + '</p>' + heroButton + '</td></tr><tr><td style="padding:24px 34px;background:#f4efe5;border-top:1px solid #e7dfcf;"><p style="margin:0 0 9px;color:#4e596c;font-size:15px;line-height:1.65;">' + escapeHtml(campaign.closingNote) + '</p><div style="color:#0a1628;font-family:Georgia,serif;font-weight:700;">- Jackrabbit Punkin Publishing LLC</div></td></tr><tr><td align="center" style="padding:18px 26px;background:#0a1628;color:#bfc5cf;font-size:11px;line-height:1.65;"><span style="color:#d4ad55;font-weight:700;">Jackrabbit Punkin Publishing LLC</span><br>Stories That Inspire. Books That Endure.<br><a href="' + escapeHtml(firstUrlValue(env.SITE_URL)) + '" style="color:#fff;">Visit website</a> &nbsp;|&nbsp; <a href="' + escapeHtml(unsubscribeUrl) + '" style="color:#fff;">Unsubscribe</a></td></tr></table></td></tr></table></body></html>';
}

function renderUnsubscribePage(success: boolean, message: string) {
  const title = success ? "You're unsubscribed" : "We need a little help";
  const eyebrow = success ? "PREFERENCES UPDATED" : "UNSUBSCRIBE REQUEST";
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + '</title></head><body style="margin:0;background:#fbf8f1;font-family:Arial,Helvetica,sans-serif;color:#26354a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:40px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e7dfd0;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(10,22,40,.08);"><tr><td style="background:#0a1628;padding:28px 32px;color:#fff;font-family:Georgia,serif;font-size:22px;font-weight:700;">Jackrabbit Punkin Publishing</td></tr><tr><td style="height:5px;background:#d4ad55;font-size:0;">&nbsp;</td></tr><tr><td style="padding:42px 32px;"><div style="color:#542476;font-size:12px;font-weight:700;letter-spacing:1.5px;">' + eyebrow + '</div><h1 style="margin:10px 0 18px;color:#0a1628;font-family:Georgia,serif;font-size:32px;">' + escapeHtml(title) + '</h1><p style="margin:0 0 26px;font-size:16px;line-height:1.65;">' + escapeHtml(message) + '</p><a href="/" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#542476;color:#fff;text-decoration:none;font-weight:700;">Return to our website</a></td></tr><tr><td style="background:#f4efe5;padding:20px 32px;color:#687386;font-size:12px;">Stories That Inspire. Books That Endure.</td></tr></table></td></tr></table></body></html>';
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

async function runScheduledTasks(env: Env) {
  await sendDueCampaigns(env);
  await rollupAnalyticsEvents(env);
  await syncBookInventoryFromSquare(env);
}

const ANALYTICS_EVENT_TYPES = new Set([
  "page_view",
  "form_submit",
  "sponsor_checkout_start",
  "store_checkout_start",
  "book_interest",
  "newsletter_signup",
]);

function categorizeDevice(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (/bot|crawler|spider|slurp|bingpreview/.test(ua)) return "bot";
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|iphone|android/.test(ua)) return "mobile";
  return "desktop";
}

function categorizeReferrer(referrer: string, siteUrls: string) {
  if (!referrer) return "direct";
  try {
    const referrerHost = new URL(referrer).hostname.replace(/^www\./, "");
    const siteHosts = splitUrlList(siteUrls).map((value) => {
      try {
        return new URL(value).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    });
    if (siteHosts.includes(referrerHost)) return "internal";
    if (/google|bing|duckduckgo|yahoo/.test(referrerHost)) return "search";
    if (/facebook|instagram|twitter|x\.com|tiktok|pinterest|linkedin/.test(referrerHost)) return "social";
    return "other";
  } catch {
    return "other";
  }
}

async function hashVisitorId(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${userAgent}|${day}`));
  return bytesToHex(new Uint8Array(digest)).slice(0, 24);
}

async function handleAnalyticsEvent(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json(request, env, { ok: false, error: "Not configured." }, 404);
  const body = await parseBody(request);
  const eventType = text(body.eventType, 40);
  if (!ANALYTICS_EVENT_TYPES.has(eventType)) {
    return json(request, env, { ok: false, error: "Unknown event type." }, 400);
  }
  const pagePath = text(body.pagePath, 300);
  const bookId = text(body.bookId, 40);
  let meta = "{}";
  if (body.meta) {
    try {
      meta = JSON.stringify(JSON.parse(body.meta)).slice(0, 2000);
    } catch {
      meta = "{}";
    }
  }
  const referrerCategory = categorizeReferrer(request.headers.get("referer") || "", env.SITE_URL);
  const deviceCategory = categorizeDevice(request.headers.get("user-agent") || "");
  const visitorHash = await hashVisitorId(request);

  await env.DB.prepare(
    "INSERT INTO analytics_events (id, event_type, page_path, referrer_category, device_category, book_id, meta_json, visitor_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
  )
    .bind(crypto.randomUUID(), eventType, pagePath, referrerCategory, deviceCategory, bookId, meta, visitorHash)
    .run();

  return json(request, env, { ok: true });
}

async function rollupAnalyticsEvents(env: Env) {
  const today = new Date().toISOString().slice(0, 10);
  const pendingDays = await env.DB.prepare(
    "SELECT DISTINCT substr(created_at, 1, 10) AS day FROM analytics_events WHERE substr(created_at, 1, 10) < ?1 ORDER BY day ASC LIMIT 14",
  )
    .bind(today)
    .all<{ day: string }>();

  for (const row of pendingDays.results || []) {
    const day = row.day;
    const eventCounts = await env.DB.prepare(
      "SELECT event_type AS eventType, page_path AS pagePath, COUNT(*) AS count FROM analytics_events WHERE substr(created_at, 1, 10) = ?1 GROUP BY event_type, page_path",
    )
      .bind(day)
      .all<{ eventType: string; pagePath: string; count: number }>();

    const statements = (eventCounts.results || []).map((entry) =>
      env.DB.prepare(
        "INSERT INTO analytics_daily (day, metric, dimension, count) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(day, metric, dimension) DO UPDATE SET count = excluded.count",
      ).bind(day, entry.eventType, entry.pagePath || "", entry.count),
    );
    statements.push(env.DB.prepare("DELETE FROM analytics_events WHERE substr(created_at, 1, 10) = ?1").bind(day));
    if (statements.length) await env.DB.batch(statements);
  }
}

async function getAnalyticsSummary(env: Env, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const dailyRows = (
    await env.DB.prepare("SELECT day, metric, dimension, count FROM analytics_daily WHERE day >= ?1").bind(since).all<{
      day: string;
      metric: string;
      dimension: string;
      count: number;
    }>()
  ).results || [];

  const rawRows = (
    await env.DB.prepare(
      "SELECT substr(created_at, 1, 10) AS day, event_type AS metric, page_path AS dimension, COUNT(*) AS count FROM analytics_events WHERE substr(created_at, 1, 10) >= ?1 GROUP BY day, event_type, page_path",
    )
      .bind(since)
      .all<{ day: string; metric: string; dimension: string; count: number }>()
  ).results || [];

  const combined = [...dailyRows, ...rawRows];

  const dailyPageViews = new Map<string, number>();
  const topPages = new Map<string, number>();
  const eventBreakdown = new Map<string, number>();

  for (const entry of combined) {
    eventBreakdown.set(entry.metric, (eventBreakdown.get(entry.metric) || 0) + entry.count);
    if (entry.metric === "page_view") {
      dailyPageViews.set(entry.day, (dailyPageViews.get(entry.day) || 0) + entry.count);
      if (entry.dimension) topPages.set(entry.dimension, (topPages.get(entry.dimension) || 0) + entry.count);
    }
  }

  const dailyTrend = Array.from(dailyPageViews.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const topPagesList = Array.from(topPages.entries())
    .map(([pagePath, count]) => ({ pagePath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const eventBreakdownList = Array.from(eventBreakdown.entries())
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count);
  const totalPageViews = dailyTrend.reduce((sum, entry) => sum + entry.count, 0);
  const totalEvents = eventBreakdownList.reduce((sum, entry) => sum + entry.count, 0);

  const sponsorAnalytics = await getSponsorAnalytics(env, since);
  const bookRevenueRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE lower(payment_status) = 'paid' AND substr(created_at, 1, 10) >= ?1",
  ).bind(since).first<{ total: number }>();

  return {
    totalPageViews,
    totalEvents,
    dailyTrend,
    topPages: topPagesList,
    eventBreakdown: eventBreakdownList,
    bookRevenue: money(Number(bookRevenueRow?.total || 0)),
    ...sponsorAnalytics,
  };
}

// Sponsor package performance, sourced entirely from webhook-reconciled payment data
// (sponsor_payments.status is only ever set to 'paid' by recordPaidSponsorFromSquarePayment()
// in the Square webhook handler) rather than client-side tracking events.
async function getSponsorAnalytics(env: Env, since: string) {
  const rows = await env.DB.prepare(
    `SELECT s.package AS package, COUNT(*) AS sponsorCount, SUM(sp.amount_cents) AS totalCents
     FROM sponsor_payments sp
     JOIN sponsors s ON s.id = sp.sponsor_id
     WHERE sp.status = 'paid' AND substr(sp.updated_at, 1, 10) >= ?1
     GROUP BY s.package
     ORDER BY totalCents DESC`,
  )
    .bind(since)
    .all<{ package: string; sponsorCount: number; totalCents: number }>();

  const sponsorBreakdown = (rows.results || []).map((row) => ({
    package: row.package,
    label: SPONSOR_PACKAGES[row.package as SponsorPackageKey]?.label || row.package,
    sponsorCount: Number(row.sponsorCount || 0),
    totalRevenue: money(Number(row.totalCents || 0) / 100),
  }));
  const totalSponsors = sponsorBreakdown.reduce((sum, entry) => sum + entry.sponsorCount, 0);
  const totalSponsorRevenue = money(sponsorBreakdown.reduce((sum, entry) => sum + entry.totalRevenue, 0));
  return { sponsorBreakdown, totalSponsors, totalSponsorRevenue };
}

async function sendDueCampaigns(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT campaign_id AS campaignId, created_at AS createdAt, updated_at AS updatedAt, status, title, subject, preview_text AS previewText, audience, target_type AS targetType, target_value AS targetValue, from_name AS fromName, hero_message AS heroMessage, hero_cta_label AS heroCtaLabel, hero_cta_url AS heroCtaUrl, featured_book_id AS featuredBookId, featured_book_title AS featuredBookTitle, featured_book_description AS featuredBookDescription, featured_book_image_url AS featuredBookImageUrl, featured_cta_label AS featuredCtaLabel, featured_cta_url AS featuredCtaUrl, quick1_title AS quick1Title, quick1_text AS quick1Text, quick1_url AS quick1Url, quick2_title AS quick2Title, quick2_text AS quick2Text, quick2_url AS quick2Url, closing_note AS closingNote, send_date AS sendDate, send_time AS sendTime, time_zone AS timeZone, scheduled_at AS scheduledAt, sent_at AS sentAt, recipients, sent, failed, last_error AS lastError FROM newsletter_campaigns WHERE status = 'Scheduled' AND scheduled_at != '' AND sent_at = '' AND datetime(scheduled_at) <= datetime('now') ORDER BY datetime(scheduled_at) ASC LIMIT 5",
  ).all<NewsletterCampaignRecord>();
  const scheduler: AuthenticatedAdmin = {
    email: "system@scheduler",
    role: "manager",
    displayName: "Scheduled worker",
    name: "Scheduled worker",
    avatarUrl: "",
    token: { provider: "worker-cron" },
  };
  for (const campaign of rows.results || []) {
    try {
      await sendNewsletterCampaign(env, campaign);
      await writeAuditLog(env, scheduler, "newsletter_sent", "newsletter_campaign", campaign.campaignId, "Scheduled newsletter sent by worker.");
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
  const subscribers = await getNewsletterCampaignRecipients(env, campaign);
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

async function getNewsletterCampaignRecipients(env: Env, campaign: NewsletterCampaignRecord): Promise<string[]> {
  if (campaign.targetType === "book_interest" && campaign.targetValue) {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT lower(fs.email) AS email
       FROM form_submissions fs
       LEFT JOIN newsletter_subscribers ns ON ns.email = lower(fs.email)
       WHERE fs.form_type = 'bookNotification'
         AND fs.title = ?1
         AND fs.status != 'Unsubscribed'
         AND (ns.email IS NULL OR ns.status != 'unsubscribed')
       ORDER BY email ASC`,
    )
      .bind(campaign.targetValue)
      .all<{ email: string }>();
    return (rows.results || []).map((row) => text(row.email, 320).toLowerCase()).filter(isValidEmail);
  }
  const rows = await env.DB.prepare(
    "SELECT email FROM newsletter_subscribers WHERE status = 'active' AND consent = 1 ORDER BY last_seen_at DESC",
  ).all<{ email: string }>();
  return (rows.results || []).map((row) => text(row.email, 320).toLowerCase()).filter(isValidEmail);
}

async function countQuery(env: Env, query: string) {
  const row = await env.DB.prepare(query).first<{ count: number }>();
  return Number(row?.count || 0);
}