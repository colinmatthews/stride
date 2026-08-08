import { loadEnv } from "./config.js";

export function cohortTag(): string {
  return loadEnv().SYNTH_COHORT_ID;
}

export function cohortCustomAttributes(): Record<string, string> {
  return { cohort_id: cohortTag() };
}
