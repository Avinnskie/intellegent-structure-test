export type LogFields = Record<string, string | number | boolean | null | undefined>;

type Level = "info" | "error";

type Envelope = { timestamp: string; level: Level; event: string };

function emit(stream: NodeJS.WriteStream, entry: object): void {
  stream.write(`${JSON.stringify(entry)}\n`);
}

function envelope(level: Level, event: string): Envelope {
  return { timestamp: new Date().toISOString(), level, event };
}

function emitSafely(
  stream: NodeJS.WriteStream,
  level: Level,
  event: string,
  build: () => object,
): void {
  try {
    emit(stream, build());
  } catch {
    try {
      emit(stream, { ...envelope(level, event), errorName: "UnloggableEntry" });
    } catch {
    }
  }
}

function safeText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value === undefined) return fallback;
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function stackHeader(error: Error): string {
  const name = safeText(error.name, "Error");
  const message = safeText(error.message, "");
  if (name === "") return message;
  if (message === "") return name;
  return `${name}: ${message}`;
}

function safeStackFrames(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  try {
    return stackFramesOf(error);
  } catch {
    return undefined;
  }
}

function stackFramesOf(error: Error): string | undefined {
  if (typeof error.stack !== "string") {
    return undefined;
  }

  const { stack } = error;
  const header = stackHeader(error);
  const isFallback = !stack.startsWith(header);
  const body = isFallback ? stack : stack.slice(header.length);
  const message = safeText(error.message, "");

  const frames = body
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line) && !(isFallback && message.includes(line.trim())));

  return frames.length > 0 ? frames.join("\n") : undefined;
}

const ERROR_NAME_PATTERN = /^[\w.$]{1,64}$/;

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error;
  }
  try {
    const name = error.constructor?.name;
    return typeof name === "string" && ERROR_NAME_PATTERN.test(name) ? name : "UnknownError";
  } catch {
    return "UnknownError";
  }
}

export function logInfo(event: string, fields: LogFields): void {
  emitSafely(process.stdout, "info", event, () => ({ ...fields, ...envelope("info", event) }));
}

const MAX_MESSAGE_LENGTH = 500;

/**
 * Pesan galat, dipendekkan dan dibuat satu baris.
 *
 * Sebelumnya log hanya memuat nama dan stack. Untuk galat yang namanya sudah
 * menjelaskan dirinya sendiri itu cukup, tetapi pembungkus seperti
 * `DrizzleQueryError` menyimpan sebab sebenarnya di dalam pesan — misalnya
 * kolom yang belum ada setelah migrasi tertinggal. Tanpa pesan, log hanya
 * memberi tahu bahwa ada yang gagal, bukan apa yang gagal.
 */
function safeErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  try {
    const message = String(error.message).replace(/\s+/g, " ").trim();
    if (message === "") {
      return undefined;
    }
    return message.length > MAX_MESSAGE_LENGTH
      ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…`
      : message;
  } catch {
    return undefined;
  }
}

/**
 * Rantai `cause`, tempat sebab sesungguhnya biasanya berada.
 *
 * Driver basis data membungkus galat aslinya: yang di permukaan hanya
 * menyebut "query gagal", sedangkan kode Postgres dan nama kolom yang
 * bermasalah ada satu atau dua lapis di bawahnya. Kedalaman dibatasi agar
 * rantai yang melingkar tidak membuat log meledak.
 */
function safeErrorCauses(error: unknown, maxDepth = 3): string[] | undefined {
  const causes: string[] = [];
  let current: unknown = error instanceof Error ? error.cause : undefined;

  for (let depth = 0; depth < maxDepth && current !== undefined && current !== null; depth += 1) {
    const name = safeErrorName(current);
    const message = safeErrorMessage(current);
    // Kode Postgres (mis. 42703 untuk kolom tidak dikenal) sangat menghemat
    // waktu penelusuran, jadi ikut dicatat bila ada.
    const code =
      typeof current === "object" && current !== null && "code" in current
        ? String((current as { code?: unknown }).code)
        : undefined;
    causes.push([name, code, message].filter(Boolean).join(" | "));
    current = current instanceof Error ? current.cause : undefined;
  }

  return causes.length > 0 ? causes : undefined;
}

export function logError(event: string, fields: LogFields, error: unknown): void {
  emitSafely(process.stderr, "error", event, () => ({
    ...fields,
    ...envelope("error", event),
    errorName: safeErrorName(error),
    errorMessage: safeErrorMessage(error),
    errorCauses: safeErrorCauses(error),
    errorStack: safeStackFrames(error),
  }));
}
