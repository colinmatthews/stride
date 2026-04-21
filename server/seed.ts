export type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";
export type MetricType = "distance_km" | "elevation_m";

export interface SeedAthlete {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  city: string;
  country: string;
  followers: number;
  following: number;
  bio: string;
}

export interface SeedActivity {
  id: string;
  athleteId: string;
  sport: Sport;
  title: string;
  description?: string;
  date: string;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr?: number;
  avgPaceSecPerKm?: number;
  avgSpeedKmh?: number;
  kudos: number;
  comments: { id: string; athleteId: string; text: string }[];
  achievements: number;
  photo?: string;
  routeSeed: number;
  splits?: { km: number; paceSec: number; hr: number; elev: number }[];
  segments?: { id: string; rank: number; effortSeconds: number }[];
}

export interface SeedSegment {
  id: string;
  name: string;
  sport: Sport;
  location: string;
  distanceKm: number;
  avgGrade: number;
  elevationM: number;
  attempts: number;
  athletes: number;
  korSec: number;
  korAthlete: string;
  routeSeed: number;
}

export interface SeedClub {
  id: string;
  name: string;
  sport: Sport | "Multisport";
  city: string;
  members: number;
  cover: string;
  description: string;
}

export interface SeedChallenge {
  id: string;
  name: string;
  sport: Sport | "Multisport";
  goalKm: number;
  participants: number;
  endsAt: string;
  badge: string;
  metricType: MetricType;
}

const ATHLETE_PHOTOS = [
  "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=160&h=160&fit=crop",
  "https://images.unsplash.com/photo-1489980557514-251d61e3eeb6?w=160&h=160&fit=crop",
];

export const USER_AVATARS = [
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop",
  ...ATHLETE_PHOTOS,
];

const ACTIVITY_PHOTOS = [
  "https://images.unsplash.com/photo-1486218119243-13883505764c?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1526676537331-7747bf8278fc?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1517960413843-0aee8e2b3285?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1544191696-15693072e0b5?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1471506480208-91b3a4cc78be?w=900&h=600&fit=crop",
];

export const SEEDED_ATHLETES: SeedAthlete[] = [
  {
    id: "a1",
    name: "Maya Sato",
    handle: "maya.s",
    avatar: ATHLETE_PHOTOS[0],
    city: "Tokyo",
    country: "JP",
    followers: 1820,
    following: 240,
    bio: "Ultra runner. UTMB finisher.",
  },
  {
    id: "a2",
    name: "Diego Romero",
    handle: "dromero",
    avatar: ATHLETE_PHOTOS[1],
    city: "Barcelona",
    country: "ES",
    followers: 980,
    following: 410,
    bio: "Cyclist. Always uphill.",
  },
  {
    id: "a3",
    name: "Lena Hoffman",
    handle: "lenah",
    avatar: ATHLETE_PHOTOS[2],
    city: "Berlin",
    country: "DE",
    followers: 540,
    following: 320,
    bio: "Triathlete in training.",
  },
  {
    id: "a4",
    name: "Noah Bennett",
    handle: "noahb",
    avatar: ATHLETE_PHOTOS[3],
    city: "Wellington",
    country: "NZ",
    followers: 730,
    following: 180,
    bio: "Trail. Sea. Repeat.",
  },
  {
    id: "a5",
    name: "Priya Shah",
    handle: "priya.s",
    avatar: ATHLETE_PHOTOS[4],
    city: "Mumbai",
    country: "IN",
    followers: 2210,
    following: 540,
    bio: "Marathoner. Coach.",
  },
  {
    id: "a6",
    name: "Tomas Lima",
    handle: "tlima",
    avatar: ATHLETE_PHOTOS[5],
    city: "Lisbon",
    country: "PT",
    followers: 410,
    following: 290,
    bio: "Weekend warrior.",
  },
  {
    id: "a7",
    name: "Anya Volkov",
    handle: "anyav",
    avatar: ATHLETE_PHOTOS[6],
    city: "Reykjavik",
    country: "IS",
    followers: 1120,
    following: 220,
    bio: "Cold runs, hot coffee.",
  },
  {
    id: "a8",
    name: "Jamal Reed",
    handle: "jreed",
    avatar: ATHLETE_PHOTOS[7],
    city: "Cape Town",
    country: "ZA",
    followers: 660,
    following: 410,
    bio: "Mountain biker.",
  },
];

