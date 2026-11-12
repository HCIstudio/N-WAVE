// What an analysis is doing while it runs, so a wait of minutes doesn't look
// like nothing happens. The server checks the code in one request, so its
// stages are what can be known from outside: the code is written (at once),
// the analysis tools are downloaded (the first time; the server says which
// images it has, asked every few seconds), then nextflow lint and
// BioFlow-Insight read the code. And how long it has taken so far.

import { useEffect, useState } from "react";
import api, { isDemoMode } from "../api";

export type AnalysisStage = "code" | "download" | "reading";

interface ToolStatus {
  available: boolean;
  image: string;
  imagePresent: boolean;
}

export interface AnalysisProgress {
  stage: AnalysisStage;
  /** Whether the tools have to be downloaded first (known after the first check). */
  downloading: boolean;
  /** Images still being downloaded. */
  missing: string[];
  seconds: number;
}

const POLL_MS = 3000;

const missingImages = async (): Promise<string[]> => {
  const { data } = await api.get<Record<"lint" | "bioflow", ToolStatus>>("/analysis");
  return Object.values(data)
    .filter((tool) => tool.available && !tool.imagePresent)
    .map((tool) => tool.image);
};

/** The progress of the analysis that runs while `running` is true; null when none runs. */
export const useAnalysisProgress = (running: boolean): AnalysisProgress | null => {
  const [seconds, setSeconds] = useState(0);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!running) return;
    setSeconds(0);
    setMissing(null);
    setDownloaded(false);
    const started = Date.now();
    const tick = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    if (isDemoMode) return () => window.clearInterval(tick);

    let stopped = false;
    let poll: number | undefined;
    const check = async (first: boolean) => {
      try {
        const images = await missingImages();
        if (stopped) return;
        setMissing(images);
        if (images.length === 0) {
          if (!first) setDownloaded(true);
          return;
        }
        poll = window.setTimeout(() => void check(false), POLL_MS);
      } catch {
        // Can't tell: show the reading stage only.
        if (!stopped) setMissing([]);
      }
    };
    void check(true);
    return () => {
      stopped = true;
      window.clearInterval(tick);
      window.clearTimeout(poll);
    };
  }, [running]);

  if (!running) return null;
  const downloading = (missing?.length ?? 0) > 0 || downloaded;
  return {
    stage: missing === null ? "code" : (missing.length > 0 ? "download" : "reading"),
    downloading,
    missing: missing ?? [],
    seconds,
  };
};
