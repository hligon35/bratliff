import type { Env } from './types';
import { isValidEmail, text } from './utils';

// Exact title identity with typography/case/whitespace normalization; never
// fuzzy-match a different title or sequel. Admins can explicitly link a list.
export function bookNotificationKey(title: string) {
  return title.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

type NotificationMatch = { submissionId: string; bookId: string; title: string; name: string; email: string; notificationKey: string };
type EmailMessage = { to: string; subject: string; text: string; html: string; replyTo: string; fromName: string; fromEmail?: string; idempotencyKey?: string };

export async function queueBookNotifications(env: Env, buildMessage: (match: NotificationMatch) => Promise<EmailMessage>) {
  // Bounded lazy backfill preserves existing lists without rewriting historical
  // submissions or replaying receipt emails. Cron continues larger backfills.
  const [books, submissions] = await Promise.all([
    env.DB.prepare("SELECT id, title, notification_title AS notificationTitle FROM books WHERE notification_key = '' LIMIT 200").all<{id: string; title: string; notificationTitle: string}>(),
    env.DB.prepare("SELECT id, title FROM form_submissions WHERE form_type = 'bookNotification' AND book_notification_key = '' AND title != '' LIMIT 200").all<{id: string; title: string}>(),
  ]);
  const backfill = [
    ...(books.results || []).map(book => env.DB.prepare("UPDATE books SET notification_key = ?2 WHERE id = ?1 AND notification_key = ''").bind(book.id, bookNotificationKey(book.notificationTitle || book.title))),
    ...(submissions.results || []).map(row => env.DB.prepare("UPDATE form_submissions SET book_notification_key = ?2 WHERE id = ?1 AND book_notification_key = ''").bind(row.id, bookNotificationKey(row.title))),
  ];
  // Keep each D1 batch bounded even when both legacy lists are populated.
  for (let offset = 0; offset < backfill.length; offset += 100) await env.DB.batch(backfill.slice(offset, offset + 100));
  const matches = await env.DB.prepare(`SELECT fs.id AS submissionId, b.id AS bookId, b.title,
      fs.name, lower(trim(fs.email)) AS email, b.notification_key AS notificationKey
    FROM form_submissions fs JOIN books b ON b.notification_key = fs.book_notification_key
    WHERE fs.form_type = 'bookNotification' AND fs.consent = 1 AND fs.status != 'Unsubscribed'
      AND b.status = 'Published' AND b.stock > 0 AND b.price > 0 AND b.coming_soon = 0 AND b.preorder = 0
      AND NOT EXISTS (SELECT 1 FROM newsletter_subscribers ns WHERE lower(ns.email) = lower(trim(fs.email)) AND ns.status = 'unsubscribed')
      AND NOT EXISTS (SELECT 1 FROM book_notification_email_deliveries d WHERE d.notification_key = b.notification_key AND d.email = lower(trim(fs.email)) AND (d.status != 'Skipped' OR d.attempts > 0 OR d.submission_id = fs.id))
    GROUP BY b.notification_key, lower(trim(fs.email)) ORDER BY fs.created_at, fs.id, b.id LIMIT 100`).all<NotificationMatch>();
  let queued = 0;
  for (const match of matches.results || []) {
    if (!isValidEmail(match.email)) continue;
    const id = 'book-availability:' + crypto.randomUUID();
    const message = await buildMessage(match);
    const result = await env.DB.prepare(`INSERT INTO book_notification_email_deliveries
      (id, submission_id, book_id, notification_key, email, message_json) VALUES (?1,?2,?3,?4,?5,?6)
      ON CONFLICT(notification_key,email) DO UPDATE SET id = excluded.id, submission_id = excluded.submission_id,
      book_id = excluded.book_id, message_json = excluded.message_json, status = 'Pending', last_error = '', next_attempt_at = datetime('now'), updated_at = datetime('now')
      WHERE book_notification_email_deliveries.status = 'Skipped' AND book_notification_email_deliveries.attempts = 0
        AND book_notification_email_deliveries.submission_id != excluded.submission_id`).bind(id, match.submissionId, match.bookId, match.notificationKey, match.email,
        JSON.stringify({ ...message, fromEmail: env.MAIL_FROM_EMAIL, idempotencyKey: id })).run();
    queued += Number(result.meta?.changes || 0);
  }
  return queued;
}

export async function bookNotificationEligibility(env: Env, deliveryId: string): Promise<'ready' | 'wait' | 'skip'> {
  const row = await env.DB.prepare(`SELECT d.email, d.notification_key AS notificationKey,
      EXISTS(SELECT 1 FROM form_submissions fs WHERE fs.form_type = 'bookNotification'
        AND lower(trim(fs.email)) = d.email AND fs.book_notification_key = d.notification_key
        AND fs.status != 'Unsubscribed' AND fs.consent = 1) AS interested,
      EXISTS(SELECT 1 FROM newsletter_subscribers ns WHERE lower(ns.email) = d.email AND ns.status = 'unsubscribed') AS unsubscribed,
      EXISTS(SELECT 1 FROM books b WHERE b.id = d.book_id AND b.notification_key = d.notification_key
        AND b.status = 'Published' AND b.stock > 0 AND b.price > 0 AND b.coming_soon = 0 AND b.preorder = 0) AS available
    FROM book_notification_email_deliveries d WHERE d.id = ?1`).bind(text(deliveryId, 100)).first<{interested: number; unsubscribed: number; available: number}>();
  if (!row || !row.interested || row.unsubscribed) return 'skip';
  return row.available ? 'ready' : 'wait';
}