export const SEEDED_SEGMENTS: SeedSegment[] = [
  {
    id: "seg-1",
    name: "Flagstaff Climb",
    sport: "Ride",
    location: "Boulder, USA",
    distanceKm: 7.2,
    avgGrade: 7.4,
    elevationM: 530,
    attempts: 14820,
    athletes: 4210,
    korSec: 1412,
    korAthlete: "T. Pidcock",
    routeSeed: 11,
  },
  {
    id: "seg-2",
    name: "Mesa Trail South",
    sport: "Run",
    location: "Boulder, USA",
    distanceKm: 5.6,
    avgGrade: 3.1,
    elevationM: 180,
    attempts: 8210,
    athletes: 2110,
    korSec: 1402,
    korAthlete: "K. Jornet",
    routeSeed: 12,
  },
  {
    id: "seg-3",
    name: "Bear Peak Out & Back",
    sport: "Run",
    location: "Boulder, USA",
    distanceKm: 12.3,
    avgGrade: 6.2,
    elevationM: 950,
    attempts: 3210,
    athletes: 980,
    korSec: 3421,
    korAthlete: "M. Sato",
    routeSeed: 13,
  },
  {
    id: "seg-4",
    name: "Old La Honda",
    sport: "Ride",
    location: "Woodside, USA",
    distanceKm: 5.5,
    avgGrade: 7.3,
    elevationM: 400,
    attempts: 24500,
    athletes: 7800,
    korSec: 902,
    korAthlete: "D. Romero",
    routeSeed: 14,
  },
  {
    id: "seg-5",
    name: "Sandbank Sprint",
    sport: "Run",
    location: "Wellington, NZ",
    distanceKm: 1.2,
    avgGrade: 1.0,
    elevationM: 8,
    attempts: 5400,
    athletes: 1820,
    korSec: 198,
    korAthlete: "N. Bennett",
    routeSeed: 15,
  },
  {
    id: "seg-6",
    name: "City Loop Crit",
    sport: "Ride",
    location: "Berlin, DE",
    distanceKm: 3.4,
    avgGrade: 0.4,
    elevationM: 12,
    attempts: 9800,
    athletes: 3100,
    korSec: 286,
    korAthlete: "L. Hoffman",
    routeSeed: 16,
  },
];

export const SEEDED_CLUBS: SeedClub[] = [
  {
    id: "c1",
    name: "Front Range Trail Pack",
    sport: "Run",
    city: "Boulder, USA",
    members: 1842,
    cover: "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=900&h=400&fit=crop",
    description: "Weekly group runs on Front Range trails. All paces welcome.",
  },
  {
    id: "c2",
    name: "Sunrise Cycling Crew",
    sport: "Ride",
    city: "Barcelona, ES",
    members: 920,
    cover: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&h=400&fit=crop",
    description: "Early morning rides up the coast. Coffee included.",
  },
  {
    id: "c3",
    name: "Tokyo Ultra Society",
    sport: "Run",
    city: "Tokyo, JP",
    members: 612,
    cover: "https://images.unsplash.com/photo-1486218119243-13883505764c?w=900&h=400&fit=crop",
    description: "For those who run further than reasonable.",
  },
  {
    id: "c4",
    name: "Berlin Tri Lab",
    sport: "Multisport",
    city: "Berlin, DE",
    members: 480,
    cover: "https://images.unsplash.com/photo-1471506480208-91b3a4cc78be?w=900&h=400&fit=crop",
    description: "Swim. Bike. Run. Repeat. Together.",
  },
  {
    id: "c5",
    name: "Cape Town MTB",
    sport: "Ride",
    city: "Cape Town, ZA",
    members: 1320,
    cover: "https://images.unsplash.com/photo-1544191696-15693072e0b5?w=900&h=400&fit=crop",
    description: "Singletrack and table mountain views.",
  },
  {
    id: "c6",
    name: "Reykjavik Cold Runners",
    sport: "Run",
    city: "Reykjavik, IS",
    members: 280,
    cover: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=900&h=400&fit=crop",
    description: "Run through wind, snow and northern lights.",
  },
];

export const SEEDED_CHALLENGES: SeedChallenge[] = [
  {
    id: "ch1",
    name: "April Distance Run",
    sport: "Run",
    goalKm: 100,
    participants: 184230,
    endsAt: "2026-04-30",
    badge: "RUN",
    metricType: "distance_km",
  },
  {
    id: "ch2",
    name: "Climb 5,000m",
    sport: "Ride",
    goalKm: 5000,
    participants: 92450,
    endsAt: "2026-04-30",
    badge: "CLIMB",
    metricType: "elevation_m",
  },
  {
    id: "ch3",
    name: "Gran Fondo 100K",
    sport: "Ride",
    goalKm: 100,
    participants: 64200,
    endsAt: "2026-05-15",
    badge: "GF",
    metricType: "distance_km",
  },
  {
    id: "ch4",
    name: "10K Race Ready",
    sport: "Run",
    goalKm: 10,
    participants: 38120,
    endsAt: "2026-05-31",
    badge: "10K",
    metricType: "distance_km",
  },
  {
    id: "ch5",
    name: "Swim 20K",
    sport: "Swim",
    goalKm: 20,
    participants: 22100,
    endsAt: "2026-04-30",
    badge: "SWIM",
    metricType: "distance_km",
  },
];

