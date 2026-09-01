import type { Env } from "./types";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function text(value: unknown, maxLength: number) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

export function cleanInput(value: unknown, maxLength: number) {
  let result = text(value, maxLength);
  if (/^[=+\-@]/.test(result)) result = "'" + result;
  return result;
}

export function escapeHtml(value: unknown) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function linkValue(value: unknown) {
  const textValue = String(value || "");
  const escaped = escapeHtml(textValue);
  if (isValidEmail(textValue)) return `<a href="mailto:${escaped}" style="color:#542476;">${escaped}</a>`;
  if (/^https?:\/\/[^\s]+$/i.test(textValue)) return `<a href="${escaped}" style="color:#542476;">${escaped}</a>`;
  return escaped;
}

export function toBoolean(value: unknown) {
  return /^(true|yes|1|on)$/i.test(String(value == null ? "" : value));
}

export function isValidEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function safeUrl(value: unknown) {
  const url = String(value || "").trim();
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : "";
}

export function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Math.floor(Number(value || fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function base64UrlFromBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlEncode(value: string) {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

export function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return atob(padded);
}

export async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlFromBytes(new Uint8Array(signature));
}

export async function signJwtWithPem(unsigned: string, privateKey: string) {
  const normalized = privateKey.replace(/\\n/g, "\n");
  const pem = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(pem);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return base64UrlFromBytes(new Uint8Array(signature));
}

export function withCors(request: Request, env: Env, response: Response) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = new Set(
    [env.CORS_ORIGIN, env.SITE_URL, env.PUBLIC_ADMIN_URL]
      .filter(Boolean)
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return value;
        }
      }),
  );
  const headers = new Headers(response.headers);
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Cf-Access-Jwt-Assertion, Stripe-Signature");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

export function json(request: Request, env: Env, payload: Record<string, unknown>, status = 200) {
  return withCors(
    request,
    env,
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json;charset=UTF-8" },
    }),
  );
}

export async function parseBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, value == null ? "" : String(value)]));
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await request.text()).entries());
  }
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, typeof value === "string" ? value : value.name]));
  }
  return {};
}

export function splitEmails(value: string) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => isValidEmail(email));
}

export function createBookId() {
  return "BK-" + crypto.randomUUID().slice(0, 8).toUpperCase();
}

export function createOrderNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `JRPP-${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function buildIdentityKey(request: Request, payload: Record<string, string>) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "anonymous";
  return text(payload.email || payload.name || ip, 320).toLowerCase();
}

export function buildPublicBookImageUrl(env: Env, imageKey: string) {
  const base = env.PUBLIC_API_URL.replace(/\/$/, "");
  return `${base}/media/books/${encodeURIComponent(imageKey)}`;
}

export function getFirstName(name: string) {
  const firstName = text(name, 80).split(/\s+/)[0];
  return firstName || "there";
}

export function formatStripeAddress(address: Record<string, unknown>) {
  return [
    text(address.line1, 200),
    text(address.line2, 200),
    [text(address.city, 100), text(address.state, 100), text(address.postal_code, 40)].filter(Boolean).join(", "),
    text(address.country, 40),
  ].filter(Boolean).join("\n");
}