import { addNode, connect, expect, test } from "./fixtures";

test.describe("a new workflow", () => {
  test("places nodes side by side, connects an empty File Input and goes home", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const input = await addNode(page, "File Input");
    const filter = await addNode(page, "Filter");
    const merge = await addNode(page, "Merge");

    // No node is placed on top of another.
    const boxes = await Promise.all([input, filter, merge].map((node) => node.boundingBox()));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) throw new Error("node not visible");
        const apart =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart, `nodes ${i} and ${j} overlap`).toBe(true);
      }
    }

    // A File Input connects before it has a file...
    await connect(page, input, filter);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    // ...and the workflow check asks for one before it runs.
    await expect(page.getByRole("button", { name: "Run Workflow" })).toBeDisabled();

    // Home leaves the canvas (an operator node used to re-render endlessly,
    // which kept the navigation from finishing).
    await page.getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { name: "Workflows", exact: true })).toBeVisible();
  });
});
