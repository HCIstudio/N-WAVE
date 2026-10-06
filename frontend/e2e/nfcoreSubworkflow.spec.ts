import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { addNode, connect, expect, moveNode, test } from "./fixtures";

// The demo fetches nf-core files from GitHub; serve the real
// bam_sort_stats_samtools main.nf and stand-ins for everything else.
const stubGitHub = async (page: Page) => {
  const subworkflowSource = await readFile(
    new URL(
      "../src/test/fixtures/nfcore-bam_sort_stats_samtools.main.nf",
      import.meta.url
    ),
    "utf8"
  );
  await page.route("https://raw.githubusercontent.com/**", (route) => {
    const url = route.request().url();
    const subworkflow = url.match(/\/subworkflows\/nf-core\/(\w+)\/main\.nf$/);
    route.fulfill({
      contentType: "text/plain",
      body:
        subworkflow?.[1] === "bam_sort_stats_samtools"
          ? subworkflowSource
          : subworkflow
            ? "include { SAMTOOLS_STATS } from '../../../modules/nf-core/samtools/stats/main'\nworkflow BAM_STATS_SAMTOOLS {}\n"
            : url.endsWith("main.nf")
              ? "process STUB {\n}\n"
              : "name: stub\n",
    });
  });
};

test.describe("nf-core subworkflow nodes", () => {
  test("installs a subworkflow, builds, exports and converts it", async ({
    page,
  }) => {
    await stubGitHub(page);
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    await page.getByRole("button", { name: "Add node" }).click();
    await page.getByRole("button", { name: "nf-core Library" }).click();
    await page.getByRole("tab", { name: /^Subworkflows/ }).click();
    await page
      .getByPlaceholder("Search nf-core subworkflows...")
      .fill("bam_sort_stats");
    await page
      .getByRole("button", {
        name: "Install nf-core/subworkflows/bam_sort_stats_samtools",
      })
      .click();
    await expect(
      page.getByText(
        /Installed nf-core\/subworkflows\/bam_sort_stats_samtools and what it includes \(.*nf-core\/samtools\/sort.*nf-core\/subworkflows\/bam_stats_samtools\)/
      )
    ).toBeVisible();
    await page.getByRole("button", { name: "Close nf-core library" }).click();
    // The node menu stays open; close it.
    await page.getByRole("button", { name: "Add node" }).click();

    const input = await addNode(page, "File Input");
    await moveNode(page, input, -350, 0);
    await input.locator('input[type="file"]').setInputFiles({
      name: "sample.bam",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("BAM"),
    });
    const subworkflow = await addNode(page, "bam_sort_stats_samtools");
    // Takes are inputs, emits outputs.
    await expect(
      subworkflow.locator(".react-flow__handle.target")
    ).toHaveCount(2);
    await expect(
      subworkflow.locator(".react-flow__handle.source")
    ).toHaveCount(5);
    await connect(page, input, subworkflow);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    // Settings: the unconnected take shows its placeholder.
    await subworkflow.dblclick();
    await expect(page.getByLabel(/^ch_fasta_fai/)).toHaveValue(
      "Channel.value([[:], [], []])"
    );
    await page.getByRole("tab", { name: "Code" }).click();
    await expect(
      page.getByLabel("Subworkflow code", { exact: true })
    ).toContainText("workflow BAM_SORT_STATS_SAMTOOLS");
    await expect(
      page.getByLabel("Include statement", { exact: true })
    ).toContainText("./subworkflows/nf-core/bam_sort_stats_samtools/main");
    await page.keyboard.press("Escape");

    // The export holds the subworkflows and every module they include.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Project" }).click();
    const download = await downloadPromise;
    const files = unzipSync(new Uint8Array(await readFile(await download.path())));
    const project = "Untitled_Workflow";
    expect(
      Object.keys(files)
        .filter((name) => /\/(modules|subworkflows)\//.test(name))
        .map((name) => name.replace(`${project}/`, ""))
        .filter((name) => name.endsWith("main.nf"))
        .sort()
    ).toEqual([
      "modules/nf-core/samtools/index/main.nf",
      "modules/nf-core/samtools/sort/main.nf",
      "modules/nf-core/samtools/stats/main.nf",
      "subworkflows/nf-core/bam_sort_stats_samtools/main.nf",
      "subworkflows/nf-core/bam_stats_samtools/main.nf",
    ]);
    expect(strFromU8(files[`${project}/main.nf`])).toMatch(
      /include \{ BAM_SORT_STATS_SAMTOOLS as \w+ \} from '\.\/subworkflows\/nf-core\/bam_sort_stats_samtools\/main'/
    );

    // Convert it to an editable custom node: same ports, workflow inline.
    await subworkflow.dblclick();
    await page.getByRole("tab", { name: "Code" }).click();
    await page.getByRole("button", { name: "Convert to custom node" }).click();
    const converted = page.locator(".react-flow__node").nth(1);
    await expect(converted).toContainText("Custom node");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await expect(converted.locator(".react-flow__handle.source")).toHaveCount(5);

    await converted.dblclick();
    await page.getByRole("tab", { name: "Code" }).click();
    await expect(
      page.getByLabel("Process code", { exact: true })
    ).toContainText(/workflow custom_bam_sort_stats_samtools_\w+ \{/);
    await expect(
      page.getByLabel("Include statements", { exact: true })
    ).toContainText(
      "include { SAMTOOLS_SORT } from './modules/nf-core/samtools/sort/main'"
    );
  });
});
