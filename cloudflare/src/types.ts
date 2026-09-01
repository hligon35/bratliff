export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: { changes?: number };
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface R2ObjectBody {
  body: ReadableStream | null;
  httpEtag?: string;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BOOK_ASSETS: R2Bucket;
  SITE_URL: string;
  PUBLIC_ADMIN_URL: string;
  PUBLIC_API_URL: string;
  ADMIN_BOOTSTRAP_EMAILS: string;
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  STRIPE_CURRENCY: string;
  ORDER_SUCCESS_URL: string;
  ORDER_CANCEL_URL: string;
  SHEETS_EXPORT_SPREADSHEET_ID: string;
  SHEETS_EXPORT_ENABLED: string;
  CORS_ORIGIN: string;
  UNSUBSCRIBE_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  GOOGLE_SERVICE_ACCOUNT_TOKEN_URI: string;
  GOOGLE_APPS_SCRIPT_EMAIL_URL: string;
  GOOGLE_APPS_SCRIPT_EMAIL_SECRET: string;
  RESEND_API_KEY: string;
  MAIL_FROM_EMAIL: string;
  ADMIN_NOTIFICATION_EMAIL: string;
}

export type FormType =
  | "contact"
  | "newsletter"
  | "speaking"
  | "bookClub"
  | "bookNotification";

export type AdminRole = "owner" | "editor" | "fulfillment" | "marketing";

export interface AdminUser {
  email: string;
  role: AdminRole;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedAdmin {
  email: string;
  role: AdminRole;
  displayName: string;
  token: Record<string, unknown>;
}

export interface BookRecord {
  bookId: string;
  sku: string;
  isbn: string;
  title: string;
  subtitle: string;
  author: string;
  synopsis: string;
  shortDescription: string;
  format: string;
  category: string;
  price: number;
  comparePrice: number;
  stock: number;
  lowStockThreshold: number;
  imageKey: string;
  imageUrl: string;
  featured: boolean;
  comingSoon: boolean;
  preorder: boolean;
  status: string;
  publicationDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartLineItem {
  bookId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  preorder: boolean;
}

export interface CheckoutSessionRecord {
  sessionId: string;
  cartJson: string;
  createdAt: string;
}

export interface NewsletterCampaignRecord {
  campaignId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  title: string;
  subject: string;
  previewText: string;
  audience: string;
  fromName: string;
  heroMessage: string;
  heroCtaLabel: string;
  heroCtaUrl: string;
  featuredBookId: string;
  featuredBookTitle: string;
  featuredBookDescription: string;
  featuredBookImageUrl: string;
  featuredCtaLabel: string;
  featuredCtaUrl: string;
  quick1Title: string;
  quick1Text: string;
  quick1Url: string;
  quick2Title: string;
  quick2Text: string;
  quick2Url: string;
  closingNote: string;
  sendDate: string;
  sendTime: string;
  timeZone: string;
  scheduledAt: string;
  sentAt: string;
  recipients: number;
  sent: number;
  failed: number;
  lastError: string;
}

export interface AppHandler {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void>;
}