import type { ActivityKind } from "@/lib/mock-data";
import {
  Bike,
  Footprints,
  Waves,
  Mountain,
  PersonStanding,
  Dumbbell,
  Flower2,
  StretchHorizontal,
} from "lucide-react";

const ICONS: Record<ActivityKind, typeof Bike> = {
  Run: Footprints,
  Ride: Bike,
  Swim: Waves,
  Hike: Mountain,
  Walk: PersonStanding,
  Strength: Dumbbell,
  Yoga: Flower2,
  Stretching: StretchHorizontal,
};
export function SportBadge({ sport, className = "" }: { sport: ActivityKind; className?: string }) {
  const Icon = ICONS[sport];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md bg-secondary text-secondary-foreground ${className}`}
    >
      <Icon className="h-3 w-3" />
      {sport}
    </span>
  );
}
