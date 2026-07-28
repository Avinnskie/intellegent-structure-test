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

export function logError(event: string, fields: LogFields, error: unknown): void {
  emitSafely(process.stderr, "error", event, () => ({
    ...fields,
    ...envelope("error", event),
    errorName: safeErrorName(error),
    errorStack: safeStackFrames(error),
  }));
}
