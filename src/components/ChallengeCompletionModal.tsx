import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PartyPopper, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { clearChallengeCompletion, useChallengeCompletion } from "@/lib/challenge-celebration";
import { Confetti } from "./Confetti";

const FILL_DURATION_MS = 1400;
const CONFETTI_LIFETIME_MS = 4200;

export function ChallengeCompletionModal() {
  const completion = useChallengeCompletion();
  const [pct, setPct] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [bursts, setBursts] = useState<number[]>([]);

  function launchConfetti() {
    const id = Date.now() + Math.random();
    setBursts((prev) => [...prev, id]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b !== id));
    }, CONFETTI_LIFETIME_MS);
  }

  useEffect(() => {
    if (!completion) {
      setPct(0);
      setAnimating(false);
      setBursts([]);
      return;
    }
    // First paint: jump straight to the starting percentage with no
    // transition, so there's nothing to animate yet. Next frame: turn the
    // transition on and move to 100 — that's the only width change that
    // actually animates, so onTransitionEnd (and the fallback timer below)
    // fire exactly once.
    setAnimating(false);
    setPct(completion.fromPct);
    setBursts([]);
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimating(true);
        setPct(100);
      });
    });
    const fallback = window.setTimeout(launchConfetti, FILL_DURATION_MS + 250);
    return () => {
      cancelAnimationFrame(raf1);
      window.clearTimeout(fallback);
    };
  }, [completion]);

  if (!completion) return null;
  const { challenge } = completion;

  function handleOpenChange(open: boolean) {
    if (!open) clearChallengeCompletion();
  }

  return (
    <>
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md gap-0 overflow-hidden border-border bg-surface p-0 sm:rounded-none">
          <DialogTitle className="sr-only">{challenge.name} complete</DialogTitle>
          <div className="relative flex flex-col items-center bg-secondary px-8 pb-8 pt-10 text-center text-secondary-foreground">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-secondary-foreground/60">
              Challenge complete
            </div>
            <div className="mt-4 font-display text-[3.5rem] font-bold leading-none tracking-[-0.03em]">
              {challenge.badge}
            </div>
            <h2 className="mt-3 font-display text-xl font-semibold tracking-tight">
              {challenge.name}
            </h2>

            <div className="mt-6 w-full">
              <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-foreground/70">
                <span>Progress</span>
                <span className="stat-num text-sm text-primary">{Math.round(pct)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary-foreground/15">
                <div
                  className={`h-full rounded-full bg-primary ${
                    animating ? "transition-[width] duration-[1400ms] ease-out" : ""
                  }`}
                  style={{ width: `${pct}%` }}
                  onTransitionEnd={(event) => {
                    if (event.propertyName === "width" && pct >= 100) launchConfetti();
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 p-6">
            <Link
              to="/challenges"
              onClick={() => clearChallengeCompletion()}
              className="inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95"
            >
              <PartyPopper className="h-4 w-4" /> View challenge
            </Link>
            <button
              onClick={launchConfetti}
              className="inline-flex h-11 items-center gap-2 border border-border px-5 text-sm font-medium hover:bg-muted"
            >
              <Sparkles className="h-4 w-4" /> Celebrate some more!
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {bursts.map((id) => (
        <Confetti key={id} />
      ))}
    </>
  );
}
