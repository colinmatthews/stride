import type { Sport } from "../../../server/seed.js";

export type PersonaId =
  | "casual_runner"
  | "weekend_warrior"
  | "ultra_runner"
  | "competitive_cyclist"
  | "triathlete"
  | "new_user"
  | "power_user"
  | "dormant"
  | "churned";

export type Plan = "free" | "premium" | "cancelled";

export type UserStatus = "active" | "dormant" | "churned";

export interface Persona {
  id: PersonaId;
  label: string;
  weight: number;
  status: UserStatus;
  primarySports: Sport[];
  sportMix: { sport: Sport; weight: number }[];
  activitiesPerWeek: [number, number];
  planMix: { plan: Plan; weight: number }[];
  signupWindowDays: [number, number];
  supportLikelihood: number;
  kudosGivenRate: number;
  followsGivenRange: [number, number];
  clubJoinChance: number;
  challengeJoinChance: number;
  dormantAfterDays?: [number, number];
  cancelledDaysAgo?: [number, number];
  bioSamples: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: "casual_runner",
    label: "Casual Runner",
    weight: 25,
    status: "active",
    primarySports: ["Run"],
    sportMix: [
      { sport: "Run", weight: 75 },
      { sport: "Walk", weight: 20 },
      { sport: "Hike", weight: 5 },
    ],
    activitiesPerWeek: [2, 4],
    planMix: [
      { plan: "free", weight: 85 },
      { plan: "premium", weight: 15 },
    ],
    signupWindowDays: [30, 365],
    supportLikelihood: 0.15,
    kudosGivenRate: 0.25,
    followsGivenRange: [3, 15],
    clubJoinChance: 0.35,
    challengeJoinChance: 0.4,
    bioSamples: [
      "Running to clear my head.",
      "Slow and steady.",
      "Training for my first half.",
      "Park runs and pasta dinners.",
      "New to running, loving it.",
    ],
  },
  {
    id: "weekend_warrior",
    label: "Weekend Warrior",
    weight: 13,
    status: "active",
    primarySports: ["Run", "Ride", "Hike"],
    sportMix: [
      { sport: "Run", weight: 30 },
      { sport: "Ride", weight: 35 },
      { sport: "Hike", weight: 25 },
      { sport: "Walk", weight: 10 },
    ],
    activitiesPerWeek: [1, 3],
    planMix: [
      { plan: "free", weight: 80 },
      { plan: "premium", weight: 20 },
    ],
    signupWindowDays: [60, 540],
    supportLikelihood: 0.1,
    kudosGivenRate: 0.2,
    followsGivenRange: [5, 25],
    clubJoinChance: 0.25,
    challengeJoinChance: 0.3,
    bioSamples: [
      "Desk job Monday–Friday. Outside on weekends.",
      "Any excuse to be outside.",
      "Dad of two. Still moving.",
      "Saturdays are sacred.",
    ],
  },
  {
    id: "ultra_runner",
    label: "Ultra Runner",
    weight: 5,
    status: "active",
    primarySports: ["Run"],
    sportMix: [
      { sport: "Run", weight: 85 },
      { sport: "Hike", weight: 10 },
      { sport: "Walk", weight: 5 },
    ],
    activitiesPerWeek: [5, 7],
    planMix: [
      { plan: "free", weight: 25 },
      { plan: "premium", weight: 75 },
    ],
    signupWindowDays: [120, 900],
    supportLikelihood: 0.2,
    kudosGivenRate: 0.35,
    followsGivenRange: [30, 120],
    clubJoinChance: 0.7,
    challengeJoinChance: 0.8,
    bioSamples: [
      "100 milers. 50 milers. All the milers.",
      "UTMB finisher. Back for more.",
      "Vert is my love language.",
      "If the trail is longer than the car ride, I'm in.",
    ],
  },
  {
    id: "competitive_cyclist",
    label: "Competitive Cyclist",
    weight: 7,
    status: "active",
    primarySports: ["Ride"],
    sportMix: [
      { sport: "Ride", weight: 90 },
      { sport: "Run", weight: 5 },
      { sport: "Swim", weight: 5 },
    ],
    activitiesPerWeek: [4, 6],
    planMix: [
      { plan: "free", weight: 20 },
      { plan: "premium", weight: 80 },
    ],
    signupWindowDays: [180, 1200],
    supportLikelihood: 0.25,
    kudosGivenRate: 0.4,
    followsGivenRange: [40, 200],
    clubJoinChance: 0.75,
    challengeJoinChance: 0.85,
    bioSamples: [
      "Cat 2 roadie. Always chasing watts.",
      "Coffee, carbon, climbs.",
      "Racing this season. 78kg FTP 320.",
      "Crit racer. Weekend gravel.",
    ],
  },
  {
    id: "triathlete",
    label: "Triathlete",
    weight: 5,
    status: "active",
    primarySports: ["Run", "Ride", "Swim"],
    sportMix: [
      { sport: "Run", weight: 30 },
      { sport: "Ride", weight: 40 },
      { sport: "Swim", weight: 30 },
    ],
    activitiesPerWeek: [5, 8],
    planMix: [
      { plan: "free", weight: 15 },
      { plan: "premium", weight: 85 },
    ],
    signupWindowDays: [180, 1200],
    supportLikelihood: 0.3,
    kudosGivenRate: 0.3,
    followsGivenRange: [20, 100],
    clubJoinChance: 0.6,
    challengeJoinChance: 0.7,
    bioSamples: [
      "Swim. Bike. Run. Sleep. Repeat.",
      "70.3 this fall, IM next year.",
      "Three sports, one obsession.",
      "Ironman in training.",
    ],
  },
  {
    id: "new_user",
    label: "New User",
    weight: 15,
    status: "active",
    primarySports: ["Run", "Walk"],
    sportMix: [
      { sport: "Run", weight: 40 },
      { sport: "Walk", weight: 40 },
      { sport: "Ride", weight: 15 },
      { sport: "Hike", weight: 5 },
    ],
    activitiesPerWeek: [0, 3],
    planMix: [
      { plan: "free", weight: 95 },
      { plan: "premium", weight: 5 },
    ],
    signupWindowDays: [0, 14],
    supportLikelihood: 0.5,
    kudosGivenRate: 0.05,
    followsGivenRange: [0, 3],
    clubJoinChance: 0.1,
    challengeJoinChance: 0.15,
    bioSamples: [
      "New to Stride.",
      "Just getting started.",
      "Figuring this out.",
      "",
    ],
  },
  {
    id: "power_user",
    label: "Power User",
    weight: 10,
    status: "active",
    primarySports: ["Run", "Ride"],
    sportMix: [
      { sport: "Run", weight: 40 },
      { sport: "Ride", weight: 35 },
      { sport: "Swim", weight: 10 },
      { sport: "Hike", weight: 10 },
      { sport: "Walk", weight: 5 },
    ],
    activitiesPerWeek: [6, 9],
    planMix: [{ plan: "premium", weight: 100 }],
    signupWindowDays: [365, 1460],
    supportLikelihood: 0.35,
    kudosGivenRate: 0.6,
    followsGivenRange: [80, 400],
    clubJoinChance: 0.85,
    challengeJoinChance: 0.9,
    bioSamples: [
      "Logging everything since 2018.",
      "Coach, athlete, data nerd.",
      "If it's not on Stride, it didn't happen.",
      "Premium since day one.",
    ],
  },
  {
    id: "dormant",
    label: "Dormant",
    weight: 15,
    status: "dormant",
    primarySports: ["Run", "Ride", "Walk"],
    sportMix: [
      { sport: "Run", weight: 50 },
      { sport: "Ride", weight: 25 },
      { sport: "Walk", weight: 20 },
      { sport: "Hike", weight: 5 },
    ],
    activitiesPerWeek: [1, 4],
    planMix: [
      { plan: "free", weight: 80 },
      { plan: "premium", weight: 20 },
    ],
    signupWindowDays: [180, 1200],
    dormantAfterDays: [14, 70],
    supportLikelihood: 0.15,
    kudosGivenRate: 0.05,
    followsGivenRange: [5, 50],
    clubJoinChance: 0.25,
    challengeJoinChance: 0.2,
    bioSamples: [
      "Used to run. Life got busy.",
      "Taking a break.",
      "Injured. Back soon.",
      "",
    ],
  },
  {
    id: "churned",
    label: "Churned",
    weight: 5,
    status: "churned",
    primarySports: ["Run", "Ride"],
    sportMix: [
      { sport: "Run", weight: 45 },
      { sport: "Ride", weight: 35 },
      { sport: "Walk", weight: 15 },
      { sport: "Hike", weight: 5 },
    ],
    activitiesPerWeek: [3, 6],
    planMix: [{ plan: "cancelled", weight: 100 }],
    signupWindowDays: [180, 1200],
    cancelledDaysAgo: [5, 60],
    supportLikelihood: 0.55,
    kudosGivenRate: 0.2,
    followsGivenRange: [10, 80],
    clubJoinChance: 0.4,
    challengeJoinChance: 0.3,
    bioSamples: [
      "Cancelled premium. Still here for now.",
      "Not worth it anymore.",
      "Might be back.",
      "",
    ],
  },
];

export function personaById(id: PersonaId): Persona {
  const found = PERSONAS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown persona: ${id}`);
  return found;
}
