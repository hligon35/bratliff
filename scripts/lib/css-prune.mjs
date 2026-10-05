export function parseCss(source) {
  const nodes = [];
  let i = 0;
  const n = source.length;
  const skipString = (q) => { i++; while (i < n && source[i] !== q) { if (source[i] === "\\") i++; i++; } i++; };
  while (i < n) {
    while (i < n && /\s/.test(source[i])) i++;
    if (i >= n) break;
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    const start = i;
    let depth = 0;
    let bodyStart = -1;
    while (i < n) {
      const ch = source[i];
      if (ch === '"' || ch === "'") { skipString(ch); continue; }
      if (source.startsWith("/*", i)) { const end = source.indexOf("*/", i + 2); i = end < 0 ? n : end + 2; continue; }
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "{" && depth === 0) { bodyStart = i; break; }
      else if (ch === ";" && depth === 0) break;
      i++;
    }
    if (bodyStart < 0) { nodes.push({ prelude: source.slice(start, i).trim(), body: null }); i++; continue; }
    const prelude = source.slice(start, bodyStart).trim();
    let level = 1;
    i = bodyStart + 1;
    while (i < n && level > 0) {
      const ch = source[i];
      if (ch === '"' || ch === "'") { skipString(ch); continue; }
      if (source.startsWith("/*", i)) { const end = source.indexOf("*/", i + 2); i = end < 0 ? n : end + 2; continue; }
      if (ch === "{") level++;
      else if (ch === "}") level--;
      i++;
    }
    nodes.push({ prelude, body: source.slice(bodyStart + 1, i - 1) });
  }
  return nodes;
}

function splitSelectors(prelude) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of prelude) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(current.trim()); current = ""; } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function tokensOf(selector) {
  const stripped = selector.replace(/\[[^\]]*\]/g, (m) => ` ${m} `);
  const tokens = [];
  for (const m of stripped.matchAll(/[.#]([A-Za-z_][\w-]*)/g)) tokens.push(m[1]);
  for (const m of selector.matchAll(/\[([\w-]+)/g)) tokens.push(m[1]);
  return tokens;
}

export function pruneCss(source, corpus) {
  const dropped = [];
  const keepSelector = (selector) => tokensOf(selector).every((token) => corpus.includes(token));
  const walk = (nodes) => {
    const out = [];
    for (const node of nodes) {
      if (node.body === null) { out.push(`${node.prelude};`); continue; }
      if (/^@(media|supports)/i.test(node.prelude)) {
        const inner = walk(parseCss(node.body));
        if (inner.length) out.push(`${node.prelude}{\n${inner.join("\n")}\n}`);
        continue;
      }
      if (/^@/.test(node.prelude)) { out.push(`${node.prelude}{${node.body}}`); continue; }
      const selectors = splitSelectors(node.prelude);
      const kept = selectors.filter(keepSelector);
      dropped.push(...selectors.filter((s) => !keepSelector(s)));
      if (kept.length) out.push(`${kept.join(",")}{${node.body.trim()}}`);
    }
    return out;
  };
  return { css: walk(parseCss(source)).join("\n") + "\n", dropped };
}
