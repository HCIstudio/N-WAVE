import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { addNode, connect, expect, moveNode, test } from "./fixtures";

test.describe("parameters node", () => {
  test("declares params and connects a reference file", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const params = await addNode(page, "Parameters");
    await moveNode(page, params, -350, 0);
    await expect(params).toContainText("No parameters yet");

    await params.dblclick();
    await page.getByRole("button", { name: "Add parameter" }).click();
    await page.getByLabel("Name", { exact: true }).first().fill("genome_name");
    await page.getByLabel("Value", { exact: true }).fill("R64-1-1");

    await page.getByRole("button", { name: "Add reference file" }).click();
    await page.getByLabel("Name", { exact: true }).nth(1).fill("fasta");
    const reference = page.getByLabel("File, path or URL");
    await reference.fill("genome.fa");
    // Not uploaded and not a path or URL: the panel warns.
    await expect(page.getByText(/"genome\.fa" isn't uploaded/)).toBeVisible();
    await reference.fill("https://example.org/genome.fa");
    await expect(page.getByText(/isn't uploaded/)).toHaveCount(0);
    await expect(params).toContainText("1 parameter, 1 reference");
    await page.getByRole("button", { name: "Close Panel" }).click();

    // The reference is an output port other nodes connect to.
    const output = await addNode(page, "Display Output");
    await moveNode(page, output, 150, 0);
    await connect(page, params, output);
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
    expect(files[`${project}/main.nf`]).toContain(
      "params.fasta = 'https://example.org/genome.fa'"
    );
    expect(files[`${project}/main.nf`]).toMatch(/\w+_fasta = Channel\.of\(nwaveInputFile\(params\.fasta\)\)/);
    expect(files[`${project}/nextflow.config`]).toMatch(
      /params \{\n {2}genome_name = 'R64-1-1'\n {2}fasta = 'https:\/\/example\.org\/genome\.fa'\n\}/
    );
  });
});
