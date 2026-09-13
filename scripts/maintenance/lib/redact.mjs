// Redaction rules applied to any captured command output or finding evidence
// before it is written to monthlyReport.md or a workflow log/artifact.
// Keep this list conservative: prefer over-redacting to leaking a secret.
const PATTERNS = [
  // Generic bearer / authorization headers
  [/(authorization:\s*bearer\s+)([a-z0-9._~+/-]{8,})/gi, "$1[REDACTED]"],
  [/(bearer\s+)([a-z0-9._~+/-]{12,})/gi, "$1[REDACTED]"],
  // JSON Web Tokens (three base64url segments separated by dots)
  [/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, "[REDACTED_JWT]"],
  // Square access tokens / signature keys (sandbox + production prefixes)
  [/\bEAAA[a-zA-Z0-9+/=_-]{10,}\b/g, "[REDACTED_SQUARE_TOKEN]"],
  [/\bsq0[a-z]{3}-[a-zA-Z0-9_-]{10,}\b/gi, "[REDACTED_SQUARE_TOKEN]"],
  // AWS-style access keys
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]"],
  // Resend / generic vendor API keys ("re_..." or "sk_...")
  [/\b(re|sk|pk)_[a-zA-Z0-9]{16,}\b/g, "[REDACTED_API_KEY]"],
  // Generic "key/secret/token/password = value" style assignments
  [
    /((?:api[_-]?key|secret|token|password|passwd|access[_-]?key|client[_-]?secret)\s*[:=]\s*)(['"]?)([^\s'"]{6,})\2/gi,
    "$1$2[REDACTED]$2",
  ],
  // .env style KEY=value lines for known secret variable names
  [
    /^(UNSUBSCRIBE_SECRET|ADMIN_SESSION_SECRET|SQUARE_ACCESS_TOKEN|SQUARE_WEBHOOK_SIGNATURE_KEY|SQUARE_LOCATION_ID|RESEND_API_KEY|TURNSTILE_SECRET_KEY|GOOGLE_CLIENT_ID|CF_ACCESS_AUD)=(.+)$/gim,
    "$1=[REDACTED]",
  ],
  // Email addresses (avoid writing real customer/admin PII into the report)
  [/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, "[REDACTED_EMAIL]"],
  // Long hex/base64-ish blobs that look like keys (32+ chars, no spaces)
  [/\b[a-f0-9]{32,}\b/gi, "[REDACTED_HEX]"],
];

/** Redact secret-looking and PII-looking substrings from a text blob. */
export function redact(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  let output = text;
  for (const [pattern, replacement] of PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

/** Deep-redact every string value in a plain object/array (used before JSON is embedded in the report). */
export function redactDeep(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) out[key] = redactDeep(val);
    return out;
  }
  return value;
}
