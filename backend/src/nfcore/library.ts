import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import {
	findNfCoreModuleDir,
	getNwaveDataRoot,
} from "../execution/nfcoreModules";

// The nf-core module library: the catalog, installed modules (files under
// the N-WAVE data dir plus an index), and installing modules from
// nf-core/modules at the catalog's pinned commit. Used by the /api/nfcore
// routes and by workflow execution, which installs missing modules on demand.

export type SupportLevel =
	| "full"
	| "candidate"
	| "needs_review"
	| "unsupported";

interface NfCoreInputGroup {
	argumentIndex: number;
	handle: string;
	tuple: boolean;
	metaName: string | null;
	/** Path field names (the node's input ports). */
	fields: string[];
	/** Full argument layout (meta, path and val items); catalog schema 2+. */
	items?: Array<{ kind: "meta" | "path" | "val"; name: string }>;
}

export interface NfCoreCatalogEntry {
	id: string;
	moduleName: string;
	modulePath: string;
	label: string;
	description: string;
	processName: string;
	source: {
		repository: string;
		ref: string;
		commit: string;
		path: string;
	};
	files: {
		main: boolean;
		meta: boolean;
		environment: boolean;
		/** Every file of the module except tests/, relative to its directory. */
		paths?: string[];
	};
	keywords: string[];
	tools: string[];
	inputs: string[];
	inputDeclarations?: string[];
	inputGroups?: NfCoreInputGroup[];
	valueInputs?: Array<{
		name: string;
		type: string;
		description?: string;
		defaultValue: string | number | boolean;
	}>;
	outputs: string[];
	emits: string[];
	containers: string[];
	settings?: {
		extArgs: boolean;
		extArgNames?: string[];
		argumentReferences?: Array<{
			type: string;
			url: string;
		}>;
		resources: boolean;
	};
	support: SupportLevel;
	installability?: {
		automatic: boolean;
		requiresReview: boolean;
		reasons: string[];
	};
}

export interface NfCoreCatalog {
	schemaVersion: number;
	generatedAt: string;
	source: {
		repository: string;
		ref: string;
		commit: string;
	};
	counts: Record<string, number>;
	modules: NfCoreCatalogEntry[];
}

export interface InstalledModuleIndexEntry {
	id: string;
	installedAt: string;
	moduleDir: string;
	manifestPath: string;
	sourceCommit: string;
	support: SupportLevel;
}

/** An error with the HTTP status the API should answer with. */
export class NfCoreLibraryError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly reasons: string[] = [],
	) {
		super(message);
		this.name = "NfCoreLibraryError";
	}
}

// Files used when a catalog entry has no file list (catalogs before paths).
const DEFAULT_MODULE_FILES = ["main.nf", "meta.yml", "environment.yml"];

let catalogCache: NfCoreCatalog | null = null;

const resolveCatalogPath = (): string => {
	const candidates = [
		path.join(
			process.cwd(),
			"dist",
			"workflows",
			"library",
			"assets",
			"nf-core",
			"catalog.json",
		),
		path.join(
			process.cwd(),
			"src",
			"workflows",
			"library",
			"assets",
			"nf-core",
			"catalog.json",
		),
	];
	const catalogPath = candidates.find((candidate) => fs.existsSync(candidate));
	if (!catalogPath) {
		throw new Error(
			`nf-core catalog not found. Checked: ${candidates.join(", ")}`,
		);
	}
	return catalogPath;
};

export const loadCatalog = (): NfCoreCatalog => {
	catalogCache ??= JSON.parse(
		fs.readFileSync(resolveCatalogPath(), "utf8"),
	) as NfCoreCatalog;
	return catalogCache;
};

export const findCatalogEntry = (id: string): NfCoreCatalogEntry | undefined =>
	loadCatalog().modules.find((entry) => entry.id === id);

const getInstalledIndexPath = (): string =>
	path.join(getNwaveDataRoot(), "nf-core", "installed.json");

