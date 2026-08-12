import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STREET_ROUTES } from "./street-routes";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  MessageCircle,
  Mountain,
  PartyPopper,
  Plus,
  Send,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { fmtTimeAgo } from "@/lib/mock-data";
import {
  fetchCommunityChallenge,
  postCommunityContribution,
  toggleCommunityContributionReaction,
  updateCommunityNotification,
  type CommunityChallengeData,
  type CommunityParticipant,
} from "@/lib/api";
import { usePostHog } from "@posthog/react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSearch } from "@tanstack/react-router";

type Participant = {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  city: string;
  distance: string;
  note: string;
  time: string;
  lat: number;
  lng: number;
  route: [number, number][];
  tone: "orange" | "green" | "yellow" | "ink";
  kudos: number;
  replies: number;
  reacted: boolean;
  isMine: boolean;
};

function mapParticipant(participant: CommunityParticipant): Participant {
  return {
    ...participant,
    distance: `${participant.distanceKm.toFixed(1)} km`,
    time: fmtTimeAgo(participant.publishedAt),
    route: STREET_ROUTES[participant.routeKey as keyof typeof STREET_ROUTES] ?? STREET_ROUTES.me,
  };
}

const TONE: Record<Participant["tone"], string> = {
  orange: "bg-primary text-primary-foreground",
  green: "bg-pr text-white",
  yellow: "bg-accent text-accent-foreground",
  ink: "bg-secondary text-secondary-foreground",
};

const MAP_TONE_COLORS: Record<Participant["tone"], string> = {
  orange: "#f05a28",
  green: "#2fa84f",
  yellow: "#d29a00",
  ink: "#2d2823",
};

type PreviewState = "notification" | "returned" | "completion" | "badge-added";

function getPreviewState(requestedState: string | undefined): PreviewState {
  if (
    requestedState === "returned" ||
    requestedState === "completion" ||
    requestedState === "badge-added"
  ) {
    return requestedState;
  }
  return "notification";
}

