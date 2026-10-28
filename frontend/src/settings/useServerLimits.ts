import { useEffect, useState } from "react";
import api from "../api";

/** GET /execute/limits: the most a run may use on this server. */
export interface ServerLimits {
  maxCpus: number;
  maxMemory: string;
  defaultTimeoutMinutes: number;
}

/**
 * What this server allows (NWAVE_MAX_CPUS / NWAVE_MAX_MEMORY /
 * NWAVE_EXECUTION_TIMEOUT), or null: the demo has no backend.
 */
export const useServerLimits = (): ServerLimits | null => {
  const [limits, setLimits] = useState<ServerLimits | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<ServerLimits>("/execute/limits").then(
      (response) => !cancelled && setLimits(response.data),
      () => !cancelled && setLimits(null),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return limits;
};