export const getInstalledModuleRoot = (entry: NfCoreCatalogEntry): string =>
	path.join(
		getNwaveDataRoot(),
		"nf-core",
		"modules",
		"nf-core",
		...entry.modulePath.split("/"),
	);

export const loadInstalledIndex = (): Record<
	string,
	InstalledModuleIndexEntry
> => {
	const indexPath = getInstalledIndexPath();
	if (!fs.existsSync(indexPath)) return {};
	return JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<
		string,
		InstalledModuleIndexEntry
	>;
};

export const writeInstalledIndex = (
	index: Record<string, InstalledModuleIndexEntry>,
): void => {
	const indexPath = getInstalledIndexPath();
	fs.mkdirSync(path.dirname(indexPath), { recursive: true });
	fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
};

export const ensureInside = (root: string, target: string): void => {
	const resolvedRoot = path.resolve(root);
	const resolvedTarget = path.resolve(target);
	if (
		resolvedTarget !== resolvedRoot &&
		!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
	) {
		throw new Error(
			`Refusing to write outside ${resolvedRoot}: ${resolvedTarget}`,
		);
	}
};

const toTitle = (value: string): string =>
	value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

/**
 * Ports of a module: every path field of its inputs, in declaration order.
 * Older catalog entries without input groups fall back to meta.yml names.
 */
const getInputPorts = (entry: NfCoreCatalogEntry): string[] =>
	entry.inputGroups
		? entry.inputGroups.flatMap((group) =>
				group.items
					? group.items.flatMap((item) =>
							item.kind === "path" ? [item.name] : [],
						)
					: group.fields,
			)
		: entry.inputs;

