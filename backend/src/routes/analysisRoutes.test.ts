import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";

const app = createApp();

describe("/api/analysis/bioflow", () => {
  const previous: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const name of ["NWAVE_BIOFLOW", "NWAVE_LINT"]) {
      previous[name] = process.env[name];
      process.env[name] = "off";
    }
  });
  afterEach(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("says when the analysis isn't available", async () => {
    const response = await request(app).get("/api/analysis/bioflow").expect(200);
    expect(response.body).toMatchObject({ available: false });
    const analysis = await request(app).post("/api/analysis/bioflow").send({ nextflowScript: "workflow {}" }).expect(503);
    expect(analysis.body.message).toContain("switched off");
  });

  it("POST /api/analysis says for each tool why it didn't run", async () => {
    const status = await request(app).get("/api/analysis").expect(200);
    expect(status.body.lint).toMatchObject({ available: false });
    expect(status.body.bioflow).toMatchObject({ available: false });
    const response = await request(app).post("/api/analysis").send({ nextflowScript: "workflow {}" }).expect(200);
    expect(response.body.lint).toEqual({ status: "unavailable", reason: expect.stringContaining("NWAVE_LINT=off") });
    expect(response.body.bioflow).toEqual({ status: "unavailable", reason: expect.stringContaining("NWAVE_BIOFLOW=off") });
    await request(app).post("/api/analysis").send({}).expect(400);
  });

  it("requires a script", async () => {
    await request(app).post("/api/analysis/bioflow").send({}).expect(400);
  });

  it.each(["../x.nf", "/abs.nf", "a\\b.nf", "a/../b.nf"])("refuses the file %s", async (file) => {
    const response = await request(app)
      .post("/api/analysis/bioflow")
      .send({ nextflowScript: "workflow {}", files: { [file]: "" } })
      .expect(400);
    expect(response.body.details.join(" ")).toContain("inside the project");
  });
});
