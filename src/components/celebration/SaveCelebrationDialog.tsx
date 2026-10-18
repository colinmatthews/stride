import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Plus } from "lucide-react";
import { fmtDuration } from "@/lib/mock-data";
import type { SaveSummary } from "@/lib/save-summary";
import { SportBadge } from "@/components/SportBadge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChallengeBar,
  CheckBurst,
  Confetti,
  CountUp,
  HighlightChips,
  Kicker,
  WeekBars,
} from "./parts";
import {
  compareToAverage,
  deltaTone,
  fmtMinutes,
  fmtPaceValue,
  ordinal,
  paceValueOf,
  sportNoun,
} from "./format";

function riseWith(reduce: boolean | null) {
  return (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
        };
}

export function SaveCelebrationDialog({
  summary,
  open,
  onOpenChange,
  onViewActivity,
  onLogAnother,
}: {
  summary: SaveSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewActivity: () => void;
  onLogAnother: () => void;
}) {
  const rise = riseWith(useReducedMotion());
  if (!summary) return null;
  const { activity, weeks, thisWeek, lastWeek } = summary;
  const noun = sportNoun(activity.sport);
  const comparisons = compareToAverage(summary);
  const minuteDelta = thisWeek.minutes - lastWeek.minutes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl gap-0 overflow-y-auto border-border p-0 sm:rounded-lg [&>button:last-child]:text-secondary-foreground">
        <div className="relative overflow-hidden bg-secondary px-8 pb-8 pt-10 text-secondary-foreground">
          <Confetti />
          <div className="relative flex flex-col items-center text-center">
            <CheckBurst size={64} />
            <motion.div {...rise(0.35)}>
              <Kicker className="mt-6 text-secondary-foreground/60">
                Activity #{summary.ordinal} · {ordinal(summary.sportOrdinal)} {noun}
              </Kicker>
            </motion.div>
            <motion.div {...rise(0.45)}>
              <DialogTitle className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-0.02em]">
                Nice work{summary.athleteFirstName ? `, ${summary.athleteFirstName}` : ""}.
              </DialogTitle>
              <DialogDescription className="mt-2 flex items-center justify-center gap-2 text-sm text-secondary-foreground/70">
                <SportBadge sport={activity.sport} className="bg-secondary-foreground/10" />
                {activity.title}
              </DialogDescription>
            </motion.div>
          </div>

          <motion.div {...rise(0.6)} className="relative mt-8 grid grid-cols-3 gap-6 text-center">
            <HeroStat label="Distance">
              <CountUp to={activity.distanceKm} decimals={2} delay={0.7} />
              <span className="ml-1 text-sm font-normal text-secondary-foreground/60">km</span>
            </HeroStat>
            <HeroStat label="Time">
              <CountUp to={activity.movingSeconds} delay={0.7} format={(v) => fmtDuration(v)} />
            </HeroStat>
            <HeroStat label={activity.sport === "Ride" ? "Speed" : "Pace"}>
              {fmtPaceValue(activity.sport, paceValueOf(activity))}
            </HeroStat>
          </motion.div>
        </div>

        <div className="space-y-px bg-border">
          {summary.highlights.length > 0 && (
            <section className="bg-surface px-6 py-5">
              <Kicker>Today's highlights</Kicker>
              <div className="mt-3">
                <HighlightChips highlights={summary.highlights} delay={0.9} />
              </div>
            </section>
          )}

          <motion.section {...rise(0.8)} className="bg-surface px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Kicker>Your week</Kicker>
                <div className="stat-num mt-2 text-2xl font-bold">
                  <CountUp
                    to={thisWeek.minutes}
                    delay={0.9}
                    format={(v) => fmtMinutes(Math.round(v))}
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {thisWeek.count} {thisWeek.count === 1 ? "activity" : "activities"} ·{" "}
                  <span className={deltaTone(minuteDelta > 0 ? true : null)}>
                    {minuteDelta >= 0 ? "+" : "−"}
                    {fmtMinutes(Math.abs(minuteDelta))} vs last week
                  </span>
                </div>
              </div>
              <div className="w-56 shrink-0 pt-6">
                <WeekBars weeks={weeks} height={72} delay={0.9} />
              </div>
            </div>
          </motion.section>

          <motion.section {...rise(0.95)} className="bg-surface px-6 py-5">
            <Kicker>Vs your usual {noun}</Kicker>
            {comparisons.length ? (
              <div className="mt-3 divide-y divide-border">
                {comparisons.map((c) => (
                  <div key={c.label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <div className="w-20 text-sm text-muted-foreground">{c.label}</div>
                    <div className="stat-num flex-1 text-base font-semibold">{c.value}</div>
                    <div className={`text-right text-xs ${deltaTone(c.positive)}`}>{c.delta}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                This is your first {noun} — it sets the baseline for every one after.
              </p>
            )}
          </motion.section>

          {summary.challenges.length > 0 && (
            <motion.section {...rise(1.1)} className="space-y-4 bg-surface px-6 py-5">
              <Kicker>Challenge progress</Kicker>
              {summary.challenges.map((c, i) => (
                <ChallengeBar key={c.id} progress={c} delay={1.2 + i * 0.2} />
              ))}
            </motion.section>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-surface px-6 py-4">
          <Button
            variant="outline"
            onClick={onLogAnother}
            className="hover:bg-muted hover:text-foreground"
          >
            <Plus /> Log another
          </Button>
          <Button onClick={onViewActivity} className="group">
            View activity{" "}
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeroStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Kicker className="text-secondary-foreground/60">{label}</Kicker>
      <div className="stat-num mt-1 text-2xl font-bold text-primary">{children}</div>
    </div>
  );
}
