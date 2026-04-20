import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Heart, MessageCircle, Trophy, MapPin } from "lucide-react";
import type { Activity } from "@/lib/mock-data";
import { ACTIVITIES, fmtDuration, fmtPace, fmtTimeAgo, getAthlete } from "@/lib/mock-data";
import { RouteMap } from "./RouteMap";
import { SportBadge } from "./SportBadge";

interface Props {
  activity: Activity;
}
export function ActivityCard({ activity }: Props) {
  const ath = getAthlete(activity.athleteId);
  const [kudoed, setKudoed] = useState(activity.kudoed ?? false);
  const [count, setCount] = useState(activity.kudos);
  const toggle = () => {
    setKudoed((k) => !k);
    setCount((c) => c + (kudoed ? -1 : 1));
    // mutate underlying mock for consistency this session
    const a = ACTIVITIES.find((x) => x.id === activity.id);
    if (a) {
      a.kudoed = !kudoed;
      a.kudos = count + (kudoed ? -1 : 1);
    }
  };
  return (
    <article className="bg-surface rounded-xl border border-border overflow-hidden">
      <header className="px-5 pt-4 pb-3 flex items-start gap-3">
        <Link to="/athlete/$id" params={{ id: ath.id }} className="shrink-0">
          <img src={ath.avatar} alt={ath.name} className="h-10 w-10 rounded-full object-cover" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link to="/athlete/$id" params={{ id: ath.id }} className="font-medium text-sm hover:underline truncate">
              {ath.name}
            </Link>
            <SportBadge sport={activity.sport} />
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <span>{fmtTimeAgo(activity.date)}</span>
            <span>·</span>
            <MapPin className="h-3 w-3" />
            <span>{ath.city}</span>
          </div>
        </div>
      </header>

      <div className="px-5">
        <Link to="/activity/$id" params={{ id: activity.id }} className="block group">
          <h3 className="text-lg font-display font-semibold tracking-tight group-hover:text-primary transition-colors">
            {activity.title}
          </h3>
          {activity.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{activity.description}</p>
          )}
        </Link>
      </div>

      <div className="px-5 pt-4 pb-4 grid grid-cols-3 gap-4">
        <CardStat label="Distance" value={activity.distanceKm.toFixed(2)} unit="km" />
        {activity.sport === "Ride" ? (
          <CardStat label="Avg speed" value={activity.avgSpeedKmh?.toFixed(1) ?? "—"} unit="km/h" />
        ) : activity.sport === "Swim" ? (
          <CardStat label="Time" value={fmtDuration(activity.movingSeconds)} />
        ) : (
          <CardStat label="Pace" value={activity.avgPaceSecPerKm ? fmtPace(activity.avgPaceSecPerKm).replace("/km", "") : "—"} unit="/km" />
        )}
        <CardStat label="Elev" value={activity.elevationM} unit="m" />
      </div>

      <Link to="/activity/$id" params={{ id: activity.id }} className="block">
        <div className="relative">
          {activity.photo ? (
            <div className="grid grid-cols-2 gap-px bg-border">
              <img src={activity.photo} alt={activity.title} className="w-full h-44 object-cover" />
              <RouteMap seed={activity.routeSeed} width={400} height={200} className="w-full h-44" />
            </div>
          ) : (
            <RouteMap seed={activity.routeSeed} width={800} height={260} className="w-full h-52" />
          )}
        </div>
      </Link>

      <footer className="px-5 py-3 flex items-center gap-1 border-t border-border">
        <button
          onClick={toggle}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
            kudoed ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Give kudos"
        >
          <Heart className={`h-4 w-4 ${kudoed ? "fill-primary" : ""}`} />
          <span className="num">{count}</span>
        </button>
        <Link
          to="/activity/$id"
          params={{ id: activity.id }}
          hash="comments"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="num">{activity.comments.length}</span>
        </Link>
        {activity.achievements > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-pr">
            <Trophy className="h-4 w-4" />
            <span className="num">{activity.achievements}</span>
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{fmtDuration(activity.movingSeconds)}</span>
      </footer>
    </article>
  );
}

function CardStat({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="stat-num text-xl mt-0.5">
        {value}
        {unit && <span className="text-xs text-muted-foreground font-body font-normal ml-1">{unit}</span>}
      </div>
    </div>
  );
}
