import { readFile } from "node:fs/promises";
import { BRANCHES_SCRIPT, STRUCTURE_SCRIPT } from "../src/courses/courseWorkflows";
import { addNode, canvasSettled, connectHandles, exportAs, expect, test } from "./fixtures";

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
  await expect(branch).toHaveAttribute("data-branch-now", "if");
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
  await expect(branch).toHaveAttribute("data-branch-now", "else");
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

const importScript = async (page: import("@playwright/test").Page, name: string, source: string) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Import Workflow" }).click();
  await page.getByLabel("Nextflow File, Project Zip, Folder or DAW Model").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/workflow\//);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await canvasSettled(page);
};
const fixture = (name: string) => readFile(new URL(`../src/workflows/import/fixtures/branches/${name}`, import.meta.url), "utf8");

// if / else if / else: one Branch with three arms; a switch the same, with a warning.
test("else if and switch import as one branch with an arm each", async ({ page }) => {
  await importScript(page, "aligner-chain.nf", await fixture("aligner-chain.nf"));
  const branch = page.locator("[data-branch]");
  await expect(branch.locator("[data-arm]")).toHaveCount(3);
  await expect(page.locator('[data-branch-lane="else-if-1"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /^Workflow check/ })).toHaveAttribute("aria-label", "Workflow check: No problems found");

  // An arm added and removed in the panel.
  await page.locator(".react-flow__node:has([data-branch])").dblclick();
  await page.getByRole("button", { name: "Add else if" }).click();
  await expect(branch.locator("[data-arm]")).toHaveCount(4);
  await page.getByLabel("Parameter of the else if arm").last().selectOption("aligner");
  await page.getByLabel("Value of the else if arm").last().fill("bwa");
  await expect(branch).toContainText("params.aligner == 'bwa'");
  await page.getByRole("button", { name: "Remove the condition else if params.aligner == 'bwa'" }).click();
  await expect(branch.locator("[data-arm]")).toHaveCount(3);
  await page.getByRole("button", { name: "Close Panel" }).click();

  await importScript(page, "switch.nf", await fixture("switch.nf"));
  await expect(page.getByText("Nextflow's strict syntax has no switch")).toBeVisible();
  await expect(page.locator("[data-branch] [data-arm]")).toHaveCount(3);
  await expect(page.locator("[data-branch]")).toContainText("params.aligner == 'hisat2' || params.aligner == 'hisat'");
});

// A switch from the + menu: a parameter, a value per arm, written as if / else if.
test("a switch built from the + menu chooses a step by a parameter's value", async ({ page }) => {
  await importScript(page, "two-aligners.nf", BRANCHES_SCRIPT);
  const check = page.getByRole("button", { name: /^Workflow check/ });
  await expect(check).toHaveAttribute("aria-label", /^Workflow check: 1 problem to fix/);

  await addNode(page, "Switch on a parameter");
  await page.keyboard.press("Escape");
  const branch = page.locator(".react-flow__node:has([data-branch])");
  await branch.dblclick();
  await page.getByLabel("Parameter").selectOption("aligner");
  await page.getByRole("textbox", { name: "Value 1" }).fill("star");
  await page.getByRole("textbox", { name: "Value 2" }).fill("hisat2");
  await page.getByRole("button", { name: "Close Panel" }).click();
  await expect(branch.locator("[data-arm]")).toHaveCount(3);
  await expect(branch).toContainText("params.aligner == 'hisat2'");

  // Inputs can't go into an arm: Parameters has no arm handle at all; steps do.
  const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
  await expect(node("n-params").locator('.react-flow__handle[data-handleid="branch"]')).toHaveCount(0);
  const arm = (handle: string, id: string) =>
    connectHandles(page, branch.locator(`.react-flow__handle[data-handleid="${handle}"]`), node(id).locator('.react-flow__handle[data-handleid="branch"]'));
  await arm("if", "n-align_star");
  await arm("else-if-1", "n-align_hisat");
  await expect(page.locator('[data-branch-lane="else-if-1"]')).toBeVisible();
  await expect(check).toHaveAttribute("aria-label", "Workflow check: No problems found");
  await expect(branch.locator("[data-branch-now]")).toHaveAttribute("data-branch-now", "if");

  const download = page.waitForEvent("download");
  await exportAs(page, "Download script");
  const script = await readFile(await (await download).path(), "utf8");
  expect(script).toContain("if (params.aligner == 'star') {");
  expect(script).toContain("} else if (params.aligner == 'hisat2') {");
  expect(script).not.toContain("switch");
});

// Drawing an arm's line: the tops of the steps light up, their data ports are unavailable,
// no text gets selected, and a drop on a data port puts nothing in the arm.
test("an arm's line goes to the top of a step, not to its data ports", async ({ page }) => {
  await importScript(page, "two-aligners.nf", BRANCHES_SCRIPT);
  await addNode(page, "If / else");
  await page.keyboard.press("Escape");
  const branch = page.locator(".react-flow__node:has([data-branch])");
  const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
  const exit = branch.locator('.react-flow__handle[data-handleid="if"]');
  const drag = async (to: import("@playwright/test").Locator, finish: (page: import("@playwright/test").Page) => Promise<void>) => {
    // A node just added out of view makes the canvas zoom out to it, shortly after.
    await page.waitForTimeout(100);
    await canvasSettled(page);
    const from = await exit.boundingBox();
    const target = await to.boundingBox();
    if (!from || !target) throw new Error("handles are not visible");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await finish(page);
    await page.mouse.up();
  };

  // On a data port: nothing joins the arm.
  await drag(node("n-align_star").locator('.react-flow__handle[data-handleid="reads"]'), async () => {
    await expect(branch.locator('[data-arm="if"]')).toHaveAttribute("data-drawing", "true");
    await expect(node("n-align_star").locator('.react-flow__handle[data-handleid="branch"]')).toHaveAttribute("data-arm-target", "fits");
    await expect(node("n-align_star")).toContainText("Into the if arm");
    await expect(node("n-align_star").locator('.react-flow__handle[data-handleid="reads"]')).toHaveAttribute("data-unavailable", "true");
    await expect(node("n-trim").locator(".react-flow__handle.source").first()).toHaveAttribute("data-unavailable", "true");
    // Nothing on the page is selected (it used to turn the canvas blue).
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
  });
  await expect(page.locator('[data-branch-lane="if"]')).toHaveCount(0);

  // On the top of the step: it joins the arm.
  await drag(node("n-align_star").locator('.react-flow__handle[data-handleid="branch"]'), async () => {});
  await expect(page.locator('[data-branch-lane="if"]')).toBeVisible();
  await expect(node("n-align_star").locator('.react-flow__handle[data-handleid="reads"]')).not.toHaveAttribute("data-unavailable", "true");
});

// The condition as a form, and a parameter made right there when the workflow has none.
test("a condition is chosen in a form, with a new parameter added in place", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New Workflow" }).click();
  await page.getByRole("button", { name: "Empty workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\//);
  await addNode(page, "If / else");
  await page.keyboard.press("Escape");
  const branch = page.locator(".react-flow__node:has([data-branch])");
  await branch.dblclick();
  await expect(page.getByText("No parameters yet")).toBeVisible();
  await page.getByLabel("Parameter of the if arm").selectOption({ label: "New parameter…" });
  await page.getByLabel(/^Name/).fill("min_depth");
  await page.getByLabel("Its value is").selectOption("number");
  await page.getByLabel(/^Value for now/).fill("10");
  await page.getByRole("button", { name: "Add parameter" }).click();
  await page.getByLabel("Comparison of the if arm").selectOption("gt");
  await page.getByLabel("Value of the if arm").fill("5");
  await page.getByRole("button", { name: "Close Panel" }).click();
  // The Parameters node was made, and the branch reads it: 10 > 5, so the if arm runs.
  await expect(page.locator('.react-flow__node[data-id^="node-"]').filter({ hasText: "Parameters" })).toHaveCount(1);
  await expect(branch).toContainText("params.min_depth > 5");
  await expect(branch.locator("[data-branch-now]")).toHaveAttribute("data-branch-now", "if");

  // Anything else is code.
  await branch.dblclick();
  await page.getByRole("button", { name: "Write it as code" }).click();
  await page.getByLabel("Condition of the if arm, as code").fill("params.min_depth > 5 && params.min_depth < 20");
  await expect(page.getByRole("button", { name: "Use the form" })).toBeDisabled();
});
