import { z } from "zod";
import { CHANNELS, DISMISS_REASONS, RETENTION_ACTIONS } from "./retention.js";

const MAX_MESSAGE_LENGTH = 4000;

const retentionActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contacted"),
    channel: z.enum(CHANNELS),
    message: z.string().trim().min(1, "Message is required").max(MAX_MESSAGE_LENGTH),
  }),
  z.object({ action: z.literal("snoozed") }),
  z.object({ action: z.literal("dismissed"), note: z.enum(DISMISS_REASONS) }),
  z.object({ action: z.literal("reopened") }),
]);

export type RetentionActionInput = z.infer<typeof retentionActionSchema>;

export function parseRetentionAction(
  body: unknown,
): { ok: true; value: RetentionActionInput } | { ok: false; error: string } {
  const result = retentionActionSchema.safeParse(body);

  if (result.success) {
    return { ok: true, value: result.data };
  }

  const issue = result.error.issues[0];
  const field = issue?.path.join(".");
  return {
    ok: false,
    error:
      field === "action"
        ? `action must be one of: ${RETENTION_ACTIONS.join(", ")}`
        : `${field ? `${field}: ` : ""}${issue?.message ?? "Invalid request"}`,
  };
}
