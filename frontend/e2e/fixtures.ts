import { test as base, expect, type Locator, type Page } from "@playwright/test";

/** Mark the guided tutorial as done so it doesn't overlay the canvas. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem("nwave.demoTutorial.completed", "custom-nodes-v3");
    });
    await use(page);
  },
});

export { expect };

/** Add a node from the "Add node" menu and return its locator. */
export const addNode = async (page: Page, label: string): Promise<Locator> => {
  const nodes = page.locator(".react-flow__node");
  const before = await nodes.count();
  await page.getByRole("button", { name: "Add node" }).click();
  await page
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .first()
    .click();
  await expect(nodes).toHaveCount(before + 1);
  return nodes.nth(before);
};

/** Move a node by dragging it, so freshly added nodes don't overlap. */
export const moveNode = async (
  page: Page,
  node: Locator,
  dx: number,
  dy: number
): Promise<void> => {
  const box = await node.boundingBox();
  if (!box) throw new Error("node is not visible");
  // Grab the node near its top edge, away from buttons and handles.
  const x = box.x + box.width / 2;
  const y = box.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
};

/** Connect the first source handle of `from` to the first target of `to`. */
export const connect = async (
  page: Page,
  from: Locator,
  to: Locator
): Promise<void> => {
  const source = from.locator(".react-flow__handle.source").first();
  const target = to.locator(".react-flow__handle.target").first();
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  if (!s || !t) throw new Error("handles are not visible");
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 });
  await page.mouse.up();
};
