import type React from "react";
import { useState, useSyncExternalStore } from "react";
import { Square, Play } from "lucide-react";
import { useFeature } from "../settings/useFeatures";
import { endTest, getCurrentTest, getParticipant, startTest, subscribeActivity } from "./activityLog";

/**
 * Shown on every page while verbose mode records: that it does, for whom,
 * and Start test / End test to mark a short test with a participant.
 */
const RecordingIndicator: React.FC = () => {
  const recording = useFeature("verbose");
  const test = useSyncExternalStore(subscribeActivity, getCurrentTest);
  const participant = useSyncExternalStore(subscribeActivity, getParticipant);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");
  if (!recording) return null;

  const start = (event: React.FormEvent) => {
    event.preventDefault();
    startTest(label);
    setLabel("");
    setNaming(false);
  };

  return (
    <section
      aria-label="Verbose mode recording"
      className="fixed left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-panel-border bg-panel-background px-3 py-1 text-xs text-text shadow-lg"
    >
      <span className="flex items-center gap-1.5" title="Verbose mode records what happens in N-WAVE (Global Settings)">
        <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden />
        <span>
          Recording{participant ? ` · ${participant}` : ""}
          {test && ` · Test${test.label ? ` “${test.label}”` : ""}`}
        </span>
      </span>
      {test ? (
        <button
          type="button"
          onClick={endTest}
          className="flex items-center gap-1 rounded-full border border-panel-border px-2 py-0.5 hover:bg-accent"
        >
          <Square className="h-3 w-3" aria-hidden />
          End test
        </button>
      ) : naming ? (
        <form onSubmit={start} className="flex items-center gap-1">
          <label className="sr-only" htmlFor="nwave-test-label">
            Test label (optional)
          </label>
          <input
            id="nwave-test-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label (optional)"
            maxLength={80}
            // biome-ignore lint/a11y/noAutofocus: the field was just asked for.
            autoFocus
            className="w-32 rounded border border-panel-border bg-background px-1.5 py-0.5 text-xs text-text"
          />
          <button type="submit" className="rounded-full border border-panel-border px-2 py-0.5 hover:bg-accent">
            Start
          </button>
          <button
            type="button"
            onClick={() => setNaming(false)}
            className="px-1 text-text-light hover:text-text"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="flex items-center gap-1 rounded-full border border-panel-border px-2 py-0.5 hover:bg-accent"
        >
          <Play className="h-3 w-3" aria-hidden />
          Start test
        </button>
      )}
    </section>
  );
};

export default RecordingIndicator;
