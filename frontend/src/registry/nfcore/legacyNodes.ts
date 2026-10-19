// FastQC and Trimmomatic were once built-in nodes with their own settings
// panels. They are nf-core modules like any other now, installed from the
// nf-core Library; nodes of saved workflows become those modules' nodes, with
// their settings turned into the module's arguments (ext.args).

import type { Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";

const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

interface LegacyModule {
  moduleId: string;
  processType: string;
  /** The versions output's port, named after its emit now. */
  versionsPort: string;
  extArgs: (data: NodeData) => string;
}

const LEGACY_MODULES: Record<string, LegacyModule> = {
  fastqc: {
    moduleId: "nf-core/fastqc",
    processType: "nfcore_fastqc",
    versionsPort: "versions_fastqc",
    extArgs: (data) =>
      [
        data.nogroup ? "--nogroup" : "",
        data.format ? `--format ${shellQuote(String(data.format))}` : "",
        data.kmers ? `--kmers ${Number(data.kmers)}` : "",
        data.adapters ? `--adapters ${shellQuote(String(data.adapters))}` : "",
        data.limits ? `--limits ${shellQuote(String(data.limits))}` : "",
      ]
        .filter(Boolean)
        .join(" "),
  },
  trimmomatic: {
    moduleId: "nf-core/trimmomatic",
    processType: "nfcore_trimmomatic",
    versionsPort: "versions_trimmomatic",
    extArgs: (data) => {
      const steps = [
        `LEADING:${data.leading ?? 3}`,
        `TRAILING:${data.trailing ?? 3}`,
        `SLIDINGWINDOW:${data.slidingwindow ?? "4:15"}`,
        `MINLEN:${data.minlen ?? 36}`,
      ];
      if (data.adapter_file) steps.push(`ILLUMINACLIP:${data.adapter_file}`);
      if (data.custom_steps) {
        steps.push(
          ...String(data.custom_steps)
            .split("\n")
            .map((step) => step.trim())
            .filter(Boolean),
        );
      }
      return `-phred${data.phred_score ?? "33"} ${steps.join(" ")}`;
    },
  },
};

/** The settings only the old panels had. */
const LEGACY_SETTINGS = [
  "threads",
  "format",
  "kmers",
  "nogroup",
  "adapters",
  "limits",
  "leading",
  "trailing",
  "slidingwindow",
  "minlen",
  "adapter_file",
  "custom_steps",
  "phred_score",
  "containerImage",
];

/** A built-in FastQC or Trimmomatic node as the nf-core module's node. */
export const migrateLegacyNfCoreNode = (node: Node<NodeData>): Node<NodeData> => {
  const legacy =
    node.type === "process" ? LEGACY_MODULES[String(node.data.processType)] : undefined;
  if (!legacy) return node;
  const data: NodeData = Object.fromEntries(
    Object.entries(node.data).filter(([key]) => !LEGACY_SETTINGS.includes(key)),
  );
  return {
    ...node,
    data: {
      ...data,
      processType: legacy.processType,
      subtitle: "nf-core module",
      nwaveExecutionBackend: "nf-core",
      nwaveNfCoreModuleId: legacy.moduleId,
      nfcoreExtArgs: legacy.extArgs(node.data),
      outputs: (node.data.outputs ?? []).map((port) =>
        port.name === "versions" ? { ...port, name: legacy.versionsPort } : port,
      ),
    },
  };
};

