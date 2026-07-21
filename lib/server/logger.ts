/**
 * Structured logger: one JSON object per line, stdout for info and stderr for error.
 *
 * Spec §19 forbids PII, full access codes, participant tokens, response values, scoring keys and
 * norms from ever reaching the log stream. The signature is the enforcement: callers pass EXPLICIT
 * scalar fields they have named one by one, so there is no way to hand this module a request body,
 * a database row, or a domain object and have it walked. Never widen `LogFields` to accept objects.
 */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

type Level = "info" | "error";

/** Reserved envelope keys. Written after the caller's fields so a stray field cannot redefine them. */
type Envelope = { timestamp: string; level: Level; event: string };

function emit(stream: NodeJS.WriteStream, entry: object): void {
  // JSON.stringify drops `undefined` fields, which is what we want for optional context.
  stream.write(`${JSON.stringify(entry)}\n`);
}

function envelope(level: Level, event: string): Envelope {
  return { timestamp: new Date().toISOString(), level, event };
}

/**
 * INVARIANT: `logInfo` and `logError` MUST NOT THROW, for any input, ever.
 *
 * Both are called from inside `withApiHandler`'s catch block. A throw there escapes before
 * `toErrorResponse` runs, so the client gets no envelope at all and the original error is lost —
 * strictly worse than the failure being logged. Guarding each field individually was tried and
 * missed three hazards in a row (`message`, `name`, and the `.stack` access itself), so totality is
 * enforced structurally here instead of by enumeration: `build` is invoked INSIDE the try, so any
 * throwing getter, hostile `toString`, `Error.prepareStackTrace` hook, or unserializable field is
 * contained no matter which field introduced it.
 *
 * Do not "simplify" these try/catch blocks away.
 */
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
      // The entry was unbuildable or unserializable. A bare line still records that the event
      // happened, which beats silence when something is actively misbehaving.
      emit(stream, { ...envelope(level, event), errorName: "UnloggableEntry" });
    } catch {
      // The stream itself is gone (EPIPE) or `event` is hostile too. Nothing left to try, and
      // swallowing is the whole point: the response envelope matters more than the log line.
    }
  }
}

/**
 * `name`/`message` are typed as strings but are plain writable properties, so at runtime they can
 * hold anything — `Object.assign(new Error(), await response.json())` lets an upstream body decide.
 * V8 coerces them when it formats `stack`, so the header must be measured the same way or the slice
 * below under-measures it and leaves the message in the frames.
 */
function safeText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value === undefined) return fallback;
  try {
    return String(value); // Throws for a symbol, and runs a hostile `toString`.
  } catch {
    return fallback;
  }
}

/** Mirrors V8's `ErrorUtils.ToString`, which is how it builds the header line(s) of `stack`. */
function stackHeader(error: Error): string {
  const name = safeText(error.name, "Error");
  const message = safeText(error.message, "");
  if (name === "") return message;
  if (message === "") return name;
  return `${name}: ${message}`;
}

/**
 * V8 renders `stack` as "<header>\n    at ..." where the header embeds the message, so logging a raw
 * stack leaks it. For an unknown error that message is untrusted: a driver may have echoed a
 * parameter back into it (an answer, an access code, a candidate name).
 *
 * The header is removed by LENGTH, not by pattern: a message containing newlines spans multiple
 * header lines, so a line-by-line filter lets a crafted message forge its own "    at ..." frame and
 * survive. `name`/`message` are read to measure the header — they are never emitted.
 */
function safeStackFrames(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  try {
    return stackFramesOf(error);
  } catch {
    // Reading `.stack` is itself a hazard, not just the value it returns: V8 formats the stack
    // lazily on FIRST ACCESS, and that formatting calls Error.prototype.toString() plus any
    // installed `Error.prepareStackTrace` hook — an error-monitoring SDK, per ERROR_MONITORING_DSN.
    // A hostile `message.toString` or a buggy hook throws there, before any value guard can run.
    // A log line without a stack still beats a lost envelope.
    return undefined;
  }
}

function stackFramesOf(error: Error): string | undefined {
  if (typeof error.stack !== "string") {
    return undefined;
  }

  const { stack } = error;
  const header = stackHeader(error);
  // V8 caches the formatted stack on first access, so a `name`/`message` mutated afterwards no
  // longer matches the header. Fall back to the line filter for those and for non-V8/custom stacks.
  const isFallback = !stack.startsWith(header);
  const body = isFallback ? stack : stack.slice(header.length);
  const message = safeText(error.message, "");

  // The header survives on the fallback path, so a crafted message can still forge a frame there. A
  // genuine frame is V8-generated and never appears inside the message, so anything that does is
  // dropped. Gated to that path deliberately: on the primary path the slice has already removed the
  // message, and the common wrap `new Error("upstream failed: " + inner.stack)` legitimately repeats
  // real frames inside the message, which this would otherwise strip from the log.
  //
  // Known/accepted residual: a message mutated AFTER `stack` is read defeats this, because the
  // message tested here no longer contains the forged frame. That needs post-hoc mutation of a
  // caught error, so it is not reachable from request data.
  const frames = body
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line) && !(isFallback && message.includes(line.trim())));

  return frames.length > 0 ? frames.join("\n") : undefined;
}

// Constructor names are code-defined identifiers; this rejects anything that isn't one.
const ERROR_NAME_PATTERN = /^[\w.$]{1,64}$/;

/**
 * `Error.prototype.name` is writable, so on an UNKNOWN error it is data we never vetted and may
 * carry PII an upstream layer stuffed into it. The constructor name is not assignable through the
 * instance, and the pattern keeps anything exotic out of the log line.
 */
function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error;
  }
  try {
    const name = error.constructor?.name; // A proxy or getter here can throw.
    return typeof name === "string" && ERROR_NAME_PATTERN.test(name) ? name : "UnknownError";
  } catch {
    return "UnknownError";
  }
}

/** Never throws — see the INVARIANT on `emitSafely`. */
export function logInfo(event: string, fields: LogFields): void {
  emitSafely(process.stdout, "info", event, () => ({ ...fields, ...envelope("info", event) }));
}

/**
 * Logs an unexpected failure. Never throws — see the INVARIANT on `emitSafely`.
 *
 * The error's `message` is deliberately NOT recorded, here or via the stack — see
 * `safeStackFrames`. A caller holding an error whose message is safe (an `ApiError` we authored,
 * whose copy is already in the response body) passes that message as an explicit field.
 */
export function logError(event: string, fields: LogFields, error: unknown): void {
  emitSafely(process.stderr, "error", event, () => ({
    ...fields,
    ...envelope("error", event),
    errorName: safeErrorName(error),
    errorStack: safeStackFrames(error),
  }));
}
