const formatBuildDate = (value: string) => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("de-DE");
};

export const buildInfo = {
  version: __APP_VERSION__,
  sha: __GIT_SHA__,
  buildDate: __BUILD_DATE__,
  displayBuildDate: formatBuildDate(__BUILD_DATE__),
};
