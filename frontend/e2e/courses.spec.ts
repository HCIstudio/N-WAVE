import { expect, test } from "@playwright/test";
import { addNode, connect, exportAs } from "./fixtures";

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

  test("import and export: out as a project, a script and a DAW model, and the script back in", async ({ page }) => {
    await page.goto("./courses");
    await page.getByRole("listitem", { name: "Import and export" }).getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const card = page.getByRole("region", { name: "Course" });
    await expect(card).toContainText("Your copy of Demo 1");
    await card.getByRole("button", { name: "Next" }).click();

    await expect(card).toContainText("Open Export");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(card).toContainText("Download project");
    const dialog = page.getByRole("dialog", { name: "Export workflow" });
    let download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download project" }).click();
    await download;
    await expect(card).toContainText("Download script");
    download = page.waitForEvent("download");
    await exportAs(page, "Download script");
    const script = await download;
    await expect(card).toContainText("Download DAW model");
    download = page.waitForEvent("download");
    await exportAs(page, "Download DAW model");
    await download;

    // The home page: the card says where to go, then follows the user there.
    await expect(card).toContainText("Go to the home page");
    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(card).toContainText("Import Workflow");
    await expect(page.locator('[data-tutorial="import"]')).toHaveClass(/tutorial-target/);
    await page.getByRole("button", { name: "Import Workflow" }).click();
    await page.getByLabel("Nextflow File, Project Zip, Folder or DAW Model").setInputFiles(await script.path());
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(card).toContainText("read back from the code");
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
  });

  test("your own steps: a custom process, its code, and a node pack", async ({ page }) => {
    await page.goto("./courses");
    await page.getByRole("listitem", { name: "Your own steps" }).getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const card = page.getByRole("region", { name: "Course" });
    await card.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Add node" }).click();
    await page.getByRole("button", { name: "Custom process" }).click();
    await expect(card).toContainText("Save Node");
    await page.getByRole("textbox", { name: "Name", exact: true }).first().fill("Head lines");
    await page.getByRole("button", { name: "Save Node" }).click();
    await expect(card).toContainText("Add it");
    await page.getByRole("button", { name: /^Head lines/ }).first().click();
    await expect(card).toContainText("Code");
    await page.locator(".react-flow__node").first().dblclick();
    await page.getByRole("tab", { name: "Code" }).click();
    await expect(card).toContainText("Download pack");
    await page.getByRole("button", { name: "Close Panel" }).first().click();
    await page.getByRole("button", { name: "Add node" }).click();
    await page.getByRole("button", { name: "Node packs" }).click();
    await page.getByRole("tab", { name: "Export" }).click();
    await page.getByRole("checkbox", { name: /Head lines/ }).check();
    await page.getByRole("textbox", { name: "Pack name" }).fill("Text tools");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download pack" }).click();
    await download;
    await expect(card).toContainText("You wrote a step of your own");
  });

  test("large workflows: the overview, a subworkflow's steps, and a group", async ({ page }) => {
    await page.goto("./courses");
    await page.getByRole("listitem", { name: "Large workflows" }).getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(page).not.toHaveURL(/builtin:/);
    const card = page.getByRole("region", { name: "Course" });
    await expect(card).toContainText("Demo 3");
    await card.getByRole("button", { name: "Next" }).click();
    await expect(card).toContainText("Fit view");
    await page.locator("[data-canvas-controls]").getByRole("button", { name: "Fit view" }).click();
    await expect(card).toContainText("Step in");
    await page.getByRole("button", { name: /^Step in/ }).first().click();
    await expect(card).toContainText("Copy into new workflow");
    await card.getByRole("button", { name: "Skip this step" }).or(card.getByRole("button", { name: "Next" })).click();
    await expect(card).toContainText("Group into subworkflow");
    await card.getByRole("button", { name: "Leave course" }).click();
    await expect(card).toHaveCount(0);
  });

  test("N-WAVE for studies: feature switches and verbose mode in Global Settings", async ({ page }) => {
    await page.goto("./courses");
    await page.getByRole("listitem", { name: "N-WAVE for studies" }).getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    const card = page.getByRole("region", { name: "Course" });
    await card.getByRole("button", { name: "Next" }).click();
    const hints = page.locator('[data-feature="connectionHints"]');
    await expect(hints).toHaveClass(/tutorial-target/);
    await hints.getByRole("checkbox").uncheck();
    await expect(card).toContainText("switch it on");
    await hints.getByRole("checkbox").check();
    await expect(card).toContainText("Record what happens");
    await page.getByRole("checkbox", { name: /Record what happens/ }).check();
    await expect(card).toContainText("Participant ID");
    await page.getByLabel("Participant ID (this browser)").fill("P01");
    await page.getByLabel("Participant ID (this browser)").press("Enter");
    await expect(card).toContainText("Start test");
    await card.getByRole("button", { name: "Leave course" }).click();
    await expect(card).toHaveCount(0);
  });

  test("the courses page: the basics in the browser, then the advanced ones with an installation", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("region", { name: "Tutorial" }).getByRole("button", { name: "Not now" }).click();
    await page.getByRole("link", { name: "Courses", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Basics" }).getByRole("button", { name: "Start" })).toHaveCount(7);
    await expect(page.getByRole("region", { name: "Install N-WAVE" })).toContainText("How to install N-WAVE");
    const advanced = page.getByRole("region", { name: "Advanced" });
    await expect(advanced).toContainText("Needs a full install of N-WAVE.");
    await expect(advanced.getByRole("button", { name: "Start" })).toHaveCount(0);
    // All five are written: none is "coming soon", each needs an installation.
    await expect(advanced.getByText("Coming soon")).toHaveCount(0);
    await expect(advanced.getByText("Needs a full install", { exact: true })).toHaveCount(5);
    await page.goto("./");
    await expect(page.getByRole("region", { name: "Tutorial" })).toHaveCount(0);
  });
});
