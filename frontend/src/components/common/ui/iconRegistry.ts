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
  Microscope,
  Minimize,
  Package,
  PackagePlus,
  Pencil,
  Scissors,
  Server,
  Terminal,
  Trash2,
  Wand,
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
  Microscope,
  Minimize,
  Package,
  PackagePlus,
  Pencil,
  Scissors,
  Server,
  Terminal,
  Trash2,
  Wand,
  X,
};
