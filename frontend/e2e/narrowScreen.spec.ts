import { expect, test } from "./fixtures";

// On a narrow window the bottom bar moves up a row: it covers none of the
// canvas controls or the Runs bar, and they all stay usable.
test("the canvas controls and the bottom bar don't cover each other on a narrow window", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await page.goto("./workflow/builtin:demo-basic");
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  const bar = page.locator("[data-tutorial-bottom-bar]");
  await expect(bar).toHaveAttribute("data-row", "above");

  for (const name of ["Fit view", "Zoom in", "Keyboard shortcuts", "Export", "Run Workflow"]) {
    const button = page.getByRole("button", { name, exact: true });
    const box = await button.boundingBox();
    if (!box) throw new Error(`${name} is not visible`);
    // What is drawn at the button's centre is the button itself.
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(onTop, name).toBe(name);
  }

  // Wide enough, it is back in the bottom row.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(bar).toHaveAttribute("data-row", "bottom");
});
