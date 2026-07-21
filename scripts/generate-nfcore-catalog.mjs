#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoUrl = "https://github.com/nf-core/modules.git";
const repoRef = process.env.NFCORE_MODULES_REF || "master";
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const cacheDir = path.join(workspaceRoot, ".cache", "nfcore-modules");
const frontendOutputPath = path.join(
  workspaceRoot,
  "frontend",
  "src",
  "registry",
  "nfcore",
  "catalog.json"
);
const backendOutputPath = path.join(
  workspaceRoot,
  "backend",
  "src",
  "workflows",
  "library",
  "assets",
  "nf-core",
  "catalog.json"
);

const fullSupportModules = new Set(["fastqc", "trimmomatic"]);

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: workspaceRoot,
    stdio: options.stdio ?? "pipe",
    encoding: "utf8",
  });
}

function output(command, args, cwd = workspaceRoot) {
  return execFileSync(command, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();
}

function ensureModulesRepo() {
  fs.mkdirSync(path.dirname(cacheDir), { recursive: true });

  if (!fs.existsSync(path.join(cacheDir, ".git"))) {
    run("git", [
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--branch",
      repoRef,
      repoUrl,
      cacheDir,
    ], { stdio: "inherit" });
    run("git", ["-C", cacheDir, "sparse-checkout", "set", "modules/nf-core"], {
      stdio: "inherit",
    });
    return;
  }

  run("git", ["-C", cacheDir, "fetch", "--depth", "1", "origin", repoRef], {
    stdio: "inherit",
  });
  run("git", ["-C", cacheDir, "checkout", "--detach", "FETCH_HEAD"], {
    stdio: "inherit",
  });
  run("git", ["-C", cacheDir, "sparse-checkout", "set", "modules/nf-core"], {
    stdio: "inherit",
  });
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function unquote(value) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function getTopLevelScalar(yaml, key) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^${key}:\\s*`).test(line)
  );
  if (start === -1) return "";

  const firstValue = lines[start].replace(new RegExp(`^${key}:\\s*`), "");
  if (firstValue && firstValue !== "|" && firstValue !== ">") {
    return unquote(firstValue);
  }

  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_]+:\s*/.test(line)) break;
    if (line.trim()) values.push(line.trim());
  }
  return values.join(" ").trim();
}

function getTopLevelList(yaml, key) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return [];

  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_]+:\s*/.test(line)) break;
    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (match) values.push(unquote(match[1]));
  }
  return values;
}

function getTools(yaml) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "tools:");
  if (start === -1) return [];

  const tools = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_]+:\s*/.test(line)) break;
    const match = line.match(/^\s*-\s+["']?([^"':]+)["']?:\s*$/);
    if (match) tools.push(match[1]);
  }
  return tools;
}

function getTopLevelMapKeys(yaml, key) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return [];

  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_]+:\s*/.test(line)) break;
    const match = line.match(/^  ([A-Za-z0-9_.$-]+):\s*$/);
    if (match) values.push(match[1]);
  }
  return values;
}

function getInputNames(yaml) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "input:");
  if (start === -1) return [];

  const names = new Set();
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_]+:\s*/.test(line)) break;
    const match = line.match(/^\s{4}-\s+([A-Za-z0-9_.$-]+):\s*$/);
    if (match) names.add(match[1]);
  }
  return Array.from(names);
}

function getContainerNames(yaml) {
  return Array.from(
    new Set(
      [...yaml.matchAll(/^\s+name:\s*(.+?)\s*$/gm)]
        .map((match) => unquote(match[1]))
        .filter(Boolean)
    )
  );
}

function getReferenceUrls(yaml) {
  const references = new Map();
  [
    ...yaml.matchAll(
      /^\s+(homepage|documentation|tool_dev_url):\s*["']?(https?:\/\/[^"'\s]+)["']?\s*$/gm
    ),
  ].forEach((match) => {
    references.set(`${match[1]}:${match[2]}`, {
      type: match[1],
      url: match[2],
    });
  });

  return Array.from(references.values());
}

function getProcessName(mainNf) {
  return mainNf.match(/^\s*process\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/m)?.[1] ?? "";
}

function getEmits(mainNf) {
  return Array.from(
    new Set(
      [...mainNf.matchAll(/\bemit:\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map(
        (match) => match[1]
      )
    )
  );
}

function getExtArgNames(mainNf) {
  return Array.from(
    new Set(
      [...mainNf.matchAll(/\btask\.ext\.(args\d*)\b/g)].map(
        (match) => match[1]
      )
    )
  );
}

function getInputDeclarations(mainNf) {
  const inputBlock = mainNf.match(/^\s*input:\s*$([\s\S]*?)(?=^\s*(output|when|script|shell|stub):\s*$)/m)?.[1] ?? "";
  return inputBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(tuple|path|val|env|stdin)\b/.test(line));
}

function splitTopLevel(value) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripLineComment(value) {
  let quote = "";
  for (let index = 0; index < value.length - 1; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "/" && value[index + 1] === "/") {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function getInputGroups(inputDeclarations) {
  return inputDeclarations.map((declaration, index) =>
    parseInputDeclaration(declaration, index)
  );
}

function parseInputDeclaration(declaration, index) {
  const clean = stripLineComment(declaration);

  if (clean.startsWith("path ")) {
    const field = clean.match(/^path\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
    return {
      argumentIndex: index,
      handle: field || `input_${index + 1}`,
      tuple: false,
      metaName: null,
      fields: field ? [field] : [],
      unsupported: field ? [] : [`Could not parse path input declaration: ${declaration}`],
    };
  }

  if (!clean.startsWith("tuple ")) {
    return {
      argumentIndex: index,
      handle: `input_${index + 1}`,
      tuple: false,
      metaName: null,
      fields: [],
      unsupported: [`Unsupported input declaration: ${declaration}`],
    };
  }

  const tokens = splitTopLevel(clean.replace(/^tuple\s+/, ""));
  const fields = [];
  const unsupported = [];
  let metaName = null;

  tokens.forEach((token, tokenIndex) => {
    const valMatch = token.match(/^val\(([^)]+)\)$/);
    if (valMatch) {
      const name = valMatch[1].trim();
      if (tokenIndex === 0 && /^meta\d*$/.test(name)) {
        metaName = name;
      } else {
        unsupported.push(`Unsupported tuple value input: ${token}`);
      }
      return;
    }

    const pathMatch = token.match(/^path\(\s*([A-Za-z_][A-Za-z0-9_]*)/);
    if (pathMatch) {
      fields.push(pathMatch[1]);
      return;
    }

    unsupported.push(`Unsupported tuple token: ${token}`);
  });

  if (fields.length === 0) {
    unsupported.push(`No path fields parsed from tuple declaration: ${declaration}`);
  }

  return {
    argumentIndex: index,
    handle: fields[0] || `input_${index + 1}`,
    tuple: true,
    metaName,
    fields,
    unsupported,
  };
}

function getInstallability({ modulePath, processName, outputs, emits, hasMeta, inputGroups }) {
  const reasons = [];
  const isFull = fullSupportModules.has(modulePath);

  if (!hasMeta) reasons.push("Missing meta.yml");
  if (!processName) reasons.push("Missing process declaration");
  if (outputs.length === 0) reasons.push("No outputs in meta.yml");
  if (emits.length === 0) reasons.push("No emitted outputs in main.nf");
  if (outputs.length > 0 && emits.length > 0) {
    const missingEmits = outputs.filter((output) => !emits.includes(output));
    if (missingEmits.length > 0) {
      reasons.push(`meta.yml outputs without matching emit: ${missingEmits.join(", ")}`);
    }
  }
  if (inputGroups.length === 0) {
    reasons.push("No supported process input declarations");
  }

  const unsupportedInputs = inputGroups.flatMap((group) => group.unsupported);
  if (unsupportedInputs.length > 0) {
    reasons.push(...unsupportedInputs);
  }

  return {
    automatic: isFull || reasons.length === 0,
    requiresReview: !isFull,
    reasons,
  };
}

function classifyModule({ modulePath, processName, outputs, emits, hasMeta, installability }) {
  if (fullSupportModules.has(modulePath)) return "full";
  if (!hasMeta || !processName) return "unsupported";
  if (outputs.length === 0 || emits.length === 0) return "needs_review";
  return installability.automatic ? "candidate" : "needs_review";
}

function findModuleDirs(rootDir) {
  const moduleDirs = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const hasModuleFile = entries.some(
      (entry) =>
        entry.isFile() && (entry.name === "main.nf" || entry.name === "meta.yml")
    );

    if (hasModuleFile) {
      moduleDirs.push(currentDir);
      return;
    }

    entries
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => walk(path.join(currentDir, entry.name)));
  }

  walk(rootDir);
  return moduleDirs.sort((left, right) => left.localeCompare(right));
}

function buildCatalog() {
  const modulesRoot = path.join(cacheDir, "modules", "nf-core");
  const moduleDirs = findModuleDirs(modulesRoot);
  const commit = output("git", ["rev-parse", "HEAD"], cacheDir);
  const generatedAt = new Date().toISOString();

  const modules = moduleDirs.map((moduleDir) => {
    const modulePath = path.relative(modulesRoot, moduleDir).replace(/\\/g, "/");
    const moduleName = modulePath.split("/").at(-1) ?? modulePath;
    const metaYaml = readText(path.join(moduleDir, "meta.yml"));
    const mainNf = readText(path.join(moduleDir, "main.nf"));
    const processName = getProcessName(mainNf);
    const outputs = getTopLevelMapKeys(metaYaml, "output");
    const emits = getEmits(mainNf);
    const extArgNames = getExtArgNames(mainNf);
    const inputDeclarations = getInputDeclarations(mainNf);
    const inputGroups = getInputGroups(inputDeclarations);
    const installability = getInstallability({
      modulePath,
      processName,
      outputs,
      emits,
      hasMeta: Boolean(metaYaml),
      inputGroups,
    });

    return {
      id: `nf-core/${modulePath}`,
      moduleName,
      modulePath,
      label: getTopLevelScalar(metaYaml, "name") || moduleName,
      description: getTopLevelScalar(metaYaml, "description"),
      processName,
      source: {
        repository: repoUrl,
        ref: repoRef,
        commit,
        path: `modules/nf-core/${modulePath}`,
      },
      files: {
        main: fs.existsSync(path.join(moduleDir, "main.nf")),
        meta: fs.existsSync(path.join(moduleDir, "meta.yml")),
        environment: fs.existsSync(path.join(moduleDir, "environment.yml")),
      },
      keywords: getTopLevelList(metaYaml, "keywords"),
      tools: getTools(metaYaml),
      inputs: getInputNames(metaYaml),
      inputDeclarations,
      inputGroups: inputGroups.map(({ unsupported, ...group }) => group),
      outputs,
      emits,
      containers: getContainerNames(metaYaml),
      settings: {
        extArgs: extArgNames.length > 0,
        extArgNames,
        argumentReferences: getReferenceUrls(metaYaml),
        resources: Boolean(processName),
      },
      installedByDefault: fullSupportModules.has(modulePath),
      support: classifyModule({
        modulePath,
        processName,
        outputs,
        emits,
        hasMeta: Boolean(metaYaml),
        installability,
      }),
      installability,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt,
    source: {
      repository: repoUrl,
      ref: repoRef,
      commit,
    },
    counts: {
      total: modules.length,
      full: modules.filter((module) => module.support === "full").length,
      candidate: modules.filter((module) => module.support === "candidate")
        .length,
      needsReview: modules.filter((module) => module.support === "needs_review")
        .length,
      unsupported: modules.filter((module) => module.support === "unsupported")
        .length,
      installedByDefault: modules.filter((module) => module.installedByDefault)
        .length,
    },
    modules,
  };
}

ensureModulesRepo();
const catalog = buildCatalog();

[frontendOutputPath, backendOutputPath].forEach((outputPath) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(`${outputPath}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`);
  fs.renameSync(`${outputPath}.tmp`, outputPath);
});

console.log(
  `Generated ${catalog.counts.total} nf-core module catalog entries at ${path.relative(
    workspaceRoot,
    frontendOutputPath
  )}`
);
console.log(`Copied backend catalog to ${path.relative(workspaceRoot, backendOutputPath)}`);
console.log(
  `Support: full=${catalog.counts.full}, candidate=${catalog.counts.candidate}, needs_review=${catalog.counts.needsReview}, unsupported=${catalog.counts.unsupported}`
);
console.log(`Source: ${catalog.source.repository} ${catalog.source.commit}`);
