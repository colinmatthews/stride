import type { PersonaId } from "./personas.js";

export type RootCause =
  | "sync-failure"
  | "gps-drift"
  | "segment-mismatch"
  | "elevation-wrong"
  | "kudos-missing"
  | "billing-overcharge"
  | "billing-cancel"
  | "billing-refund"
  | "billing-downgrade"
  | "account-password"
  | "account-email"
  | "account-deletion"
  | "data-export"
  | "app-crash"
  | "notifications"
  | "feature-request"
  | "club-join"
  | "challenge-progress"
  | "privacy-report";

export type Platform = "iOS" | "Android" | "Web" | "Apple Watch" | "Garmin" | "COROS";

export interface Scenario {
  id: RootCause;
  label: string;
  rootCause: RootCause;
  platforms: Platform[];
  weight: number;
  personaBias: Partial<Record<PersonaId, number>>;
  instructions: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "sync-failure",
    label: "Activity not syncing",
    rootCause: "sync-failure",
    platforms: ["iOS", "Android", "Apple Watch", "Garmin", "COROS"],
    weight: 18,
    personaBias: { casual_runner: 1.5, new_user: 2, weekend_warrior: 1.3 },
    instructions:
      "The user's watch or phone recorded a workout but it never showed up in the feed. They have tried force-quitting the app. They're annoyed because it was a meaningful workout. Mention the device name plausibly (Garmin Forerunner 265, Apple Watch Ultra 2, COROS Pace 3, etc.) and roughly when it happened (yesterday morning, this weekend).",
  },
  {
    id: "gps-drift",
    label: "GPS looks wrong",
    rootCause: "gps-drift",
    platforms: ["iOS", "Android", "Apple Watch", "Garmin"],
    weight: 10,
    personaBias: { competitive_cyclist: 1.5, ultra_runner: 1.3, power_user: 1.2 },
    instructions:
      "The user's GPS track cuts through buildings, water, or is wildly off from the route they actually ran/rode. Distance is off by 0.5–3km. They're annoyed because it ruined a Strava-style flex. Mention specific weirdness (through a building, across a river, 2km short).",
  },
  {
    id: "segment-mismatch",
    label: "Segment not detected",
    rootCause: "segment-mismatch",
    platforms: ["iOS", "Android", "Web"],
    weight: 7,
    personaBias: { competitive_cyclist: 2, ultra_runner: 1.5, power_user: 1.3, triathlete: 1.2 },
    instructions:
      "The user ran or rode a well-known local segment (they should name a plausible one like 'Old La Honda' or 'Flagstaff Climb' or something city-appropriate) but the activity didn't attribute a segment effort. Their time would have been top-20. Mildly annoyed, technical tone.",
  },
  {
    id: "elevation-wrong",
    label: "Elevation looks off",
    rootCause: "elevation-wrong",
    platforms: ["Garmin", "iOS", "COROS"],
    weight: 6,
    personaBias: { ultra_runner: 2, competitive_cyclist: 1.3, triathlete: 1 },
    instructions:
      "The user climbed something significant (500m–2000m) but the activity shows much less — either 0 or a small fraction. They may suspect barometer calibration. Precise, mildly annoyed.",
  },
  {
    id: "kudos-missing",
    label: "Kudos not appearing",
    rootCause: "kudos-missing",
    platforms: ["iOS", "Android"],
    weight: 5,
    personaBias: { casual_runner: 1.3, new_user: 1.2, power_user: 1.1 },
    instructions:
      "A friend said they gave kudos on the user's recent activity but the user doesn't see it. Or kudos count went up then down. Light tone, not a huge deal but annoying.",
  },
  {
    id: "billing-overcharge",
    label: "Charged wrong amount",
    rootCause: "billing-overcharge",
    platforms: ["Web", "iOS", "Android"],
    weight: 5,
    personaBias: { churned: 1.5, power_user: 1.1, triathlete: 1.1, competitive_cyclist: 1.1 },
    instructions:
      "The user was billed twice, billed the wrong amount, or billed after they thought they cancelled. Polite but firm. They want a refund or explanation. Mention the $ amount plausibly (around $10 monthly or $80 annual).",
  },
  {
    id: "billing-cancel",
    label: "Can't cancel subscription",
    rootCause: "billing-cancel",
    platforms: ["Web", "iOS", "Android"],
    weight: 4,
    personaBias: { churned: 3, dormant: 1.5, lapsed: 1.5 },
    instructions:
      "The user is trying to cancel their premium subscription and either can't find the option, got an error, or is worried they'll still be charged. Slightly impatient tone.",
  },
  {
    id: "billing-refund",
    label: "Refund request",
    rootCause: "billing-refund",
    platforms: ["Web", "iOS"],
    weight: 3,
    personaBias: { churned: 2, dormant: 1.2 },
    instructions:
      "The user wants a refund for the most recent charge. Reason could be: forgot to cancel, didn't use it, signed up by mistake, or a specific grievance. Polite.",
  },
  {
    id: "billing-downgrade",
    label: "How to downgrade",
    rootCause: "billing-downgrade",
    platforms: ["Web", "iOS"],
    weight: 3,
    personaBias: { casual_runner: 1.3, dormant: 1.5 },
    instructions:
      "The user wants to downgrade from premium to free but keep their account. Neutral tone, just a product question.",
  },
  {
    id: "account-password",
    label: "Password reset issue",
    rootCause: "account-password",
    platforms: ["Web", "iOS", "Android"],
    weight: 6,
    personaBias: { new_user: 2.5, lapsed: 2, dormant: 1.8 },
    instructions:
      "The user tried password reset but never got the email, or the link is expired/broken. Frustrated because they want back in.",
  },
  {
    id: "account-email",
    label: "Change email address",
    rootCause: "account-email",
    platforms: ["Web", "iOS"],
    weight: 2,
    personaBias: {},
    instructions:
      "The user wants to change their account email (e.g. changed jobs, wants to consolidate accounts). Neutral, just a product question.",
  },
  {
    id: "account-deletion",
    label: "Delete my account",
    rootCause: "account-deletion",
    platforms: ["Web", "iOS"],
    weight: 3,
    personaBias: { churned: 2, dormant: 1.5 },
    instructions:
      "The user wants their account permanently deleted along with all data. Tone varies: some are calm, some are fed up.",
  },
  {
    id: "data-export",
    label: "Export my data",
    rootCause: "data-export",
    platforms: ["Web"],
    weight: 2,
    personaBias: { power_user: 1.5, competitive_cyclist: 1.3 },
    instructions:
      "The user wants a full data export of their activities (GDPR-style request, or just wants their data). May mention a country that makes GDPR relevant.",
  },
  {
    id: "app-crash",
    label: "App keeps crashing",
    rootCause: "app-crash",
    platforms: ["iOS", "Android"],
    weight: 8,
    personaBias: { new_user: 1.5, casual_runner: 1.2 },
    instructions:
      "The app crashes on launch, when opening the feed, or when viewing an activity. May mention phone model (iPhone 15 Pro, Pixel 8, Galaxy S24). They've already tried restarting.",
  },
  {
    id: "notifications",
    label: "Too many notifications",
    rootCause: "notifications",
    platforms: ["iOS", "Android"],
    weight: 3,
    personaBias: { casual_runner: 1.3, new_user: 1.2 },
    instructions:
      "The user is getting too many push notifications (kudos alerts, follow alerts, challenge reminders) and can't find the right setting to turn them down. Mild annoyance.",
  },
  {
    id: "feature-request",
    label: "Feature request",
    rootCause: "feature-request",
    platforms: ["iOS", "Web"],
    weight: 6,
    personaBias: { power_user: 2, competitive_cyclist: 1.5, triathlete: 1.5, ultra_runner: 1.3 },
    instructions:
      "The user is requesting a specific feature — examples: power zones for cycling, swim stroke breakdown, nutrition tracking, dark mode, custom segment creation, training plan export, Garmin Connect sync improvements. Enthusiastic tone.",
  },
  {
    id: "club-join",
    label: "Can't join club",
    rootCause: "club-join",
    platforms: ["iOS", "Android", "Web"],
    weight: 2,
    personaBias: { casual_runner: 1.2, new_user: 1.3 },
    instructions:
      "The user clicks 'Join' on a club and gets an error, or the button does nothing. They want to join because a friend is in it.",
  },
  {
    id: "challenge-progress",
    label: "Challenge progress stuck",
    rootCause: "challenge-progress",
    platforms: ["iOS", "Android"],
    weight: 3,
    personaBias: { casual_runner: 1.2, weekend_warrior: 1.2 },
    instructions:
      "The user's progress toward a distance or elevation challenge isn't incrementing after a recent activity. They want it to count before the deadline.",
  },
  {
    id: "privacy-report",
    label: "Report user / privacy",
    rootCause: "privacy-report",
    platforms: ["iOS", "Web"],
    weight: 1,
    personaBias: {},
    instructions:
      "The user wants to block or report another user for inappropriate comments on their activity, or a privacy concern (their route reveals home location). Tone is serious but measured.",
  },
];

export function scenarioById(id: RootCause): Scenario {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return found;
}
