import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Heart, MessageCircle, Trophy, MapPin, Clock } from "lucide-react";
import type { Activity } from "@/lib/mock-data";
import { fmtDuration, fmtPace, fmtTimeAgo, getActivityPhoto, getAthlete } from "@/lib/mock-data";
import { toggleActivityKudo } from "@/lib/api";
import { RouteMap } from "./RouteMap";
import { SportBadge } from "./SportBadge";

interface Props {
  activity: Activity;
}
export function ActivityCard({ activity }: Props) {
  const ath = getAthlete(activity.athleteId);
  const [kudoed, setKudoed] = useState(activity.kudoed ?? false);
  const [count, setCount] = useState(activity.kudos);

  const toggle = async () => {
    const result = await toggleActivityKudo(activity.id);
    setKudoed(result.kudoed);
    setCount(result.kudos);
  };

  return (
    <article className="group/card overflow-hidden border border-border bg-surface transition-colors hover:border-foreground/30">
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <Link to="/athlete/$id" params={{ id: ath.id }} className="shrink-0">
          <img
            src={ath.avatar}
            alt={ath.name}
            className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to="/athlete/$id"
              params={{ id: ath.id }}
              className="truncate text-sm font-semibold hover:underline"
            >
              {ath.name}
            </Link>
            <SportBadge sport={activity.sport} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>{fmtTimeAgo(activity.date)}</span>
            <span className="text-border">·</span>
            <MapPin className="h-3 w-3" />
            <span className="truncate">{ath.city}</span>
          </div>
        </div>
      </header>

      <Link
        to="/activity/$id"
        params={{ id: activity.id }}
        className="block px-5 transition-colors"
      >
        <h3 className="font-display text-xl font-bold leading-tight tracking-[-0.015em] group-hover/card:text-primary transition-colors">
          {activity.title}
        </h3>
        {activity.description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {activity.description}
          </p>
        )}
      </Link>

      <div className="grid grid-cols-3 gap-0 border-y border-border/70 mx-5 mt-4">
        <CardStat label="Distance" value={activity.distanceKm.toFixed(2)} unit="km" />
        {activity.sport === "Ride" ? (
          <CardStat
            label="Avg speed"
            value={activity.avgSpeedKmh?.toFixed(1) ?? "—"}
            unit="km/h"
            border
          />
        ) : activity.sport === "Swim" ? (
          <CardStat label="Time" value={fmtDuration(activity.movingSeconds)} border />
        ) : (
          <CardStat
            label="Pace"
            value={
              activity.avgPaceSecPerKm ? fmtPace(activity.avgPaceSecPerKm).replace("/km", "") : "—"
            }
            unit="/km"
            border
          />
        )}
        <CardStat label="Elev" value={activity.elevationM} unit="m" border />
      </div>

      <Link to="/activity/$id" params={{ id: activity.id }} className="mt-5 block">
        <div className="relative overflow-hidden">
          {activity.photo ? (
            <div className="grid grid-cols-2 gap-px bg-border">
              <img
                src={getActivityPhoto(activity)}
                alt={activity.title}
                className="h-44 w-full object-cover transition-transform duration-500 group-hover/card:scale-[1.02]"
              />
              <RouteMap
                seed={activity.routeSeed}
                width={400}
                height={200}
                className="h-44 w-full"
                distanceKm={activity.distanceKm}
              />
            </div>
          ) : (
            <RouteMap
              seed={activity.routeSeed}
              width={800}
              height={260}
              className="h-52 w-full"
              distanceKm={activity.distanceKm}
            />
          )}
        </div>
      </Link>

      <footer className="flex items-center gap-1 border-t border-border px-3 py-2.5">
        <button
          onClick={toggle}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors ${
            kudoed ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Give kudos"
        >
          <Heart className={`h-4 w-4 ${kudoed ? "fill-primary" : ""}`} />
          <span className="num font-medium">{count}</span>
        </button>
        <Link
          to="/activity/$id"
          params={{ id: activity.id }}
          hash="comments"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="num font-medium">{activity.comments.length}</span>
        </Link>
        {activity.achievements > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-pr">
            <Trophy className="h-4 w-4" />
            <span className="num font-medium">{activity.achievements}</span>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="num">{fmtDuration(activity.movingSeconds)}</span>
        </span>
      </footer>
    </article>
  );
}

function CardStat({
  label,
  value,
  unit,
  border,
}: {
  label: string;
  value: string | number;
  unit?: string;
  border?: boolean;
}) {
  return (
    <div className={`py-3 ${border ? "border-l border-border/70 pl-4" : "pr-4"}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="stat-num mt-1 text-xl font-bold tracking-tight">
        {value}
        {unit && (
          <span className="ml-1 font-body text-xs font-normal text-muted-foreground">{unit}</span>
        )}
      </div>
    </div>
  );
}
