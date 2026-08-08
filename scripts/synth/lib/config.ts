import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ override: true });

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const EnvSchema = z.object({
  DB_URL: z.string().min(1),

  INTERCOM_ACCESS_TOKEN: optionalString,
  INTERCOM_TICKET_TYPE_ID: optionalString,
  INTERCOM_REGION: z.enum(["us", "eu", "au"]).default("us"),

  POSTHOG_API_KEY: optionalString,
  VITE_PUBLIC_POSTHOG_HOST: z
    .string()
    .url()
    .default("https://us.i.posthog.com"),

  LINEAR_API_KEY: optionalString,
  LINEAR_TEAM_KEY: optionalString,

  ANTHROPIC_API_KEY: optionalString,

  SYNTH_COHORT_ID: z.string().min(1).default("cohort-local"),
  SYNTH_USER_COUNT: z.coerce.number().int().positive().default(200),
  SYNTH_RNG_SEED: z.coerce.number().int().default(42),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid env:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const env = loadEnv();
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    console.error(`Missing required env: ${String(key)}`);
    process.exit(1);
  }
  return value as NonNullable<Env[K]>;
}

export function intercomApiBase(region: "us" | "eu" | "au"): string {
  return region === "eu"
    ? "https://api.eu.intercom.io"
    : region === "au"
      ? "https://api.au.intercom.io"
      : "https://api.intercom.io";
}
