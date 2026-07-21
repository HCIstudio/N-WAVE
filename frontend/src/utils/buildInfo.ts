const formatBuildDate = (value: string) => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  // ISO-style YYYY-MM-DD (e.g. 2026-07-03), computed manually so it's
  // deterministic regardless of the runtime locale/timezone.
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const buildInfo = {
  version: __APP_VERSION__,
  sha: __GIT_SHA__,
  buildDate: __BUILD_DATE__,
  displayBuildDate: formatBuildDate(__BUILD_DATE__),
};
