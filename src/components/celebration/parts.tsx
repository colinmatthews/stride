import { useEffect, useMemo, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { Check, Flame, Medal, Mountain, TrendingUp, Zap, Star } from "lucide-react";
import type { ChallengeProgress, Highlight, WeekBucket } from "@/lib/save-summary";
import { fmtMinutes } from "./format";

export function CountUp({
  to,
  decimals = 0,
  delay = 0,
  duration = 1.1,
  format,
}: {
  to: number;
  decimals?: number;
  delay?: number;
  duration?: number;
  format?: (value: number) => string;
}) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);

  useEffect(() => {
    if (reduce) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setValue,
    });
    return () => controls.stop();
  }, [to, delay, duration, reduce]);

  return <>{format ? format(value) : value.toFixed(decimals)}</>;
}

const CONFETTI_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--pr)",
  "var(--secondary-foreground)",
];

export function Confetti({ count = 32, className = "" }: { count?: number; className?: string }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + ((i * 37) % 10) / 10;
        const dist = 90 + ((i * 53) % 110);
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.7 - 30,
          rotate: ((i * 97) % 360) - 180,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          w: i % 3 === 0 ? 4 : 6,
          h: i % 3 === 0 ? 10 : 6,
          round: i % 4 === 0,
          delay: (i % 6) * 0.02,
        };
      }),
    [count],
  );
  if (reduce) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute left-1/2 top-1/2 ${p.round ? "rounded-full" : "rounded-[1px]"}`}
          style={{ width: p.w, height: p.h, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
          animate={{
            x: p.x,
            y: [0, p.y, p.y + 60],
            opacity: [0, 1, 0],
            scale: 1,
            rotate: p.rotate,
          }}
          transition={{
            duration: 1.6,
            delay: 0.15 + p.delay,
            ease: "easeOut",
            times: [0, 0.45, 1],
          }}
        />
      ))}
    </div>
  );
}

export function CheckBurst({ size = 64 }: { size?: number }) {
  const reduce = useReducedMotion();
  const icon = (
    <Check style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={3} aria-hidden />
  );

  if (reduce) {
    return (
      <div
        className="grid place-items-center rounded-full bg-primary text-primary-foreground"
        style={{ width: size, height: size }}
      >
        {icon}
      </div>
    );
  }

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <motion.span
        className="absolute inset-0 rounded-full bg-primary/30"
        initial={{ scale: 0.6, opacity: 0.8 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 0.9, delay: 0.25, ease: "easeOut" }}
      />
      <motion.span
        className="relative grid h-full w-full place-items-center rounded-full bg-primary text-primary-foreground"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.05 }}
      >
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 500, damping: 20 }}
        >
          {icon}
        </motion.span>
      </motion.span>
    </div>
  );
}

export function Kicker({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground ${className}`}
    >
      {children}
    </div>
  );
}

export function WeekBars({
  weeks,
  height = 112,
  delay = 0.2,
}: {
  weeks: WeekBucket[];
  height?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...weeks.map((w) => w.minutes));
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {weeks.map((w, i) => (
          <div key={w.label} className="flex h-full flex-1 flex-col justify-end">
            <motion.div
              className={`relative w-full rounded-t-sm ${w.isCurrent ? "bg-primary" : "bg-surface-2"}`}
              initial={reduce ? false : { height: 0 }}
              animate={{ height: `${Math.max(4, (w.minutes / max) * 100)}%` }}
              transition={{ duration: 0.7, delay: delay + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              {w.isCurrent && (
                <motion.div
                  className="stat-num absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-primary"
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: delay + 0.7 }}
                >
                  {fmtMinutes(w.minutes)}
                </motion.div>
              )}
            </motion.div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {weeks.map((w) => (
          <div
            key={w.label}
            className={`flex-1 text-center font-mono text-[9px] uppercase tracking-[0.14em] ${
              w.isCurrent ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {w.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChallengeBar({
  progress,
  delay = 0.3,
}: {
  progress: ChallengeProgress;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const { name, before, after, goal, unit } = progress;
  const beforePct = goal > 0 ? (before / goal) * 100 : 0;
  const afterPct = goal > 0 ? (after / goal) * 100 : 0;
  const fmt = (v: number) => (unit === "m" ? Math.round(v).toLocaleString() : v.toFixed(1));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="stat-num shrink-0 text-sm font-semibold">
          <CountUp to={afterPct} delay={delay + 0.4} format={(v) => `${Math.round(v)}%`} />
        </div>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="absolute inset-y-0 left-0 bg-secondary"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${beforePct}%` }}
          transition={{ duration: 0.6, delay, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-y-0 bg-primary"
          style={{ left: `${beforePct}%` }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${afterPct - beforePct}%` }}
          transition={{ duration: 0.6, delay: delay + 0.6, ease: "easeOut" }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>
          <span className="text-primary">+{fmt(after - before)}</span> {unit} today
        </span>
        <span>
          {fmt(after)} / {fmt(goal)} {unit}
        </span>
      </div>
    </div>
  );
}

const HIGHLIGHT_ICONS: Record<string, typeof Medal> = {
  first: Star,
  longest: Medal,
  fastest: Zap,
  climb: Mountain,
  busier: TrendingUp,
  streak: Flame,
};

export function HighlightChips({
  highlights,
  delay = 0.5,
}: {
  highlights: Highlight[];
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (!highlights.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {highlights.map((h, i) => {
        const Icon = HIGHLIGHT_ICONS[h.id] ?? Star;
        return (
          <motion.div
            key={h.id}
            title={h.detail}
            className="inline-flex items-center gap-1.5 rounded-md bg-pr/12 px-2.5 py-1.5 text-xs font-medium text-[oklch(0.45_0.14_145)]"
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: delay + i * 0.12, type: "spring", stiffness: 400, damping: 22 }}
          >
            <Icon className="h-3.5 w-3.5" />
            {h.label}
          </motion.div>
        );
      })}
    </div>
  );
}
