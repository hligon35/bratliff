import type { AdminRole, FormType } from "./types";

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
    required: ["name", "organization", "email", "details"],
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
  "marketing",
  "fulfillment",
  "editor",
  "owner",
];

export const NEWSLETTER_DEFAULTS = Object.freeze({
  title: "The Jackrabbit Journal",
  subject: "A quick update from Jackrabbit Punkin Publishing",
  previewText: "New stories, milestones, and what is ahead.",
  audience: "All active subscribers",
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