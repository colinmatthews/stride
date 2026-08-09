import { z } from "zod";
import { CROSS_TRAINING_SPORTS, GPS_SPORTS, isCrossTraining } from "./sport.js";

const ALL_SPORTS = [...GPS_SPORTS, ...CROSS_TRAINING_SPORTS] as const;

// POST /api/activities body. Cross-training entries (Strength/Yoga/Stretching)
// are duration-only — no GPS route, so distance/pace/speed don't apply and
// elevation/routeSeed are meaningless. GPS sports keep the existing
// distance-and-duration-required rule the client has always enforced; this
// schema is the first place that rule is actually validated server-side.
export const createActivityBodySchema = z
  .object({
    sport: z.enum(ALL_SPORTS),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    movingSeconds: z.coerce.number().int().positive({ message: "A duration is required." }),
    distanceKm: z.coerce.number().min(0).optional(),
    elevationM: z.coerce.number().int().min(0).optional(),
    avgHr: z.coerce.number().int().positive().optional(),
    avgPaceSecPerKm: z.coerce.number().int().positive().optional(),
    avgSpeedKmh: z.coerce.number().positive().optional(),
    routeSeed: z.coerce.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (isCrossTraining(data.sport)) {
      if (data.distanceKm !== undefined && data.distanceKm !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["distanceKm"],
          message: `${data.sport} entries don't record distance.`,
        });
      }
      if (data.avgPaceSecPerKm !== undefined || data.avgSpeedKmh !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["avgPaceSecPerKm"],
          message: `${data.sport} entries don't record pace or speed.`,
        });
      }
      return;
    }

    if (data.distanceKm === undefined || data.distanceKm <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["distanceKm"],
        message: "distanceKm is required and must be greater than 0 for GPS sports.",
      });
    }
  });

export type CreateActivityBody = z.infer<typeof createActivityBodySchema>;
