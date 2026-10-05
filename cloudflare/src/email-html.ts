// Allowlist sanitizer for received email HTML. The result is only ever shown inside a
// sandboxed, script-less iframe with its own CSP; this is the first of those two layers.

const ALLOWED_TAGS = new Set([
  "a", "abbr", "address", "article", "b", "big", "blockquote", "body", "br", "caption", "center", "cite", "code", "col", "colgroup",
  "dd", "div", "dl", "dt", "em", "figcaption", "figure", "font", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i",
  "img", "li", "main", "mark", "ol", "p", "pre", "q", "s", "section", "small", "span", "strike", "strong", "sub", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "tt", "u", "ul", "wbr",
]);
const VOID_TAGS = new Set(["br", "col", "hr", "img", "wbr"]);
const DROP_WITH_CONTENT = /<(script|iframe|object|embed|noscript|template|svg|math|title|textarea|select|button|form)\b[\s\S]*?<\/\1\s*>/gi;
const ALLOWED_ATTRIBUTES = new Set([
  "align", "alt", "bgcolor", "border", "cellpadding", "cellspacing", "class", "color", "colspan", "dir", "face", "height", "href",
  "id", "lang", "rowspan", "size", "src", "style", "title", "valign", "width",
]);
const MAX_INPUT = 300_000;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 32))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Math.min(Number(dec), 0x10ffff) || 32))
    .replace(/&colon;/gi, ":").replace(/&newline;/gi, "").replace(/&tab;/gi, "");
}

function escapeAttribute(value: string): string {
  return value.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeUrl(raw: string, kind: "href" | "src"): string {
  const normalized = decodeEntities(raw).replace(/[\u0000-\u0020\u007f-\u009f]+/g, "");
  if (kind === "href") return /^(https?:|mailto:|tel:)/i.test(normalized) ? raw.trim() : "";
  return /^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(normalized) ? raw.trim() : "";
}

export function sanitizeCss(css: string): string {
  return css
    .replace(/<\/?style[^>]*>/gi, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "x(")
    .replace(/(?:javascript|vbscript):/gi, "")
    .replace(/behavior\s*:[^;}]*/gi, "")
    .replace(/-moz-binding\s*:[^;}]*/gi, "")
    .replace(/<\//g, "<\\/");
}

function sanitizeAttributes(tag: string, rawAttributes: string): string {
  let out = "";
  let hasTargetLink = false;
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of rawAttributes.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!ALLOWED_ATTRIBUTES.has(name)) continue;
    if (name === "href") {
      if (tag !== "a") continue;
      const href = safeUrl(value, "href");
      if (!href) continue;
      out += ` href="${escapeAttribute(href)}"`;
      hasTargetLink = true;
    } else if (name === "src") {
      if (tag !== "img") continue;
      const src = safeUrl(value, "src");
      if (!src) continue;
      out += ` src="${escapeAttribute(src)}"`;
    } else if (name === "style") {
      out += ` style="${escapeAttribute(sanitizeCss(decodeEntities(value)))}"`;
    } else {
      out += ` ${name}="${escapeAttribute(value)}"`;
    }
  }
  return tag === "a" && hasTargetLink ? out + ' target="_blank" rel="noopener noreferrer nofollow"' : out;
}

export function sanitizeEmailHtml(input: string): string {
  let html = input.slice(0, MAX_INPUT)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[[\s\S]*?\]>/g, "")
    .replace(DROP_WITH_CONTENT, "")
    .replace(/<(script|iframe|object|embed)\b[\s\S]*$/i, "");
  html = html.replace(/<!doctype[^>]*>/gi, "");
  let output = "";
  let cursor = 0;
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  const pushText = (text: string) => { output += text.replace(/</g, "&lt;"); };
  for (let match = tagPattern.exec(html); match; match = tagPattern.exec(html)) {
    pushText(html.slice(cursor, match.index));
    cursor = tagPattern.lastIndex;
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    if (tag === "style") {
      if (closing) continue;
      const end = html.slice(cursor).search(/<\/style\s*>/i);
      const css = end < 0 ? html.slice(cursor) : html.slice(cursor, cursor + end);
      output += `<style>${sanitizeCss(css)}</style>`;
      cursor = end < 0 ? html.length : cursor + end + html.slice(cursor + end).match(/<\/style\s*>/i)![0].length;
      tagPattern.lastIndex = cursor;
      continue;
    }
    if (!ALLOWED_TAGS.has(tag) || tag === "body") continue;
    if (closing) {
      if (!VOID_TAGS.has(tag)) output += `</${tag}>`;
    } else {
      output += `<${tag}${sanitizeAttributes(tag, match[3])}>`;
    }
  }
  pushText(html.slice(cursor));
  return output.trim();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|title|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|table|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const CSS_RULE = /[^{}\n]*\{[^{}]*\}/g;

/** Removes stylesheet text that older syncs left inside plain-text bodies. */
export function cleanLegacyEmailText(value: string): string {
  if (!/\{[^}]*:[^}]*;[^}]*\}/.test(value)) return value;
  let out = value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\*[\s\S]*$/, " ");
  for (let pass = 0; pass < 6; pass += 1) {
    const next = out.replace(CSS_RULE, " ");
    if (next === out) break;
    out = next;
  }
  return out.replace(/[^{}\n]*\{[^}]*$/, " ").replace(/[ \t]+/g, " ").replace(/\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}