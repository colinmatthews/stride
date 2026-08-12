import { createFileRoute, notFound } from "@tanstack/react-router";
import CommunityMomentumChallenge from "@/features/community-momentum";

export const Route = createFileRoute("/challenges/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    state:
      search.state === "returned" ||
      search.state === "completion" ||
      search.state === "badge-added" ||
      search.state === "notification"
        ? search.state
        : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      {
        title:
          params.id === "community-boulder" ? "Boulder Together — Stride" : "Challenge — Stride",
      },
    ],
  }),
  loader: ({ params }) => {
    if (params.id !== "community-boulder") throw notFound();
  },
  component: CommunityMomentumChallenge,
});
