import { describe, expect, it } from "vitest";
import { BUILT_IN_RUN_DEFAULTS, type RunDefaults } from "../api/settings";
import type { RunProfile } from "../execution/runProfiles";
import { DEFAULT_EXECUTION_SETTINGS } from "../pages/workflow/executionSettings";
import { applyRunDefaults, availableRunProfiles } from "./effectiveSettings";

const slurm: RunProfile = { name: "slurm", executor: "slurm", containerEngine: "apptainer" };
const own: RunProfile = { name: "mine", executor: "local", containerEngine: "docker" };
const defaults: RunDefaults = {
  ...BUILT_IN_RUN_DEFAULTS,
  maxCpus: 12,
  maxMemory: "32.GB",
  timeoutMinutes: 90,
  runProfiles: [slurm],
  runProfile: "slurm",
};

describe("applyRunDefaults", () => {
  it("uses the Settings page's limits and default profile", () => {
    const effective = applyRunDefaults(DEFAULT_EXECUTION_SETTINGS, defaults);
    expect(effective.resources).toMatchObject({ maxCpus: 12, maxMemory: "32.GB", maxTime: "PT1H30M" });
    expect(effective.runProfile).toBe("slurm");
    expect(effective.runProfiles).toEqual([slurm]);
  });

  it("keeps a workflow's own limits and its choice of this computer", () => {
    const settings = {
      ...DEFAULT_EXECUTION_SETTINGS,
      resources: { ...DEFAULT_EXECUTION_SETTINGS.resources, useDefaults: false, maxCpus: 2 },
      runProfile: "",
    };
    const effective = applyRunDefaults(settings, defaults);
    expect(effective.resources.maxCpus).toBe(2);
    expect(effective.resources.maxMemory).toBe("4.GB");
    expect(effective.runProfile).toBe("");
  });

  it("lowers a workflow's own limits to the global ones", () => {
    const own = (resources: Partial<typeof DEFAULT_EXECUTION_SETTINGS.resources>) =>
      applyRunDefaults(
        {
          ...DEFAULT_EXECUTION_SETTINGS,
          resources: { ...DEFAULT_EXECUTION_SETTINGS.resources, useDefaults: false, ...resources },
        },
        defaults,
      ).resources;
    expect(own({ maxCpus: 64, maxMemory: "1.TB", maxTime: "PT10H" })).toMatchObject({
      maxCpus: 12,
      maxMemory: "32.GB",
      maxTime: "PT1H30M",
    });
    // Lower ones stay; no time limit of its own means the global one.
    expect(own({ maxCpus: 2, maxMemory: "512.MB", maxTime: "PT20M" })).toMatchObject({
      maxCpus: 2,
      maxMemory: "512.MB",
      maxTime: "PT20M",
    });
    expect(own({ maxTime: "" }).maxTime).toBe("PT1H30M");
    // Without a global time limit, the workflow's own counts.
    expect(
      applyRunDefaults(
        {
          ...DEFAULT_EXECUTION_SETTINGS,
          resources: { ...DEFAULT_EXECUTION_SETTINGS.resources, useDefaults: false, maxTime: "PT10H" },
        },
        { ...defaults, timeoutMinutes: 0 },
      ).resources.maxTime,
    ).toBe("PT10H");
  });

  it("runs on this computer when there is no default profile", () => {
    expect(applyRunDefaults(DEFAULT_EXECUTION_SETTINGS, BUILT_IN_RUN_DEFAULTS).runProfile).toBe("");
  });

  it("still offers the profiles a workflow kept itself, unless one of the Settings page has the name", () => {
    const settings = { ...DEFAULT_EXECUTION_SETTINGS, runProfiles: [own, { ...slurm, queue: "old" }] };
    expect(availableRunProfiles(settings, defaults)).toEqual([slurm, own]);
  });
});
