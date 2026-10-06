import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { addNode, expect, test } from "./fixtures";

const REFERENCE =
  "https://raw.githubusercontent.com/nf-core/test-datasets/626c8fab639062eade4b10747e919341cbf9b41a/reference";

test.describe("nf-core/rnaseq example", () => {
  test("opens with its notes and exports a runnable launch", async ({
    page,
  }) => {
    // The demo fetches the schema from GitHub; serve rnaseq's.
    const schema = await readFile(
      new URL(
        "../src/test/fixtures/nfcore-rnaseq-3.27.0.nextflow_schema.json",
        import.meta.url
      ),
      "utf8"
    );
    await page.route(
      "https://raw.githubusercontent.com/nf-core/rnaseq/3.27.0/nextflow_schema.json",
      (route) => route.fulfill({ contentType: "application/json", body: schema })
    );

    await page.goto("./");
    await page.getByRole("link", { name: /nf-core\/rnaseq Example/ }).click();
    await expect(page).toHaveURL(/builtin:rnaseq-pipeline/);
    await expect(page.locator(".react-flow__node")).toHaveCount(9);
    await expect(page.locator(".react-flow__edge")).toHaveCount(3);
    await expect(page.locator(".react-flow__node-note")).toHaveCount(6);
    await expect(
      page.getByText("Start here: nf-core/rnaseq example")
    ).toBeVisible();
    await expect(page.locator(".react-flow__node-samplesheet")).toContainText(
      "7 samples, 4 paired-end"
    );

    // The pipeline is set to rnaseq 3.27.0 with the test profile.
    await page.locator(".react-flow__node-pipeline").dblclick();
    await expect(page.getByLabel(/test profile/)).toBeChecked();
    await expect(page.getByLabel("Pipeline problems")).toHaveCount(0);
    await expect(page.getByLabel("Launch command", { exact: true })).toContainText(
      "nextflow run nf-core/rnaseq -r 3.27.0 -profile test,docker -params-file params.json --outdir results"
    );
    await page.keyboard.press("Escape");
    // Inspecting doesn't turn the example into a copy.
    await expect(page).toHaveURL(/builtin:rnaseq-pipeline/);

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export Project", exact: true })
      .click();
    const download = await downloadPromise;
    const files = Object.fromEntries(
      Object.entries(
        unzipSync(new Uint8Array(await readFile(await download.path())))
      ).map(([name, data]) => [name.replace(/^[^/]+\//, ""), strFromU8(data)])
    );
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "inputs/samplesheet.csv",
      "params.json",
      "run.sh",
    ]);
    expect(JSON.parse(files["params.json"])).toEqual({
      input: "inputs/samplesheet.csv",
      fasta: `${REFERENCE}/genome.fasta`,
      gtf: `${REFERENCE}/genes_with_empty_tid.gtf.gz`,
    });
    expect(files["inputs/samplesheet.csv"]).toContain(
      "WT_REP1,https://raw.githubusercontent.com/nf-core/test-datasets/rnaseq/testdata/GSE110004/SRR6357070_1.fastq.gz"
    );
    expect(files["run.sh"]).toContain(
      "nextflow run nf-core/rnaseq -r 3.27.0 -profile test,docker -params-file params.json --outdir results"
    );
  });

  test("notes can be added to any workflow", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const note = await addNode(page, "Note");
    await expect(note).toContainText("Double-click to write a note.");
    await note.dblclick();
    await page.getByLabel("Note text").fill("Reads go in here.");
    await page.keyboard.press("Escape");
    await expect(note).toContainText("Reads go in here.");
    await expect(note.locator(".react-flow__handle")).toHaveCount(0);
  });
});
