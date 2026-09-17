import type { AdminRole, FormType, SponsorPackageKey } from "./types";

export const FORM_ROUTES: Record<
  FormType,
  { required: string[]; summaryLabel: string; rateLimitWindowSeconds: number }
> = {
  contact: {
    required: ["name", "email", "subject", "message"],
    summaryLabel: "Contact",
    rateLimitWindowSeconds: 20,
  },
  newsletter: {
    required: ["email"],
    summaryLabel: "Newsletter",
    rateLimitWindowSeconds: 20,
  },
  speaking: {
    required: [
      "name",
      "organization",
      "email",
      "preferredSpeaker",
      "speakingBudget",
      "details",
    ],
    summaryLabel: "Speaking Requests",
    rateLimitWindowSeconds: 20,
  },
  bookClub: {
    required: ["group", "name", "email", "request"],
    summaryLabel: "Book Club Requests",
    rateLimitWindowSeconds: 20,
  },
  bookNotification: {
    required: ["email", "title"],
    summaryLabel: "Book Notifications",
    rateLimitWindowSeconds: 20,
  },
};

export const ADMIN_ROLE_ORDER: AdminRole[] = [
  "manager",
  "developer",
  "owner",
];

export const NEWSLETTER_DEFAULTS = Object.freeze({
  title: "The Jackrabbit Journal",
  subject: "A quick update from Jackrabbit Punkin Publishing",
  previewText: "New stories, milestones, and what is ahead.",
  audience: "All active subscribers",
  targetType: "all",
  targetValue: "",
  heroMessage:
    "There is a lot happening at Jackrabbit Punkin Publishing, and we are excited to share a few highlights with you.",
  heroCtaLabel: "Visit Jackrabbit Punkin Publishing",
  featuredCtaLabel: "Explore the book",
  quick1Title: "Upcoming Events",
  quick1Text:
    "See where Jackrabbit Punkin Publishing will be connecting with readers next.",
  quick1Url: "",
  quick2Title: "Coming Soon",
  quick2Text:
    "New stories, community histories, and future releases are on the way.",
  quick2Url: "",
  closingNote:
    "Thank you for reading, sharing, and helping meaningful stories reach more people.",
  timeZone: "America/New_York",
});

/**
 * Read It Forward sponsorship packages. Every tier is a fixed price for a
 * fixed book count, except Literacy Trailblazer which is a 50-book minimum
 * with each additional book adding `perBookCents`.
 */
export const SPONSOR_PACKAGES: Record<
  SponsorPackageKey,
  {
    label: string;
    buttonLabel: string;
    priceCents: number;
    books: number;
    perBookCents?: number;
    minBooks?: number;
  }
> = {
  pagePal: { label: "Page Pal", buttonLabel: "Sponsor 5 Books", priceCents: 10000, books: 5 },
  chapterChampion: { label: "Chapter Champion", buttonLabel: "Sponsor 12 Books", priceCents: 25000, books: 12 },
  bookshelfBuilder: { label: "Bookshelf Builder", buttonLabel: "Sponsor 25 Books", priceCents: 50000, books: 25 },
  literacyTrailblazer: {
    label: "Literacy Trailblazer",
    buttonLabel: "Sponsor 50+ Books",
    priceCents: 100000,
    books: 50,
    perBookCents: 2000,
    minBooks: 50,
  },
};

export const SPONSOR_MAX_BOOKS = 1000;
