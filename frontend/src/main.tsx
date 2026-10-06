import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import LoadingIndicator from "./components/common/ui/LoadingIndicator";
import RouteErrorFallback from "./components/common/ui/RouteErrorFallback";
import "reactflow/dist/style.css";
import "./index.css";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      errorElement: <RouteErrorFallback />,
      children: [
        {
          // Pathless layout route so page errors render inside <App /> (keeping
          // the demo banner) instead of replacing the whole tree.
          errorElement: <RouteErrorFallback />,
          children: [
            // Pages are loaded on demand so the library page doesn't pay for
            // the canvas editor (React Flow, panels, generators) up front.
            {
              index: true,
              lazy: async () => ({
                Component: (await import("./pages/HomePage")).default,
              }),
            },
            {
              path: "workflow/:id",
              lazy: async () => ({
                Component: (await import("./pages/WorkflowPage")).default,
              }),
            },
          ],
        },
      ],
    },
  ],
  {
    // Prefix routes with the deployment base path (e.g. "/N-WAVE" on GitHub
    // Pages). BASE_URL is "/" for local dev and Docker, so basename is "".
    basename: import.meta.env.BASE_URL.replace(/\/$/, ""),
    future: {
      v7_relativeSplatPath: true,
    },
  }
);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider
      router={router}
      fallbackElement={<LoadingIndicator fullPage />}
      future={{ v7_startTransition: true }}
    />
  </React.StrictMode>
);
