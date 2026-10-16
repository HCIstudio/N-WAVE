import fs from "node:fs";
import path from "node:path";
import {
  findSubworkflowEntry,
  resolveSubworkflowComponents,
} from "../nfcore/library";
import {
  getReferencedNfCoreModules,
  getReferencedNfCoreSubworkflows,
} from "./nextflowScript";
import { findNfCoreSubworkflowDir, resolveNfCoreModuleDir } from "./nfcoreModules";

/**
 * Copy the nf-core modules and subworkflows a script includes (with the
 * modules and subworkflows those include) into `modules/nf-core/` and
 * `subworkflows/nf-core/` under each target root.
 */
export const materializeNfCoreModules = (
  script: string,
  targetRoots: string[]
): void => {
  const moduleNames = new Set(getReferencedNfCoreModules(script));
  const subworkflowNames = new Set(getReferencedNfCoreSubworkflows(script));
  for (const name of Array.from(subworkflowNames)) {
    const entry = findSubworkflowEntry(`nf-core/subworkflows/${name}`);
    if (!entry) continue;
    const components = resolveSubworkflowComponents(entry);
    for (const module of components.modules) moduleNames.add(module);
    for (const nested of components.subworkflows) subworkflowNames.add(nested);
  }

  const copies = [
    ...Array.from(moduleNames).map((name) => ({
      label: "module",
      sourceDir: resolveNfCoreModuleDir(name),
      relativeDir: path.join("modules", "nf-core", ...name.split("/")),
    })),
    ...Array.from(subworkflowNames).map((name) => {
      const sourceDir = findNfCoreSubworkflowDir(name);
      if (!sourceDir) {
        throw new Error(`nf-core subworkflow "${name}" is not installed`);
      }
      return {
        label: "subworkflow",
        sourceDir,
        relativeDir: path.join("subworkflows", "nf-core", name),
      };
    }),
  ];

  for (const { label, sourceDir, relativeDir } of copies) {
    for (const targetRoot of targetRoots) {
      const targetDir = path.join(targetRoot, relativeDir);
      const resolvedTargetRoot = path.resolve(targetRoot);
      const resolvedTargetDir = path.resolve(targetDir);
      if (!resolvedTargetDir.startsWith(`${resolvedTargetRoot}${path.sep}`)) {
        throw new Error(`Refusing to copy nf-core ${label} outside ${targetRoot}`);
      }
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.cpSync(sourceDir, targetDir, { recursive: true });
      console.log(`Materialized nf-core ${label} ${relativeDir}: ${targetDir}`);
    }
  }
};
