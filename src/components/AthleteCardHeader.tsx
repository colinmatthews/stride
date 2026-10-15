import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Athlete, Sport } from "@/lib/mock-data";
import { SportBadge } from "./SportBadge";

// Avatar, name, sport badge and a meta line, shared by feed cards.
export function AthleteCardHeader({
  athlete,
  sport,
  meta,
  aside,
  linkToProfile = true,
}: {
  athlete: Athlete;
  sport: Sport;
  meta: ReactNode;
  aside?: ReactNode;
  linkToProfile?: boolean;
}) {
  const avatar = (
    <img
      src={athlete.avatar}
      alt={athlete.name}
      className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
    />
  );

  return (
    <header className="flex items-start gap-3 px-5 pb-4 pt-5">
      {linkToProfile ? (
        <Link to="/athlete/$id" params={{ id: athlete.id }} className="shrink-0">
          {avatar}
        </Link>
      ) : (
        <div className="shrink-0">{avatar}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {linkToProfile ? (
            <Link
              to="/athlete/$id"
              params={{ id: athlete.id }}
              className="truncate text-sm font-semibold hover:underline"
            >
              {athlete.name}
            </Link>
          ) : (
            <span className="truncate text-sm font-semibold">{athlete.name}</span>
          )}
          <SportBadge sport={sport} />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {meta}
        </div>
      </div>
      {aside}
    </header>
  );
}
