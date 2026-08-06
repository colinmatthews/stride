import { CircleCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { HabitWeek } from "@/lib/habits";

export function ConsistencyWeekGrid({
  weeks,
  highlightFirst = false,
}: {
  weeks: HabitWeek[];
  highlightFirst?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {weeks.map((week, index) => {
        const highlighted = week.isCurrent || (highlightFirst && index === 0);

        return (
          <div
            key={`${week.start}-${index}`}
            className={`border p-4 ${highlighted ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              {week.label}
            </div>
            <div className="stat-num mt-4 text-2xl font-bold">
              {week.count}
              <span className="text-sm text-muted-foreground">/{week.target}</span>
            </div>
            <Progress
              value={Math.min(100, (week.count / week.target) * 100)}
              className="mt-3 h-1.5 rounded-none"
            />
            <div className="mt-3 flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground">
              {week.status === "complete" && (
                <CircleCheck className="h-3.5 w-3.5 text-[var(--pr)]" />
              )}
              {week.status.replace("_", " ")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
