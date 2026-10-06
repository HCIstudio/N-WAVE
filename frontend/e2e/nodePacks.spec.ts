import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const nameField = (page: Page) =>
  page.getByRole("textbox", { name: "Name", exact: true }).first();

const openPacks = async (page: Page) => {
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("button", { name: "Node packs" }).click();
  await expect(page.getByRole("dialog", { name: "Node packs" })).toBeVisible();
};

const closePacks = async (page: Page) => {
  await page.getByRole("button", { name: "Close node packs" }).click();
};

/**
 * The generated process and workflow code of the canvas's first node. Process
 * names end in the canvas node's id (`_node_<timestamp>`), which differs
 * between any two canvas nodes, so that part is masked.
 */
const nodeCode = async (page: Page) => {
  await page.locator(".react-flow__node").first().dblclick();
  await page.getByRole("tab", { name: "Code" }).click();
  const process = page.getByLabel("Process code", { exact: true });
  await expect(process).toContainText(/process \w+ \{/);
  const mask = (text: string) => text.replace(/_node_\d+/g, "_node_<id>");
  const code = {
    process: mask(await process.innerText()),
    workflow: mask(
      await page.getByLabel("Workflow code", { exact: true }).innerText()
    ),
  };
  await page.getByRole("button", { name: "Close Panel" }).first().click();
  return code;
};

test.describe("node packs", () => {
  test("a pack exported from one install imports into another with the same code", async ({
    page,
    browser,
  }, testInfo) => {
    // Install A: make a custom node and use it.
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Add node" }).click();
    await page.getByRole("button", { name: "Custom process" }).click();
    await nameField(page).fill("Head lines");
    await page.getByRole("button", { name: "Save Node" }).click();
    await page.getByRole("button", { name: /^Head lines/ }).first().click();
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
    const original = await nodeCode(page);

    // Export it as a pack.
    await openPacks(page);
    await page.getByRole("tab", { name: "Export" }).click();
    await page.getByRole("checkbox", { name: /Head lines/ }).check();
    await page.getByRole("textbox", { name: "Pack name" }).fill("Text tools");
    await page.getByRole("textbox", { name: "Description" }).fill("Line tools");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download pack" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      "text-tools-1.0.0.nwave-pack.json"
    );
    const packPath = await download.path();
    const pack = JSON.parse(await readFile(packPath, "utf8"));
    expect(pack).toMatchObject({
      format: "n-wave-node-pack",
      formatVersion: 1,
      id: "text-tools",
      name: "Text tools",
      version: "1.0.0",
      description: "Line tools",
      nodes: [{ label: "Head lines" }],
    });

    // Install B: a fresh browser (empty demo storage).
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
    await context.addInitScript(() => {
      localStorage.setItem("nwave.demoTutorial.completed", "custom-nodes-v3");
    });
    const other = await context.newPage();
    await other.goto("./");
    await other.getByRole("button", { name: "New Workflow" }).click();
    await expect(other).toHaveURL(/\/workflow\//);

    // A broken file is rejected with the reason.
    await openPacks(other);
    await other.getByRole("tab", { name: "Import" }).click();
    await other.getByLabel("Node pack file").setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"format":"n-wave-node-pack","formatVersion":1,"nodes":[]}'),
    });
    const problems = other.getByRole("alert");
    await expect(problems).toContainText("This pack can't be imported");
    await expect(problems).toContainText('Pack: "name" is required.');
    await expect(problems).toContainText("The pack has no nodes.");

    // The exported pack imports.
    await other.getByLabel("Node pack file").setInputFiles(packPath);
    const preview = other.getByRole("region", { name: "Pack preview" });
    await expect(preview).toContainText("Text tools");
    await expect(preview.getByRole("listitem", { name: "Head lines" })).toBeVisible();
    await other.getByRole("button", { name: "Import 1 node" }).click();
    await expect(other.getByRole("status")).toContainText(
      'Imported 1 node. They\'re in the Add node menu under "Pack: Text tools".'
    );

    // Importing it again offers to replace the installed node.
    await other.getByLabel("Node pack file").setInputFiles(packPath);
    await expect(
      other.getByRole("combobox", { name: "When Head lines is already installed" })
    ).toHaveValue("replace");
    await other.getByRole("tab", { name: "Installed" }).click();
    await expect(
      other.getByRole("listitem", { name: "Text tools 1.0.0" })
    ).toContainText("Head lines");
    await closePacks(other);

    // The pack's node is in the menu and generates the same code.
    await expect(other.getByText("Pack: Text tools")).toBeVisible();
    await other.getByRole("button", { name: /^Head lines/ }).first().click();
    await expect(other.locator(".react-flow__node")).toHaveCount(1);
    expect(await nodeCode(other)).toEqual(original);

    // Removing the pack removes its node from the menu.
    await openPacks(other);
    await other.getByRole("button", { name: "Remove Text tools" }).click();
    await other.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(other.getByText("No packs installed.")).toBeVisible();
    await closePacks(other);
    await other.getByRole("button", { name: "Add node" }).click();
    await expect(other.getByText("Pack: Text tools")).toHaveCount(0);
    await context.close();
  });

  test("imports a pack listed in the community index", async ({ page }) => {
    const index =
      "https://raw.githubusercontent.com/HCIstudio/N-WAVE-node-packs/main/index.json";
    const source = [
      "process COUNT_LINES {",
      "  input:",
      "  path text",
      "  output:",
      "  path 'count.txt', emit: count",
      "  script:",
      '  """',
      "  wc -l < $text > count.txt",
      '  """',
      "}",
    ].join("\n");
    await page.route(index, (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          format: "n-wave-node-pack-index",
          formatVersion: 1,
          packs: [
            {
              id: "counting",
              name: "Counting",
              version: "2.0.0",
              description: "Count things",
              author: "Community",
              url: "packs/counting.json",
            },
          ],
        }),
      })
    );
    await page.route(
      "https://raw.githubusercontent.com/HCIstudio/N-WAVE-node-packs/main/packs/counting.json",
      (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            format: "n-wave-node-pack",
            formatVersion: 1,
            id: "counting",
            name: "Counting",
            version: "2.0.0",
            nodes: [
              {
                id: "count_lines",
                label: "Count lines",
                description: "Lines in a file",
                icon: "Hash",
                processName: "COUNT_LINES",
                source,
                inputs: [{ name: "text", kind: "path", label: "Text" }],
                outputs: [{ name: "count", emit: "count", label: "Count" }],
              },
            ],
          }),
        })
    );

    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await openPacks(page);
    await page.getByRole("tab", { name: "Import" }).click();
    await page.getByText("Community packs").click();
    const listed = page.getByRole("list", { name: "Community packs" });
    await expect(listed).toContainText("Counting");
    await expect(listed).toContainText("Count things");
    await listed.getByRole("button", { name: "Load" }).click();
    await expect(
      page.getByRole("listitem", { name: "Count lines" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Import 1 node" }).click();
    await expect(page.getByRole("status")).toContainText("Imported 1 node");
    await closePacks(page);
    await page.getByRole("button", { name: /^Count lines/ }).first().click();
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
    await expect(page.locator(".react-flow__node").first()).toContainText(
      "Count lines"
    );
  });
});
