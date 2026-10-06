import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";

const app = createApp();

describe("GET /api/nfcore/modules/source", () => {
  it("returns the main.nf of a bundled module", async () => {
    const response = await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/fastqc" })
      .expect(200);
    expect(response.body.id).toBe("nf-core/fastqc");
    expect(response.body.source).toMatch(/process FASTQC \{/);
  });

  it("reports modules that are not installed", async () => {
    await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/samtools/sort" })
      .expect(404);
  });

  it.each(["fastqc", "nf-core/../../etc", "nf-core/fastqc/../x", ""])(
    "rejects invalid id %j",
    async (id) => {
      await request(app)
        .get("/api/nfcore/modules/source")
        .query({ id })
        .expect(400);
    }
  );
});
