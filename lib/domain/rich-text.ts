const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
]);

const VOID_TAGS: ReadonlySet<string> = new Set(["br"]);

const DROP_CONTENT_TAGS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
]);

const TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g;

const ENTITY_PATTERN = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;

function escapeText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "&") {
      const rest = value.slice(i);
      const entity = ENTITY_PATTERN.exec(rest);
      if (entity && entity.index === 0) {
        out += entity[0];
        i += entity[0].length - 1;
        continue;
      }
      out += "&amp;";
      continue;
    }
    if (char === "<") {
      out += "&lt;";
      continue;
    }
    if (char === ">") {
      out += "&gt;";
      continue;
    }
    out += char;
  }
  return out;
}

export function sanitizeRichText(input: string): string {
  const openStack: string[] = [];
  let out = "";
  let cursor = 0;

  let dropDepth = 0;
  let dropTag = "";

  TAG_PATTERN.lastIndex = 0;
  let match = TAG_PATTERN.exec(input);

  while (match !== null) {
    const text = input.slice(cursor, match.index);
    if (dropDepth === 0) {
      out += escapeText(text);
    }
    cursor = match.index + match[0].length;

    const raw = match[0];
    const name = match[1]?.toLowerCase();

    // Komentar dan CDATA dibuang tanpa jejak.
    if (name === undefined) {
      match = TAG_PATTERN.exec(input);
      continue;
    }

    const isClosing = raw.startsWith("</");

    if (dropDepth > 0) {
      if (name === dropTag) {
        dropDepth += isClosing ? -1 : 1;
      }
      match = TAG_PATTERN.exec(input);
      continue;
    }

    if (DROP_CONTENT_TAGS.has(name)) {
      if (!isClosing && !raw.endsWith("/>")) {
        dropDepth = 1;
        dropTag = name;
      }
      match = TAG_PATTERN.exec(input);
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) {
      // Tag tidak dikenal: tagnya dibuang, teks di dalamnya tetap tampil.
      match = TAG_PATTERN.exec(input);
      continue;
    }

    if (VOID_TAGS.has(name)) {
      out += `<${name} />`;
      match = TAG_PATTERN.exec(input);
      continue;
    }

    if (isClosing) {
      const depth = openStack.lastIndexOf(name);
      if (depth !== -1) {
        // Tutup juga tag yang tertinggal di dalamnya, agar tidak menganga.
        for (let i = openStack.length - 1; i >= depth; i -= 1) {
          out += `</${openStack[i]}>`;
        }
        openStack.length = depth;
      }
      match = TAG_PATTERN.exec(input);
      continue;
    }

    openStack.push(name);
    out += `<${name}>`;
    match = TAG_PATTERN.exec(input);
  }

  if (dropDepth === 0) {
    out += escapeText(input.slice(cursor));
  }
  for (let i = openStack.length - 1; i >= 0; i -= 1) {
    out += `</${openStack[i]}>`;
  }

  return out;
}

export function isPlainText(value: string): boolean {
  return !/<[a-zA-Z/]/.test(value);
}

export function toDisplayHtml(value: string): string {
  if (isPlainText(value)) {
    return value
      .split(/\n{2,}/)
      .map((block) => `<p>${escapeText(block).replace(/\n/g, "<br />")}</p>`)
      .join("");
  }
  return sanitizeRichText(value);
}

export function toPlainText(value: string): string {
  return sanitizeRichText(value)
    .replace(/<br \/>/g, " ")
    .replace(/<\/(p|h1|h2|h3|li|blockquote)>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRichTextEmpty(value: string): boolean {
  return toPlainText(value) === "";
}
