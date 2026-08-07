import { Clock, Gauge, Trophy } from "lucide-react";
import { Stat } from "@/components/Stat";
import { fmtDate } from "@/lib/mock-data";
import type { ChallengeMeta, ChallengePace, ChallengeProgress } from "./metric";

export function ChallengeStatTiles({
  meta,
  progress,
  pace,
}: {
  meta: ChallengeMeta;
  progress: ChallengeProgress;
  pace: ChallengePace;
}) {
  return (
    <div className="mt-6 grid grid-cols-3 gap-4">
      <div className="border border-border bg-surface p-5">
        <Stat
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Days left"
          value={meta.daysLeft}
          caption={meta.closed ? "challenge ended" : `ends ${fmtDate(meta.endsAt)}`}
        />
      </div>
      <div className="border border-border bg-surface p-5">
        <Stat
          icon={<Gauge className="h-3.5 w-3.5" />}
          label="Daily target"
          value={pace.dailyTarget}
          unit={meta.unit}
          caption={meta.closed ? "no time remaining" : "to finish on time"}
        />
      </div>
      <div className="border border-border bg-surface p-5">
        <Stat
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="To confirm"
          value={progress.pendingActivityCount}
          caption={`${progress.pendingTotal} ${meta.unit} waiting`}
          emphasis={progress.pendingActivityCount > 0}
        />
      </div>
    </div>
  );
}
