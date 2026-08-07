import { Calendar, Clock, Users } from "lucide-react";
import { fmtDate } from "@/lib/mock-data";
import type { ChallengeMeta } from "./metric";

export function ChallengeHeader({ meta }: { meta: ChallengeMeta }) {
  return (
    <div className="mb-8 border-b border-border pb-8">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        {meta.closed ? "Challenge closed" : "Live challenge"}
      </div>
      <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
        {meta.name}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {meta.closed ? "Ended" : `${meta.daysLeft} ${meta.daysLeft === 1 ? "day" : "days"} left`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {meta.participants.toLocaleString()} athletes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {fmtDate(meta.startsAt)} – {fmtDate(meta.endsAt)}
        </span>
      </div>
    </div>
  );
}