export default function CommunityMomentumChallenge() {
  const posthog = usePostHog();
  const { state } = useSearch({ from: "/challenges/$id" });
  const previewState = getPreviewState(state);
  const startsReturned = previewState === "returned";
  const hydratedRef = useRef(false);
  const [data, setData] = useState<CommunityChallengeData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [completionOpen, setCompletionOpen] = useState(previewState === "completion");
  const [returnAlertOpen, setReturnAlertOpen] = useState(false);
  const [returnedFromAlert, setReturnedFromAlert] = useState(startsReturned);
  const [contributionQueued, setContributionQueued] = useState(false);
  const [badgeAdded, setBadgeAdded] = useState(false);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [badgeAnimating, setBadgeAnimating] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [postText, setPostText] = useState(
    "Morning miles, powered by this crew. Let’s keep moving!",
  );
  const [saving, setSaving] = useState(false);
  const [mapScope, setMapScope] = useState<"all" | "following">("all");

  useEffect(() => {
    let active = true;
    setLoadError("");
    void fetchCommunityChallenge("community-boulder", mapScope)
      .then((result) => {
        if (!active) return;
        setData(result);
        const mine = result.myContribution;
        setBadgeAdded(Boolean(mine));
        setBadgeVisible(Boolean(mine));
        if (!hydratedRef.current) {
          hydratedRef.current = true;
          if (mine) {
            setPostText(mine.note);
            setContributionQueued(true);
          }
          const initialId =
            (previewState === "badge-added" && mine?.id) ||
            result.notification?.anchorContributionId ||
            result.participants[0]?.id ||
            "";
          setSelectedId(initialId);
          setReturnAlertOpen(
            previewState === "notification" && Boolean(result.notification?.pending) && !mine,
          );
        } else {
          setSelectedId((current) =>
            result.participants.some((participant) => participant.id === current)
              ? current
              : (result.participants[0]?.id ?? ""),
          );
        }
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : "Unable to load challenge");
      });
    return () => {
      active = false;
    };
  }, [mapScope, previewState]);

  const mapParticipants = useMemo(
    () =>
      (data?.participants ?? [])
        .filter((participant) => badgeVisible || !participant.isMine)
        .map(mapParticipant),
    [badgeVisible, data?.participants],
  );

  const selected = useMemo(
    () =>
      mapParticipants.find((participant) => participant.id === selectedId) ?? mapParticipants[0],
    [mapParticipants, selectedId],
  );

  const revealBadgeOnMap = () => {
    setBadgeAdded(true);
    setBadgeVisible(false);
    setBadgeAnimating(true);
    setReturnedFromAlert(false);
    window.setTimeout(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("community-map")?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    }, 220);
    window.setTimeout(() => setBadgeVisible(true), 760);
    window.setTimeout(() => setBadgeAnimating(false), 4_500);
  };

  const persistContribution = async () => {
    if (!postText.trim() || !data || (!data.eligibleActivity && !data.myContribution) || saving)
      return;
    setSaving(true);
    setActionError("");
    try {
      const result = await postCommunityContribution(data.challenge.id, {
        activityId: data.eligibleActivity?.activityId,
        note: postText.trim(),
      });
      setData(result);
      setComposerOpen(false);
      setCompletionOpen(false);
      setSelectedId(result.myContribution?.id ?? result.participants[0]?.id ?? "");
      setContributionQueued(true);
      revealBadgeOnMap();
      posthog.capture("community_momentum_badge_posted", {
        challenge_id: data.challenge.id,
        local_area: data.challenge.localArea,
        approximate_location: true,
        has_note: true,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to post your badge");
    } finally {
      setSaving(false);
    }
  };

  const toggleReaction = async (participantId: string) => {
    const participant = data?.participants.find((entry) => entry.id === participantId);
    if (!participant) return;
    setActionError("");
    let result: Awaited<ReturnType<typeof toggleCommunityContributionReaction>>;
    try {
      result = await toggleCommunityContributionReaction(participantId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update kudos");
      return;
    }
    setData((current) =>
      current
        ? {
            ...current,
            participants: current.participants.map((entry) =>
              entry.id === participantId ? { ...entry, ...result } : entry,
            ),
            myContribution:
              current.myContribution?.id === participantId
                ? { ...current.myContribution, ...result }
                : current.myContribution,
          }
        : current,
    );
    posthog.capture("community_momentum_reaction_toggled", {
      challenge_id: data?.challenge.id,
      participant_id: participantId,
      action: result.reacted ? "sent" : "removed",
      entry_context: returnedFromAlert ? "local_momentum_notification" : "community_map",
    });
  };

  const viewParticipant = (participantId: string, entryContext = "community_map") => {
    setSelectedId(participantId);
    posthog.capture("community_momentum_badge_viewed", {
      challenge_id: data?.challenge.id,
      participant_id: participantId,
      entry_context: entryContext,
    });
  };

  const openLocalMomentum = () => {
    const notification = data?.notification;
    if (!notification) return;
    setReturnAlertOpen(false);
    setReturnedFromAlert(true);
    setContributionQueued(false);
    viewParticipant(notification.anchorContributionId, "local_momentum_notification");
    void updateCommunityNotification(notification.id, "open");
    posthog.capture("community_momentum_notification_opened", {
      challenge_id: data.challenge.id,
      local_area: data.challenge.localArea,
      notification_policy: "meaningful_cluster",
      bundled_contributions: notification.bundledContributions,
      bundled_distance_km: notification.bundledDistanceKm,
    });
    window.setTimeout(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("community-map")?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    }, 120);
  };

  const openCompletion = () => {
    setReturnAlertOpen(false);
    setCompletionOpen(true);
    posthog.capture("community_momentum_completion_viewed", {
      challenge_id: data?.challenge.id,
      activity_type: "run",
      eligible_distance_km: data?.eligibleActivity?.distanceKm,
    });
  };

  const replayNotification = () => {
    setReturnedFromAlert(false);
    setContributionQueued(false);
    setReturnAlertOpen(true);
  };

  const dismissNotification = () => {
    setReturnAlertOpen(false);
    if (data?.notification) void updateCommunityNotification(data.notification.id, "dismiss");
  };

  if (loadError) {
    return (
      <AppShell>
        <div className="border border-destructive/30 bg-destructive/5 p-8 text-center">
          <h1 className="font-display text-2xl font-semibold">Challenge unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        </div>
      </AppShell>
    );
  }

  if (!data || !selected) {
    return (
      <AppShell>
        <div
          className="h-[640px] animate-pulse border border-border bg-muted/50"
          aria-label="Loading challenge"
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ReturnAlert
        open={returnAlertOpen}
        participant={mapParticipant(
          data.participants.find(
            (participant) => participant.id === data.notification?.anchorContributionId,
          ) ?? data.participants[0],
        )}
        notification={data.notification}
        remainingKm={data.summary.remainingKm}
        localArea={data.challenge.localArea}
        onOpen={openLocalMomentum}
        onDismiss={dismissNotification}
      />

      <div className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Community challenge ·{" "}
            {new Date(`${data.challenge.startsAt}T12:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
            –
            {new Date(`${data.challenge.endsAt}T12:00:00`).toLocaleDateString(undefined, {
              day: "numeric",
            })}
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
            {data.challenge.localArea} moves together.
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-10 gap-2 rounded-sm border border-black bg-black font-mono text-xs uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#ff4f1f] transition-all hover:-translate-y-0.5 hover:bg-[#241f1b] hover:shadow-[4px_4px_0_#ff4f1f]"
            onClick={badgeAdded ? () => setComposerOpen(true) : openCompletion}
          >
            <Plus className="h-4 w-4" />
            {badgeAdded ? "Post to the map" : "Add your miles"}
          </Button>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-6 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      )}

      {contributionQueued && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center gap-4 border border-pr/30 bg-pr/[0.08] px-5 py-4"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center bg-pr text-white">
            <Check className="h-4 w-4" />
          </div>
          <div className="min-w-[240px] flex-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-pr">
              Your contribution is building local momentum
            </div>
            <p className="mt-1 text-sm text-foreground/80">
              Your badge is live for challenge participants and can join the next{" "}
              {data.challenge.localArea} update when enough local activity builds.
            </p>
          </div>
          <button
            onClick={replayNotification}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
          >
            Replay the return loop
          </button>
        </div>
      )}

      <section className="mb-6 grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-[1.35fr_1fr_1fr]">
        <div className="bg-secondary px-6 py-5 text-secondary-foreground">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/55">
                Community distance
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="stat-num text-3xl font-bold">
                  {Math.round(data.summary.distanceKm).toLocaleString()}
                </span>
                <span className="text-sm text-secondary-foreground/55">
                  / {data.challenge.goalKm.toLocaleString()} km
                </span>
              </div>
            </div>
            <div className="grid h-11 w-11 place-items-center bg-primary text-primary-foreground">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <Progress
            value={(data.summary.distanceKm / data.challenge.goalKm) * 100}
            className="mt-4 h-1.5 bg-secondary-foreground/15 [&>div]:bg-primary"
          />
        </div>
        <Metric
          icon={Users}
          label="People moving"
          value={data.summary.peopleMoving.toLocaleString()}
          detail={`+${data.summary.addedToday} today`}
        />
        <Metric
          icon={Mountain}
          label="Badges planted"
          value={data.summary.badgesPlanted.toLocaleString()}
          detail={`${data.summary.cities} cities`}
        />
      </section>

      <div className="grid min-h-[660px] overflow-hidden border border-border bg-surface xl:grid-cols-[minmax(0,1fr)_370px]">
        <section
          id="community-map"
          className="relative isolate min-h-[620px] overflow-hidden bg-[#e8e7e0]"
        >
          <CommunityLeafletMap
            participants={mapParticipants}
            selectedId={selected.id}
            onSelect={viewParticipant}
            newlyAddedId={badgeAnimating ? data.myContribution?.id : undefined}
          />

          <div className="absolute left-5 top-5 z-[500] flex items-center gap-1 border border-border bg-surface/95 p-1 shadow-md backdrop-blur">
            <button
              onClick={() => setMapScope("all")}
              aria-pressed={mapScope === "all"}
              className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                mapScope === "all"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All activity
            </button>
            <button
              onClick={() => {
                setMapScope("following");
              }}
              aria-pressed={mapScope === "following"}
              className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                mapScope === "following"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Following
            </button>
          </div>

          <div className="absolute right-5 top-5 z-[500] border border-border bg-surface/95 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground shadow-md backdrop-blur">
            Live · {data.summary.liveMovingCount} moving now
          </div>

          <div className="absolute bottom-5 left-5 z-[500] max-w-[270px] border border-border bg-surface/95 p-4 shadow-md backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center bg-primary/10 text-primary">
                <Trophy className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {Math.round(data.summary.remainingKm)} km to the finish
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  At today’s pace, {data.challenge.localArea} completes the challenge by Friday
                  afternoon.
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-t border-border bg-surface xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                From the map
              </div>
              <h2 className="mt-1 font-display text-xl font-semibold">Community pulse</h2>
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-md border border-border hover:bg-muted">
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-border bg-muted/35 p-5">
            <div
              key={selected.id}
              className="animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              <PostCard
                participant={selected}
                reacted={selected.reacted}
                onReact={() => toggleReaction(selected.id)}
                featured
              />
            </div>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {mapParticipants
              .filter((participant) => participant.id !== selected.id)
              .slice(0, 3)
              .map((participant) => (
                <button
                  key={participant.id}
                  onClick={() => viewParticipant(participant.id)}
                  className="block w-full border-b border-border p-5 text-left transition-colors hover:bg-muted/45"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={participant.avatar}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{participant.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {participant.distance} · {participant.time}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-5 text-foreground/75">
                    {participant.note}
                  </p>
                </button>
              ))}
          </div>

          <button
            onClick={badgeAdded ? () => setComposerOpen(true) : openCompletion}
            className="m-4 flex items-center justify-between border border-dashed border-border px-4 py-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <span>
              <span className="block text-sm font-semibold">
                {badgeAdded
                  ? "Add to the momentum"
                  : `Your turn to move ${data.challenge.localArea}`}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {badgeAdded
                  ? "Share a note with your badge"
                  : "Preview your eligible activity confirmation"}
              </span>
            </span>
            <Plus className="h-4 w-4 text-primary" />
          </button>
        </aside>
      </div>

      <CompletionDialog
        open={completionOpen}
        onOpenChange={setCompletionOpen}
        postText={postText}
        onPostTextChange={setPostText}
        onPostBadge={() => void persistContribution()}
        eligibleActivity={data.eligibleActivity}
        progress={(data.summary.distanceKm / data.challenge.goalKm) * 100}
        challengeName={data.challenge.name}
        saving={saving}
      />

      <ComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        postText={postText}
        onPostTextChange={setPostText}
        onShare={() => void persistContribution()}
        participant={data.myContribution ? mapParticipant(data.myContribution) : selected}
        challengeName={data.challenge.name}
        localArea={data.challenge.localArea}
        saving={saving}
      />

      <style>{`
        @keyframes stride-map-marker-arrive {
          0% {
            opacity: 0;
            transform: translateY(-44px) scale(0.72);
          }
          62% {
            opacity: 1;
            transform: translateY(5px) scale(1.05);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .community-leaflet {
          z-index: 0;
          background: #e8e7e0;
          font-family: var(--font-body);
        }

        .community-leaflet .leaflet-tile-pane {
          filter: saturate(0.58) sepia(0.08) brightness(1.04) contrast(0.9);
        }

        .community-leaflet .leaflet-control-zoom,
        .community-leaflet .leaflet-control-scale-line {
          border: 1px solid rgba(51, 45, 39, 0.18);
          border-radius: 0;
          box-shadow: 0 4px 14px rgba(51, 45, 39, 0.12);
        }

        .community-leaflet .leaflet-control-zoom a {
          color: #332d27;
          background: rgba(255, 255, 255, 0.94);
          border-bottom-color: rgba(51, 45, 39, 0.12);
        }

        .community-leaflet .leaflet-control-zoom a:hover {
          background: #fff;
          color: #f05a28;
        }

        .community-leaflet .leaflet-control-scale-line {
          background: rgba(255, 255, 255, 0.9);
          color: #625d56;
          font-family: var(--font-mono);
          font-size: 8px;
          letter-spacing: 0.08em;
        }

        .community-leaflet .leaflet-control-attribution {
          background: rgba(255, 255, 255, 0.78);
          color: #777169;
          font-size: 9px;
        }

        .community-leaflet .stride-route-trace {
          transition: stroke-width 160ms ease, stroke-opacity 160ms ease;
        }

        .community-leaflet .stride-route-trace:hover {
          stroke-width: 6;
          stroke-opacity: 1;
        }

        .stride-leaflet-div-icon {
          border: 0;
          background: transparent;
        }

        .stride-leaflet-marker {
          --marker-color: #332d27;
          position: relative;
          width: 50px;
          height: 50px;
          border: 4px solid #fff;
          border-radius: 999px;
          background: var(--marker-color);
          box-shadow: 0 5px 15px rgba(37, 31, 26, 0.25);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .stride-leaflet-marker:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 22px rgba(37, 31, 26, 0.3);
        }

        .stride-leaflet-marker img {
          width: 100%;
          height: 100%;
          border-radius: 999px;
          object-fit: cover;
        }

        .stride-leaflet-marker--orange { --marker-color: #f05a28; }
        .stride-leaflet-marker--green { --marker-color: #42b95f; }
        .stride-leaflet-marker--yellow { --marker-color: #dcae20; }
        .stride-leaflet-marker--ink { --marker-color: #2d2823; }

        .stride-leaflet-marker-tip {
          position: absolute;
          left: 50%;
          bottom: -7px;
          width: 14px;
          height: 14px;
          transform: translateX(-50%) rotate(45deg);
          border-right: 4px solid #fff;
          border-bottom: 4px solid #fff;
          background: var(--marker-color);
          z-index: -1;
        }

        .stride-leaflet-marker.is-selected {
          transform: translateY(-4px);
          box-shadow: 0 0 0 3px #fff, 0 0 0 5px #332d27, 0 9px 24px rgba(37, 31, 26, 0.34);
        }

        .stride-leaflet-marker.is-new {
          animation: stride-map-marker-arrive 850ms cubic-bezier(0.22, 0.9, 0.36, 1.12) both;
        }

        .community-leaflet .leaflet-popup-content-wrapper {
          border: 1px solid rgba(51, 45, 39, 0.14);
          border-radius: 0;
          box-shadow: 0 14px 34px rgba(37, 31, 26, 0.2);
        }

        .community-leaflet .leaflet-popup-content {
          margin: 0;
        }

        .stride-map-popup {
          padding: 16px;
          color: #332d27;
        }

        .stride-map-popup-kicker {
          color: #7a746d;
          font-family: var(--font-mono);
          font-size: 8px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        .stride-map-popup-name {
          margin-top: 5px;
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
        }

        .stride-map-popup-distance {
          margin-top: 12px;
          padding-block: 10px;
          border-block: 1px solid #e7e3dc;
          font-family: var(--font-display);
          font-size: 22px;
          font-weight: 700;
        }

        .stride-map-popup-distance span {
          margin-left: 6px;
          color: #7a746d;
          font-family: var(--font-mono);
          font-size: 7px;
          font-weight: 400;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .stride-map-popup p {
          margin: 11px 0 0;
          color: #625d56;
          font-size: 12px;
          line-height: 1.55;
        }

        .community-leaflet .stride-new-badge-tooltip {
          border: 1px solid rgba(240, 90, 40, 0.28);
          border-radius: 0;
          background: #fff;
          color: #e64d1b;
          font-family: var(--font-mono);
          font-size: 8px;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          box-shadow: 0 6px 16px rgba(37, 31, 26, 0.14);
        }

        .community-leaflet .stride-new-badge-tooltip::before {
          border-bottom-color: #fff;
        }

        @media (prefers-reduced-motion: reduce) {
          .stride-leaflet-marker.is-new {
            animation-duration: 1ms;
          }
        }
      `}</style>
    </AppShell>
  );
}

function ReturnAlert({
  open,
  participant,
  notification,
  remainingKm,
  localArea,
  onOpen,
  onDismiss,
}: {
  open: boolean;
  participant: Participant;
  notification: CommunityChallengeData["notification"];
  remainingKm: number;
  localArea: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label="Stride local challenge notification"
      className="fixed right-5 top-5 z-50 w-[min(390px,calc(100vw-2.5rem))] animate-in fade-in slide-in-from-top-3 duration-300"
    >
      <div className="overflow-hidden rounded-xl border border-black/10 bg-[#faf9f5]/95 shadow-[0_24px_70px_rgba(37,30,24,0.24)] backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-black/10 px-4 py-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-secondary-foreground shadow-sm">
            <Bell className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            Local challenge update
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            now
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss local challenge notification"
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <button onClick={onOpen} className="block w-full p-4 text-left hover:bg-white/60">
          <div className="flex gap-3.5">
            <div className="relative shrink-0">
              <img
                src={participant.avatar}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
              <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-[#faf9f5] bg-pr text-white">
                <Trophy className="h-3 w-3" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-display text-[17px] font-semibold leading-5">
                {localArea} just moved {notification?.bundledDistanceKm.toFixed(1)} km
              </div>
              <p className="mt-1.5 text-sm leading-5 text-foreground/75">
                {participant.name.split(" ")[0]} and{" "}
                {Math.max((notification?.bundledContributions ?? 1) - 1, 0)} other {localArea}{" "}
                athletes added new badges. The community is only {Math.round(remainingKm)} km from
                its goal.
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                See what moved around {localArea}
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-4 bg-surface px-6 py-5">
      <div className="grid h-10 w-10 place-items-center bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="stat-num text-2xl font-bold">{value}</span>
          <span className="text-xs text-pr">{detail}</span>
        </div>
      </div>
    </div>
  );
}

function escapeMapText(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function CommunityLeafletMap({
  participants,
  selectedId,
  onSelect,
  newlyAddedId,
}: {
  participants: Participant[];
  selectedId: string;
  onSelect: (participantId: string) => void;
  newlyAddedId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);

  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      minZoom: 10,
      maxZoom: 18,
      scrollWheelZoom: true,
    }).setView([40.015, -105.245], 12);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.circle([40.015, -105.245], {
      radius: 7800,
      color: "#f05a28",
      weight: 1.5,
      opacity: 0.55,
      fillColor: "#f05a28",
      fillOpacity: 0.035,
      dashArray: "5 7",
      interactive: false,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", metric: true, imperial: false }).addTo(map);

    const markerLayer = L.layerGroup().addTo(map);
    markerLayerRef.current = markerLayer;
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(containerRef.current);
    window.setTimeout(() => map.invalidateSize({ pan: false }), 0);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();
    let selectedMarker: L.Marker | undefined;

    participants.forEach((participant) => {
      const selected = participant.id === selectedId;

      L.polyline(participant.route, {
        color: "#fffdf8",
        weight: selected ? 9 : 7,
        opacity: selected ? 0.9 : 0.68,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(markerLayer);

      const routeTrace = L.polyline(participant.route, {
        color: MAP_TONE_COLORS[participant.tone],
        weight: selected ? 5 : 3,
        opacity: selected ? 0.96 : 0.58,
        lineCap: "round",
        lineJoin: "round",
        smoothFactor: 1,
        className: "stride-route-trace",
      })
        .addTo(markerLayer)
        .bindTooltip(`${participant.name} · ${participant.distance}`, {
          direction: "top",
          sticky: true,
        });

      routeTrace.on("click", () => onSelectRef.current(participant.id));
      if (selected) routeTrace.bringToFront();
    });

    participants.forEach((participant) => {
      const selected = participant.id === selectedId;
      const isNew = participant.id === newlyAddedId;
      const markerIcon = L.divIcon({
        className: "stride-leaflet-div-icon",
        html: `<div class="stride-leaflet-marker stride-leaflet-marker--${participant.tone}${
          selected ? " is-selected" : ""
        }${isNew ? " is-new" : ""}"><img src="${escapeMapText(participant.avatar)}" alt="" /><span class="stride-leaflet-marker-tip"></span></div>`,
        iconSize: [50, 58],
        iconAnchor: [25, 54],
        popupAnchor: [0, -52],
      });

      const marker = L.marker([participant.lat, participant.lng], {
        icon: markerIcon,
        keyboard: true,
        riseOnHover: true,
        title: `${participant.name} · ${participant.distance}`,
      })
        .addTo(markerLayer)
        .bindPopup(
          `<article class="stride-map-popup"><div class="stride-map-popup-kicker">${escapeMapText(
            participant.city,
          )} · ${escapeMapText(participant.time)}</div><div class="stride-map-popup-name">${escapeMapText(
            participant.name,
          )}</div><div class="stride-map-popup-distance">${escapeMapText(
            participant.distance,
          )}<span> moved for Boulder</span></div><p>${escapeMapText(participant.note)}</p></article>`,
          { closeButton: false, maxWidth: 280, minWidth: 235, offset: [0, -2] },
        );

      marker.on("popupopen", () => {
        if (participant.id !== selectedId) onSelectRef.current(participant.id);
      });
      if (isNew) {
        marker.bindTooltip("Badge added · +5.2 km", {
          className: "stride-new-badge-tooltip",
          direction: "bottom",
          offset: [0, 12],
          permanent: true,
        });
      }
      if (selected) selectedMarker = marker;
    });

    if (selectedMarker) {
      const target = selectedMarker.getLatLng();
      map.flyTo(target, Math.max(map.getZoom(), 13), { duration: 0.6 });
      selectedMarker.openPopup();
    } else if (participants.length > 0) {
      map.fitBounds(
        L.latLngBounds(participants.map((participant) => [participant.lat, participant.lng])),
        { padding: [60, 60], maxZoom: 13 },
      );
    }
  }, [newlyAddedId, participants, selectedId]);

  return (
    <div
      ref={containerRef}
      className="community-leaflet absolute inset-0 h-full w-full"
      role="region"
      aria-label="Interactive Boulder challenge activity map with generalized route traces. Drag to pan and use the controls to zoom."
    />
  );
}

function PostCard({
  participant,
  reacted,
  onReact,
  featured = false,
}: {
  participant: Participant;
  reacted: boolean;
  onReact: () => void;
  featured?: boolean;
}) {
  return (
    <article className={featured ? "border border-border bg-surface p-4" : ""}>
      <div className="flex items-start gap-3">
        <img
          src={participant.avatar}
          alt={participant.name}
          className="h-10 w-10 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{participant.name}</div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {participant.city} · {participant.time}
              </div>
            </div>
            <div className={`grid h-8 w-8 place-items-center ${TONE[participant.tone]}`}>
              <Trophy className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2 border-y border-border py-3">
            <span className="stat-num text-2xl font-bold">{participant.distance}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              moved for Boulder
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-foreground/80">{participant.note}</p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={onReact}
              aria-label={`${reacted ? "Remove kudos from" : "Send kudos to"} ${participant.name}`}
              aria-pressed={reacted}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                reacted
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${reacted ? "fill-current" : ""}`} />
              {participant.kudos + (reacted ? 1 : 0)}
            </button>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-muted">
              <MessageCircle className="h-3.5 w-3.5" />
              {participant.replies}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function CompletionDialog({
  open,
  onOpenChange,
  postText,
  onPostTextChange,
  onPostBadge,
  eligibleActivity,
  progress,
  challengeName,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postText: string;
  onPostTextChange: (text: string) => void;
  onPostBadge: () => void;
  eligibleActivity: CommunityChallengeData["eligibleActivity"];
  progress: number;
  challengeName: string;
  saving: boolean;
}) {
  if (!eligibleActivity) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="overflow-hidden border-border p-0 sm:max-w-[540px]">
          <div className="bg-secondary px-8 py-7 text-secondary-foreground">
            <DialogHeader className="text-left">
              <div className="mb-4 grid h-12 w-12 place-items-center bg-primary text-primary-foreground">
                <Activity className="h-5 w-5" />
              </div>
              <DialogTitle className="font-display text-3xl font-bold tracking-[-0.03em] text-secondary-foreground">
                Add an eligible run first.
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-secondary-foreground/65">
                Record a run to earn your {challengeName} badge. Completed activities are checked
                automatically—no manual distance entry required.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-8 py-6">
            <a
              href="/record"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-95"
            >
              <Plus className="h-4 w-4" /> Record a run
            </a>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-border p-0 sm:max-w-[600px]">
        <div className="relative bg-secondary px-8 pb-6 pt-7 text-secondary-foreground">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <DialogHeader className="relative text-left">
            <div className="mb-4">
              <div className="grid h-12 w-12 animate-in zoom-in-50 place-items-center bg-primary text-primary-foreground duration-300">
                <PartyPopper className="h-5 w-5" />
              </div>
            </div>
            <DialogTitle className="max-w-md font-display text-3xl font-bold leading-[1.05] tracking-[-0.03em] text-secondary-foreground">
              You moved the whole challenge forward.
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-lg text-sm leading-6 text-secondary-foreground/65">
              Your {eligibleActivity.title} qualified. You’ve earned a {challengeName} badge—and{" "}
              {eligibleActivity.distanceKm.toFixed(1)} km is ready to join the community map.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-8 py-6">
          <div className="grid grid-cols-3 gap-px border border-border bg-border">
            <div className="bg-surface p-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Distance
              </div>
              <div className="stat-num mt-1 text-xl font-bold">
                {eligibleActivity.distanceKm.toFixed(1)} km
              </div>
            </div>
            <div className="bg-surface p-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Your badges
              </div>
              <div className="stat-num mt-1 text-xl font-bold">{eligibleActivity.badgesEarned}</div>
            </div>
            <div className="bg-surface p-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Community
              </div>
              <div className="stat-num mt-1 text-xl font-bold text-pr">{Math.round(progress)}%</div>
            </div>
          </div>

          <div className="mt-5">
            <label
              htmlFor="completion-post"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              Add a note
            </label>
            <Textarea
              id="completion-post"
              value={postText}
              onChange={(event) => onPostTextChange(event.target.value)}
              maxLength={180}
              className="mt-2 min-h-20 resize-none rounded-md border-border bg-background text-sm leading-6"
              placeholder="What kept you moving?"
            />
          </div>

          <div className="mt-5">
            <Button
              onClick={onPostBadge}
              disabled={!postText.trim() || saving}
              className="h-11 w-full gap-2 rounded-md"
            >
              <Send className="h-4 w-4" />
              {saving ? "Posting…" : "Post badge to the map"}
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-pr" />
            Shared with challenge participants at an approximate area—not your activity location.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComposerDialog({
  open,
  onOpenChange,
  postText,
  onPostTextChange,
  onShare,
  participant,
  challengeName,
  localArea,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postText: string;
  onPostTextChange: (text: string) => void;
  onShare: () => void;
  participant: Participant;
  challengeName: string;
  localArea: string;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border p-0 sm:max-w-[540px]">
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <DialogTitle className="font-display text-2xl font-semibold">
            Post to the challenge map
          </DialogTitle>
          <DialogDescription>
            Add a note to your badge and give the community something to rally around.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6">
          <div className="flex items-center gap-3">
            <img
              src={participant.avatar}
              alt={participant.name}
              className="h-11 w-11 rounded-full object-cover"
            />
            <div>
              <div className="text-sm font-semibold">{participant.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {challengeName} · {participant.distance}
              </div>
            </div>
            <div className="ml-auto grid h-10 w-10 place-items-center bg-primary text-primary-foreground">
              <Trophy className="h-4 w-4" />
            </div>
          </div>

          <Textarea
            value={postText}
            onChange={(event) => onPostTextChange(event.target.value)}
            maxLength={180}
            className="mt-5 min-h-28 resize-none rounded-md border-border bg-background text-sm leading-6"
            placeholder="What kept you moving?"
          />
          <div className="mt-2 text-right font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {postText.length} / 180
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-md">
              Cancel
            </Button>
            <Button
              onClick={onShare}
              disabled={!postText.trim() || saving}
              className="gap-2 rounded-md"
            >
              <Send className="h-4 w-4" />
              {saving ? "Sharing…" : `Share with ${localArea}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
