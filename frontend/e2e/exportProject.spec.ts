import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import type { Download, Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { addNode, connect, expect, installNfCoreModule, moveNode, test } from "./fixtures";

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
    await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(6);

    const download = await exportProject(page);
    expect(download.suggestedFilename()).toBe("Demo_1_-_Text_basics.zip");
    const files = await unzip(download);

    expect(Object.keys(files).sort()).toEqual([
      "Demo_1_-_Text_basics/README.md",
      "Demo_1_-_Text_basics/inputs/sample.txt",
      "Demo_1_-_Text_basics/main.nf",
      "Demo_1_-_Text_basics/nextflow.config",
    ]);
    expect(files["Demo_1_-_Text_basics/main.nf"]).toContain("workflow {");
    expect(files["Demo_1_-_Text_basics/main.nf"]).not.toContain(
      "N-WAVE_NEXTFLOW_CONFIG"
    );
    expect(files["Demo_1_-_Text_basics/nextflow.config"]).toContain(
      "docker.enabled = true"
    );
    expect(files["Demo_1_-_Text_basics/README.md"]).toContain(
      "nextflow run main.nf -profile docker"
    );
    expect(files["Demo_1_-_Text_basics/inputs/sample.txt"]).toContain("Barry");
  });

  test("exports the run profiles of the Settings page for -profile", async ({ page }) => {
    await page.goto("./settings");
    await page.getByRole("button", { name: "SLURM cluster profile" }).click();
    const card = page.getByRole("listitem", { name: "Profile slurm" });
    await card.getByLabel("Partition (queue)").fill("short");
    await card.getByLabel("Name").fill("hpc");
    await page.getByRole("button", { name: "Save global settings" }).click();
    await expect(page.getByText(/^Saved\./)).toBeVisible();

    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Empty workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await addNode(page, "File Input");

    const files = await unzip(await exportProject(page));
    const [config] = Object.entries(files).find(([name]) => name.endsWith("/nextflow.config")) ?? [];
    const text = files[config ?? ""] ?? "";
    expect(text).toContain("  hpc {\n    process.executor = 'slurm'\n    process.queue = 'short'");
    expect(text).toContain("singularity.enabled = true");
    const readme = Object.entries(files).find(([name]) => name.endsWith("/README.md"))?.[1] ?? "";
    expect(readme).toContain("nextflow run main.nf -profile hpc");
  });

    test("keeps an uploaded .fastq.gz byte for byte, also after a reload", async ({ page }) => {
    const gzip = gzipSync("@read1\nACGTACGT\n+\nIIIIIIII\n");
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Empty workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const input = await addNode(page, "File Input");
    await input.dblclick();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add Files" }).click();
    await (await chooserPromise).setFiles({
      name: "reads.fastq.gz",
      mimeType: "application/gzip",
      buffer: gzip,
    });
    await expect(input).toContainText("1 file selected");

    const inputsOf = async () => {
      const entries = unzipSync(new Uint8Array(await readFile(await (await exportProject(page)).path())));
      const name = Object.keys(entries).find((entry) => entry.endsWith("/inputs/reads.fastq.gz"));
      return name ? Buffer.from(entries[name]) : undefined;
    };
    expect((await inputsOf())?.equals(gzip)).toBe(true);

    // Small files are saved with the workflow, as their bytes.
    await page.getByRole("button", { name: "Save Workflow" }).click();
    await page.reload();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    expect((await inputsOf())?.equals(gzip)).toBe(true);
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
    await page.getByRole("button", { name: "Empty workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const input = await addNode(page, "File Input");
    await moveNode(page, input, -350, 0);
    await input.locator('input[type="file"]').setInputFiles({
      name: "sample.fastq",
      mimeType: "text/plain",
      buffer: Buffer.from("@r1\nACGT\n+\nIIII\n"),
    });
    await installNfCoreModule(page, "nf-core/fastqc");
    const fastqc = await addNode(page, "fastqc");
    await connect(page, input, fastqc);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    const files = await unzip(await exportProject(page));
    const project = "Untitled_Workflow";

    expect(Object.keys(files).sort()).toEqual([
      `${project}/README.md`,
      `${project}/inputs/sample.fastq`,
      `${project}/main.nf`,
      `${project}/modules/nf-core/fastqc/.conda-lock/linux_amd64-bd-b342db7b694c9af4_1.txt`,
      `${project}/modules/nf-core/fastqc/.conda-lock/linux_arm64-bd-7c8a53b986d9a000_1.txt`,
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
