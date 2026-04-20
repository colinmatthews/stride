import type { Sport } from "@/lib/mock-data";
import { Bike, Footprints, Waves, Mountain, PersonStanding } from "lucide-react";

const ICONS: Record<Sport, typeof Bike> = {
  Run: Footprints,
  Ride: Bike,
  Swim: Waves,
  Hike: Mountain,
  Walk: PersonStanding,
};
export function SportBadge({ sport, className = "" }: { sport: Sport; className?: string }) {
  const Icon = ICONS[sport];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md bg-secondary text-secondary-foreground ${className}`}>
      <Icon className="h-3 w-3" />
      {sport}
    </span>
  );
}
