// Mock dataset for the Strava-style prototype. All client-side.

export type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";

export interface Athlete {
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

export interface Activity {
  id: string;
  athleteId: string;
  sport: Sport;
  title: string;
  description?: string;
  date: string; // ISO
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr?: number;
  avgPaceSecPerKm?: number; // for run/walk/hike
  avgSpeedKmh?: number; // for ride
  kudos: number;
  comments: { id: string; athleteId: string; text: string }[];
  achievements: number;
  photo?: string;
  routeSeed: number; // deterministic squiggle
  splits?: { km: number; paceSec: number; hr: number; elev: number }[];
  segments?: { id: string; rank: number }[];
  kudoed?: boolean;
}

export interface Segment {
  id: string;
  name: string;
  sport: Sport;
  location: string;
  distanceKm: number;
  avgGrade: number;
  elevationM: number;
  attempts: number;
  athletes: number;
  myBestSec?: number;
  korSec: number;
  korAthlete: string;
  routeSeed: number;
}

export interface Club {
  id: string;
  name: string;
  sport: Sport | "Multisport";
  city: string;
  members: number;
  cover: string;
  description: string;
  joined?: boolean;
}

export interface Challenge {
  id: string;
  name: string;
  sport: Sport | "Multisport";
  goalKm: number;
  myProgressKm: number;
  participants: number;
  endsAt: string;
  badge: string;
  joined?: boolean;
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

export const ME: Athlete = {
  id: "me",
  name: "Alex Carter",
  handle: "alexruns",
  avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop",
  city: "Boulder",
  country: "USA",
  followers: 412,
  following: 218,
  bio: "Trail runner. Coffee dependent. Marathon PR 2:54.",
};

export const ATHLETES: Athlete[] = [
  ME,
  { id: "a1", name: "Maya Sato", handle: "maya.s", avatar: ATHLETE_PHOTOS[0], city: "Tokyo", country: "JP", followers: 1820, following: 240, bio: "Ultra runner. UTMB finisher." },
  { id: "a2", name: "Diego Romero", handle: "dromero", avatar: ATHLETE_PHOTOS[1], city: "Barcelona", country: "ES", followers: 980, following: 410, bio: "Cyclist. Always uphill." },
  { id: "a3", name: "Lena Hoffman", handle: "lenah", avatar: ATHLETE_PHOTOS[2], city: "Berlin", country: "DE", followers: 540, following: 320, bio: "Triathlete in training." },
  { id: "a4", name: "Noah Bennett", handle: "noahb", avatar: ATHLETE_PHOTOS[3], city: "Wellington", country: "NZ", followers: 730, following: 180, bio: "Trail. Sea. Repeat." },
  { id: "a5", name: "Priya Shah", handle: "priya.s", avatar: ATHLETE_PHOTOS[4], city: "Mumbai", country: "IN", followers: 2210, following: 540, bio: "Marathoner. Coach." },
  { id: "a6", name: "Tomás Lima", handle: "tlima", avatar: ATHLETE_PHOTOS[5], city: "Lisbon", country: "PT", followers: 410, following: 290, bio: "Weekend warrior." },
  { id: "a7", name: "Anya Volkov", handle: "anyav", avatar: ATHLETE_PHOTOS[6], city: "Reykjavík", country: "IS", followers: 1120, following: 220, bio: "Cold runs, hot coffee." },
  { id: "a8", name: "Jamal Reed", handle: "jreed", avatar: ATHLETE_PHOTOS[7], city: "Cape Town", country: "ZA", followers: 660, following: 410, bio: "Mountain biker." },
];

function pad(n: number) { return n.toString().padStart(2, "0"); }
export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
export function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}:${pad(s)}/km`;
}
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function fmtTimeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(iso);
}

const ACTIVITY_TITLES: Record<Sport, string[]> = {
  Run: ["Sunrise miles", "Tempo Tuesday", "Easy shakeout", "Long run", "Hill repeats", "Recovery jog", "Marathon pace"],
  Ride: ["Coffee ride", "Climbing day", "Group ride", "Solo gravel", "Sunset spin", "Recovery roll"],
  Swim: ["Pool intervals", "Open water", "Endurance swim", "Drill set"],
  Hike: ["Ridge traverse", "Summit push", "Forest loop", "Sunset hike"],
  Walk: ["Lunch walk", "Dog walk", "Evening stroll"],
};

function rnd(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateActivities(): Activity[] {
  const out: Activity[] = [];
  const sports: Sport[] = ["Run", "Ride", "Swim", "Hike", "Walk"];
  const now = Date.now();
  for (let i = 0; i < 40; i++) {
    const r = rnd(i + 1);
    const sport = sports[Math.floor(r() * sports.length)];
    const ath = ATHLETES[Math.floor(r() * ATHLETES.length)];
    const distance = sport === "Ride" ? 20 + r() * 80 : sport === "Swim" ? 1 + r() * 3 : sport === "Hike" ? 5 + r() * 15 : 3 + r() * 20;
    const pace = sport === "Ride" ? 0 : 240 + r() * 180; // sec/km
    const speed = sport === "Ride" ? 22 + r() * 15 : 0;
    const moving = sport === "Ride" ? (distance / speed) * 3600 : distance * pace;
    const elev = sport === "Swim" ? 0 : Math.floor(50 + r() * 800);
    const titles = ACTIVITY_TITLES[sport];
    const title = titles[Math.floor(r() * titles.length)];
    const daysAgo = Math.floor(r() * 30);
    const date = new Date(now - daysAgo * 86400000 - Math.floor(r() * 86400000)).toISOString();
    const hasPhoto = r() > 0.4;
    const splits = sport !== "Swim" ? Array.from({ length: Math.max(1, Math.floor(distance)) }, (_, k) => ({
      km: k + 1,
      paceSec: sport === "Ride" ? Math.floor(3600 / (speed + (r() - 0.5) * 4)) : Math.floor(pace + (r() - 0.5) * 30),
      hr: Math.floor(140 + r() * 40),
      elev: Math.floor((r() - 0.5) * 30),
    })) : undefined;

    out.push({
      id: `act-${i + 1}`,
      athleteId: ath.id,
      sport,
      title,
      description: r() > 0.6 ? "Felt strong today. Legs finally coming back after the race." : undefined,
      date,
      distanceKm: Math.round(distance * 100) / 100,
      movingSeconds: Math.floor(moving),
      elevationM: elev,
      avgHr: sport === "Swim" ? undefined : Math.floor(140 + r() * 30),
      avgPaceSecPerKm: sport === "Ride" ? undefined : Math.floor(pace),
      avgSpeedKmh: sport === "Ride" ? Math.round(speed * 10) / 10 : undefined,
      kudos: Math.floor(r() * 80),
      comments: r() > 0.5 ? [
        { id: `c${i}-1`, athleteId: ATHLETES[Math.floor(r() * ATHLETES.length)].id, text: "Massive effort 🔥" },
        ...(r() > 0.6 ? [{ id: `c${i}-2`, athleteId: ATHLETES[Math.floor(r() * ATHLETES.length)].id, text: "Beautiful route!" }] : []),
      ] : [],
      achievements: Math.floor(r() * 4),
      photo: hasPhoto ? ACTIVITY_PHOTOS[i % ACTIVITY_PHOTOS.length] : undefined,
      routeSeed: i + 1,
      splits,
      segments: sport === "Run" || sport === "Ride" ? [
        { id: `seg-${(i % 6) + 1}`, rank: Math.floor(r() * 50) + 1 },
      ] : undefined,
    });
  }
  return out.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export const ACTIVITIES: Activity[] = generateActivities();

export const SEGMENTS: Segment[] = [
  { id: "seg-1", name: "Flagstaff Climb", sport: "Ride", location: "Boulder, USA", distanceKm: 7.2, avgGrade: 7.4, elevationM: 530, attempts: 14820, athletes: 4210, myBestSec: 1840, korSec: 1412, korAthlete: "T. Pidcock", routeSeed: 11 },
  { id: "seg-2", name: "Mesa Trail South", sport: "Run", location: "Boulder, USA", distanceKm: 5.6, avgGrade: 3.1, elevationM: 180, attempts: 8210, athletes: 2110, myBestSec: 1620, korSec: 1402, korAthlete: "K. Jornet", routeSeed: 12 },
  { id: "seg-3", name: "Bear Peak Out & Back", sport: "Run", location: "Boulder, USA", distanceKm: 12.3, avgGrade: 6.2, elevationM: 950, attempts: 3210, athletes: 980, korSec: 3421, korAthlete: "M. Sato", routeSeed: 13 },
  { id: "seg-4", name: "Old La Honda", sport: "Ride", location: "Woodside, USA", distanceKm: 5.5, avgGrade: 7.3, elevationM: 400, attempts: 24500, athletes: 7800, korSec: 902, korAthlete: "D. Romero", routeSeed: 14 },
  { id: "seg-5", name: "Sandbank Sprint", sport: "Run", location: "Wellington, NZ", distanceKm: 1.2, avgGrade: 1.0, elevationM: 8, attempts: 5400, athletes: 1820, myBestSec: 240, korSec: 198, korAthlete: "N. Bennett", routeSeed: 15 },
  { id: "seg-6", name: "City Loop Crit", sport: "Ride", location: "Berlin, DE", distanceKm: 3.4, avgGrade: 0.4, elevationM: 12, attempts: 9800, athletes: 3100, korSec: 286, korAthlete: "L. Hoffman", routeSeed: 16 },
];

export const CLUBS: Club[] = [
  { id: "c1", name: "Front Range Trail Pack", sport: "Run", city: "Boulder, USA", members: 1842, cover: "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=900&h=400&fit=crop", description: "Weekly group runs on Front Range trails. All paces welcome.", joined: true },
  { id: "c2", name: "Sunrise Cycling Crew", sport: "Ride", city: "Barcelona, ES", members: 920, cover: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&h=400&fit=crop", description: "Early morning rides up the coast. Coffee included." },
  { id: "c3", name: "Tokyo Ultra Society", sport: "Run", city: "Tokyo, JP", members: 612, cover: "https://images.unsplash.com/photo-1486218119243-13883505764c?w=900&h=400&fit=crop", description: "For those who run further than reasonable." },
  { id: "c4", name: "Berlin Tri Lab", sport: "Multisport", city: "Berlin, DE", members: 480, cover: "https://images.unsplash.com/photo-1471506480208-91b3a4cc78be?w=900&h=400&fit=crop", description: "Swim. Bike. Run. Repeat. Together." },
  { id: "c5", name: "Cape Town MTB", sport: "Ride", city: "Cape Town, ZA", members: 1320, cover: "https://images.unsplash.com/photo-1544191696-15693072e0b5?w=900&h=400&fit=crop", description: "Singletrack and table mountain views." },
  { id: "c6", name: "Reykjavík Cold Runners", sport: "Run", city: "Reykjavík, IS", members: 280, cover: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=900&h=400&fit=crop", description: "Run through wind, snow and northern lights." },
];

export const CHALLENGES: Challenge[] = [
  { id: "ch1", name: "April Distance Run", sport: "Run", goalKm: 100, myProgressKm: 64.2, participants: 184230, endsAt: "2026-04-30", badge: "🏃", joined: true },
  { id: "ch2", name: "Climb 5,000m", sport: "Ride", goalKm: 5000, myProgressKm: 2840, participants: 92450, endsAt: "2026-04-30", badge: "⛰️", joined: true },
  { id: "ch3", name: "Gran Fondo 100K", sport: "Ride", goalKm: 100, myProgressKm: 0, participants: 64200, endsAt: "2026-05-15", badge: "🚴" },
  { id: "ch4", name: "10K Race Ready", sport: "Run", goalKm: 10, myProgressKm: 0, participants: 38120, endsAt: "2026-05-31", badge: "🥇" },
  { id: "ch5", name: "Swim 20K", sport: "Swim", goalKm: 20, myProgressKm: 6.4, participants: 22100, endsAt: "2026-04-30", badge: "🏊", joined: true },
];

export function getAthlete(id: string): Athlete {
  return ATHLETES.find((a) => a.id === id) ?? ME;
}
export function getActivity(id: string): Activity | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}
export function getSegment(id: string): Segment | undefined {
  return SEGMENTS.find((s) => s.id === id);
}

// Weekly stats
export function weeklyStats(athleteId: string = "me") {
  const acts = ACTIVITIES.filter((a) => a.athleteId === athleteId);
  const weeks: { label: string; km: number; time: number; elev: number }[] = [];
  const now = new Date();
  for (let w = 7; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(now.getDate() - w * 7 - 6);
    const end = new Date(now);
    end.setDate(now.getDate() - w * 7);
    const wk = acts.filter((a) => {
      const d = new Date(a.date);
      return d >= start && d <= end;
    });
    weeks.push({
      label: `W${8 - w}`,
      km: Math.round(wk.reduce((s, a) => s + a.distanceKm, 0) * 10) / 10,
      time: wk.reduce((s, a) => s + a.movingSeconds, 0),
      elev: wk.reduce((s, a) => s + a.elevationM, 0),
    });
  }
  return weeks;
}

// Build a deterministic SVG polyline path from a seed, used as a fake "route".
export function routePath(seed: number, w = 600, h = 300): string {
  const r = rnd(seed * 17 + 3);
  const pts: [number, number][] = [];
  let x = w * 0.15;
  let y = h * 0.5;
  pts.push([x, y]);
  for (let i = 0; i < 24; i++) {
    x += (w * 0.7) / 24 + (r() - 0.5) * 20;
    y += (r() - 0.5) * 40;
    y = Math.max(20, Math.min(h - 20, y));
    pts.push([x, y]);
  }
  return pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
}

// Elevation profile points
export function elevationProfile(seed: number, points = 60) {
  const r = rnd(seed * 23 + 7);
  let v = 100 + r() * 200;
  return Array.from({ length: points }, (_, i) => {
    v += (r() - 0.45) * 40;
    v = Math.max(20, v);
    return { x: i, elev: Math.round(v) };
  });
}
