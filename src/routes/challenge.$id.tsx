import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CHALLENGES, type ChallengeTracker, type ContributionStatus } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { ChallengeHeader } from "@/components/challenge/ChallengeHeader";
import { ProgressHero } from "@/components/challenge/ProgressHero";
import { ChallengeStatTiles } from "@/components/challenge/ChallengeStatTiles";
import { PendingConfirmationList } from "@/components/challenge/PendingConfirmationList";
import { CountedList } from "@/components/challenge/CountedList";
import { ChallengeLeaderboard } from "@/components/challenge/ChallengeLeaderboard";
import { PaceSummary } from "@/components/challenge/PaceSummary";
import { ApiError, fetchChallengeTracker, setChallengeActivityStatus } from "@/lib/api";
import { usePostHog } from "@posthog/react";

export const Route = createFileRoute("/challenge/$id")({
  loader: ({ params }) => {
    const challenge = CHALLENGES.find((entry) => entry.id === params.id);
    if (!challenge) throw notFound();
    return { challenge };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.challenge.name} — Stride Challenge` },
          {
            name: "description",
            content: `Track your progress toward ${loaderData.challenge.name} and confirm which activities count.`,
          },
        ]
      : [],
  }),
  component: ChallengeTrackerPage,
});

function ChallengeTrackerPage() {
  const { id } = Route.useParams();
  const posthog = usePostHog();

  const [tracker, setTracker] = useState<ChallengeTracker | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTracker(await fetchChallengeTracker(id));
      setError("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load this challenge");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!tracker) return;

    posthog.capture("challenge_tracker_viewed", {
      challenge_id: tracker.challenge.id,
      challenge_name: tracker.challenge.name,
      pending_count: tracker.progress.pendingActivityCount,
      counted_total: tracker.progress.countedTotal,
    });
    // Fires once per challenge, not on every progress change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker?.challenge.id]);

  const decide = useCallback(
    async (activityId: string, status: ContributionStatus | null) => {
      setBusyId(activityId);

      try {
        const next = await setChallengeActivityStatus(id, activityId, status);
        setTracker(next);
        setError("");
        posthog.capture(
          status === "counted"
            ? "challenge_activity_counted"
            : status === "dismissed"
              ? "challenge_activity_dismissed"
              : "challenge_activity_restored",
          {
            challenge_id: id,
            activity_id: activityId,
            counted_total: next.progress.countedTotal,
            pending_count: next.progress.pendingActivityCount,
          },
        );
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "Could not update that activity");
      } finally {
        setBusyId(null);
      }
    },
    [id, posthog],
  );

  if (error && !tracker) {
    return (
      <AppShell>
        <div className="border border-border bg-surface p-8 text-sm text-muted-foreground">
          {error}
        </div>
      </AppShell>
    );
  }

  if (!tracker) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="h-32 animate-pulse bg-muted" />
          <div className="h-48 animate-pulse bg-muted" />
        </div>
      </AppShell>
    );
  }

  const { challenge: meta, progress, pace, pending, counted, leaderboard } = tracker;

  return (
    <AppShell>
      <ChallengeHeader meta={meta} />

      {error && (
        <div className="mb-6 border border-primary/40 bg-primary/5 p-4 text-sm text-foreground">
          {error}
        </div>
      )}

      <ProgressHero meta={meta} progress={progress} />
      <ChallengeStatTiles meta={meta} progress={progress} pace={pace} />
      <PendingConfirmationList meta={meta} pending={pending} busyId={busyId} onDecide={decide} />
      <CountedList
        meta={meta}
        progress={progress}
        counted={counted}
        busyId={busyId}
        onDecide={decide}
      />
      <ChallengeLeaderboard meta={meta} leaderboard={leaderboard} />
      <PaceSummary meta={meta} progress={progress} pace={pace} />

      <div className="mt-8">
        <Link
          to="/challenges"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← All challenges
        </Link>
      </div>
    </AppShell>
  );
}
