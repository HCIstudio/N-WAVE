import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "./fixtures";

interface ExampleNode {
  id: string;
  type: string;
  data: { label: string };
}
const example = JSON.parse(
  await readFile(
    new URL("../src/demo/rnaseqStarSalmonExample.json", import.meta.url),
    "utf8"
  )
) as { components: string[]; nodes: ExampleNode[]; edges: unknown[] };

const fixture = (name: string) =>
  readFile(new URL(`../src/test/fixtures/${name}`, import.meta.url), "utf8");

test.describe("RNA-seq (STAR + Salmon) example", () => {
  test("opens, installs its nf-core nodes, shows every node's code and exports", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Installing fetches main.nf files from nf-core/modules on GitHub: serve
    // the subworkflows (their includes are read) and stand-ins for modules.
    const subworkflows: Record<string, string> = {
      bam_sort_stats_samtools: await fixture(
        "nfcore-bam_sort_stats_samtools.main.nf"
      ),
      bam_stats_samtools: await fixture("nfcore-bam_stats_samtools.main.nf"),
    };
    await page.route("https://raw.githubusercontent.com/nf-core/modules/**", (route) => {
      const url = route.request().url();
      const subworkflow = url.match(/subworkflows\/nf-core\/([a-z_]+)\/main\.nf$/)?.[1];
      const module = url.match(/modules\/nf-core\/(.+)\/[^/]+$/)?.[1] ?? "module";
      route.fulfill({
        contentType: "text/plain",
        body:
          (subworkflow && subworkflows[subworkflow]) ||
          `process ${module.toUpperCase().replace(/\//g, "_")} {\n}\n`,
      });
    });

    await page.goto("./");
    await page.getByRole("link", { name: /RNA-seq \(STAR \+ Salmon\)/ }).click();
    await expect(page).toHaveURL(/builtin:rnaseq-star-salmon/);
    await expect(page.locator(".react-flow__node")).toHaveCount(
      example.nodes.length
    );
    await expect(page.locator(".react-flow__edge")).toHaveCount(
      example.edges.length
    );

    // Its nf-core modules aren't installed in a fresh browser yet.
    const banner = page.getByRole("alert", { name: "Missing nf-core components" });
    await expect(banner).toContainText(
      `uses ${example.components.length} nf-core components`
    );
    await expect(banner).toContainText("nf-core/star/align");
    await banner.getByRole("button", { name: "Install them" }).click();
    await expect(banner).toHaveCount(0, { timeout: 60_000 });

    // Every step shows the code it adds.
    for (const node of example.nodes.filter((candidate) => candidate.type !== "note")) {
      await page.locator(`[data-id="${node.id}"]`).dblclick();
      await page.getByRole("tab", { name: "Code" }).click();
      if (node.type === "samplesheet" || node.type === "parameters") {
        // Inputs become channels at the top of the script, not a process.
        await expect(
          page.getByText("This node doesn't generate a process.")
        ).toBeVisible();
      } else {
        await expect(
          page.getByLabel("Workflow code", { exact: true }),
          `${node.data.label} shows its workflow code`
        ).not.toBeEmpty();
      }
      await page.getByRole("button", { name: "Close Panel" }).first().click();
    }
    // Inspecting doesn't turn the example into an editable copy.
    await expect(page).toHaveURL(/builtin:rnaseq-star-salmon/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Project", exact: true }).click();
    const download = await downloadPromise;
    const files = Object.fromEntries(
      Object.entries(
        unzipSync(new Uint8Array(await readFile(await download.path())))
      ).map(([name, data]) => [name.replace(/^[^/]+\//, ""), strFromU8(data)])
    );
    for (const path of [
      "main.nf",
      "nextflow.config",
      "README.md",
      "inputs/samplesheet.csv",
      "modules/nf-core/star/align/main.nf",
      "modules/nf-core/salmon/quant/main.nf",
      "modules/nf-core/custom/gtffilter/main.nf",
      "modules/nf-core/multiqc/main.nf",
      "modules/nf-core/samtools/stats/main.nf",
      "subworkflows/nf-core/bam_sort_stats_samtools/main.nf",
      "subworkflows/nf-core/bam_stats_samtools/main.nf",
    ]) {
      expect(Object.keys(files), path).toContain(path);
    }
    expect(files["main.nf"]).toContain("include { STAR_ALIGN as ");
    expect(files["main.nf"]).toContain("qc_reports_reports = fastqc_raw_zip.mix(");
    expect(files["nextflow.config"]).toContain(
      "--quantTranscriptomeSAMoutput BanSingleEnd"
    );
    expect(files["nextflow.config"]).toContain(
      'path: { "${params.outdir}/multiqc" }'
    );
  });
});
