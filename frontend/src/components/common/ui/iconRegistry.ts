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
