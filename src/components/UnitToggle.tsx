import { usePostHog } from "@posthog/react";
import { useUnits } from "@/lib/units-context";
import type { UnitSystem } from "@/lib/units";

const OPTIONS: { system: UnitSystem; label: string; title: string }[] = [
  { system: "metric", label: "KM", title: "Kilometres, metres, min/km" },
  { system: "imperial", label: "MI", title: "Miles, feet, min/mi" },
];

export function UnitToggle({ className = "" }: { className?: string }) {
  const { system, setSystem } = useUnits();
  const posthog = usePostHog();

  return (
    <div
      role="radiogroup"
      aria-label="Distance units"
      className={`inline-flex items-center rounded-md border border-border p-0.5 ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = system === option.system;
        return (
          <button
            key={option.system}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => {
              if (active) return;
              setSystem(option.system);
              posthog.capture("units_changed", { units: option.system });
            }}
            className={`h-8 px-2.5 rounded-[5px] font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
