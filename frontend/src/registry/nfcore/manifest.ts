import type { NfCoreAdapterManifest } from "../nfcoreModuleAdapters";
import {
  getGroupItems,
  type NfCoreModuleInputGroup,
  type NfCoreValueInput,
} from "./inputChannels";

/** The catalog fields needed to build a module's adapter manifest. */
export interface NfCoreCatalogEntryForManifest {
  id: string;
  modulePath: string;
  label: string;
  description: string;
  processName: string;
  inputs: string[];
  inputGroups?: NfCoreModuleInputGroup[];
  valueInputs?: NfCoreValueInput[];
  emits: string[];
  settings?: NfCoreAdapterManifest["settings"];
  support: NfCoreAdapterManifest["support"];
  installability?: NfCoreAdapterManifest["installability"];
}

const toTitle = (value: string): string =>
  value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

/**
 * Ports of a module: every path field of its inputs, in declaration order.
 * Older catalog entries without input groups fall back to meta.yml names.
 */
export const getNfCoreInputPorts = (
  entry: Pick<NfCoreCatalogEntryForManifest, "inputs" | "inputGroups">,
): string[] =>
  entry.inputGroups
    ? entry.inputGroups.flatMap((group) =>
        getGroupItems(group).flatMap((item) =>
          item.kind === "path" ? [item.name] : [],
        ),
      )
    : entry.inputs;

/** Mirrors buildAdapterManifest in backend/src/controllers/nfcoreController.ts. */
export const buildNfCoreManifest = (
  entry: NfCoreCatalogEntryForManifest,
): NfCoreAdapterManifest => ({
  schemaVersion: 2,
  id: entry.id,
  label: entry.label,
  description: entry.description,
  processType: `nfcore_${entry.modulePath.replace(/[^A-Za-z0-9]+/g, "_")}`,
  modulePath: `./modules/nf-core/${entry.modulePath}/main`,
  processName: entry.processName,
  support: entry.support,
  needsReview: entry.support === "needs_review",
  installability: entry.installability,
  settings: entry.settings,
  inputGroups: entry.inputGroups,
  valueInputs: entry.valueInputs ?? [],
  inputs: getNfCoreInputPorts(entry).map((name) => ({
    handle: name,
    nfcoreName: name,
    adapter: entry.inputGroups
      ? "path"
      : name === "reads"
        ? "fastq_reads_with_meta"
        : "path",
    label: toTitle(name),
  })),
  outputs: entry.emits.map((emit) => ({
    handle: emit,
    emit,
    label: toTitle(emit),
  })),
  defaults: {
    label: entry.label,
    subtitle: "nf-core module",
    note: "Imported from nf-core catalog",
    nwaveExecutionBackend: "nf-core",
    nwaveNfCoreModuleId: entry.id,
    nwaveNfCoreSupportsExtArgs: entry.settings?.extArgs ?? false,
    nwaveNfCoreExtArgNames: entry.settings?.extArgNames ?? [],
    nwaveNfCoreArgumentReferences: entry.settings?.argumentReferences ?? [],
    nwaveNfCoreSupportsResources: entry.settings?.resources ?? true,
  },
});
