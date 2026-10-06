import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { addNode, connect, expect, moveNode, test } from "./fixtures";

const exportProject = async (page: Page): Promise<Download> => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Project" }).click();
  return downloadPromise;
};

const unzip = async (download: Download) => {
  const entries = unzipSync(
    new Uint8Array(await readFile(await download.path()))
  );
  return Object.fromEntries(
    Object.entries(entries).map(([name, data]) => [name, strFromU8(data)])
  );
};

test.describe("export project", () => {
  test("exports the demo workflow as a runnable project", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo Workflow/ }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(6);

    const download = await exportProject(page);
    expect(download.suggestedFilename()).toBe("Demo_Workflow.zip");
    const files = await unzip(download);

    expect(Object.keys(files).sort()).toEqual([
      "Demo_Workflow/README.md",
      "Demo_Workflow/inputs/sample.txt",
      "Demo_Workflow/main.nf",
      "Demo_Workflow/nextflow.config",
    ]);
    expect(files["Demo_Workflow/main.nf"]).toContain("workflow {");
    expect(files["Demo_Workflow/main.nf"]).not.toContain(
      "N-WAVE_NEXTFLOW_CONFIG"
    );
    expect(files["Demo_Workflow/nextflow.config"]).toContain(
      "docker.enabled = true"
    );
    expect(files["Demo_Workflow/README.md"]).toContain(
      "nextflow run main.nf -profile docker"
    );
    expect(files["Demo_Workflow/inputs/sample.txt"]).toContain("Barry");
  });

  test("includes the nf-core modules the workflow uses", async ({ page }) => {
    const githubRequests: string[] = [];
    await page.route("https://raw.githubusercontent.com/**", (route) => {
      const url = route.request().url();
      githubRequests.push(url);
      route.fulfill({
        contentType: "text/plain",
        body: url.endsWith("main.nf") ? "process FASTQC {\n}\n" : "name: fastqc\n",
      });
    });

    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const input = await addNode(page, "File Input");
    await moveNode(page, input, -350, 0);
    await input.locator('input[type="file"]').setInputFiles({
      name: "sample.fastq",
      mimeType: "text/plain",
      buffer: Buffer.from("@r1\nACGT\n+\nIIII\n"),
    });
    const fastqc = await addNode(page, "FastQC");
    await connect(page, input, fastqc);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    const files = await unzip(await exportProject(page));
    const project = "Untitled_Workflow";

    expect(Object.keys(files).sort()).toEqual([
      `${project}/README.md`,
      `${project}/inputs/sample.fastq`,
      `${project}/main.nf`,
      `${project}/modules/nf-core/fastqc/environment.yml`,
      `${project}/modules/nf-core/fastqc/main.nf`,
      `${project}/modules/nf-core/fastqc/meta.yml`,
      `${project}/nextflow.config`,
    ]);
    expect(files[`${project}/main.nf`]).toMatch(
      /include \{ FASTQC as \w+ \} from '\.\/modules\/nf-core\/fastqc\/main'/
    );
    expect(files[`${project}/modules/nf-core/fastqc/main.nf`]).toContain(
      "process FASTQC"
    );
    // Module files come from nf-core/modules at the catalog's pinned commit.
    expect(githubRequests).toContainEqual(
      expect.stringMatching(
        /^https:\/\/raw\.githubusercontent\.com\/nf-core\/modules\/[0-9a-f]{40}\/modules\/nf-core\/fastqc\/main\.nf$/
      )
    );
  });
});
