import { useState } from "react";
import { Radio, Trophy } from "lucide-react";
import { Meter } from "@/components/Meter";
import { fmtDate, getAthlete, type ChallengeLeaderboardEntry } from "@/lib/mock-data";
import { RankTrend } from "./RankTrend";
import type { ChallengeMeta } from "./metric";

type Board = "overall" | "weekly";

export function ChallengeLeaderboard({
  meta,
  leaderboard,
}: {
  meta: ChallengeMeta;
  leaderboard: ChallengeLeaderboardEntry[];
}) {
  const [board, setBoard] = useState<Board>("overall");

  const ranked =
    board === "overall"
      ? leaderboard
      : [...leaderboard].sort((a, b) => a.weeklyRank - b.weeklyRank);
  // Bars are relative to the leader, and never divide by zero on an empty board.
  const topTotal = Math.max(...leaderboard.map((row) => row.total), 1);
  const myRow = leaderboard.find((row) => row.athleteId === "me");

  return (
    <section className="mt-6 border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
          <Trophy className="h-4 w-4 text-primary" /> Leaderboard
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex border border-border">
            {(["overall", "weekly"] as Board[]).map((option) => (
              <button
                key={option}
                onClick={() => setBoard(option)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  board === option
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option === "overall" ? "Overall" : "Last 7 days"}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            <Radio className="h-3 w-3" /> Live
          </span>
        </div>
      </div>

      {myRow && (
        <div className="mt-5 border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <RankTrend delta={myRow.rankDelta} />
            {myRow.rankDelta > 0
              ? "Gaining ground"
              : myRow.rankDelta < 0
                ? "Losing ground"
                : "Holding position"}
          </div>
          <p className="mt-1.5 text-sm">
            #{myRow.rank} overall · #{myRow.weeklyRank} in the last 7 days ({myRow.weeklyTotal}{" "}
            {meta.unit})
          </p>
        </div>
      )}

      <ul className="mt-5 space-y-1">
        {ranked.map((row) => {
          const isMe = row.athleteId === "me";
          const athlete = getAthlete(row.athleteId);
          const value = board === "overall" ? row.total : row.weeklyTotal;

          return (
            <li
              key={row.athleteId}
              className={`flex items-center gap-4 p-3 ${isMe ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
            >
              <span className="stat-num w-6 shrink-0 text-sm text-muted-foreground">
                {board === "overall" ? row.rank : row.weeklyRank}
              </span>
              {athlete.avatar ? (
                <img
                  src={athlete.avatar}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {(athlete.name || "You").charAt(0)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{isMe ? "You" : athlete.name}</div>
                <Meter
                  value={(value / topTotal) * 100}
                  className="mt-1.5 h-1"
                  barClassName={isMe ? "bg-primary" : "bg-muted-foreground/40"}
                />
              </div>
              <span className="inline-flex shrink-0 items-center gap-1">
                <RankTrend delta={row.rankDelta} />
              </span>
              <span className="stat-num shrink-0 text-lg font-semibold">
                {value}
                <span className="ml-1 text-xs text-muted-foreground">{meta.unit}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
        Total {meta.unit} since the challenge opened on {fmtDate(meta.startsAt)}. Arrows show each
        athlete&rsquo;s 7-day rank against their overall rank. Your total counts only the activities
        you have confirmed.
      </p>
    </section>
  );
}
