import type { Locator, Page } from "@playwright/test";
import { canvasSettled, expect, test } from "./fixtures";

const handle = (page: Page, nodeId: string, type: "source" | "target", name: string): Locator =>
  page.locator(`[data-id="${nodeId}"] .react-flow__handle.${type}[data-handleid="${name}"]`);

const center = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("handle is not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.describe("connection hints", () => {
  test("mark the inputs that fit while dragging, and warn on a mismatched connection", async ({ page }) => {
    test.setTimeout(120_000);
    // Installing fetches each module's main.nf from GitHub: serve stand-ins.
    await page.route("https://raw.githubusercontent.com/nf-core/modules/**", (route) =>
      route.fulfill({ contentType: "text/plain", body: "process STAND_IN {\n}\n" }),
    );
    await page.goto("./workflow/builtin:rnaseq-star-salmon");
    const banner = page.getByRole("alert", { name: "Missing nf-core components" });
    await banner.getByRole("button", { name: "Install them" }).click();
    await expect(banner).toHaveCount(0, { timeout: 60_000 });
    // The example's own connections all fit.
    await expect(page.getByRole("button", { name: /^Connection warning/ })).toHaveCount(0);
    await canvasSettled(page);

    // Dragging the genome FASTA: STAR index's fasta input fits, its gtf doesn't.
    const from = await center(handle(page, "reference", "source", "fasta"));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 40, { steps: 5 });
    await expect(handle(page, "star_index", "target", "fasta")).toHaveAttribute("data-fit", "fits");
    await expect(handle(page, "star_index", "target", "gtf")).toHaveAttribute("data-fit", "mismatch");
    await expect(handle(page, "star_index", "target", "gtf")).toHaveAttribute(
      "title",
      /expects annotation \(GTF\/GFF\).*gives FASTA sequences/,
    );
    await page.mouse.up();

    // Connect reads where STAR index expects the genome (in an editable copy).
    const connectReadsToGenome = async () => {
      await canvasSettled(page);
      const reads = await center(handle(page, "samples", "source", "samples"));
      const genome = await center(handle(page, "star_index", "target", "fasta"));
      await page.mouse.move(reads.x, reads.y);
      await page.mouse.down();
      await page.mouse.move(genome.x, genome.y, { steps: 15 });
      await page.mouse.up();
    };
    await connectReadsToGenome();
    await page.getByRole("dialog", { name: "Make your own copy to edit" }).getByRole("button", { name: "Make a copy" }).click();
    await expect(page).not.toHaveURL(/builtin:rnaseq-star-salmon/);
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await connectReadsToGenome();

    // The connection is made, with a warning that says what fits instead.
    const warning = page.getByRole("button", { name: /^Connection warning: “STAR index” expects FASTA sequences/ });
    await expect(warning).toHaveCount(1);
    await warning.click();
    await expect(page.getByRole("note")).toContainText("reference from a Parameters node");
    // The workflow check lists it as a warning; the run isn't blocked by it.
    await page.getByRole("button", { name: /^Workflow check:/ }).click();
    await expect(page.getByRole("region", { name: "Workflow check" })).toContainText(
      "“Samplesheet” gives FASTQ reads",
    );
  });
});
