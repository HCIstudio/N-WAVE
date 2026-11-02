// Verbose mode's recorder: while verbose mode is on (Global Settings), parts of
// N-WAVE call logActivity() and the events go to the activity log in batches.
// Each event carries this tab's session, the participant ID and marked test
// set in this browser, the open workflow and the page. Off, nothing is kept.

import type { Edge, Node } from "@xyflow/react";
import { isDemoMode } from "../api";
import { recordActivity } from "../api/activity";
import { currentFeatures, currentRecordsValues } from "../settings/useFeatures";
import type { ActivityEvent, ActivityType } from "./activityEvents";

export const PARTICIPANT_KEY = "nwave-activity-participant";
export const TEST_KEY = "nwave-activity-test";
/** Letters, digits, - and _ only: a code, never a name. */
export const PARTICIPANT_PATTERN = /^[A-Za-z0-9_-]{0,40}$/;

/** Events wait this long to be sent together. */
const FLUSH_MS = 2_000;
const FLUSH_COUNT = 50;
/** Events kept while N-WAVE can't be reached. */
const MAX_QUEUED = 2_000;
/** Events per request: the backend takes at most 1,000 at once. */
const MAX_BATCH = 500;

const randomId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

let session = randomId();
let sessionStarted = false;
let workflowId: string | undefined;
let queue: ActivityEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export interface CurrentTest {
  id: string;
  label?: string;
  startedAt: string;
}

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse; the event still carries what is known.
  }
};

// The participant and test change from the Settings page and the recording
// indicator; both re-render with them.
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
export const subscribeActivity = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getParticipant = (): string => readStorage(PARTICIPANT_KEY) ?? "";

/** Set the pseudonymous ID (empty: none); false when it isn't a valid code. */
export const setParticipant = (code: string): boolean => {
  const trimmed = code.trim();
  if (!PARTICIPANT_PATTERN.test(trimmed)) return false;
  writeStorage(PARTICIPANT_KEY, trimmed || null);
  notify();
  return true;
};

let testCache: { raw: string | null; test: CurrentTest | null } = { raw: null, test: null };
/** The marked test going on in this browser, if any. */
export const getCurrentTest = (): CurrentTest | null => {
  const raw = readStorage(TEST_KEY);
  if (raw !== testCache.raw) {
    let test: CurrentTest | null = null;
    try {
      test = raw ? (JSON.parse(raw) as CurrentTest) : null;
    } catch {
      test = null;
    }
    testCache = { raw, test };
  }
  return testCache.test;
};

/** The workflow open in this tab; its events carry its id. */
export const setActivityWorkflow = (id: string | undefined): void => {
  workflowId = id;
};

export const isRecording = (): boolean => currentFeatures().verbose;

const makeEvent = (type: ActivityType, data?: Record<string, unknown>): ActivityEvent => {
  const participant = getParticipant();
  const test = getCurrentTest();
  return {
    id: randomId(),
    time: new Date().toISOString(),
    type,
    session,
    ...(participant ? { participant } : {}),
    ...(test ? { test: test.id } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(typeof window !== "undefined" ? { path: window.location.pathname } : {}),
    ...(data ? { data } : {}),
  };
};

const schedule = () => {
  if (queue.length >= FLUSH_COUNT) {
    void flushActivity();
    return;
  }
  timer ??= setTimeout(() => {
    timer = null;
    void flushActivity();
  }, FLUSH_MS);
};

/** Record one event, if verbose mode is on. The first one in a tab says which features are on. */
export const logActivity = (type: ActivityType, data?: Record<string, unknown>): void => {
  if (!isRecording()) return;
  if (!sessionStarted) {
    sessionStarted = true;
    queue.push(makeEvent("session.started", { features: currentFeatures(), recordsValues: currentRecordsValues() }));
  }
  queue.push(makeEvent(type, data));
  schedule();
};

/** Send what is waiting; kept for the next try when N-WAVE can't be reached. */
export const flushActivity = async (): Promise<void> => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // In batches the backend accepts: after a long outage the queue is longer than one.
  while (queue.length > 0) {
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    try {
      await recordActivity(batch);
    } catch {
      queue = [...batch, ...queue].slice(-MAX_QUEUED);
      timer ??= setTimeout(() => {
        timer = null;
        void flushActivity();
      }, FLUSH_MS * 5);
      return;
    }
  }
};

/** Start a marked test (a short test with a participant); its events can be exported on their own. */
export const startTest = (label = ""): CurrentTest => {
  const ended = getCurrentTest();
  if (ended) endTest();
  const test: CurrentTest = {
    id: randomId(),
    ...(label.trim() ? { label: label.trim().slice(0, 80) } : {}),
    startedAt: new Date().toISOString(),
  };
  writeStorage(TEST_KEY, JSON.stringify(test));
  logActivity("test.started", { label: test.label ?? "" });
  notify();
  return test;
};

export const endTest = (): void => {
  const test = getCurrentTest();
  if (!test) return;
  logActivity("test.ended", { label: test.label ?? "" });
  writeStorage(TEST_KEY, null);
  notify();
};

/** Tests: the events waiting to be sent. */
export const pendingActivity = (): ActivityEvent[] => [...queue];

/** Tests: start over with an empty queue and a new tab session. */
export const resetActivityLog = (): void => {
  if (timer) clearTimeout(timer);
  timer = null;
  queue = [];
  session = randomId();
  sessionStarted = false;
  workflowId = undefined;
  testCache = { raw: null, test: null };
};

// Leaving the page sends what is waiting (a beacon outlives the page).
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (queue.length === 0) return;
    if (isDemoMode || typeof navigator.sendBeacon !== "function") {
      void flushActivity();
      return;
    }
    const base = import.meta.env.VITE_API_BASE_URL || "/api";
    while (queue.length > 0) {
      const batch = queue.slice(0, MAX_BATCH);
      const sent = navigator.sendBeacon(
        `${base}/activity`,
        new Blob([JSON.stringify({ events: batch })], { type: "application/json" }),
      );
      // Too much for a beacon: the rest stays for the next visit's flush.
      if (!sent) break;
      queue = queue.slice(MAX_BATCH);
    }
  });
}

/**
 * The workflow as it is, for the record of a run: its nodes and connections,
 * without parameter values or file contents unless the installation records them.
 */
export const workflowSnapshot = (
  nodes: Node[],
  edges: Edge[],
  withValues = currentRecordsValues(),
): { nodes: unknown[]; edges: unknown[] } => ({
  nodes: nodes.map((node) => ({
    id: node.id,
    type: node.type,
    label: (node.data as { label?: unknown } | undefined)?.label,
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    ...(withValues ? { data: node.data } : {}),
  })),
  edges: edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? null,
    target: edge.target,
    targetHandle: edge.targetHandle ?? null,
  })),
});
