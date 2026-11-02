import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

// The canvas overview: the minimap, and the steps inside subworkflow and
// pipeline nodes (read from GitHub, served here from the test fixtures).
const fixture = (name: string) => readFileSync(new URL(`../src/test/fixtures/${name}`, import.meta.url), "utf8");

test("the minimap can be shown and stays as chosen", async ({ page }) => {
  await page.goto("./workflow/builtin:demo-basic");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  const toggle = page.getByRole("button", { name: "Minimap" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".react-flow__minimap")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const minimap = page.locator(".react-flow__minimap");
  await expect(minimap).toBeVisible();
  await expect(minimap.locator(".react-flow__minimap-node")).toHaveCount(6);

  await page.reload();
  await expect(page.locator(".react-flow__minimap")).toBeVisible();
  await page.getByRole("button", { name: "Minimap" }).click();
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
  await page.getByRole("button", { name: "Show the steps inside “SAMtools sort, index, stats”" }).click();

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
  await page.getByRole("button", { name: /^Show the steps inside/ }).click();

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
