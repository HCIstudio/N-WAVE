import type React from "react";
import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { isDemoMode } from "./api";
import DemoBanner from "./demo/DemoBanner";
import { setNotificationNavigator } from "./notifications/notifications";
import { useBackendMonitor } from "./notifications/useBackendMonitor";

const App: React.FC = () => {
  // A click on a notification opens its page here.
  const navigate = useNavigate();
  useEffect(() => {
    setNotificationNavigator((path) => void navigate(path));
    return () => setNotificationNavigator(null);
  }, [navigate]);
  useBackendMonitor();

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
