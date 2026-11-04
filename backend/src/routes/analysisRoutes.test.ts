import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";

const app = createApp();

describe("/api/analysis/bioflow", () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.NWAVE_BIOFLOW;
    process.env.NWAVE_BIOFLOW = "off";
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.NWAVE_BIOFLOW;
    else process.env.NWAVE_BIOFLOW = previous;
  });

  it("says when the analysis isn't available", async () => {
    const response = await request(app).get("/api/analysis/bioflow").expect(200);
    expect(response.body).toMatchObject({ available: false });
    const analysis = await request(app).post("/api/analysis/bioflow").send({ nextflowScript: "workflow {}" }).expect(503);
    expect(analysis.body.message).toContain("switched off");
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
