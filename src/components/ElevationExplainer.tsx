import { AlertTriangle, ArrowDown, CheckCircle2, Crosshair, Waves } from "lucide-react";
import type { ElevationPreview } from "@/lib/api";
import { formatKm } from "@/lib/utils";

export function NoFixNotice({ preview }: { preview: ElevationPreview }) {
  if (preview.blockedReason) {
    const fromKm = preview.flatRegion ? formatKm(preview.flatRegion.fromKm) : null;
    return (
      <div className="bg-surface rounded-xl border border-border p-5 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div>
          <div className="text-sm font-semibold">Some climbing looks missing</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your altimeter seems to have stopped updating
            {fromKm !== null ? ` at km ${fromKm}` : ""}.{" "}
            {preview.blockedReason === "needs_gps"
              ? "This activity has no GPS track, so we can't look up the terrain to fill in the climbing."
              : "Terrain correction isn't available right now, so we can't fill in the climbing yet."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-surface rounded-xl border border-border p-5 flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-pr" />
      <div>
        <div className="text-sm font-semibold">Your elevation looks accurate</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {preview.method === "terrain"
            ? `Terrain data along your route matches your recording (${preview.elevationBeforeM} m vs. ${preview.elevationAfterM} m). Nothing to fix.`
            : `We found no spikes or sensor noise worth removing. Your ${preview.elevationBeforeM} m stays as it is.`}
        </p>
      </div>
    </div>
  );
}

// Sits between Original and Corrected: what went wrong, what changes, what doesn't.
export function CorrectionExplainer({
  preview,
  deviceName,
}: {
  preview: ElevationPreview;
  deviceName?: string;
}) {
  const recorder = deviceName ?? "Your device";
  const fromKm = preview.flatRegion ? formatKm(preview.flatRegion.fromKm) : null;
  const terrain = preview.method === "terrain";

  let wentWrong: React.ReactNode;
  if (preview.errorType === "flatline") {
    wentWrong = (
      <>
        {recorder}'s altimeter{" "}
        <b className="font-medium text-foreground">stopped updating at km {fromKm}</b> (shaded),
        often a sensor port blocked by sweat or rain. The climbing after that wasn't recorded.
      </>
    );
  } else if (preview.errorType === "spikes") {
    wentWrong = (
      <>
        {recorder} logged <b className="font-medium text-foreground">{preview.spikeCount} spikes</b>{" "}
        (red dots), adding climbing you didn't do.
      </>
    );
  } else {
    wentWrong = `${recorder} recorded ${preview.direction === "up" ? "less" : "more"} climbing than the ${terrain ? "terrain along your route shows" : "recording supports once sensor noise is removed"}.`;
  }

  const items = [
    {
      icon:
        preview.errorType === "flatline" ? (
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm border border-dashed border-destructive/60 bg-destructive/10" />
        ) : (
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-destructive" />
        ),
      title: "What went wrong",
      body: wentWrong,
    },
    {
      icon: terrain ? (
        <Crosshair className="h-3.5 w-3.5 shrink-0 text-primary" />
      ) : (
        <Waves className="h-3.5 w-3.5 shrink-0 text-primary" />
      ),
      title: "What we'll correct",
      body: terrain
        ? "We keep your exact GPS track and take the altitude at every point from terrain elevation data."
        : "We remove the spikes and smooth out sensor noise in your recorded elevation.",
    },
    {
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-pr" />,
      title: "What stays the same",
      body: `Route, distance, pace, splits and segment times. The activity shows a ${terrain ? "Terrain-corrected" : "Corrected"} tag.`,
    },
  ];
  return (
    <div className="mx-5 my-3 rounded-lg border border-border bg-surface-2">
      <div className="flex items-center gap-2 px-4 pt-3">
        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          What's changing
        </span>
      </div>
      <div className="grid gap-5 px-4 pt-2 pb-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="flex gap-2">
            {item.icon}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">{item.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
