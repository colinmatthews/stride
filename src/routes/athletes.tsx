import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { ATHLETES } from "@/lib/mock-data";

export const Route = createFileRoute("/athletes")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  head: () => ({
    meta: [
      { title: "Athletes — Stride" },
      { name: "description", content: "Find athletes to follow on Stride." },
    ],
  }),
  component: AthletesPage,
});

function AthletesPage() {
  const search = Route.useSearch();
  const [query, setQuery] = useState(search.q);
  const athletes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ATHLETES.filter((athlete) => {
      if (athlete.id === "me") return false;
      if (!normalized) return true;
      return [athlete.name, athlete.handle, athlete.city, athlete.country].some((value) =>
        value.toLowerCase().includes(normalized),
      );
    });
  }, [query]);

  return (
    <AppShell>
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">Build your training circle</p>
        <h1 className="mt-1 text-3xl font-display font-bold tracking-tight">Discover athletes</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Follow athletes to bring their latest activities into your feed.
        </p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, handle, or city…"
          className="h-11 w-full rounded-md border border-transparent bg-surface-2 pl-10 pr-3 text-sm outline-none focus:border-border focus:bg-surface"
        />
      </div>

      {athletes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {athletes.map((athlete) => (
            <article key={athlete.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-start gap-4">
                <Link to="/athlete/$id" params={{ id: athlete.id }}>
                  <img
                    src={athlete.avatar}
                    alt={athlete.name}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/athlete/$id"
                    params={{ id: athlete.id }}
                    className="block truncate font-display font-semibold hover:text-primary"
                  >
                    {athlete.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">@{athlete.handle}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{athlete.city}</p>
                </div>
                <FollowButton id={athlete.id} />
              </div>
              <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                {athlete.bio}
              </p>
              <div className="mt-4 flex gap-5 border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">{athlete.followers.toLocaleString()}</strong>{" "}
                  followers
                </span>
                <span>
                  <strong className="text-foreground">{athlete.following.toLocaleString()}</strong>{" "}
                  following
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-surface text-center">
          <div>
            <Users className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 font-medium">No athletes found</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different name or location.</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
