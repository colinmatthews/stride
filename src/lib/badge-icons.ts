import {
  Award,
  Crown,
  Flame,
  Footprints,
  Gauge,
  Heart,
  Medal,
  Milestone,
  Mountain,
  Route,
  Star,
  Sunrise,
  Trophy,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the icon *key* the server stores on each badge (see SEEDED_BADGES in
 * server/seed.ts) to its Lucide component. Keeping this on the client lets the
 * API stay a plain JSON contract while badges still render real icons.
 */
export const BADGE_ICONS: Record<string, LucideIcon> = {
  Footprints,
  Trophy,
  Medal,
  Crown,
  Heart,
  Flame,
  Mountain,
  Sunrise,
  Star,
  Waves,
  Route,
  Milestone,
  Award,
  Gauge,
  Zap,
};

/** Resolves an icon key to a component, falling back to Award if unknown. */
export function iconFor(key: string): LucideIcon {
  return BADGE_ICONS[key] ?? Award;
}