const ACTIVITY_TITLES: Record<Sport, string[]> = {
  Run: [
    "Sunrise miles",
    "Tempo Tuesday",
    "Easy shakeout",
    "Long run",
    "Hill repeats",
    "Recovery jog",
    "Marathon pace",
  ],
  Ride: [
    "Coffee ride",
    "Climbing day",
    "Group ride",
    "Solo gravel",
    "Sunset spin",
    "Recovery roll",
  ],
  Swim: ["Pool intervals", "Open water", "Endurance swim", "Drill set"],
  Hike: ["Ridge traverse", "Summit push", "Forest loop", "Sunset hike"],
  Walk: ["Lunch walk", "Dog walk", "Evening stroll"],
};

function rnd(seed: number) {
  let current = seed;
  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
}

export function generateSeedActivities(): SeedActivity[] {
  const sports: Sport[] = ["Run", "Ride", "Swim", "Hike", "Walk"];
  const now = Date.now();
  const activities: SeedActivity[] = [];

  for (let index = 0; index < 40; index += 1) {
    const random = rnd(index + 1);
    const sport = sports[Math.floor(random() * sports.length)];
    const athlete = SEEDED_ATHLETES[Math.floor(random() * SEEDED_ATHLETES.length)];
    const distance =
      sport === "Ride"
        ? 20 + random() * 80
        : sport === "Swim"
          ? 1 + random() * 3
          : sport === "Hike"
            ? 5 + random() * 15
            : 3 + random() * 20;
    const pace = sport === "Ride" ? 0 : 240 + random() * 180;
    const speed = sport === "Ride" ? 22 + random() * 15 : 0;
    const moving = sport === "Ride" ? (distance / speed) * 3600 : distance * pace;
    const elevation = sport === "Swim" ? 0 : Math.floor(50 + random() * 800);
    const title = ACTIVITY_TITLES[sport][Math.floor(random() * ACTIVITY_TITLES[sport].length)];
    const daysAgo = Math.floor(random() * 30);
    const date = new Date(now - daysAgo * 86400000 - Math.floor(random() * 86400000)).toISOString();
    const hasPhoto = random() > 0.4;
    const splits =
      sport !== "Swim"
        ? Array.from({ length: Math.max(1, Math.floor(distance)) }, (_, splitIndex) => ({
            km: splitIndex + 1,
            paceSec:
              sport === "Ride"
                ? Math.floor(3600 / (speed + (random() - 0.5) * 4))
                : Math.floor(pace + (random() - 0.5) * 30),
            hr: Math.floor(140 + random() * 40),
            elev: Math.floor((random() - 0.5) * 30),
          }))
        : undefined;
    const segmentCandidates = SEEDED_SEGMENTS.filter((segment) => segment.sport === sport);
    const pickedSegment =
      (sport === "Run" || sport === "Ride") && segmentCandidates.length > 0
        ? segmentCandidates[index % segmentCandidates.length]
        : undefined;

    activities.push({
      id: `act-${index + 1}`,
      athleteId: athlete.id,
      sport,
      title,
      description:
        random() > 0.6 ? "Felt strong today. Legs finally coming back after the race." : undefined,
      date,
      distanceKm: Math.round(distance * 100) / 100,
      movingSeconds: Math.floor(moving),
      elevationM: elevation,
      avgHr: sport === "Swim" ? undefined : Math.floor(140 + random() * 30),
      avgPaceSecPerKm: sport === "Ride" ? undefined : Math.floor(pace),
      avgSpeedKmh: sport === "Ride" ? Math.round(speed * 10) / 10 : undefined,
      kudos: Math.floor(random() * 80),
      comments:
        random() > 0.5
          ? [
              {
                id: `c${index}-1`,
                athleteId: SEEDED_ATHLETES[Math.floor(random() * SEEDED_ATHLETES.length)].id,
                text: "Massive effort.",
              },
              ...(random() > 0.6
                ? [
                    {
                      id: `c${index}-2`,
                      athleteId: SEEDED_ATHLETES[Math.floor(random() * SEEDED_ATHLETES.length)].id,
                      text: "Beautiful route.",
                    },
                  ]
                : []),
            ]
          : [],
      achievements: Math.floor(random() * 4),
      photo: hasPhoto ? ACTIVITY_PHOTOS[index % ACTIVITY_PHOTOS.length] : undefined,
      routeSeed: index + 1,
      splits,
      segments: pickedSegment
        ? [
            {
              id: pickedSegment.id,
              rank: Math.floor(random() * 50) + 1,
              effortSeconds: pickedSegment.korSec + Math.floor(random() * 600) + 45,
            },
          ]
        : undefined,
    });
  }

  return activities.sort((left, right) => +new Date(right.date) - +new Date(left.date));
}
