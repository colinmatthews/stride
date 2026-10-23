import { useId, useState } from "react";
import { Bell, Check, Plus } from "lucide-react";
import type { Sport } from "@/lib/mock-data";
import {
  GOAL_HINT,
  MAX_MINUTES,
  PRESETS,
  SPORT_ICONS,
  customEffort,
  goalStatusLine,
  goalTitle,
  type Effort,
  type TreatmentTracker,
} from "@/lib/goal-tracker";

/* ===== Quick log (one tap per preset) ===== */

export function QuickLogPanel({
  onLog,
  disabled,
}: {
  onLog: (effort: Effort) => void;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const [sport, setSport] = useState<Sport>("Walk");
  const [minutes, setMinutes] = useState("10");
  const inputId = useId();
  const errorId = useId();
  const n = Number(minutes);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_MINUTES;

  return (
    <div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PRESETS.map((preset) => {
          const Icon = SPORT_ICONS[preset.sport];
          return (
            <li key={preset.id}>
              <button
                onClick={() => onLog(preset)}
                disabled={disabled}
                className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-foreground/40 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-5">{preset.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {preset.minutes} min · {preset.km} km
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!custom ? (
        <button
          onClick={() => setCustom(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Something else
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <div
            className="flex flex-wrap gap-1 rounded-md bg-surface-2 p-1"
            role="group"
            aria-label="Sport"
          >
            {(Object.keys(SPORT_ICONS) as Sport[]).map((option) => (
              <button
                key={option}
                onClick={() => setSport(option)}
                aria-pressed={sport === option}
                className={`min-h-9 rounded px-2.5 text-xs transition-colors ${
                  sport === option
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <label htmlFor={inputId} className="sr-only">
                Minutes
              </label>
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_MINUTES}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                aria-invalid={!valid}
                aria-describedby={valid ? undefined : errorId}
                className="h-9 w-20 rounded-md border border-border bg-transparent px-2 text-sm outline-none focus:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-sm text-muted-foreground">min</span>
              <button
                onClick={() => valid && onLog(customEffort(sport, n))}
                disabled={!valid || disabled}
                className="h-9 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Log it
              </button>
            </div>
            {!valid && (
              <p id={errorId} className="mt-1 text-xs text-destructive">
                Enter whole minutes from 1 to {MAX_MINUTES}.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Slots and day strip ===== */

function Slots({ tracker, done }: { tracker: TreatmentTracker; done: boolean }) {
  return (
    <ol
      className="grid grid-cols-5 gap-2"
      aria-label={`${Math.min(tracker.count, tracker.goal)} of ${tracker.goal} logged`}
    >
      {Array.from({ length: tracker.goal }, (_, index) => {
        const entry = tracker.logged[index];
        const Icon = entry ? SPORT_ICONS[entry.sport] : null;
        return (
          <li
            key={index}
            className={`flex h-14 flex-col justify-between rounded-md p-2 ${
              entry
                ? done
                  ? "bg-pr/20 text-foreground"
                  : "bg-secondary text-secondary-foreground"
                : "border border-dashed border-border"
            }`}
          >
            {entry && Icon ? (
              <>
                <Icon className="h-3.5 w-3.5" aria-hidden />
                <span className="truncate text-xs">
                  Day {entry.day}
                  <span className="sr-only">, {entry.title}</span>
                </span>
              </>
            ) : (
              <span className="sr-only">Not logged yet</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DayStrip({ tracker }: { tracker: TreatmentTracker }) {
  const logged = new Set(tracker.loggedDays);
  return (
    <ol
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${tracker.windowDays}, minmax(0, 1fr))` }}
      aria-label="Your first two weeks, day by day"
    >
      {Array.from({ length: tracker.windowDays }, (_, index) => {
        const day = index + 1;
        const isToday = day === tracker.day;
        const has = logged.has(day);
        const checkInHere = day === tracker.checkInDay && tracker.checkInSent;
        return (
          <li key={day} className="flex flex-col items-center gap-1">
            <span
              className={`h-1.5 w-full rounded-full ${
                has ? "bg-foreground" : day > tracker.day ? "bg-muted" : "bg-border"
              } ${isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-surface" : ""}`}
              aria-hidden
            />
            <span
              className={`flex items-center gap-0.5 text-[11px] tabular-nums ${
                isToday ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {checkInHere && <Bell className="h-2.5 w-2.5" aria-hidden />}
              {day}
            </span>
            <span className="sr-only">
              {has ? "logged" : day > tracker.day ? "upcoming" : "no activity"}
              {isToday ? ", today" : ""}
              {checkInHere ? ", check-in sent" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ===== Goal block at the top of the feed, day-4 check-in inline ===== */

export function GoalTracker({
  tracker,
  busy,
  onLog,
  onDismissCheckIn,
}: {
  tracker: TreatmentTracker;
  busy: boolean;
  onLog: (effort: Effort, source: "goal_block" | "checkin_inline") => Promise<boolean>;
  onDismissCheckIn: () => void;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const headingId = useId();
  const checkInId = useId();
  const done = tracker.count >= tracker.goal;
  const checkInOpen = tracker.checkIn === "open";

  return (
    <section className="rounded-xl border border-border bg-surface" aria-labelledby={headingId}>
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={headingId} className="font-display text-base font-semibold">
            {goalTitle(tracker.goal)}
          </h2>
          <span className="shrink-0 text-xs text-muted-foreground">
            Day {tracker.day} of {tracker.windowDays}
          </span>
        </div>
        {!checkInOpen && <p className="mt-1 text-sm text-muted-foreground">{GOAL_HINT}</p>}

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="flex items-baseline gap-1.5">
            <span className="stat-num text-4xl font-bold leading-none">
              {Math.min(tracker.count, tracker.goal)}
            </span>
            <span className="text-sm font-medium">of {tracker.goal} logged</span>
          </span>
          <span className="text-sm text-muted-foreground">{goalStatusLine(tracker)}</span>
        </div>

        {tracker.checkIn === "answered" && tracker.latestTitle && (
          <p className="mt-3 flex items-center gap-2 text-sm" role="status">
            <Check className="h-4 w-4 text-pr" aria-hidden />
            Back on the board with {tracker.latestTitle.toLowerCase()}. Keep them small.
          </p>
        )}

        <div className="mt-4 space-y-4">
          <Slots tracker={tracker} done={done} />
          <DayStrip tracker={tracker} />
        </div>

        {!done && !checkInOpen && (
          <div className="mt-5">
            {logOpen ? (
              <QuickLogPanel
                disabled={busy}
                onLog={async (effort) => {
                  if (await onLog(effort, "goal_block")) setLogOpen(false);
                }}
              />
            ) : (
              <button
                onClick={() => setLogOpen(true)}
                aria-expanded={logOpen}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95"
              >
                <Plus className="h-4 w-4" aria-hidden /> Log an activity
              </button>
            )}
          </div>
        )}
      </div>

      {checkInOpen && (
        <div
          className="rounded-b-xl border-t border-border bg-surface-2/60 p-5"
          role="region"
          aria-labelledby={checkInId}
        >
          <h2
            id={checkInId}
            className="font-display text-lg font-bold leading-tight tracking-[-0.015em]"
          >
            Any activity counts.
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            A 10-minute walk logs the same as a long run. Tap one and you're at {tracker.count + 1}{" "}
            of {tracker.goal}.
          </p>
          <div className="mt-4">
            <QuickLogPanel
              disabled={busy}
              onLog={(effort) => void onLog(effort, "checkin_inline")}
            />
          </div>
          <button
            onClick={onDismissCheckIn}
            className="mt-1 min-h-11 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Not today
          </button>
        </div>
      )}
    </section>
  );
}
