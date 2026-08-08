import { Outlet, Link, createRootRoute, HeadContent } from "@tanstack/react-router";
import { PostHogProvider } from "@posthog/react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Stride — Where every effort counts" },
      {
        name: "description",
        content:
          "Track runs, rides, swims and more. Connect with athletes, chase segments, conquer challenges.",
      },
      { name: "author", content: "Stride" },
      { property: "og:title", content: "Stride — Where every effort counts" },
      {
        property: "og:description",
        content:
          "Track runs, rides, swims and more. Connect with athletes, chase segments, conquer challenges.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeadContent />
      <PostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN!}
        options={{
          api_host: "/ingest",
          ui_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://us.posthog.com",
          defaults: "2025-05-24",
          capture_exceptions: true,
          debug: import.meta.env.DEV,
        }}
      >
        {children}
      </PostHogProvider>
    </>
  );
}

function RootComponent() {
  return <Outlet />;
}
