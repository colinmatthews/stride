// Everything in the app is stored metric (kilometres, metres, seconds per km).
// These helpers convert at render time so the stored data never changes shape
// when an athlete flips their unit preference.

export type UnitSystem = "metric" | "imperial";

export const KM_PER_MILE = 1.609344;
export const METERS_PER_FOOT = 0.3048;

export function isUnitSystem(value: unknown): value is UnitSystem {
  return value === "metric" || value === "imperial";
}

export function distanceUnit(system: UnitSystem): "km" | "mi" {
  return system === "imperial" ? "mi" : "km";
}

export function elevationUnit(system: UnitSystem): "m" | "ft" {
  return system === "imperial" ? "ft" : "m";
}

export function speedUnit(system: UnitSystem): "km/h" | "mph" {
  return system === "imperial" ? "mph" : "km/h";
}

export function paceUnit(system: UnitSystem): "/km" | "/mi" {
  return system === "imperial" ? "/mi" : "/km";
}

export function toDistance(km: number, system: UnitSystem): number {
  return system === "imperial" ? km / KM_PER_MILE : km;
}

export function toElevation(meters: number, system: UnitSystem): number {
  return system === "imperial" ? meters / METERS_PER_FOOT : meters;
}

export function toSpeed(kmh: number, system: UnitSystem): number {
  return system === "imperial" ? kmh / KM_PER_MILE : kmh;
}

// Pace scales the other way from distance: covering a mile takes longer than
// covering a kilometre, so seconds-per-unit goes up in imperial.
export function toPaceSeconds(secPerKm: number, system: UnitSystem): number {
  return system === "imperial" ? secPerKm * KM_PER_MILE : secPerKm;
}

/** Inverse of `toDistance` — takes a value the athlete typed, returns km. */
export function fromDistance(value: number, system: UnitSystem): number {
  return system === "imperial" ? value * KM_PER_MILE : value;
}

/** Inverse of `toElevation` — takes a value the athlete typed, returns metres. */
export function fromElevation(value: number, system: UnitSystem): number {
  return system === "imperial" ? value * METERS_PER_FOOT : value;
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

/** Distance without a unit suffix, e.g. `"12.42"`. */
export function fmtDistanceValue(km: number, system: UnitSystem, digits = 2): string {
  return toDistance(km, system).toFixed(digits);
}

/** Distance with its unit, e.g. `"12.42 mi"`. */
export function fmtDistance(km: number, system: UnitSystem, digits = 2): string {
  return `${fmtDistanceValue(km, system, digits)} ${distanceUnit(system)}`;
}

/** Elevation rounded to a whole unit, no suffix, e.g. `"1247"`. */
export function fmtElevationValue(meters: number, system: UnitSystem): string {
  return Math.round(toElevation(meters, system)).toString();
}

/** Elevation with its unit, e.g. `"1247 ft"`. */
export function fmtElevation(meters: number, system: UnitSystem): string {
  return `${fmtElevationValue(meters, system)} ${elevationUnit(system)}`;
}

/** Speed without a unit suffix, e.g. `"18.4"`. */
export function fmtSpeedValue(kmh: number, system: UnitSystem, digits = 1): string {
  return toSpeed(kmh, system).toFixed(digits);
}

/** Speed with its unit, e.g. `"18.4 mph"`. */
export function fmtSpeed(kmh: number, system: UnitSystem, digits = 1): string {
  return `${fmtSpeedValue(kmh, system, digits)} ${speedUnit(system)}`;
}

/** Pace as `m:ss`, no unit suffix. */
export function fmtPaceValue(secPerKm: number, system: UnitSystem): string {
  const total = Math.round(toPaceSeconds(secPerKm, system));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${pad(seconds)}`;
}

/** Pace as `m:ss/km` or `m:ss/mi`. */
export function fmtPace(secPerKm: number, system: UnitSystem): string {
  return `${fmtPaceValue(secPerKm, system)}${paceUnit(system)}`;
}

export interface Split {
  /** Lap number — kilometres in metric, miles in imperial. */
  km: number;
  /** Pace during the lap, always stored as seconds per kilometre. */
  paceSec: number;
  hr: number;
  elev: number;
}

/**
 * Activities record one split per kilometre, so imperial can't just relabel the
 * column — a mile lap straddles km boundaries. Treating pace as constant within
 * each recorded kilometre (which is all the resolution we have) lets us
 * re-integrate the laps over mile boundaries exactly. Metric passes through.
 *
 * A trailing partial lap is kept, with its pace normalised to a full mile so it
 * stays comparable to the laps above it.
 */
export function resplit(splits: Split[], system: UnitSystem): Split[] {
  if (system === "metric" || splits.length === 0) return splits;

  const totalKm = splits.length;
  const lapCount = Math.ceil(totalKm / KM_PER_MILE);
  const out: Split[] = [];

  for (let lap = 0; lap < lapCount; lap += 1) {
    const startKm = lap * KM_PER_MILE;
    const endKm = Math.min((lap + 1) * KM_PER_MILE, totalKm);
    const lapKm = endKm - startKm;
    if (lapKm <= 0) break;

    let seconds = 0;
    let elev = 0;
    let hrWeighted = 0;

    // Each source split covers [index, index + 1) kilometres.
    for (let index = Math.floor(startKm); index < Math.ceil(endKm); index += 1) {
      const overlap = Math.min(endKm, index + 1) - Math.max(startKm, index);
      if (overlap <= 0) continue;
      const split = splits[index];
      seconds += split.paceSec * overlap;
      elev += split.elev * overlap;
      hrWeighted += split.hr * overlap;
    }

    out.push({
      km: lap + 1,
      // Normalise back to seconds-per-km so downstream formatters, which always
      // take metric pace, convert it to min/mi correctly.
      paceSec: seconds / lapKm,
      hr: Math.round(hrWeighted / lapKm),
      elev: Math.round(elev),
    });
  }

  return out;
}
