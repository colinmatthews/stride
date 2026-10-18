import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "0.5" near the start, "12" further on: for "km …" labels. */
export function formatKm(km: number) {
  return km < 10 ? km.toFixed(1).replace(/\.0$/, "") : String(Math.round(km));
}
