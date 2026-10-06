import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { addNode, connect, expect, moveNode, test } from "./fixtures";

test.describe("samplesheet node", () => {
  test("parses, validates and exports a samplesheet", async ({ page }) => {
    await page.route("https://raw.githubusercontent.com/**", (route) =>
      route.fulfill({ contentType: "text/plain", body: "process FASTQC {\n}\n" })
    );
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const input = await addNode(page, "File Input");
    await moveNode(page, input, -450, -200);
    await input.locator('input[type="file"]').setInputFiles([
      { name: "a_R1.fastq", mimeType: "text/plain", buffer: Buffer.from("@r\nA\n+\nI\n") },
      { name: "a_R2.fastq", mimeType: "text/plain", buffer: Buffer.from("@r\nA\n+\nI\n") },
    ]);

    const sheet = await addNode(page, "Samplesheet");
    await moveNode(page, sheet, -350, 100);
    await expect(sheet).toContainText("No samples yet");

    await sheet.dblclick();
    const csv = page.getByLabel("Samplesheet (CSV)");
    await csv.fill(
      "sample,fastq_1,fastq_2,strandedness\na,a_R1.fastq,a_R2.fastq,reverse\nb,b.fastq,,auto\n"
    );
    // b.fastq isn't uploaded: the panel says so and the node shows it.
    await expect(page.getByLabel("Samplesheet problems")).toContainText(
      '"b.fastq" (line 3) isn\'t uploaded'
    );
    await expect(sheet).toContainText("1 problem to fix");

    await csv.fill(
      "sample,fastq_1,fastq_2,strandedness\na,a_R1.fastq,a_R2.fastq,reverse\nc,https://example.org/c.fastq.gz,,auto\n"
    );
    const preview = page.getByRole("table", { name: "Parsed samples" });
    await expect(preview).toContainText("paired-end");
    await expect(preview).toContainText("single-end");
    await expect(preview).toContainText("reverse");
    await expect(sheet).toContainText("2 samples, 1 paired-end");
    await page.getByRole("button", { name: "Close Panel" }).click();

    const fastqc = await addNode(page, "FastQC");
    await moveNode(page, fastqc, 100, 100);
    await connect(page, sheet, fastqc);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Project" }).click();
    const entries = unzipSync(
      new Uint8Array(await readFile(await (await downloadPromise).path()))
    );
    const files = Object.fromEntries(
      Object.entries(entries).map(([name, data]) => [name, strFromU8(data)])
    );
    const project = "Untitled_Workflow";
    expect(files[`${project}/inputs/samplesheet.csv`]).toContain(
      "c,https://example.org/c.fastq.gz,,auto"
    );
    expect(files[`${project}/main.nf`]).toMatch(
      /params\.samplesheet_\w+ = "\$\{params\.inputdir\}\/samplesheet\.csv"/
    );
    expect(files[`${project}/main.nf`]).toContain(".splitCsv(header: true, strip: true)");
  });
});
