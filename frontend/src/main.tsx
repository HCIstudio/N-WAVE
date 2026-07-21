import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import HomePage from "./pages/HomePage";
import WorkflowPage from "./pages/WorkflowPage";
import "reactflow/dist/style.css";
import "./index.css";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "workflow/:id", element: <WorkflowPage /> },
      ],
    },
  ],
  {
    // Prefix routes with the deployment base path (e.g. "/N-WAVE" on GitHub
    // Pages). BASE_URL is "/" for local dev and Docker, so basename is "".
    basename: import.meta.env.BASE_URL.replace(/\/$/, ""),
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    } as any,
  }
);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
