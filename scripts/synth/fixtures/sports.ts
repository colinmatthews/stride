import type { Sport } from "../../../server/seed.js";

export interface SportProfile {
  distanceKm: [number, number];
  paceSecPerKm?: [number, number];
  speedKmh?: [number, number];
  elevationM: [number, number];
  avgHr: [number, number];
  photoChance: number;
  descriptionChance: number;
  titles: string[];
}

export const SPORT_PROFILES: Record<Sport, SportProfile> = {
  Run: {
    distanceKm: [3, 30],
    paceSecPerKm: [240, 420],
    elevationM: [10, 600],
    avgHr: [135, 175],
    photoChance: 0.4,
    descriptionChance: 0.35,
    titles: [
      "Sunrise miles",
      "Tempo Tuesday",
      "Easy shakeout",
      "Long run",
      "Hill repeats",
      "Recovery jog",
      "Marathon pace",
      "Trail run",
      "Lunchtime loop",
      "Track intervals",
    ],
  },
  Ride: {
    distanceKm: [15, 140],
    speedKmh: [22, 38],
    elevationM: [50, 2200],
    avgHr: [125, 165],
    photoChance: 0.55,
    descriptionChance: 0.4,
    titles: [
      "Coffee ride",
      "Climbing day",
      "Group ride",
      "Solo gravel",
      "Sunset spin",
      "Recovery roll",
      "Century attempt",
      "Commute",
      "Zone 2 base",
    ],
  },
  Swim: {
    distanceKm: [1, 4],
    paceSecPerKm: [900, 1500],
    elevationM: [0, 0],
    avgHr: [120, 150],
    photoChance: 0.15,
    descriptionChance: 0.25,
    titles: ["Pool intervals", "Open water", "Endurance swim", "Drill set", "Masters session"],
  },
  Hike: {
    distanceKm: [4, 22],
    paceSecPerKm: [600, 900],
    elevationM: [100, 1800],
    avgHr: [110, 140],
    photoChance: 0.7,
    descriptionChance: 0.5,
    titles: ["Ridge traverse", "Summit push", "Forest loop", "Sunset hike", "Alpine day"],
  },
  Walk: {
    distanceKm: [1, 8],
    paceSecPerKm: [660, 900],
    elevationM: [0, 80],
    avgHr: [90, 120],
    photoChance: 0.2,
    descriptionChance: 0.15,
    titles: ["Lunch walk", "Dog walk", "Evening stroll", "Errands", "Neighborhood loop"],
  },
};

export const ACTIVITY_DESCRIPTIONS = [
  "Felt strong today.",
  "Legs heavy but pushed through.",
  "Beautiful morning.",
  "First time on this route.",
  "Rained the whole way.",
  "Recovery day, took it easy.",
  "New PR on the climb.",
  "Windy but worth it.",
  "Sun was out. Legs were not.",
  "Solid effort. Happy with it.",
  "Short but sweet.",
  "Brutal headwind coming back.",
];

export const ACTIVITY_PHOTOS = [
  "https://images.unsplash.com/photo-1486218119243-13883505764c?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1526676537331-7747bf8278fc?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1517960413843-0aee8e2b3285?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1544191696-15693072e0b5?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1471506480208-91b3a4cc78be?w=900&h=600&fit=crop",
];

export const USER_AVATARS = [
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1489980557514-251d61e3eeb6?w=160&h=160&fit=crop",
];