// Mirrored in the frontend by buildNfCoreManifest
// (frontend/src/registry/nfcore/manifest.ts).
export const buildAdapterManifest = (entry: NfCoreCatalogEntry) => ({
	schemaVersion: 2,
	generatedAt: new Date().toISOString(),
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
	source: entry.source,
	inputGroups: entry.inputGroups,
	valueInputs: entry.valueInputs ?? [],
	inputs: getInputPorts(entry).map((inputName) => ({
		handle: inputName,
		nfcoreName: inputName,
		adapter:
			!entry.inputGroups && inputName === "reads"
				? "fastq_reads_with_meta"
				: "path",
		label: toTitle(inputName),
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

/** A safe relative file path: "main.nf", "templates/tx2gene.py". */
const isSafeRelativePath = (filePath: string): boolean =>
	filePath
		.split("/")
		.every(
			(segment) =>
				/^[A-Za-z0-9_.-]+$/.test(segment) && !/^\.\.?$/.test(segment),
		);

/** Relative paths of a module's files (templates included, tests not). */
const moduleFilePaths = (entry: NfCoreCatalogEntry): string[] =>
	(entry.files.paths ?? DEFAULT_MODULE_FILES).filter(isSafeRelativePath);

/** raw.githubusercontent.com URL of a module file at the catalog commit. */
export const moduleFileUrl = (
	entry: NfCoreCatalogEntry,
	filePath: string,
): string => {
	const repo = entry.source.repository.match(
		/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/,
	);
	if (!repo) {
		throw new Error(
			`Unsupported module repository: ${entry.source.repository}`,
		);
	}
	return `https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/${entry.source.commit}/${entry.source.path}/${filePath}`;
};

const downloadFile = async (url: string): Promise<Buffer | null> => {
	try {
		const response = await axios.get<ArrayBuffer>(url, {
			responseType: "arraybuffer",
			headers: { "User-Agent": "N-WAVE-nfcore-installer" },
		});
		return Buffer.from(response.data);
	} catch (error: unknown) {
		if (axios.isAxiosError(error) && error.response?.status === 404)
			return null;
		throw error;
	}
};

/** Check that the catalog lets a module be installed automatically. */
export const assertInstallable = (entry: NfCoreCatalogEntry): void => {
	if (
		entry.support === "unsupported" ||
		entry.installability?.automatic === false
	) {
		throw new NfCoreLibraryError(
			400,
			`${entry.id} cannot be installed automatically`,
			entry.installability?.reasons ?? [],
		);
	}
};

/**
 * Download a module's files at the catalog commit into the data dir, write
 * its adapter manifest and record it in the install index.
 */
export const installModule = async (entry: NfCoreCatalogEntry) => {
	assertInstallable(entry);

	const installRoot = getInstalledModuleRoot(entry);
	const tempRoot = `${installRoot}.tmp`;
	ensureInside(getNwaveDataRoot(), installRoot);
	fs.rmSync(tempRoot, { recursive: true, force: true });
	fs.mkdirSync(tempRoot, { recursive: true });

	try {
		for (const filePath of moduleFilePaths(entry)) {
			const content = await downloadFile(moduleFileUrl(entry, filePath));
			if (!content) {
				if (filePath === "main.nf") {
					throw new Error(
						`${entry.id} has no main.nf at ${entry.source.commit}`,
					);
				}
				continue;
			}
			const target = path.join(tempRoot, ...filePath.split("/"));
			ensureInside(tempRoot, target);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content);
		}

		const manifest = buildAdapterManifest(entry);
		fs.writeFileSync(
			path.join(tempRoot, "nwave.adapter.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);

		fs.rmSync(installRoot, { recursive: true, force: true });
		fs.mkdirSync(path.dirname(installRoot), { recursive: true });
		fs.renameSync(tempRoot, installRoot);

		const installed: InstalledModuleIndexEntry = {
			id: entry.id,
			installedAt: new Date().toISOString(),
			moduleDir: installRoot,
			manifestPath: path.join(installRoot, "nwave.adapter.json"),
			sourceCommit: entry.source.commit,
			support: entry.support,
		};
		const index = loadInstalledIndex();
		index[entry.id] = installed;
		writeInstalledIndex(index);

		return { installed, manifest };
	} catch (error: unknown) {
		fs.rmSync(tempRoot, { recursive: true, force: true });
		throw error;
	}
};

/**
 * Make sure every module a workflow includes ("fastqc", "star/align") is
 * installed, installing missing ones from the catalog. Returns the ids of
 * the modules it installed.
 */
export const ensureModulesInstalled = async (
	moduleNames: string[],
): Promise<string[]> => {
	const installed: string[] = [];
	for (const moduleName of moduleNames) {
		if (findNfCoreModuleDir(moduleName)) continue;
		const entry = findCatalogEntry(`nf-core/${moduleName}`);
		if (!entry) {
			throw new NfCoreLibraryError(
				404,
				`nf-core module "${moduleName}" is not installed and not in the catalog`,
			);
		}
		await installModule(entry);
		installed.push(entry.id);
	}
	return installed;
};

/**
 * A module's files keyed by relative path: from its installed copy, or, when
 * it isn't installed, from GitHub at the catalog commit.
 */
export const readModuleFiles = async (
	id: string,
	/** Only these files, e.g. ["main.nf"]; default: all of them. */
	only?: string[],
): Promise<Record<string, string>> => {
	const moduleName = id.replace(/^nf-core\//, "");
	const entry = findCatalogEntry(id);
	const moduleDir = findNfCoreModuleDir(moduleName);
	const paths = (entry ? moduleFilePaths(entry) : DEFAULT_MODULE_FILES).filter(
		(filePath) => !only || only.includes(filePath),
	);
	const files: Record<string, string> = {};

	if (moduleDir) {
		for (const filePath of paths) {
			const fullPath = path.join(moduleDir, ...filePath.split("/"));
			ensureInside(moduleDir, fullPath);
			if (fs.existsSync(fullPath)) {
				files[filePath] = fs.readFileSync(fullPath, "utf8");
			}
		}
		return files;
	}

	if (!entry) {
		throw new NfCoreLibraryError(404, `Unknown nf-core module: ${id}`);
	}
	for (const filePath of paths) {
		const content = await downloadFile(moduleFileUrl(entry, filePath));
		if (content) files[filePath] = content.toString("utf8");
	}
	if (!files["main.nf"]) {
		throw new NfCoreLibraryError(
			404,
			`${id} has no main.nf at ${entry.source.commit}`,
		);
	}
	return files;
};
