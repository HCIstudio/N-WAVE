// Verbose mode: clicks on buttons, links, tabs and menu entries, by the name
// people see (their label), never what was typed into a field.

import { useEffect } from "react";
import { logActivity } from "./activityLog";

const CLICKABLE = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary';
const MAX_NAME = 80;

/** What kind of control it is, and its name. */
export const describeClick = (target: EventTarget | null): { element: string; name: string } | null => {
  if (!(target instanceof Element)) return null;
  const control = target.closest(CLICKABLE);
  if (!control) return null;
  const role = control.getAttribute("role");
  const element =
    role && role !== "button"
      ? role
      : control.tagName === "A"
        ? "link"
        : control.tagName === "SUMMARY"
          ? "summary"
          : "button";
  const text = (
    control.getAttribute("aria-label") ||
    control.textContent ||
    control.getAttribute("title") ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
  return { element, name: text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1)}…` : text };
};

export const useClickRecorder = (): void => {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const click = describeClick(event.target);
      if (click) logActivity("ui.click", { ...click });
    };
    // Capture: also clicks that the control stops from spreading.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
};
