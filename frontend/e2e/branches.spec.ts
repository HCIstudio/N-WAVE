import { readFile } from "node:fs/promises";
import { STRUCTURE_SCRIPT } from "../src/courses/courseWorkflows";
import { exportAs, expect, test } from "./fixtures";

// An imported if/else: a Branch node, its arms' steps in lanes, the dashed
// lines from its parameter and to its steps, and the preview of which arm runs.
test("an if/else imports as a branch that the parameter switches", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Import Workflow" }).click();
  await page.getByLabel("Nextflow File, Project Zip, Folder or DAW Model").setInputFiles({
    name: "two-aligners.nf",
    mimeType: "text/plain",
    buffer: Buffer.from(STRUCTURE_SCRIPT),
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/workflow\//);

  const branch = page.locator("[data-branch]");
  await expect(branch).toContainText("params.aligner == 'star'");
  await expect(branch).toContainText("Chosen by the parameter aligner");
  await expect(branch.locator("[data-branch-now]")).toHaveAttribute("data-branch-now", "if");
  await expect(page.locator('[data-branch-lane="if"]')).toBeVisible();
  await expect(page.locator('[data-branch-lane="else"]')).toBeVisible();
  // To each arm's step, and from the Parameters node.
  await expect(page.locator('[data-derived="branch"]')).toHaveCount(2);
  await expect(page.locator('[data-derived="branch-params"]')).toHaveCount(1);
  const runs = (id: string) => page.locator(`.react-flow__node[data-id="${id}"] [data-runs]`);
  await expect(runs("n-align_star")).toHaveAttribute("data-runs", "true");
  await expect(runs("n-align_hisat")).toHaveAttribute("data-runs", "false");
  // The report reads whichever ran: no problem for its two connections.
  await expect(page.getByRole("button", { name: /^Workflow check/ })).toHaveAttribute(
    "aria-label",
    "Workflow check: No problems found",
  );

  // The other aligner.
  await page.locator('.react-flow__node[data-id="n-params"]').dblclick();
  await page.getByLabel("Value").first().fill("hisat2");
  await expect(branch.locator("[data-branch-now]")).toHaveAttribute("data-branch-now", "else");
  await expect(runs("n-align_star")).toHaveAttribute("data-runs", "false");
  await expect(runs("n-align_hisat")).toHaveAttribute("data-runs", "true");
  await page.getByRole("button", { name: "Close Panel" }).click();

  // Written back as the if/else.
  const download = page.waitForEvent("download");
  await exportAs(page, "Download script");
  const script = await readFile(await (await download).path(), "utf8");
  expect(script).toContain("if (params.aligner == 'star') {");
  expect(script).toContain("ch_aligned = ALIGN_HISAT.out");
  expect(script).toContain("REPORT(ch_aligned, QC.out)");
});
