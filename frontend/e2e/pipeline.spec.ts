import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { addNode, connect, expect, moveNode, test } from "./fixtures";

test.describe("nf-core pipeline node", () => {
  test("builds the settings from the pipeline schema and exports the launch", async ({
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
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const sheet = await addNode(page, "Samplesheet");
    await moveNode(page, sheet, -350, 0);
    const pipeline = await addNode(page, "nf-core Pipeline");
    await expect(pipeline).toContainText("nf-core/rnaseq 3.27.0");

    await pipeline.dblclick();
    const problems = page.getByLabel("Pipeline problems");
    await expect(problems).toContainText(
      "Connect a samplesheet to the pipeline's input"
    );
    // Groups, enums and help text come from nextflow_schema.json.
    await expect(page.getByText("Alignment options")).toBeVisible();
    await page.getByLabel("Filter parameters").fill("aligner");
    await page.getByLabel("--aligner", { exact: true }).selectOption("hisat2");
    await page.getByLabel("--pseudo_aligner", { exact: true }).selectOption("salmon");
    await page.getByLabel("Filter parameters").fill("skip_trimming");
    await page.getByLabel("--skip_trimming", { exact: true }).check();

    await page.getByLabel(/test profile/).check();
    await expect(problems).toHaveCount(0);
    await expect(page.getByLabel("Launch command", { exact: true })).toContainText(
      "nextflow run nf-core/rnaseq -r 3.27.0 -profile test,docker -params-file params.json --outdir results"
    );
    await expect(page.getByLabel("Params file", { exact: true })).toContainText(
      '"aligner": "hisat2"'
    );
    await expect(page.getByText(/The demo can't run pipelines/)).toBeVisible();
    await page.keyboard.press("Escape");

    // The samplesheet feeds --input.
    await connect(page, sheet, pipeline);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Project" }).click();
    const download = await downloadPromise;
    const files = Object.fromEntries(
      Object.entries(
        unzipSync(new Uint8Array(await readFile(await download.path())))
      ).map(([name, data]) => [name, strFromU8(data)])
    );
    const project = "Untitled_Workflow";
    expect(Object.keys(files).sort()).toEqual([
      `${project}/README.md`,
      `${project}/inputs/samplesheet.csv`,
      `${project}/params.json`,
      `${project}/run.sh`,
    ]);
    expect(JSON.parse(files[`${project}/params.json`])).toEqual({
      aligner: "hisat2",
      pseudo_aligner: "salmon",
      skip_trimming: true,
      input: "inputs/samplesheet.csv",
    });
    expect(files[`${project}/run.sh`]).toContain(
      "nextflow run nf-core/rnaseq -r 3.27.0 -profile test,docker -params-file params.json --outdir results"
    );
  });
});
