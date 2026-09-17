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
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
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
  RESEND_API_KEY: string;
  SITE_URL: string;
  PUBLIC_ADMIN_URL: string;
  PUBLIC_API_URL: string;
  ADMIN_BOOTSTRAP_EMAILS: string;
  GOOGLE_CLIENT_ID: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  ORDER_SUCCESS_URL: string;
  ORDER_CANCEL_URL: string;
  SPONSOR_SUCCESS_URL?: string;
  CORS_ORIGIN: string;
  UNSUBSCRIBE_SECRET: string;
  ADMIN_SESSION_SECRET: string;
  SQUARE_ACCESS_TOKEN: string;
  SQUARE_WEBHOOK_SIGNATURE_KEY: string;
  SQUARE_LOCATION_ID: string;
  SQUARE_ENVIRONMENT: string;
  SQUARE_API_VERSION: string;
  MAIL_FROM_EMAIL: string;
  ADMIN_NOTIFICATION_EMAIL: string;
  TURNSTILE_SECRET_KEY: string;
}

export type FormType =
  | "contact"
  | "newsletter"
  | "speaking"
  | "bookClub"
  | "bookNotification";

export type AdminRole = "owner" | "developer" | "manager";

export interface AdminUser {
  email: string;
  role: AdminRole;
  displayName: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedAdmin {
  email: string;
  role: AdminRole;
  displayName: string;
  name: string;
  avatarKey?: string;
  avatarUrl: string;
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
  squareCatalogItemId: string;
  squareCatalogVariationId: string;
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
  targetType: string;
  targetValue: string;
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

export type SponsorPackageKey =
  | "pagePal"
  | "chapterChampion"
  | "bookshelfBuilder"
  | "literacyTrailblazer";

export type SponsorRecognitionStatus =
  | "Awaiting Payment"
  | "Pending Profile"
  | "Pending Review"
  | "Published"
  | "Hidden"
  | "Refunded";

export interface SponsorRecord {
  id: string;
  package: SponsorPackageKey | string;
  booksSponsored: number;
  amountPaidCents: number;
  payerName: string;
  payerEmail: string;
  displayName: string;
  entityType: string;
  anonymous: boolean;
  publishPermission: boolean;
  logoKey: string;
  logoUrl: string;
  logoAlt: string;
  websiteUrl: string;
  recognitionStatus: SponsorRecognitionStatus | string;
  adminNotes: string;
  displayOrder: number;
  approvedBy: string;
  paidAt: string;
  approvedAt: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorRecord {
  id: string;
  name: string;
  title: string;
  shortIntro: string;
  biography: string;
  portraitKey: string;
  portraitUrl: string;
  portraitAlt: string;
  portraitFocalX: number;
  portraitFocalY: number;
  bookImageKey: string;
  bookImageUrl: string;
  bookImageAlt: string;
  websiteUrl: string;
  socialLinks: string;
  relatedBookIds: string;
  ctaLabel: string;
  ctaUrl: string;
  status: string;
  startAt: string;
  endAt: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}
