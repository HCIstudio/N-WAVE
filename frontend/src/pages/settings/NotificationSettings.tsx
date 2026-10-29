import type React from "react";
import { useId, useState } from "react";
import { Bell } from "lucide-react";
import {
  NOTIFICATION_EVENTS,
  type NotificationSupport,
  notificationSupport,
  requestNotificationPermission,
  sendTestNotification,
} from "../../notifications/notifications";
import { useNotificationPrefs } from "../../notifications/useNotificationPrefs";

/** Why notifications can't be shown here, and what to do about it. */
const supportHint = (support: NotificationSupport): string | null => {
  switch (support) {
    case "insecure":
      return `Browsers only show notifications for pages on HTTPS or on this computer (localhost). N-WAVE is open at ${window.location.origin}: open it at http://localhost (or through HTTPS) to use them.`;
    case "unsupported":
      return "This browser can't show notifications.";
    case "denied":
      return "This browser blocks N-WAVE's notifications. Allow them in the site settings (the icon left of the address), then reload the page.";
    default:
      return null;
  }
};

/** The Settings page's notifications: on or off, for which events, and a test. */
const NotificationSettings: React.FC = () => {
  const id = useId();
  const { prefs, change } = useNotificationPrefs();
  const [support, setSupport] = useState(notificationSupport);
  const [testResult, setTestResult] = useState<string | null>(null);
  const usable = support === "granted" || support === "default";
  const hint = supportHint(support);
  // The events only count while notifications are on.
  const eventsOn = prefs.enabled && support === "granted";

  const toggle = async (enabled: boolean) => {
    setTestResult(null);
    // Asked only now: browsers block pages that ask on their own.
    const next = enabled ? await requestNotificationPermission() : support;
    setSupport(next);
    change({ ...prefs, enabled: enabled && next === "granted" });
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border border-panel-border p-5">
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-semibold text-text">
        <Bell className="h-5 w-5" aria-hidden />
        Notifications
      </h2>
      <p className="mt-1 text-sm text-text-light">
        While you're in another tab or window, N-WAVE can tell you when something happens. When
        N-WAVE is in view, its own notices say the same. These choices are kept in this browser.
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-text">
        <input
          type="checkbox"
          checked={prefs.enabled && support === "granted"}
          disabled={!usable}
          onChange={(event) => void toggle(event.target.checked)}
          className="h-4 w-4 accent-nextflow-green"
        />
        Send browser notifications
      </label>
      {hint && (
        <p role="note" className="mt-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-2 text-sm text-text">
          {hint}
        </p>
      )}

      <fieldset
        className={`mt-3 space-y-1.5 pl-6 ${eventsOn ? "" : "opacity-50"}`}
        disabled={!eventsOn}
      >
        <legend className="sr-only">Notify when</legend>
        {NOTIFICATION_EVENTS.map((event) => (
          <label
            key={event.id}
            className={`flex items-center gap-2 text-sm text-text ${eventsOn ? "" : "cursor-not-allowed"}`}
          >
            <input
              type="checkbox"
              checked={prefs.events[event.id]}
              onChange={(e) =>
                change({ ...prefs, events: { ...prefs.events, [event.id]: e.target.checked } })
              }
              className="h-4 w-4 accent-nextflow-green"
            />
            {event.label}
          </label>
        ))}
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={support !== "granted"}
          onClick={() =>
            setTestResult(
              sendTestNotification()
                ? "Sent. If nothing showed up, check the notification settings of your system (e.g. Focus or Do Not Disturb)."
                : "Notifications aren't allowed for N-WAVE in this browser.",
            )
          }
          className="rounded-md border border-panel-border px-3 py-1.5 text-sm text-text hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send test notification
        </button>
        {testResult && (
          <p role="status" className="text-sm text-text-light">
            {testResult}
          </p>
        )}
      </div>
    </section>
  );
};

export default NotificationSettings;
