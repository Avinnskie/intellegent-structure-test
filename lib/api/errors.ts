import { ZodError } from "zod";
import { logError, logInfo, type LogFields } from "../server/logger.ts";

/**
 * An expected, named failure. `message` is user-facing Indonesian copy that we author, so unlike an
 * arbitrary `Error` message it is safe to return to the client and to log.
 */
export class ApiError extends Error {
  // Declared and assigned explicitly rather than as constructor parameter properties: the latter
  // need real code generation, which Node's type-stripping runtime (used by `npm test`) rejects.
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

// Stable client copy. Zod's own issue messages can quote the rejected value and name the field it
// came from, so they never reach the client — only this fixed string does.
const VALIDATION_MESSAGE = "Data yang dikirim tidak valid.";
const INTERNAL_MESSAGE = "Terjadi kesalahan pada server.";

type Classified = {
  code: string;
  message: string;
  status: number;
  /** PII-free context for the log line only — never merged into the response body. */
  logFields: LogFields;
  /** True for faults we did not anticipate: the only category that logs at error level. */
  unexpected: boolean;
};

/** Single source of truth for status/code, shared by the response and the log line. */
function classify(error: unknown): Classified {
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: VALIDATION_MESSAGE,
      status: 422,
      logFields: {
        // Field NAMES and issue codes only. An issue's `message` and the value behind the path may
        // be an answer or PII; `String` guards the symbol keys that would make `join` throw.
        invalidFields: error.issues.map((issue) => issue.path.map(String).join(".")).join(","),
        issueCodes: [...new Set(error.issues.map((issue) => issue.code))].join(","),
      },
      unexpected: false,
    };
  }

  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      logFields: { message: error.message },
      unexpected: false,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: INTERNAL_MESSAGE,
    status: 500,
    logFields: {},
    unexpected: true,
  };
}

export function toErrorResponse(error: unknown, requestId: string): Response {
  const { code, message, status } = classify(error);
  return Response.json({ error: { code, message, requestId } }, { status });
}

export function withApiHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    const requestId = crypto.randomUUID();
    try {
      return await handler(...args);
    } catch (error) {
      const { code, status, logFields, unexpected } = classify(error);
      // Envelope keys last so a future `classify` branch cannot silently redefine them.
      const fields = { ...logFields, requestId, code, status };

      if (unexpected) {
        logError("api_error", fields, error);
      } else {
        // An expired session or a rejected payload is normal control flow, not a fault. Logging it
        // at error level would drown the signal that `level:"error"` is supposed to carry.
        logInfo("api_client_error", fields);
      }

      return toErrorResponse(error, requestId);
    }
  };
}
