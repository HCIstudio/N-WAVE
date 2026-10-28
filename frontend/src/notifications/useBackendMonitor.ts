// Watches whether N-WAVE answers, to notify when it can't be reached any
// more and when it is back. It only asks while that notification is on.

import { useEffect } from "react";
import api, { isDemoMode } from "../api";
import { notify } from "./notifications";
import { useNotificationPrefs } from "./useNotificationPrefs";

/** How often N-WAVE is asked whether it's there. */
export const HEALTH_INTERVAL_MS = 15_000;
/** Failed checks in a row before it counts as gone (a restart takes a few seconds). */
const FAILURES_BEFORE_LOST = 2;
// Tags name the minute, so tabs that notice it about together send it once.

export const useBackendMonitor = (): void => {
  const { prefs } = useNotificationPrefs();
  const watching = !isDemoMode && prefs.enabled && prefs.events.backendLost;

  useEffect(() => {
    if (!watching) return;
    let failures = 0;
    let lost = false;
    let stopped = false;
    const check = async () => {
      try {
        await api.get("/health", { timeout: 10_000 });
        if (stopped) return;
        failures = 0;
        if (lost) {
          lost = false;
          notify("backendLost", {
            title: "N-WAVE is back",
            body: "N-WAVE answers again. Runs that were going on are shown as they went on.",
            tag: `backend-back-${Math.floor(Date.now() / 60_000)}`,
          });
        }
      } catch {
        if (stopped) return;
        failures += 1;
        if (!lost && failures >= FAILURES_BEFORE_LOST) {
          lost = true;
          notify("backendLost", {
            title: "N-WAVE can't be reached",
            body: "It may have stopped or be restarting. You'll get a notification when it's back.",
            tag: `backend-lost-${Math.floor(Date.now() / 60_000)}`,
          });
        }
      }
    };
    const timer = window.setInterval(() => void check(), HEALTH_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [watching]);
};
