import type React from "react";
import { useEffect } from "react";
import { Outlet } from "react-router";
import { isDemoMode } from "./api";
import DemoBanner from "./demo/DemoBanner";

const App: React.FC = () => {
  useEffect(() => {
    // The canvas has no use for the browser's menu; everywhere else (logs,
    // text fields, links) it stays, so text can be copied.
    const handleContextMenu = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(".react-flow")) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  return (
    <>
      <Outlet />
      {isDemoMode && <DemoBanner />}
    </>
  );
};

export default App;
