/**
 * Pembersih HTML untuk teks soal dan tutorial.
 *
 * Teks ini ditulis HR lewat editor, lalu dirender ke halaman peserta dengan
 * `dangerouslySetInnerHTML`. Tanpa pembersihan, siapa pun yang dapat menyunting
 * soal dapat menitipkan skrip yang berjalan di peramban peserta.
 *
 * Pendekatannya bukan "cari lalu buang yang berbahaya" — daftar hal berbahaya
 * tidak pernah lengkap. Sebaliknya: HTML dibongkar, lalu disusun ulang hanya
 * dari tag yang dikenal, dan SETIAP ATRIBUT DIBUANG.
 *
 * Karena tidak ada satu pun atribut yang lolos, seluruh permukaan serangan
 * berbasis atribut ikut hilang sekaligus: `onerror`, `onload`, `href` berisi
 * `javascript:`, `src` ke berkas luar, `style` yang menutupi elemen lain.
 * Ukuran huruf diatur lewat tag <h1>/<h2>/<h3>, bukan lewat `style`, justru
 * supaya atribut tidak perlu diizinkan sama sekali.
 */

/** Tag yang boleh muncul. Sengaja tidak memuat a, img, video, table. */
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

/** Tag tanpa penutup. */
const VOID_TAGS: ReadonlySet<string> = new Set(["br"]);

/**
 * Isi tag berikut dibuang seluruhnya, bukan sekadar di-escape.
 *
 * Meng-escape isi <script> sebenarnya sudah aman — ia berubah jadi teks biasa.
 * Tetapi peserta lalu melihat baris kode di tengah soal, dan itu tampak seperti
 * kerusakan. Lebih baik hilang sama sekali.
 */
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

/**
 * Entitas yang sudah benar dibiarkan utuh; `&` lain baru di-escape.
 *
 * Tanpa ini, teks yang keluar dari editor sebagai `&amp;` akan di-escape lagi
 * menjadi `&amp;amp;` dan peserta membaca "&amp;" secara harfiah. Kesalahan ini
 * menumpuk tiap kali soal disimpan ulang.
 */
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

/**
 * Mengembalikan HTML yang hanya berisi tag dari daftar izin, tanpa atribut.
 *
 * Tag penutup yang tidak punya pembuka dibuang, dan tag yang belum ditutup
 * ditutup di akhir. Markup yang timpang tidak boleh keluar dari fungsi ini:
 * satu <ul> yang menganga bisa menelan sisa tata letak halaman peserta.
 */
export function sanitizeRichText(input: string): string {
  const openStack: string[] = [];
  let out = "";
  let cursor = 0;
  /** Ketika > 0, kita sedang berada di dalam <script> dan seisinya dibuang. */
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

/** Benar untuk teks lama yang disimpan sebelum editor ada. */
export function isPlainText(value: string): boolean {
  return !/<[a-zA-Z/]/.test(value);
}

/**
 * Menyiapkan nilai tersimpan untuk ditampilkan.
 *
 * Soal lama tersimpan sebagai teks polos dengan baris baru sungguhan. Kalau
 * langsung dimasukkan ke innerHTML, baris barunya hilang. Jadi teks polos
 * diubah dulu menjadi paragraf, sementara HTML cukup dibersihkan.
 */
export function toDisplayHtml(value: string): string {
  if (isPlainText(value)) {
    return value
      .split(/\n{2,}/)
      .map((block) => `<p>${escapeText(block).replace(/\n/g, "<br />")}</p>`)
      .join("");
  }
  return sanitizeRichText(value);
}

/** Teks tanpa tag, untuk pratinjau ringkas dan pencarian. */
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

/** Benar bila tidak ada teks yang tersisa setelah tag dilepas. */
export function isRichTextEmpty(value: string): boolean {
  return toPlainText(value) === "";
}
