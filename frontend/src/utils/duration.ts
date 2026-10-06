// Conversions between ISO 8601 durations (as stored in
// ExecutionSettings.resources.maxTime, e.g. "PT30M", "PT2H") and whole minutes
// (as edited in the settings dialog and sent to the backend).

const ISO_DURATION =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Minutes in an ISO 8601 duration, rounded; 0 for empty or invalid input. */
export const isoDurationToMinutes = (duration: string | undefined): number => {
  const match = duration?.trim().toUpperCase().match(ISO_DURATION);
  if (!match || duration?.trim().toUpperCase() === "P") return 0;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return Math.round(
    Number(days) * 1440 +
      Number(hours) * 60 +
      Number(minutes) +
      Number(seconds) / 60
  );
};

/** ISO 8601 duration for a number of minutes; "" for 0 (no limit set). */
export const minutesToIsoDuration = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return "";
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `PT${hours ? `${hours}H` : ""}${rest ? `${rest}M` : ""}`;
};
