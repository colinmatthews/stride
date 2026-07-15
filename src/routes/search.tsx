import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ATHLETES, CHALLENGES, CLUBS, SEGMENTS } from "@/lib/mock-data";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  head: () => ({ meta: [{ title: "Search — Stride" }] }),
  component: SearchPage,
});

function includesQuery(query: string, values: Array<string | number>) {
  return values.some((value) => String(value).toLowerCase().includes(query));
}

function SearchPage() {
  const { q } = Route.useSearch();
  const query = q.trim().toLowerCase();
  const athletes = query
    ? ATHLETES.filter(
        (athlete) =>
          athlete.id !== "me" &&
          includesQuery(query, [athlete.name, athlete.handle, athlete.city, athlete.country, athlete.bio]),
      )
    : [];
  const segments = query
    ? SEGMENTS.filter((segment) =>
        includesQuery(query, [segment.name, segment.location, segment.sport]),
      )
    : [];
  const clubs = query
    ? CLUBS.filter((club) => includesQuery(query, [club.name, club.city, club.sport, club.description]))
    : [];
  const challenges = query
    ? CHALLENGES.filter((challenge) => includesQuery(query, [challenge.name, challenge.sport]))
    : [];
  const total = athletes.length + segments.length + clubs.length + challenges.length;

  return (
    <AppShell>
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">Search Stride</p>
        <h1 className="mt-1 text-3xl font-display font-bold tracking-tight">
          {q ? `Results for “${q}”` : "Find your next effort"}
        </h1>
        {q && <p className="mt-2 text-sm text-muted-foreground">{total} results across Stride</p>}
      </div>

      {!q ? (
        <EmptySearch message="Use the search box above to find athletes, segments, clubs, and challenges." />
      ) : total === 0 ? (
        <EmptySearch message="Try another name, location, sport, or keyword." />
      ) : (
        <div className="space-y-8">
          {athletes.length > 0 && (
            <ResultSection title="Athletes" count={athletes.length} action="View all" actionTo="/athletes">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {athletes.slice(0, 6).map((athlete) => (
                  <Link
                    key={athlete.id}
                    to="/athlete/$id"
                    params={{ id: athlete.id }}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:border-foreground/30"
                  >
                    <img src={athlete.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{athlete.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{athlete.handle} · {athlete.city}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </ResultSection>
          )}

          {segments.length > 0 && (
            <ResultSection title="Segments" count={segments.length}>
              <ResultList
                items={segments.slice(0, 6).map((segment) => ({
                  id: segment.id,
                  title: segment.name,
                  detail: `${segment.sport} · ${segment.location} · ${segment.distanceKm.toFixed(1)} km`,
                  to: `/segment/${segment.id}`,
                }))}
              />
            </ResultSection>
          )}

          {clubs.length > 0 && (
            <ResultSection title="Clubs" count={clubs.length}>
              <ResultList
                items={clubs.slice(0, 6).map((club) => ({
                  id: club.id,
                  title: club.name,
                  detail: `${club.sport} · ${club.city} · ${club.members.toLocaleString()} members`,
                  to: `/club/${club.id}`,
                }))}
              />
            </ResultSection>
          )}

          {challenges.length > 0 && (
            <ResultSection title="Challenges" count={challenges.length}>
              <ResultList
                items={challenges.slice(0, 6).map((challenge) => ({
                  id: challenge.id,
                  title: `${challenge.badge} ${challenge.name}`,
                  detail: `${challenge.sport} · ${challenge.participants.toLocaleString()} participants`,
                  to: "/challenges",
                }))}
              />
            </ResultSection>
          )}
        </div>
      )}
    </AppShell>
  );
}

function ResultSection({
  title,
  count,
  action,
  actionTo,
  children,
}: {
  title: string;
  count: number;
  action?: string;
  actionTo?: "/athletes";
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{title} <span className="text-sm font-normal text-muted-foreground">{count}</span></h2>
        {action && actionTo && <Link to={actionTo} className="text-xs text-muted-foreground hover:text-foreground">{action}</Link>}
      </div>
      {children}
    </section>
  );
}

function ResultList({ items }: { items: Array<{ id: string; title: string; detail: string; to: string }> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((item) => (
        <a key={item.id} href={item.to} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2">
          <span className="text-sm font-medium">{item.title}</span>
          <span className="text-xs text-muted-foreground">{item.detail}</span>
        </a>
      ))}
    </div>
  );
}

function EmptySearch({ message }: { message: string }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-surface text-center">
      <div className="max-w-sm px-6">
        <Search className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 font-medium">Nothing to show yet</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
