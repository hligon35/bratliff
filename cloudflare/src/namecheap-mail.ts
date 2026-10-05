import { connect } from "cloudflare:sockets";
import type { Env } from "./types";

const encoder = new TextEncoder();
const utf8 = new TextDecoder("utf-8", { fatal: false });
const MAX_MESSAGE_BYTES = 700_000;

class ProtocolReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = new Uint8Array(0);
  constructor(stream: ReadableStream<Uint8Array>) { this.reader = stream.getReader(); }

  private async fill(): Promise<void> {
    const next = await this.reader.read();
    if (next.done || !next.value) throw new Error("Mail server closed the connection.");
    const merged = new Uint8Array(this.buffer.length + next.value.length);
    merged.set(this.buffer);
    merged.set(next.value, this.buffer.length);
    this.buffer = merged;
  }

  async line(): Promise<string> {
    for (;;) {
      for (let i = 0; i + 1 < this.buffer.length; i++) {
        if (this.buffer[i] === 13 && this.buffer[i + 1] === 10) {
          const line = this.buffer.slice(0, i);
          this.buffer = this.buffer.slice(i + 2);
          if (line.length > MAX_MESSAGE_BYTES) throw new Error("Mail server response was too large.");
          return utf8.decode(line);
        }
      }
      if (this.buffer.length > MAX_MESSAGE_BYTES) throw new Error("Mail server response was too large.");
      await this.fill();
    }
  }

  async bytes(length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MESSAGE_BYTES) {
      throw new Error("Mail message exceeds the configured size limit.");
    }
    while (this.buffer.length < length) await this.fill();
    const value = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return value;
  }
}

function appendText(writer: WritableStreamDefaultWriter<Uint8Array>, value: string): Promise<void> {
  return writer.write(encoder.encode(value));
}

async function imapCommand(
  reader: ProtocolReader,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  tag: string,
  command: string,
): Promise<{ lines: string[]; literals: Array<{ uid: string; bytes: Uint8Array }> }> {
  await appendText(writer, tag + " " + command + "\r\n");
  const lines: string[] = [];
  const literals: Array<{ uid: string; bytes: Uint8Array }> = [];
  let activeUid = "";
  for (let count = 0; count < 1200; count++) {
    const line = await reader.line();
    lines.push(line);
    const uidMatch = line.match(/\bUID\s+(\d+)/i);
    if (uidMatch) activeUid = uidMatch[1];
    const marker = line.match(/\{(\d+)\+?\}$/);
    if (marker) {
      const data = await reader.bytes(Number(marker[1]));
      if (activeUid) literals.push({ uid: activeUid, bytes: data });
      continue;
    }
    if (line.startsWith(tag + " ")) {
      if (!/\bOK\b/i.test(line)) throw new Error("Namecheap IMAP command failed.");
      return { lines, literals };
    }
  }
  throw new Error("Namecheap IMAP response limit exceeded.");
}

function headerMap(headerText: string): Record<string, string> {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  const out: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const split = line.indexOf(":");
    if (split > 0) out[line.slice(0, split).trim().toLowerCase()] = line.slice(split + 1).trim();
  }
  return out;
}

function decodeEncodedWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_all, charset: string, mode: string, encoded: string) => {
    try {
      if (mode.toLowerCase() === "b") {
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return new TextDecoder(charset, { fatal: false }).decode(bytes);
      }
      const decoded = encoded.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      return new TextDecoder(charset, { fatal: false }).decode(Uint8Array.from(decoded, (character) => character.charCodeAt(0)));
    } catch { return encoded; }
  });
}

