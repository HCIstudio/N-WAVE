import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

// The canvas overview: the minimap, and the steps inside subworkflow and
// pipeline nodes (read from GitHub, served here from the test fixtures).
const fixture = (name: string) => readFileSync(new URL(`../src/test/fixtures/${name}`, import.meta.url), "utf8");

test("shows the minimap above the zoom buttons, unless it is switched off", async ({ page }) => {
  await page.goto("./workflow/builtin:demo-basic");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  const minimap = page.locator(".react-flow__minimap");
  await expect(minimap).toBeVisible();
  await expect(minimap.locator(".react-flow__minimap-node")).toHaveCount(6);
  // Bottom left, just above the zoom buttons.
  const map = await minimap.boundingBox();
  const fit = await page.getByRole("button", { name: "Fit view" }).boundingBox();
  expect(map && fit && map.x <= fit.x + 4 && map.y + map.height <= fit.y).toBe(true);
  await expect(page.getByRole("button", { name: "Minimap" })).toHaveCount(0);

  await page.goto("./settings");
  await page.getByRole("region", { name: "Features" }).getByRole("checkbox", { name: /^Minimap/ }).uncheck();
  await page.goto("./workflow/builtin:demo-basic");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await expect(page.locator(".react-flow__minimap")).toHaveCount(0);
});

test("opens the steps inside a subworkflow node, and the subworkflows inside it", async ({ page }) => {
  await page.route("https://raw.githubusercontent.com/nf-core/modules/**", (route) => {
    const url = route.request().url();
    const body = url.endsWith("subworkflows/nf-core/bam_sort_stats_samtools/main.nf")
      ? fixture("nfcore-bam_sort_stats_samtools.main.nf")
      : url.endsWith("subworkflows/nf-core/bam_stats_samtools/main.nf")
        ? fixture("nfcore-bam_stats_samtools.main.nf")
        : "process STAND_IN {\n}\n";
    return route.fulfill({ contentType: "text/plain", body });
  });
  await page.goto("./workflow/builtin:rnaseq-star-salmon");
  const subworkflow = page.locator('[data-id="bam_sort_stats"]');
  // Drawn as a stack: it holds several steps.
  await expect(subworkflow.getByTestId("node-stack")).toHaveCount(1);
  // Its components aren't installed: the cards behind are red like the node.
  await expect(subworkflow.getByTestId("node-stack")).toHaveAttribute("data-tone", "error");
  // The node itself has the same border as the cards behind it.
  await expect(subworkflow.locator("> div").first()).toHaveClass(/border-2 .*border-red-500|border-red-500.*border-2/);
  await subworkflow.getByRole("button", { name: "Step in: show the steps inside “SAMtools sort, index, stats”" }).click();

  const view = page.getByRole("dialog", { name: "SAMtools sort, index, stats" });
  await expect(view.getByText("SAMTOOLS_SORT", { exact: true })).toBeVisible();
  await expect(view.getByText("SAMTOOLS_INDEX", { exact: true })).toBeVisible();
  await view.getByRole("button", { name: /^BAM_STATS_SAMTOOLS/ }).click();

  const inner = page.getByRole("dialog", { name: "BAM_STATS_SAMTOOLS" });
  await expect(inner.getByText("SAMTOOLS_FLAGSTAT", { exact: true })).toBeVisible();
  const breadcrumb = inner.getByRole("navigation", { name: "Breadcrumb" });
  await breadcrumb.getByRole("button", { name: "SAMtools sort, index, stats" }).click();
  await expect(page.getByRole("dialog", { name: "SAMtools sort, index, stats" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("opens the steps inside nf-core/rnaseq as a pipeline node", async ({ page }) => {
  const served: string[] = [];
  await page.route("https://raw.githubusercontent.com/nf-core/rnaseq/**", (route) => {
    const url = route.request().url();
    served.push(url.replace(/^.*\/nf-core\/rnaseq\/[^/]+\//, ""));
    if (url.endsWith("/workflows/rnaseq/main.nf")) {
      return route.fulfill({ contentType: "text/plain", body: fixture("nested/rnaseq-workflow.nf") });
    }
    if (url.endsWith("/main.nf")) return route.fulfill({ contentType: "text/plain", body: fixture("nested/rnaseq-main.nf") });
    return route.continue();
  });
  await page.goto("./workflow/builtin:rnaseq-pipeline");
  await page.getByRole("button", { name: /^Step in: show the steps inside/ }).click();

  const view = page.getByRole("dialog");
  await expect(view.getByRole("button", { name: /^PREPARE_GENOME_INDICES/ })).toBeVisible();
  await view.getByRole("button", { name: /^RNASEQ/ }).click();
  await expect(view.getByRole("button", { name: /^ALIGN_STAR/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /^QUANTIFY_PSEUDO_ALIGNMENT/ })).toBeVisible();
  await expect(view.getByRole("navigation", { name: "Breadcrumb" })).toContainText("RNASEQ");
  expect(served).toEqual(["main.nf", "workflows/rnaseq/main.nf"]);

  await view.getByRole("button", { name: "Close the steps inside" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
