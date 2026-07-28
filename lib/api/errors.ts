import { ZodError } from "zod";
import { logError, logInfo, type LogFields } from "../server/logger.ts";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const VALIDATION_MESSAGE = "Data yang dikirim tidak valid.";
const INTERNAL_MESSAGE = "Terjadi kesalahan pada server.";

type Classified = {
  code: string;
  message: string;
  status: number;
  logFields: LogFields;
  unexpected: boolean;
};

function classify(error: unknown): Classified {
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: VALIDATION_MESSAGE,
      status: 422,
      logFields: {
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
      const fields = { ...logFields, requestId, code, status };

      if (unexpected) {
        logError("api_error", fields, error);
      } else {
        logInfo("api_client_error", fields);
      }

      return toErrorResponse(error, requestId);
    }
  };
}
