import fs from "node:fs";
import path from "node:path";

/** N-WAVE's version, from the backend's package.json; the images it runs carry the same. */
export const nwaveVersion = (): string | null => {
  for (const candidate of [
    path.join(__dirname, "..", "package.json"),
    path.join(process.cwd(), "package.json"),
  ]) {
    try {
      const { version } = JSON.parse(fs.readFileSync(candidate, "utf8")) as { version?: string };
      if (version) return version;
    } catch {
      // Not there; try the next.
    }
  }
  return null;
};
