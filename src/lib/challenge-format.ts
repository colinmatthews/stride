/**
 * Display helpers for the challenge shelf.
 *
 * The engine that decides *which* editions exist lives on the server
 * (`server/challenge-engine.ts`) — this module only formats what it sends
 * back. The month arithmetic is duplicated rather than shared because the
 * client and server builds are separate TypeScript projects, the same way
 * `Sport` is declared in both.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthIndex(year: number, month0: number) {
  return year * 12 + month0;
}

export function monthIndexOf(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return monthIndex(year, month - 1);
}

export function monthShort(idx: number) {
  return MONTHS[idx % 12].slice(0, 3);
}

/** "August 2026" — the year matters once history spans more than one. */
export function monthLabel(idx: number) {
  return `${MONTHS[idx % 12]} ${Math.floor(idx / 12)}`;
}

export function dayOfMonth(iso: string) {
  return Number(iso.split("-")[2]);
}

/** "1–31 Aug" — the window a challenge counts effort over. */
export function windowLabel(startsAt: string, endsAt: string) {
  return `${dayOfMonth(startsAt)}–${dayOfMonth(endsAt)} ${monthShort(monthIndexOf(startsAt))}`;
}

export function daysBetween(fromISO: string, toISO: string) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000);
}

/** Today as a UTC calendar date, matching how the server dates editions. */
export function todayISO(now: Date = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function fmtGoal(value: number, unit: "km" | "m") {
  return unit === "m" ? `${Math.round(value).toLocaleString()} m` : `${value} km`;
}

export function fmtProgress(value: number, unit: "km" | "m") {
  return unit === "m" ? Math.round(value).toLocaleString() : value.toFixed(1);
}
