import type { LucideIcon } from "lucide-react";
import {
  ClipboardCheck,
  Code,
  Cog,
  Dna,
  Eye,
  FileCode,
  FlaskConical,
  FolderOpen,
  Funnel,
  GitMerge,
  Microscope,
  Minimize,
  Boxes,
  CircleCheck,
  CircleX,
  Package,
  PackagePlus,
  Pencil,
  Scissors,
  Server,
  Settings2,
  Sheet,
  StickyNote,
  Terminal,
  Trash2,
  Wand,
  Workflow,
  X,
} from "lucide-react";

/**
 * Icons that can be referenced by name (node definitions, custom nodes, saved
 * workflows). Importing lucide's full `icons` map pulled every icon (~700 kB)
 * into the bundle, so only the names N-WAVE actually stores are listed here.
 * Add an entry when a node definition or icon picker starts using a new icon.
 */
export const iconRegistry: Record<string, LucideIcon> = {
  ClipboardCheck,
  Code,
  Cog,
  Dna,
  Eye,
  FileCode,
  FlaskConical,
  FolderOpen,
  Funnel,
  GitMerge,
  Microscope,
  Minimize,
  Boxes,
  CircleCheck,
  CircleX,
  Package,
  PackagePlus,
  Pencil,
  Scissors,
  Server,
  Settings2,
  Sheet,
  StickyNote,
  Terminal,
  Trash2,
  Wand,
  Workflow,
  X,
};

/** Whether a name is a registered icon (not an Object.prototype key). */
export const hasIcon = (name: string): boolean =>
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn is ES2022; the app's lib is ES2020.
  Object.prototype.hasOwnProperty.call(iconRegistry, name);

/** The icon registered under a name, if any. */
export const getIcon = (name: string): LucideIcon | undefined =>
  hasIcon(name) ? iconRegistry[name] : undefined;
