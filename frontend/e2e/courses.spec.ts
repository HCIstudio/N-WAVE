import { expect, test } from "@playwright/test";
import { addNode, connect } from "./fixtures";

// A fresh browser: the courses haven't been offered yet.
test.describe("courses", () => {
  test("the home page, then the canvas: the user makes a workflow from Demo 1 and works in it", async ({ page }) => {
    await page.goto("./");
    const offer = page.getByRole("region", { name: "Tutorial" });
    await offer.getByRole("button", { name: "Start the first course" }).click();
    for (let step = 1; step < 6; step++) await offer.getByRole("button", { name: "Next" }).click();

    // The last task: New Workflow, then Demo 1 in its dialog.
    await expect(offer).toContainText("click New Workflow");
    await page.getByRole("button", { name: "New Workflow" }).click();
    const dialog = page.getByRole("dialog", { name: "Start a new workflow" });
    await expect(dialog.getByRole("status")).toContainText("Choose Demo 1 - Text basics");
    await dialog.getByRole("button", { name: "Demo 1 - Text basics" }).click();

    // An editable copy, not the read-only demo; the canvas course starts there, docked.
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(page).not.toHaveURL(/builtin:demo-basic/);
    const card = page.getByRole("region", { name: "Course" });
    await expect(card).toContainText("The canvas");
    await expect(card).toContainText("your copy");
    await card.getByRole("button", { name: "Next" }).click();

    // Each task goes on once it is done.
    const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
    await expect(card).toContainText("Double-click the Map node");
    await expect(node("demo-map-uppercase")).toHaveClass(/tutorial-target/);
    await node("demo-map-uppercase").dblclick();
    await expect(card).toContainText("Case to Lowercase");
    await page.getByLabel("Case", { exact: true }).selectOption("toLowerCase");

    await expect(card).toContainText("remove the second Filter");
    await page.getByRole("button", { name: "Close Panel" }).click();
    await expect(node("demo-filter-bee")).toHaveClass(/tutorial-target/);
    await node("demo-filter-bee").click();
    await page.keyboard.press("Delete");

    await expect(card).toContainText("Open the + menu");
    await page.getByRole("button", { name: "Add node" }).click();
    await expect(card).toContainText("Pick Filter");
    await page.getByRole("button", { name: /^Filter/ }).first().click();

    // The canvas moved to show the new node.
    await expect(card).toContainText("Connect it");
    const added = page.locator('.react-flow__node:not([data-id^="demo-"])');
    await expect(added).toBeInViewport();
    await connect(page, node("demo-file-input"), added);
    await expect(card).toContainText("connect the new Filter to Merge");
    await connect(page, added, node("demo-merge"));

    await expect(card).toContainText("bottom bar");
    await card.getByRole("button", { name: "Next" }).click();
    await card.getByRole("button", { name: "Next" }).click();
    await expect(card.getByRole("button", { name: "Next course: Build with nf-core modules" })).toBeVisible();
    await card.getByRole("link", { name: "All courses" }).click();

    // Done, on the courses page; the offer isn't made again.
    await expect(page).toHaveURL(/\/courses$/);
    await expect(page.getByRole("listitem", { name: "The home page" })).toContainText("Done");
    await expect(page.getByRole("listitem", { name: "The canvas" })).toContainText("Done");
    await page.goto("./");
    await expect(offer).toHaveCount(0);
  });

  test("the canvas course started on its own makes its copy of Demo 1", async ({ page }) => {
    await page.goto("./courses");
    await page.getByRole("listitem", { name: "The canvas" }).getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(page).not.toHaveURL(/builtin:demo-basic/);
    await expect(page.getByRole("region", { name: "Course" })).toContainText("your copy");
    await expect(page.locator('.react-flow__node[data-id="demo-map-uppercase"]')).toBeVisible();
  });

  test("the nf-core course starts in an empty workflow made for it", async ({ page }) => {
    await page.goto("./courses");
    await page.getByRole("listitem", { name: "Build with nf-core modules" }).getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const card = page.getByRole("region", { name: "Course" });
    await expect(card).toContainText("An empty workflow, made for this course");
    await card.getByRole("button", { name: "Next" }).click();
    await expect(card).toContainText("add a Samplesheet");
    await addNode(page, "Samplesheet");
    await expect(card).toContainText("nf-core Library");
    await card.getByRole("button", { name: "Leave course" }).click();
    await expect(card).toHaveCount(0);
  });

  test("the courses page: the basics in the browser, then the advanced ones with an installation", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("region", { name: "Tutorial" }).getByRole("button", { name: "Not now" }).click();
    await page.getByRole("link", { name: "Courses", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Basics" }).getByRole("button", { name: "Start" })).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Install N-WAVE" })).toContainText("How to install N-WAVE");
    const advanced = page.getByRole("region", { name: "Advanced" });
    await expect(advanced).toContainText("Needs a full install of N-WAVE.");
    await expect(advanced.getByRole("button", { name: "Start" })).toHaveCount(0);
    await page.goto("./");
    await expect(page.getByRole("region", { name: "Tutorial" })).toHaveCount(0);
  });
});
