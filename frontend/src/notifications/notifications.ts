// Browser notifications (the Notification API): a run ended, N-WAVE can't
// be reached any more, or is back. What to notify about is kept in this
// browser only. Notifications are sent only while the tab isn't in view (the
// page shows the same itself), and once when several tabs notice the same.

import { currentFeatures } from "../settings/useFeatures";

export type NotificationEvent = "runSucceeded" | "runFailed" | "backendLost";

export const NOTIFICATION_EVENTS: { id: NotificationEvent; label: string }[] = [
  { id: "runSucceeded", label: "A run finished" },
  { id: "runFailed", label: "A run failed or was stopped" },
  { id: "backendLost", label: "N-WAVE can't be reached, and when it's back" },
];

export interface NotificationPrefs {
  enabled: boolean;
  events: Record<NotificationEvent, boolean>;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  events: { runSucceeded: true, runFailed: true, backendLost: true },
};

const PREFS_KEY = "nwave-notifications";
/** Prefix of the keys that say a notification was already sent (by any tab). */
const SENT_PREFIX = "nwave-notified:";
/** How long a sent notification keeps other tabs from sending it again. */
const SENT_FOR_MS = 10 * 60 * 1000;

export const readNotificationPrefs = (): NotificationPrefs => {
  if (unstoredPrefs) return unstoredPrefs;
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as
      | Partial<NotificationPrefs>
      | null;
    if (!stored) return DEFAULT_NOTIFICATION_PREFS;
    return {
      enabled: stored.enabled === true,
      events: { ...DEFAULT_NOTIFICATION_PREFS.events, ...stored.events },
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
};

/** Fired on window when this tab changes the choices (other tabs get a storage event). */
export const PREFS_CHANGED = "nwave-notifications-changed";

let unstoredPrefs: NotificationPrefs | null = null;

export const writeNotificationPrefs = (prefs: NotificationPrefs): void => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    unstoredPrefs = null;
  } catch {
    // Without storage the choice lasts as long as the page.
    unstoredPrefs = prefs;
  }
  window.dispatchEvent(new Event(PREFS_CHANGED));
};

/** Whether a storage event is about these choices. */
export const isPrefsKey = (key: string | null): boolean => key === PREFS_KEY;

/**
 * Whether this browser can show notifications here: "insecure" when the page
 * isn't on HTTPS or localhost (browsers allow them only there), else the
 * permission so far.
 */
export type NotificationSupport = "unsupported" | "insecure" | NotificationPermission;

export const notificationSupport = (): NotificationSupport => {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
};

/** Ask for permission; only call this from something the user did. */
export const requestNotificationPermission = async (): Promise<NotificationSupport> => {
  const support = notificationSupport();
  if (support !== "default") return support;
  return Notification.requestPermission();
};

/** Whether the person is looking at this tab right now. */
const tabInView = (): boolean =>
  document.visibilityState === "visible" && document.hasFocus();

/** True for the first tab to send `tag` (others see it in shared storage). */
const claim = (tag: string): boolean => {
  const key = `${SENT_PREFIX}${tag}`;
  try {
    const sent = Number(localStorage.getItem(key));
    if (sent && Date.now() - sent < SENT_FOR_MS) return false;
    localStorage.setItem(key, String(Date.now()));
    // Old marks go, so storage doesn't fill up.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const other = localStorage.key(i);
      if (
        other?.startsWith(SENT_PREFIX) &&
        Date.now() - Number(localStorage.getItem(other)) > SENT_FOR_MS
      ) {
        localStorage.removeItem(other);
      }
    }
  } catch {
    // Without storage, the tag still keeps the browser from showing it twice.
  }
  return true;
};

// Where a click on a notification goes; the app sets it (a router navigate).
let openInApp: ((path: string) => void) | null = null;
export const setNotificationNavigator = (navigate: ((path: string) => void) | null): void => {
  openInApp = navigate;
};

export interface NotificationContent {
  title: string;
  body: string;
  /** The same tag from several tabs or twice is shown once. */
  tag: string;
  /** The page a click opens, e.g. "/workflow/abc?run=xyz". */
  path?: string;
}

const show = ({ title, body, tag, path }: NotificationContent): Notification => {
  const notification = new Notification(title, {
    body,
    tag,
    icon: `${import.meta.env.BASE_URL}favicon.ico`,
  });
  notification.onclick = () => {
    window.focus();
    if (path) openInApp?.(path);
    notification.close();
  };
  return notification;
};

/**
 * Send a notification about `event` if it is turned on, allowed, this tab
 * isn't in view and no other tab sent it. Returns whether it was sent.
 */
export const notify = (event: NotificationEvent, content: NotificationContent): boolean => {
  // Global Settings → Features can switch notifications off for everyone.
  if (!currentFeatures().notifications) return false;
  const prefs = readNotificationPrefs();
  if (!prefs.enabled || !prefs.events[event]) return false;
  if (notificationSupport() !== "granted") return false;
  if (tabInView()) return false;
  if (!claim(content.tag)) return false;
  show(content);
  return true;
};

/** The Settings page's test: sent even while the tab is in view. */
export const sendTestNotification = (): boolean => {
  if (notificationSupport() !== "granted") return false;
  show({
    title: "N-WAVE notifications work",
    body: "This is how N-WAVE tells you when a run ends while you're in another tab.",
    tag: `test-${Date.now()}`,
  });
  return true;
};
