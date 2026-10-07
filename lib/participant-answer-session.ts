import { z } from "zod";
import {
  submittedPapiAnswersSchema,
  submittedSubtestResponsesSchema,
  type SubmittedPapiAnswer,
  type SubmittedSubtestResponse,
} from "./domain/submitted-responses.ts";

const SESSION_VERSION = 1;

const subtestSessionSchema = z.object({
  version: z.literal(SESSION_VERSION),
  responses: submittedSubtestResponsesSchema,
});

const papiSessionSchema = z.object({
  version: z.literal(SESSION_VERSION),
  answers: submittedPapiAnswersSchema,
});

function readStoredValue(storage: Storage, key: string): unknown | null {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (error) {
    if (error instanceof DOMException || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function writeStoredValue(storage: Storage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error instanceof DOMException) {
      return false;
    }
    throw error;
  }
}

export function subtestAnswerStorageKey(token: string, code: string): string {
  return `ist:answers:${token}:${code}`;
}

export function readSubtestSessionResponses(
  storage: Storage,
  token: string,
  code: string,
): readonly SubmittedSubtestResponse[] {
  const parsed = subtestSessionSchema.safeParse(
    readStoredValue(storage, subtestAnswerStorageKey(token, code)),
  );
  return parsed.success ? parsed.data.responses : [];
}

export function writeSubtestSessionResponse(
  storage: Storage,
  token: string,
  code: string,
  response: SubmittedSubtestResponse,
): boolean {
  const responses = readSubtestSessionResponses(storage, token, code).filter(
    (entry) => entry.itemVersionId !== response.itemVersionId,
  );
  return writeStoredValue(storage, subtestAnswerStorageKey(token, code), {
    version: SESSION_VERSION,
    responses: [...responses, response],
  });
}

export function removeSubtestSessionResponse(
  storage: Storage,
  token: string,
  code: string,
  itemVersionId: string,
): boolean {
  const responses = readSubtestSessionResponses(storage, token, code).filter(
    (entry) => entry.itemVersionId !== itemVersionId,
  );
  return writeStoredValue(storage, subtestAnswerStorageKey(token, code), {
    version: SESSION_VERSION,
    responses,
  });
}

export function clearSubtestSessionResponses(
  storage: Storage,
  token: string,
  code: string,
): void {
  try {
    storage.removeItem(subtestAnswerStorageKey(token, code));
  } catch (error) {
    if (!(error instanceof DOMException)) {
      throw error;
    }
  }
}

function papiAnswerStorageKey(token: string): string {
  return `papi:answers:${token}`;
}

export function readPapiSessionAnswers(
  storage: Storage,
  token: string,
): readonly SubmittedPapiAnswer[] {
  const parsed = papiSessionSchema.safeParse(readStoredValue(storage, papiAnswerStorageKey(token)));
  return parsed.success ? parsed.data.answers : [];
}

export function writePapiSessionAnswer(
  storage: Storage,
  token: string,
  answer: SubmittedPapiAnswer,
): boolean {
  const answers = readPapiSessionAnswers(storage, token).filter(
    (entry) => entry.itemNumber !== answer.itemNumber,
  );
  return writeStoredValue(storage, papiAnswerStorageKey(token), {
    version: SESSION_VERSION,
    answers: [...answers, answer],
  });
}

export function clearPapiSessionAnswers(storage: Storage, token: string): void {
  try {
    storage.removeItem(papiAnswerStorageKey(token));
  } catch (error) {
    if (!(error instanceof DOMException)) {
      throw error;
    }
  }
}
