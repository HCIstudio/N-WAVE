import { describe, expect, it } from "vitest";
import { executionSettingsSchema } from "./schemas";

describe("execution settings", () => {
  it("takes Nextflow's error strategies, and nothing else (it goes into the run's config)", () => {
    for (const strategy of ["terminate", "ignore", "retry", "finish"]) {
      expect(executionSettingsSchema.parse({ errorStrategy: strategy }).errorStrategy).toBe(strategy);
    }
    expect(executionSettingsSchema.safeParse({ errorStrategy: "ignore'\nprocess.x = 1" }).success).toBe(false);
  });

  it("keeps a failed run's cache unless asked", () => {
    const settings = executionSettingsSchema.parse({});
    expect(settings.errorStrategy).toBe("terminate");
    expect(settings.cleanupOnFailure).toBe(false);
  });
});