function decodeTransfer(body: string, encoding: string, charset: string): string {
  try {
    if (encoding.toLowerCase() === "base64") {
      const binary = atob(body.replace(/[\r\n\t ]/g, ""));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder(charset || "utf-8", { fatal: false }).decode(bytes);
    }
    if (encoding.toLowerCase() === "quoted-printable") {
      const normalized = body.replace(/=\r?\n/g, "").replace(/=([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      const bytes = Uint8Array.from(normalized, (character) => character.charCodeAt(0) & 255);
      return new TextDecoder(charset || "utf-8", { fatal: false }).decode(bytes);
    }
  } catch { /* keep the encoded body as readable fallback */ }
  return body;
}

function stripHtml(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|br|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function extractTextPart(raw: string, depth = 0): string {
  if (depth > 6) return "";
  const separator = raw.search(/\r?\n\r?\n/);
  if (separator < 0) return "";
  const headerText = raw.slice(0, separator);
  const bodyStart = raw.slice(separator).match(/^\r?\n\r?\n/)?.[0].length || 2;
  const body = raw.slice(separator + bodyStart).replace(/\r?\n--[^\r\n]+--?[ \t]*$/, "");
  const headers = headerMap(headerText);
  const contentType = headers["content-type"] || "text/plain; charset=utf-8";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (/multipart\//i.test(contentType) && boundary) {
    const marker = "--" + (boundary[1] || boundary[2]);
    const parts = body.split(marker).slice(1).map((part) => part.replace(/^\r?\n/, "").replace(/\r?\n--?$/, ""));
    let html = "";
    for (const part of parts) {
      const content = extractTextPart(part, depth + 1);
      if (/content-type:\s*text\/plain/i.test(part.slice(0, 5000)) && content) return content;
      if (/content-type:\s*text\/html/i.test(part.slice(0, 5000)) && content) html = content;
    }
    return html ? stripHtml(html) : "";
  }
  const charset = contentType.match(/charset=(?:"([^"]+)"|([^;\s]+))/i);
  const decoded = decodeTransfer(body, headers["content-transfer-encoding"] || "", charset?.[1] || charset?.[2] || "utf-8");
  return /text\/html/i.test(contentType) ? stripHtml(decoded) : decoded.trim();
}

function parseEmail(rawBytes: Uint8Array, uid: string): Record<string, string> | null {
  const raw = utf8.decode(rawBytes);
  const separator = raw.search(/\r?\n\r?\n/);
  if (separator < 0) return null;
  const headerText = raw.slice(0, separator);
  const headers = headerMap(headerText);
  const from = decodeEncodedWords(headers.from || "Unknown sender");
  const email = from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] || from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const name = from.replace(/<[^>]*>/g, "").replace(/\s*\\?["']/g, "").trim() || email || "Unknown sender";
  const subject = decodeEncodedWords(headers.subject || "(no subject)").replace(/[\r\n]+/g, " ").slice(0, 240);
  const body = extractTextPart(raw).slice(0, 20000);
  const preview = body.replace(/\s+/g, " ").trim().slice(0, 220);
  const parsedDate = headers.date ? new Date(headers.date) : new Date();
  const receivedAt = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
  return {
    uid,
    messageId: (headers["message-id"] || "").slice(0, 500),
    fromName: name.slice(0, 240),
    fromEmail: email.slice(0, 320),
    toEmail: (headers.to || "").slice(0, 1000),
    subject,
    body: body || preview || "(This message has no readable plain-text body.)",
    preview: preview || "(No message preview available.)",
    receivedAt,
  };
}

function quoted(value: string): string {
  return value.replace(/[\\"]/g, "\\$&");
}

export async function syncNamecheapInbox(env: Env): Promise<{ configured: boolean; connected: boolean; synced: number; message: string }> {
  const address = String(env.NAMECHEAP_EMAIL_ADDRESS || "").trim().toLowerCase();
  const password = String(env.NAMECHEAP_EMAIL_PASSWORD || "");
  if (!address || !password) {
    return { configured: false, connected: false, synced: 0, message: "Namecheap Private Email is not configured for this Worker." };
  }

  let socket: ReturnType<typeof connect> | null = null;
  try {
    socket = connect({ hostname: "mail.privateemail.com", port: 993 }, { secureTransport: "on" });
    await socket.opened;
    const reader = new ProtocolReader(socket.readable);
    const writer = socket.writable.getWriter();
    const greeting = await reader.line();
    if (!greeting.startsWith("* OK")) throw new Error("Namecheap IMAP greeting failed.");
    const login = await imapCommand(reader, writer, "C001", 'LOGIN "' + quoted(address) + '" "' + quoted(password) + '"');
    if (!login.lines.some((line) => /C001 OK/i.test(line))) throw new Error("Namecheap IMAP login failed.");
    await imapCommand(reader, writer, "C002", "SELECT INBOX");
    const search = await imapCommand(reader, writer, "C003", "UID SEARCH ALL");
    const uidLine = search.lines.find((line) => /^\* SEARCH(?:\s|$)/i.test(line)) || "";
    const allUids = (uidLine.match(/\d+/g) || []).map(Number).filter((uid) => Number.isSafeInteger(uid) && uid > 0).sort((a, b) => a - b);
    const last = await env.DB.prepare("SELECT MAX(CAST(uid AS INTEGER)) AS maxUid FROM mailbox_external_messages").first<{ maxUid: number | null }>();
    const maxUid = Number(last?.maxUid || 0);
    const candidates = maxUid > 0 ? allUids.filter((uid) => uid > maxUid).slice(0, 50) : allUids.slice(-50);
    if (!candidates.length) {
      await imapCommand(reader, writer, "C004", "LOGOUT");
      writer.releaseLock();
      return { configured: true, connected: true, synced: 0, message: "Mailbox synchronized." };
    }

    let synced = 0;
    for (let offset = 0; offset < candidates.length; offset += 20) {
      const batch = candidates.slice(offset, offset + 20);
      const fetched = await imapCommand(reader, writer, "C" + String(5 + offset).padStart(3, "0"), "UID FETCH " + batch.join(",") + " (UID BODY.PEEK[])");
      for (const literal of fetched.literals) {
        const email = parseEmail(literal.bytes, literal.uid);
        if (!email) continue;
        await env.DB.prepare(
          "INSERT INTO mailbox_external_messages (uid, message_id, from_name, from_email, to_email, subject, body, preview, received_at, synced_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now')) ON CONFLICT(uid) DO UPDATE SET message_id = excluded.message_id, from_name = excluded.from_name, from_email = excluded.from_email, to_email = excluded.to_email, subject = excluded.subject, body = excluded.body, preview = excluded.preview, received_at = excluded.received_at, synced_at = datetime('now')",
        ).bind(email.uid, email.messageId, email.fromName, email.fromEmail, email.toEmail, email.subject, email.body, email.preview, email.receivedAt).run();
        synced++;
      }
    }
    await imapCommand(reader, writer, "C900", "LOGOUT");
    writer.releaseLock();
    return { configured: true, connected: true, synced, message: "Mailbox synchronized." };
  } catch {
    return { configured: true, connected: false, synced: 0, message: "Namecheap mailbox sync failed. Check the mailbox application password and try again." };
  } finally {
    if (socket) {
      try { await socket.close(); } catch { /* the connection may already be closed */ }
    }
  }
}

function base64(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64Mime(value: string): string { return base64(value).replace(/.{1,76}/g, (line) => line + "\r\n").replace(/\r\n$/, ""); }

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

async function smtpResponse(reader: ProtocolReader): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  let line = await reader.line();
  lines.push(line);
  const code = Number(line.slice(0, 3));
  if (!Number.isInteger(code)) throw new Error("Namecheap SMTP response was invalid.");
  while (line.slice(0, 3) === String(code) && line[3] === "-") {
    line = await reader.line();
    lines.push(line);
  }
  return { code, lines };
}

async function smtpCommand(
  reader: ProtocolReader,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  command: string,
  accepted: number[],
): Promise<void> {
  await appendText(writer, command + "\r\n");
  const response = await smtpResponse(reader);
  if (!accepted.includes(response.code)) throw new Error("Namecheap SMTP rejected a mailbox command.");
}

export async function sendNamecheapEmail(
  env: Env,
  message: { to: string; subject: string; text: string; html: string; replyTo: string; fromName: string; idempotencyKey?: string },
): Promise<void> {
  const address = String(env.NAMECHEAP_EMAIL_ADDRESS || "").trim().toLowerCase();
  const password = String(env.NAMECHEAP_EMAIL_PASSWORD || "");
  if (!address || !password) throw new Error("Namecheap Private Email is not configured.");
  const to = safeHeader(message.to);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to)) throw new Error("Recipient email is invalid.");

  let socket: ReturnType<typeof connect> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  try {
    socket = connect({ hostname: "mail.privateemail.com", port: 465 }, { secureTransport: "on" });
    await socket.opened;
    const reader = new ProtocolReader(socket.readable);
    writer = socket.writable.getWriter();
    const greeting = await smtpResponse(reader);
    if (greeting.code !== 220) throw new Error("Namecheap SMTP greeting failed.");
    await smtpCommand(reader, writer, "EHLO jackrabbitpunkinpublishing.com", [250]);
    await smtpCommand(reader, writer, "AUTH LOGIN", [334]);
    await appendText(writer, base64(address) + "\r\n");
    if ((await smtpResponse(reader)).code !== 334) throw new Error("Namecheap SMTP authentication failed.");
    await appendText(writer, base64(password) + "\r\n");
    if ((await smtpResponse(reader)).code !== 235) throw new Error("Namecheap SMTP authentication failed.");
    await smtpCommand(reader, writer, "MAIL FROM:<" + address + ">", [250]);
    await smtpCommand(reader, writer, "RCPT TO:<" + to + ">", [250, 251]);
    await smtpCommand(reader, writer, "DATA", [354]);

    const boundary = "jrpp-" + crypto.randomUUID().replace(/-/g, "");
    const encodedSubject = "=?UTF-8?B?" + base64(safeHeader(message.subject)) + "?=";
    const encodedFromName = "=?UTF-8?B?" + base64(safeHeader(message.fromName)) + "?=";
    const safeIdempotencyKey = String(message.idempotencyKey || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
    const messageId = "<" + (safeIdempotencyKey ? "mail-" + safeIdempotencyKey : crypto.randomUUID()) + "@jackrabbitpunkinpublishing.com>";
    const mime = [
      "From: " + encodedFromName + " <" + address + ">",
      "To: " + to,
      "Reply-To: " + safeHeader(message.replyTo || address),
      "Subject: " + encodedSubject,
      "Date: " + new Date().toUTCString(),
      "Message-ID: " + messageId,
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
      "",
      "--" + boundary,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Mime(message.text),
      "--" + boundary,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Mime(message.html),
      "--" + boundary + "--",
      "",
    ].join("\r\n");
    await appendText(writer, mime + ".\r\n");
    if ((await smtpResponse(reader)).code !== 250) throw new Error("Namecheap SMTP did not accept the message.");
    await appendText(writer, "QUIT\r\n");
    await smtpResponse(reader);
  } finally {
    try { writer?.releaseLock(); } catch { /* ignore stream cleanup errors */ }
    if (socket) {
      try { await socket.close(); } catch { /* connection can close after QUIT */ }
    }
  }
}
