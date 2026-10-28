import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";

const slurm = { name: "cluster", executor: "slurm", containerEngine: "apptainer", queue: "short" };

describe("settings routes", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-settings-"));
    process.env.NWAVE_DATA_DIR = root;
  });
  afterEach(() => {
    Reflect.deleteProperty(process.env, "NWAVE_DATA_DIR");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("starts with the built-in run defaults", async () => {
    const response = await request(createApp()).get("/api/settings");
    expect(response.status).toBe(200);
    expect(response.body.runDefaults).toEqual({
      maxCpus: 4,
      maxMemory: "4.GB",
      timeoutMinutes: 0,
      resume: "after-failure",
      runProfiles: [],
    });
  });

  it("keeps saved run defaults in the data folder", async () => {
    const runDefaults = {
      maxCpus: 8,
      maxMemory: "16.GB",
      timeoutMinutes: 600,
      resume: "always",
      runProfiles: [slurm, { name: "aws", executor: "awsbatch", containerEngine: "docker" }],
      runProfile: "cluster",
    };
    const saved = await request(createApp()).put("/api/settings").send({ runDefaults });
    expect(saved.status).toBe(200);
    expect(saved.body.runDefaults).toEqual(runDefaults);
    expect((await request(createApp()).get("/api/settings")).body.runDefaults).toEqual(runDefaults);
    expect(JSON.parse(fs.readFileSync(path.join(root, "settings.json"), "utf8")).runDefaults).toEqual(
      runDefaults
    );
  });

  it("refuses defaults that don't fit", async () => {
    const app = createApp();
    const bad = [
      { maxCpus: 0 },
      { maxMemory: "lots" },
      { resume: "sometimes" },
      { runProfiles: [slurm, slurm] },
      { runProfile: "missing" },
      { runProfiles: [{ ...slurm, clusterOptions: "--x 'y'" }] },
    ];
    for (const runDefaults of bad) {
      const response = await request(app).put("/api/settings").send({ runDefaults });
      expect(response.status, JSON.stringify(runDefaults)).toBe(400);
    }
    expect(fs.existsSync(path.join(root, "settings.json"))).toBe(false);
  });

  it("answers the health check", async () => {
    expect((await request(createApp()).get("/api/health")).body).toEqual({ ok: true });
  });
});
