import { z } from "zod";

export const submittedSubtestResponseSchema = z.discriminatedUnion("status", [
  z.object({
    itemVersionId: z.uuid(),
    localNumber: z.number().int().positive(),
    status: z.literal("answered"),
    value: z.string().trim().min(1).max(500),
  }),
  z.object({
    itemVersionId: z.uuid(),
    localNumber: z.number().int().positive(),
    status: z.literal("skipped"),
  }),
]);

export const submittedSubtestResponsesSchema = z
  .array(submittedSubtestResponseSchema)
  .max(200);

export type SubmittedSubtestResponse = z.infer<typeof submittedSubtestResponseSchema>;

export const submittedPapiAnswerSchema = z.object({
  itemNumber: z.number().int().min(1).max(90),
  option: z.enum(["A", "B"]),
});

export const submittedPapiAnswersSchema = z.array(submittedPapiAnswerSchema).max(90);

export type SubmittedPapiAnswer = z.infer<typeof submittedPapiAnswerSchema>;
