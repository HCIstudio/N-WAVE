import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NfCoreCatalogModule,
  NfCoreCatalogResponse,
  NfCoreCatalogSubworkflow,
} from "../../../api/nfcore";

const getNfCoreCatalog = vi.fn(
  async (): Promise<NfCoreCatalogResponse> => catalog([]),
);
const installNfCoreModule = vi.fn(async (_id: string) => ({
  dependencies: [] as string[],
}));
const uninstallNfCoreModule = vi.fn(async (_id: string) => {});
const refreshInstalledNfCoreNodes = vi.fn(async () => 0);
vi.mock("../../../api", () => ({ default: {}, isDemoMode: false }));
vi.mock("../../../api/nfcore", () => ({
  getNfCoreCatalog: () => getNfCoreCatalog(),
  installNfCoreModule: (id: string) => installNfCoreModule(id),
  uninstallNfCoreModule: (id: string) => uninstallNfCoreModule(id),
  refreshInstalledNfCoreNodes: () => refreshInstalledNfCoreNodes(),
}));

const { default: NfCoreLibraryModal } = await import("./NfCoreLibraryModal");

const source = {
  repository: "nf-core/modules",
  ref: "master",
  commit: "abc",
  path: "",
};

const catalog = (
  modules: NfCoreCatalogModule[],
  subworkflows: NfCoreCatalogSubworkflow[] = [],
): NfCoreCatalogResponse => ({
  schemaVersion: 3,
  generatedAt: "2026-10-01T00:00:00Z",
  counts: {},
  modules,
  subworkflows,
});

