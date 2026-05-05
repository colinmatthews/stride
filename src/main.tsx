import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { clearAppData, initializeAppData } from "./lib/mock-data";
import { loadInitialAppData } from "./lib/api";
import "./styles.css";

async function startApp() {
  const pathname = window.location.pathname;
  const isAuthRoute = pathname === "/auth";
  // Public routes render with empty app data (e.g. the landing page at "/"
  // shows marketing content when the user isn't authed).
  const isPublicRoute = isAuthRoute || pathname === "/";

  try {
    if (!isAuthRoute) {
      const data = await loadInitialAppData();
      initializeAppData(data);
    }
  } catch (error) {
    clearAppData();
    if (!isPublicRoute) {
      const next = `${pathname}${window.location.search}${window.location.hash}`;
      const authUrl = `/auth?next=${encodeURIComponent(next)}`;
      window.history.replaceState({}, "", authUrl);
    }
  }

  const router = getRouter();
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("Missing root element");
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}

void startApp();
