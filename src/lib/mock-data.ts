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
  isFollowing?: boolean;
}

export interface Activity {
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

export interface AppData {
  me: Athlete;
  athletes: Athlete[];
  activities: Activity[];
  segments: Segment[];
  clubs: Club[];
  challenges: Challenge[];
}

const EMPTY_ATHLETE: Athlete = {
  id: "",
  name: "",
  handle: "",
  avatar: "",
  city: "",
  country: "",
  followers: 0,
  following: 0,
  bio: "",
};

export let ME: Athlete = EMPTY_ATHLETE;
export let ATHLETES: Athlete[] = [];
export let ACTIVITIES: Activity[] = [];
export let SEGMENTS: Segment[] = [];
export let CLUBS: Club[] = [];
export let CHALLENGES: Challenge[] = [];

export function initializeAppData(data: AppData) {
  ME = data.me;
  ATHLETES = data.athletes;
  ACTIVITIES = data.activities;
  SEGMENTS = data.segments;
  CLUBS = data.clubs;
  CHALLENGES = data.challenges;
}

export function clearAppData() {
  ME = EMPTY_ATHLETE;
  ATHLETES = [];
  ACTIVITIES = [];
  SEGMENTS = [];
  CLUBS = [];
  CHALLENGES = [];
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

export function fmtDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }

  return `${minutes}:${pad(secs)}`;
}

export function fmtPace(secPerKm: number): string {
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.floor(secPerKm % 60);
  return `${minutes}:${pad(seconds)}/km`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtTimeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(iso);
}

export function getAthlete(id: string): Athlete {
  return ATHLETES.find((athlete) => athlete.id === id) ?? ME;
}

export function getActivity(id: string): Activity | undefined {
  return ACTIVITIES.find((activity) => activity.id === id);
}

const ACTIVITY_PHOTOS: Record<string, string[]> = {
  Run: [
    "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1486218119243-13883505764c?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1471506480208-91b3a4cc78be?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&q=80&auto=format&fit=crop",
  ],
  Ride: [
    "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&q=80&auto=format&fit=crop",
  ],
  Swim: [
    "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1560089000-7433a4ebbd64?w=900&q=80&auto=format&fit=crop",
  ],
  Hike: [
    "https://images.unsplash.com/photo-1551632811-561732d1e306?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1501554728187-ce583db33af7?w=900&q=80&auto=format&fit=crop",
  ],
  Walk: [
    "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1528543606781-2f6e6857f318?w=900&q=80&auto=format&fit=crop",
  ],
};

// Picks a sport-appropriate photo for an activity. Deterministic per activity
// so the feed doesn't shuffle on every render.
export function getActivityPhoto(activity: Pick<Activity, "sport" | "routeSeed">): string {
  const pool = ACTIVITY_PHOTOS[activity.sport] ?? ACTIVITY_PHOTOS.Run;
  const index = Math.abs(activity.routeSeed) % pool.length;
  return pool[index];
}

export function getSegment(id: string): Segment | undefined {
  return SEGMENTS.find((segment) => segment.id === id);
}

export function weeklyStats(athleteId: string = "me") {
  const activities = ACTIVITIES.filter((activity) => activity.athleteId === athleteId);
  const weeks: { label: string; km: number; time: number; elev: number }[] = [];
  const now = new Date();

  for (let index = 7; index >= 0; index -= 1) {
    const start = new Date(now);
    start.setDate(now.getDate() - index * 7 - 6);
    const end = new Date(now);
    end.setDate(now.getDate() - index * 7);

    const weekActivities = activities.filter((activity) => {
      const date = new Date(activity.date);
      return date >= start && date <= end;
    });

    weeks.push({
      label: `W${8 - index}`,
      km:
        Math.round(weekActivities.reduce((sum, activity) => sum + activity.distanceKm, 0) * 10) /
        10,
      time: weekActivities.reduce((sum, activity) => sum + activity.movingSeconds, 0),
      elev: weekActivities.reduce((sum, activity) => sum + activity.elevationM, 0),
    });
  }

  return weeks;
}

function rnd(seed: number) {
  let current = seed;
  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
}

export function routePath(seed: number, width = 600, height = 300): string {
  const random = rnd(seed * 17 + 3);
  const points: [number, number][] = [];
  let x = width * 0.15;
  let y = height * 0.5;
  points.push([x, y]);

  for (let index = 0; index < 24; index += 1) {
    x += (width * 0.7) / 24 + (random() - 0.5) * 20;
    y += (random() - 0.5) * 40;
    y = Math.max(20, Math.min(height - 20, y));
    points.push([x, y]);
  }

  return points
    .map((point, index) => (index === 0 ? `M${point[0]},${point[1]}` : `L${point[0]},${point[1]}`))
    .join(" ");
}

export function elevationProfile(seed: number, points = 60) {
  const random = rnd(seed * 23 + 7);
  let value = 100 + random() * 200;
  return Array.from({ length: points }, (_, index) => {
    value += (random() - 0.45) * 40;
    value = Math.max(20, value);
    return { x: index, elev: Math.round(value) };
  });
}
