import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  distanceUnit,
  elevationUnit,
  fmtDistance,
  fmtDistanceValue,
  fmtElevation,
  fmtElevationValue,
  fmtPace,
  fmtPaceValue,
  fmtSpeed,
  fmtSpeedValue,
  fromDistance,
  fromElevation,
  isUnitSystem,
  paceUnit,
  resplit,
  speedUnit,
  toDistance,
  toElevation,
  toSpeed,
  type Split,
  type UnitSystem,
} from "./units";

const STORAGE_KEY = "stride:units";

function readStoredSystem(): UnitSystem {
  if (typeof window === "undefined") return "metric";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isUnitSystem(stored) ? stored : "metric";
  } catch {
    // Private browsing / blocked storage — fall back to the default.
    return "metric";
  }
}

export interface Units {
  system: UnitSystem;
  setSystem: (system: UnitSystem) => void;
  toggle: () => void;

  distanceUnit: "km" | "mi";
  elevationUnit: "m" | "ft";
  speedUnit: "km/h" | "mph";
  paceUnit: "/km" | "/mi";

  /** `"6.21 mi"` */
  distance: (km: number, digits?: number) => string;
  /** `"6.21"` */
  distanceValue: (km: number, digits?: number) => string;
  /** `"1378 ft"` */
  elevation: (meters: number) => string;
  /** `"1378"` */
  elevationValue: (meters: number) => string;
  /** `"20.0 mph"` */
  speed: (kmh: number, digits?: number) => string;
  /** `"20.0"` */
  speedValue: (kmh: number, digits?: number) => string;
  /** `"8:03/mi"` */
  pace: (secPerKm: number) => string;
  /** `"8:03"` */
  paceValue: (secPerKm: number) => string;

  /** Raw converted numbers, for charts and arithmetic. */
  toDistance: (km: number) => number;
  toElevation: (meters: number) => number;
  toSpeed: (kmh: number) => number;

  /** Inverses, for turning athlete-entered values back into stored metric. */
  fromDistance: (value: number) => number;
  fromElevation: (value: number) => number;

  /** Re-segments per-km splits into per-mile laps when imperial. */
  resplit: (splits: Split[]) => Split[];
}

const UnitsContext = createContext<Units | null>(null);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>(readStoredSystem);

  const setSystem = useCallback((next: UnitSystem) => {
    setSystemState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference just won't survive a reload.
    }
  }, []);

  const value = useMemo<Units>(
    () => ({
      system,
      setSystem,
      toggle: () => setSystem(system === "metric" ? "imperial" : "metric"),

      distanceUnit: distanceUnit(system),
      elevationUnit: elevationUnit(system),
      speedUnit: speedUnit(system),
      paceUnit: paceUnit(system),

      distance: (km, digits) => fmtDistance(km, system, digits),
      distanceValue: (km, digits) => fmtDistanceValue(km, system, digits),
      elevation: (meters) => fmtElevation(meters, system),
      elevationValue: (meters) => fmtElevationValue(meters, system),
      speed: (kmh, digits) => fmtSpeed(kmh, system, digits),
      speedValue: (kmh, digits) => fmtSpeedValue(kmh, system, digits),
      pace: (secPerKm) => fmtPace(secPerKm, system),
      paceValue: (secPerKm) => fmtPaceValue(secPerKm, system),

      toDistance: (km) => toDistance(km, system),
      toElevation: (meters) => toElevation(meters, system),
      toSpeed: (kmh) => toSpeed(kmh, system),

      fromDistance: (value) => fromDistance(value, system),
      fromElevation: (value) => fromElevation(value, system),

      resplit: (splits) => resplit(splits, system),
    }),
    [system, setSystem],
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): Units {
  const context = useContext(UnitsContext);

  if (!context) {
    throw new Error("useUnits must be used within a UnitsProvider");
  }

  return context;
}
