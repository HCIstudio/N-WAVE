import type { NodeData } from "../components/nodes/BaseNode";

export interface NextflowProcess {
  label: string;
  description: string;
  type: string;
  icon: string;
  initialData?: Partial<NodeData>;
  outputs?: { name: string; isConnectable?: boolean; label?: string }[];
  operatorType?: "filter" | "map" | "merge";
  filterCondition?: string;
  filterValue?: string;
  mapReplaceFind?: string;
  mapReplaceWith?: string;
  mergeOperation?: "join";
  mergeJoinSeparator?: string;
  joinType?: string;
  processType?: "fastqc" | "trimmomatic";
  threads?: number;
}

export interface NextflowProcessCategory {
  category: string;
  processes: NextflowProcess[];
}

export interface SelectedFile {
  id: string;
  name: string;
}
