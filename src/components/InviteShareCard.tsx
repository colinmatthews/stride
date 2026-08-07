import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import { Check, Copy, LoaderCircle, Mail, MessageCircle, Share2 } from "lucide-react";
import { createActivityInvite, fetchActivityInvites } from "@/lib/api";
import { mailtoHref, smsHref, sportNoun, type InviteSummary } from "@/lib/invites";
import type { Activity } from "@/lib/mock-data";

interface Props {
  activity: Activity;
  /** Set when the athlete answered "yes, others were there" while recording. */
  autoCreate?: boolean;
}

/**
 * The sender half of the group-logging loop: mint a link for an activity, hand it to
 * the athlete's own messaging app, and show who has claimed it since.
 *
 * Only rendered for activities the viewer owns — you can't invite people to someone
 * else's effort, and the server enforces that too.
 */
export function InviteShareCard({ activity, autoCreate = false }: Props) {
  const posthog = usePostHog();
  const [invites, setInvites] = useState<InviteSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const noun = sportNoun(activity.sport);

  useEffect(() => {
    let cancelled = false;

    fetchActivityInvites(activity.id)
      .then((result) => {
        if (!cancelled) setInvites(result.invites);
      })
      .catch(() => {
        if (!cancelled) setInvites([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activity.id]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await createActivityInvite(activity.id);
      const result = await fetchActivityInvites(activity.id);
      setInvites(result.invites);
      posthog.capture("invite_created", {
        activity_id: activity.id,
        sport: activity.sport,
      });
    } catch (err) {
      posthog.captureException(err);
      setError("Couldn't create an invite link. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Creating on mount is what makes "yes, others were there" during recording feel
  // like one action instead of two. Waits for the initial fetch so a reload doesn't
  // mint a second link for the same activity.
  useEffect(() => {
    if (autoCreate && invites !== null && invites.length === 0 && !busy) {
      void create();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate, invites]);

  if (invites === null) {
    return null;
  }

  const invite = invites[0];

  if (!invite) {
    return (
      <section className="mt-8 flex flex-wrap items-center justify-between gap-6 border border-border bg-secondary p-6 text-secondary-foreground">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">
            Anyone else on this {noun}?
          </h2>
          <p className="mt-1.5 text-sm text-secondary-foreground/70">
            Send them a prefilled copy — they can log it on their own record in a couple of taps.
          </p>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
        <button
          onClick={create}
          disabled={busy}
          className="group inline-flex h-12 items-center gap-2 bg-primary px-7 text-sm font-medium text-primary-foreground transition-all hover:gap-3 disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {busy ? "Creating link" : "Invite them"}
        </button>
      </section>
    );
  }

  const url = `${window.location.origin}/j/${invite.code}`;
  const subject = `Log the ${noun} we did together`;

  // Every share route reports the same event so channel mix is comparable. Nothing here
  // confirms delivery — the handoff to the device's own app is the last thing Stride sees.
  const recordShare = (channel: "copy" | "sms" | "email") => {
    posthog.capture("invite_shared", {
      activity_id: activity.id,
      invite_code: invite.code,
      channel,
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
      recordShare("copy");
    } catch {
      setError("Couldn't reach the clipboard — select the link below and copy it manually.");
    }
  };

  return (
    <section className="mt-8 border border-border bg-surface">
      <div className="flex items-end justify-between gap-4 border-b border-border p-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Log it together
          </div>
          <h2 className="mt-2 font-display text-xl font-bold tracking-[-0.02em]">
            {invite.claims.length > 0
              ? `${invite.claims.length} logged it too`
              : "Your invite link is live"}
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {invite.code}
        </span>
      </div>

      <div className="border-b border-border p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          The message
        </div>
        <pre className="mt-3 whitespace-pre-wrap border border-border bg-background p-4 font-body text-sm leading-6 text-muted-foreground">
          {invite.message}
        </pre>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={copy}
            className="inline-flex h-10 items-center gap-2 bg-secondary px-5 text-sm font-medium text-secondary-foreground transition-opacity hover:opacity-95"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied to clipboard" : "Copy invite"}
          </button>
          <a
            href={smsHref(invite.message)}
            onClick={() => recordShare("sms")}
            className="inline-flex h-10 items-center gap-2 border border-border bg-surface px-5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <MessageCircle className="h-4 w-4" /> Text it
          </a>
          <a
            href={mailtoHref(subject, invite.message)}
            onClick={() => recordShare("email")}
            className="inline-flex h-10 items-center gap-2 border border-border bg-surface px-5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Mail className="h-4 w-4" /> Email it
          </a>
        </div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Sends from your own phone or mail app · Stride never sees who you sent it to
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{url}</p>
      </div>

      <div className="p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Who logged it
        </div>
        {invite.claims.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nobody yet. Claims show up here as they come in.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {invite.claims.map((claim) => (
              <li key={claim.athleteId} className="flex items-center gap-3">
                <img
                  src={claim.avatar}
                  alt={claim.name}
                  className="h-9 w-9 rounded-full object-cover ring-1 ring-border"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/activity/$id"
                    params={{ id: claim.activityId }}
                    className="text-sm font-medium hover:underline"
                  >
                    {claim.name}
                  </Link>
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {claim.wasEdited ? "Logged · adjusted the numbers" : "Logged · matched yours"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