const nfModule = (
  path: string,
  extra: Partial<NfCoreCatalogModule> = {},
): NfCoreCatalogModule => ({
  id: `nf-core/${path}`,
  source,
  moduleName: path,
  modulePath: path,
  label: path.toUpperCase(),
  description: `Runs ${path}`,
  processName: path.toUpperCase().replace(/\//g, "_"),
  keywords: [],
  tools: [],
  inputs: ["reads"],
  outputs: ["html"],
  emits: ["html", "versions"],
  support: "full",
  ...extra,
});

const subworkflow = (
  name: string,
  extra: Partial<NfCoreCatalogSubworkflow> = {},
): NfCoreCatalogSubworkflow => ({
  kind: "subworkflow",
  id: `nf-core/subworkflows/${name}`,
  name,
  label: name,
  description: `The ${name} subworkflow`,
  workflowName: name.toUpperCase(),
  takes: [
    { name: "ch_bam", kind: "channel" },
    { name: "ch_fasta", kind: "channel" },
    { name: "skip", kind: "value" },
  ] as NfCoreCatalogSubworkflow["takes"],
  emits: [{ name: "stats", description: "" }],
  components: { modules: ["samtools/sort", "samtools/stats"], subworkflows: [] },
  support: "full",
  source,
  keywords: ["bam"],
  ...extra,
});

const fastqc = nfModule("fastqc", {
  keywords: ["quality control"],
  tools: ["fastqc"],
  valueInputs: [
    { name: "a" },
    { name: "b" },
  ] as NfCoreCatalogModule["valueInputs"],
  settings: {
    extArgs: true,
    resources: true,
    argumentReferences: [
      { type: "documentation", url: "https://docs.example/fastqc" },
      { type: "tool_dev_url", url: "https://src.example/fastqc" },
      { type: "homepage", url: "https://home.example/fastqc" },
      { type: "other", url: "https://other.example/fastqc" },
    ],
  },
});
const multiqc = nfModule("multiqc", {
  support: "needs_review",
  installability: { automatic: true, requiresReview: true, reasons: [] },
});
const custom = nfModule("custom/tool", {
  support: "candidate",
  installed: true,
  description: "",
});
const manual = nfModule("manual", {
  support: "needs_review",
  installability: {
    automatic: false,
    requiresReview: true,
    reasons: ["Takes a channel of channels."],
  },
});
const unsupported = nfModule("weird", { support: "unsupported" });

const setup = async (response: NfCoreCatalogResponse) => {
  getNfCoreCatalog.mockResolvedValue(response);
  const onClose = vi.fn();
  const onInstalled = vi.fn();
  const user = userEvent.setup();
  render(
    <NfCoreLibraryModal isOpen onClose={onClose} onInstalled={onInstalled} />,
  );
  await waitFor(() =>
    expect(screen.queryByText("Loading catalog...")).toBeNull(),
  );
  return { user, onClose, onInstalled };
};

const titles = () =>
  screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

const button = (name: string | RegExp) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

const row = (title: string) =>
  screen.getByRole("heading", { level: 3, name: title })
    .parentElement?.parentElement?.parentElement as HTMLElement;

describe("NfCoreLibraryModal", () => {
  beforeEach(() => {
    getNfCoreCatalog.mockReset();
    installNfCoreModule.mockReset();
    installNfCoreModule.mockResolvedValue({ dependencies: [] });
    uninstallNfCoreModule.mockReset();
    refreshInstalledNfCoreNodes.mockClear();
  });

  it("renders nothing and loads nothing when closed", () => {
    const { container } = render(
      <NfCoreLibraryModal isOpen={false} onClose={vi.fn()} onInstalled={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
    expect(getNfCoreCatalog).not.toHaveBeenCalled();
  });

  it("lists installed modules first, then by support", async () => {
    await setup(catalog([unsupported, multiqc, fastqc, custom]));
    expect(screen.getByRole("tab", { name: "Modules (4)" })).toBeTruthy();
    expect(screen.getByText("Showing 4 of 4 matches")).toBeTruthy();
    expect(titles()).toEqual(["CUSTOM/TOOL", "FASTQC", "MULTIQC", "WEIRD"]);
    expect(within(row("CUSTOM/TOOL")).getByText("Installed")).toBeTruthy();
    expect(within(row("CUSTOM/TOOL")).getByText("Generated")).toBeTruthy();
    expect(
      within(row("CUSTOM/TOOL")).getByText("No description available."),
    ).toBeTruthy();
  });

  it("shows what a module takes, emits and links to", async () => {
    await setup(catalog([fastqc]));
    const fastqcRow = row("FASTQC");
    expect(within(fastqcRow).getByText("Ready")).toBeTruthy();
    expect(within(fastqcRow).getByText("Auto install")).toBeTruthy();
    expect(fastqcRow.textContent).toContain(
      "FASTQC - inputs 1 - settings 2 - outputs 2",
    );
    const links = within(fastqcRow).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Documentation", "https://docs.example/fastqc"],
      ["Source", "https://src.example/fastqc"],
      ["Homepage", "https://home.example/fastqc"],
      ["Reference", "https://other.example/fastqc"],
    ]);
  });

  it("can't install modules that need a manual adapter", async () => {
    await setup(catalog([manual, unsupported, multiqc]));
    expect(within(row("MANUAL")).getByText("Manual adapter needed")).toBeTruthy();
    expect(
      within(row("MANUAL")).getByText("Takes a channel of channels."),
    ).toBeTruthy();
    for (const title of ["MANUAL", "WEIRD"]) {
      const action = within(row(title)).getByRole("button") as HTMLButtonElement;
      expect(action.textContent).toBe("Needs config");
      expect(action.disabled).toBe(true);
    }
    expect(within(row("WEIRD")).getByText("Unsupported")).toBeTruthy();
    expect(
      within(row("MULTIQC")).getByText("Auto install, review recommended"),
    ).toBeTruthy();
    expect(button("Install nf-core/multiqc").disabled).toBe(false);
  });

  it("searches ids, keywords and tools", async () => {
    const { user } = await setup(catalog([fastqc, multiqc, custom]));
    const search = screen.getByPlaceholderText("Search nf-core modules...");
    await user.type(search, "Quality CONTROL");
    expect(titles()).toEqual(["FASTQC"]);
    expect(screen.getByText("Showing 1 of 1 matches")).toBeTruthy();

    await user.clear(search);
    await user.type(search, "nf-core/multi");
    expect(titles()).toEqual(["MULTIQC"]);

    await user.type(search, "zzz");
    expect(
      screen.getByText("No nf-core modules match the current search."),
    ).toBeTruthy();
  });

  it("installs a module", async () => {
    const { user, onInstalled } = await setup(catalog([fastqc]));
    await user.click(button("Install nf-core/fastqc"));

    expect(installNfCoreModule).toHaveBeenCalledWith("nf-core/fastqc");
    expect(refreshInstalledNfCoreNodes).toHaveBeenCalled();
    expect(
      (await screen.findByRole("status")).textContent,
    ).toBe("Installed nf-core/fastqc. It is now in the node menu.");
    expect(onInstalled).toHaveBeenCalled();
    expect(within(row("FASTQC")).getByText("Installed")).toBeTruthy();
    expect(button("Remove nf-core/fastqc")).toBeTruthy();
  });

  it("shows installing while it waits", async () => {
    let finish: (value: { dependencies: string[] }) => void = () => {};
    installNfCoreModule.mockImplementation(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    const { user } = await setup(catalog([fastqc]));
    await user.click(button("Install nf-core/fastqc"));
    const pending = within(row("FASTQC")).getByRole("button") as HTMLButtonElement;
    expect(pending.textContent).toBe("Installing...");
    expect(pending.disabled).toBe(true);
    finish({ dependencies: [] });
    expect(await screen.findByRole("button", { name: "Remove nf-core/fastqc" })).toBeTruthy();
  });

  it("shows why an install failed", async () => {
    installNfCoreModule.mockRejectedValue(new Error("No network"));
    const { user, onInstalled } = await setup(catalog([fastqc]));
    await user.click(button("Install nf-core/fastqc"));
    expect((await screen.findByRole("alert")).textContent).toBe("No network");
    expect(onInstalled).not.toHaveBeenCalled();
    expect(button("Install nf-core/fastqc").disabled).toBe(false);
  });

  it("removes an installed module", async () => {
    const { user, onInstalled } = await setup(catalog([custom]));
    await user.click(button("Remove nf-core/custom/tool"));

    expect(uninstallNfCoreModule).toHaveBeenCalledWith("nf-core/custom/tool");
    expect((await screen.findByRole("status")).textContent).toBe(
      "Removed nf-core/custom/tool. Workflows that use it need it reinstalled to generate code.",
    );
    expect(onInstalled).toHaveBeenCalled();
    expect(button("Install nf-core/custom/tool")).toBeTruthy();
  });

  it("shows why a removal failed", async () => {
    uninstallNfCoreModule.mockRejectedValue(new Error("In use"));
    const { user } = await setup(catalog([custom]));
    await user.click(button("Remove nf-core/custom/tool"));
    expect((await screen.findByRole("alert")).textContent).toBe("In use");
    expect(button("Remove nf-core/custom/tool")).toBeTruthy();
  });

  it("shows why the catalog couldn't load", async () => {
    getNfCoreCatalog.mockRejectedValue(new Error("Catalog missing"));
    render(<NfCoreLibraryModal isOpen onClose={vi.fn()} onInstalled={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe("Catalog missing");
  });

  it("closes from the close button", async () => {
    const { user, onClose } = await setup(catalog([]));
    await user.click(button("Close nf-core library"));
    expect(onClose).toHaveBeenCalled();
  });

  it("pages through long lists", async () => {
    const many = Array.from({ length: 151 }, (_, index) =>
      nfModule(`tool${String(index).padStart(3, "0")}`),
    );
    const { user } = await setup(catalog(many));
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.getByText("Showing 150 of 151 matches")).toBeTruthy();
    expect(button("Previous").disabled).toBe(true);

    await user.click(button("Next page"));
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(titles()).toEqual(["TOOL150"]);
    expect(button("Next page").disabled).toBe(true);

    await user.click(button("Previous"));
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();

    // A new search starts again at the first page.
    await user.click(button("Next page"));
    await user.type(screen.getByPlaceholderText("Search nf-core modules..."), "tool1");
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  describe("subworkflows", () => {
    const bamStats = subworkflow("bam_stats");
    const fastqTrim = subworkflow("fastq_trim", {
      installed: true,
      takes: [{ name: "reads", kind: "channel" }] as NfCoreCatalogSubworkflow["takes"],
      components: { modules: [], subworkflows: [] },
      keywords: ["trimming"],
      description: "",
    });
    const odd = subworkflow("odd", {
      support: "unsupported",
      installability: {
        automatic: false,
        requiresReview: false,
        reasons: ["Emits a nested channel."],
      },
    });

    it("lists subworkflows with what they include", async () => {
      const { user } = await setup(catalog([fastqc], [odd, bamStats, fastqTrim]));
      await user.click(screen.getByRole("tab", { name: "Subworkflows (3)" }));

      expect(
        screen.getByRole("tab", { name: "Subworkflows (3)" }).getAttribute("aria-selected"),
      ).toBe("true");
      expect(titles()).toEqual(["fastq_trim", "bam_stats", "odd"]);
      const stats = row("bam_stats");
      expect(stats.textContent).toContain(
        "BAM_STATS - inputs 2 - settings 1 - outputs 1",
      );
      expect(
        within(stats).getByText("Includes samtools/sort, samtools/stats"),
      ).toBeTruthy();
      expect(within(row("fastq_trim")).getByText("Installed")).toBeTruthy();
      expect(
        within(row("fastq_trim")).getByText("No description available."),
      ).toBeTruthy();
      const oddAction = within(row("odd")).getByRole("button", {
        name: "Unsupported",
      }) as HTMLButtonElement;
      expect(oddAction.disabled).toBe(true);
      expect(within(row("odd")).getByText("Emits a nested channel.")).toBeTruthy();
    });

    it("searches subworkflows by their modules", async () => {
      const { user } = await setup(catalog([], [bamStats, fastqTrim]));
      await user.click(screen.getByRole("tab", { name: "Subworkflows (2)" }));
      const search = screen.getByPlaceholderText("Search nf-core subworkflows...");
      await user.type(search, "samtools/stats");
      expect(titles()).toEqual(["bam_stats"]);
      await user.clear(search);
      await user.type(search, "nothing here");
      expect(
        screen.getByText("No nf-core subworkflows match the current search."),
      ).toBeTruthy();
    });

    it("installs a subworkflow and the modules it brings", async () => {
      installNfCoreModule.mockResolvedValue({
        dependencies: ["nf-core/fastqc"],
      });
      const { user } = await setup(catalog([fastqc], [bamStats]));
      await user.click(screen.getByRole("tab", { name: "Subworkflows (1)" }));
      await user.click(button("Install nf-core/subworkflows/bam_stats"));

      expect((await screen.findByRole("status")).textContent).toBe(
        "Installed nf-core/subworkflows/bam_stats and what it includes (nf-core/fastqc). They are now in the node menu.",
      );
      expect(button("Remove nf-core/subworkflows/bam_stats")).toBeTruthy();

      await user.click(screen.getByRole("tab", { name: "Modules (1)" }));
      expect(button("Remove nf-core/fastqc")).toBeTruthy();
    });

    it("removes an installed subworkflow", async () => {
      const { user } = await setup(catalog([], [fastqTrim]));
      await user.click(screen.getByRole("tab", { name: "Subworkflows (1)" }));
      await user.click(button("Remove nf-core/subworkflows/fastq_trim"));
      expect(uninstallNfCoreModule).toHaveBeenCalledWith(
        "nf-core/subworkflows/fastq_trim",
      );
      expect(
        await screen.findByRole("button", {
          name: "Install nf-core/subworkflows/fastq_trim",
        }),
      ).toBeTruthy();
    });
  });
});
