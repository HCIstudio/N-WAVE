import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEATURE_IDS,
  LockedFeatureError,
  lockedFeatures,
  parseFeatureList,
  readFeatures,
  writeFeatures,
} from "./features";

describe("features", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-features-"));
    process.env.NWAVE_DATA_DIR = root;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    for (const name of ["NWAVE_DATA_DIR", "NWAVE_FEATURES", "NWAVE_FEATURES_FILE"]) {
      Reflect.deleteProperty(process.env, name);
    }
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("has every feature on, and the workflow check blocking, by default", () => {
    const { features, locked } = readFeatures();
    expect(locked).toEqual([]);
    expect(features.workflowCheck).toBe("block");
    for (const id of FEATURE_IDS.filter((id) => id !== "workflowCheck")) {
      expect(features[id], id).toBe(true);
    }
  });

  it("reads switches from NWAVE_FEATURES and skips what doesn't parse", () => {
    expect(
      parseFeatureList("connectionHints=off, workflowCheck=WARN,resume=no,glossary=1,nope=on,templates=maybe"),
    ).toEqual({ connectionHints: false, workflowCheck: "warn", resume: false, glossary: true });
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("reads switches from NWAVE_FEATURES_FILE, with NWAVE_FEATURES winning", () => {
    const file = path.join(root, "features.json");
    fs.writeFileSync(file, JSON.stringify({ customCode: false, nodePacks: false, workflowCheck: "never", other: true }));
    process.env.NWAVE_FEATURES_FILE = file;
    process.env.NWAVE_FEATURES = "nodePacks=on";
    expect(lockedFeatures()).toEqual({ customCode: false, nodePacks: true });
  });

  it("ignores a features file it can't read", () => {
    process.env.NWAVE_FEATURES_FILE = path.join(root, "missing.json");
    expect(lockedFeatures()).toEqual({});
  });

  it("saves switches, applies the fixed ones over them and refuses to change those", () => {
    process.env.NWAVE_FEATURES = "notifications=off";
    const { features } = readFeatures();
    expect(features.notifications).toBe(false);

    const saved = writeFeatures({ ...features, templates: false });
    expect(saved).toEqual({ features: { ...features, templates: false }, locked: ["notifications"] });
    expect(readFeatures().features.templates).toBe(false);

    expect(() => writeFeatures({ ...features, notifications: true })).toThrow(LockedFeatureError);
    // Once the installation stops fixing it, the saved value counts again.
    Reflect.deleteProperty(process.env, "NWAVE_FEATURES");
    expect(readFeatures()).toEqual({ features: { ...features, templates: false }, locked: [] });
  });

  it("keeps the run defaults when saving features", () => {
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ runDefaults: { maxCpus: 8 } }));
    writeFeatures({ ...readFeatures().features, resume: false });
    expect(JSON.parse(fs.readFileSync(path.join(root, "settings.json"), "utf8")).runDefaults).toEqual({
      maxCpus: 8,
    });
  });
});
