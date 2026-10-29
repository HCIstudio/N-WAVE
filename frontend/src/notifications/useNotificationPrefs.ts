import { useCallback, useEffect, useState } from "react";
import {
  isPrefsKey,
  type NotificationPrefs,
  PREFS_CHANGED,
  readNotificationPrefs,
  writeNotificationPrefs,
} from "./notifications";

/** The notification choices of this browser, kept in step across its tabs. */
export const useNotificationPrefs = () => {
  const [prefs, setPrefs] = useState(readNotificationPrefs);
  useEffect(() => {
    const reread = () => setPrefs(readNotificationPrefs());
    const onStorage = (event: StorageEvent) => {
      if (isPrefsKey(event.key)) reread();
    };
    window.addEventListener(PREFS_CHANGED, reread);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PREFS_CHANGED, reread);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const change = useCallback((next: NotificationPrefs) => writeNotificationPrefs(next), []);
  return { prefs, change };
};
