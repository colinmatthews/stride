/**
 * The full notification-center page. Inbox and Settings are two "views" of the
 * same page, swapped via a top-right button backed by the `?view=settings`
 * search param (so the tray can deep-link in and Back/Forward toggles the view).
 *
 * Inbox layout: narrow column, category filter chips, items grouped by recency.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  Settings2,
  Inbox as InboxIcon,
  ChevronRight,
  ChevronLeft,
  LoaderCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { NotificationKind } from "@/lib/mock-data";
import { NotificationRow, EmptyInbox, SettingsBlock, groupByRecency, KIND_LABEL } from "./shared";
import { FilterChip, MarkAllButton } from "./atoms";
import { useInbox, useSettings } from "./NotificationsProvider";

export function NotificationCenter() {
  const search = useSearch({ from: "/notifications" });
  const view = search.view === "settings" ? "settings" : "inbox";

  const inbox = useInbox();
  const settings = useSettings();
  const [filter, setFilter] = useState<NotificationKind | "all">("all");

  // Chips derive from the full item set so they don't disappear while filtering.
  const kindsPresent = Array.from(new Set(inbox.items.map((n) => n.kind)));
  const filtered = filter === "all" ? inbox.items : inbox.items.filter((n) => n.kind === filter);
  const groups = groupByRecency(filtered);

  return (
    <div className="max-w-2xl">
      {/* Heading + view swap */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-display font-bold tracking-tight">Notifications</h1>
        {view === "settings" ? (
          <Link
            to="/notifications"
            search={{ view: undefined }}
            className="inline-flex shrink-0 items-center gap-2 h-9 px-3 rounded-md border border-border text-sm hover:bg-muted"
          >
            <InboxIcon className="h-4 w-4" /> Inbox
          </Link>
        ) : (
          <Link
            to="/notifications"
            search={{ view: "settings" }}
            className="inline-flex shrink-0 items-center gap-2 h-9 px-3 rounded-md border border-border text-sm hover:bg-muted"
          >
            <Settings2 className="h-4 w-4" /> Settings
          </Link>
        )}
      </div>

      {view === "settings" ? (
        <SettingsBlock settings={settings} />
      ) : (
        <>
          {/* Filter chips (scrollable); Mark all as read sits inline with the first group header */}
          <FilterBar className="mb-6">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All
              <span className="ml-1.5 text-muted-foreground">{inbox.items.length}</span>
            </FilterChip>
            {kindsPresent.map((k) => {
              const count = inbox.items.filter((n) => n.kind === k).length;
              return (
                <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>
                  {KIND_LABEL[k]}
                  <span className="ml-1.5 text-muted-foreground">{count}</span>
                </FilterChip>
              );
            })}
          </FilterBar>

          {/* Inbox grouped by recency */}
          {filtered.length === 0 ? (
            <Card className="overflow-hidden">
              <EmptyInbox />
            </Card>
          ) : (
            <div className="space-y-6">
              {groups.map((group, gi) => (
                <section key={group.label}>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {group.label}
                    </h2>
                    {gi === 0 && <MarkAllButton inbox={inbox} />}
                  </div>
                  <Card className="overflow-hidden py-0">
                    <ul className="divide-y divide-border">
                      {group.items.map((n) => (
                        <li key={n.id}>
                          <NotificationRow n={n} onMarkRead={inbox.markOne} />
                        </li>
                      ))}
                    </ul>
                  </Card>
                </section>
              ))}

              {/* Bootstrap only carries the first page. Without this the older
                  history is unreachable while the bell keeps counting it. */}
              {inbox.hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={inbox.loadMore}
                    disabled={inbox.loadingMore}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {inbox.loadingMore ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" /> Loading
                      </>
                    ) : (
                      "Load older notifications"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Horizontal, non-wrapping row for the filter chips. Scrollbar is hidden; a fade
 * + scroll arrow appears on each side that has more content to reveal.
 */
function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    };
    update();
    const raf = requestAnimationFrame(update); // re-measure after layout settles
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollBy = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * 180, behavior: "smooth" });

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Scrollbar hidden across engines */}
      <div
        ref={ref}
        className="flex flex-nowrap gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {canLeft && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 h-full w-12 bg-gradient-to-r from-background to-transparent" />
          <button
            onClick={() => scrollBy(-1)}
            aria-label="Scroll filters left"
            className="absolute left-0 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface-2 text-foreground/70 shadow-sm hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}
      {canRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background to-transparent" />
          <button
            onClick={() => scrollBy(1)}
            aria-label="Scroll filters right"
            className="absolute right-0 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface-2 text-foreground/70 shadow-sm hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
