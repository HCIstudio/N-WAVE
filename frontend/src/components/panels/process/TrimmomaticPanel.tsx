import React, { useState } from "react";
import { Scissors, Info, ChevronDown, ChevronUp } from "lucide-react";
import type { Node } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";
import MemoryInput from "../../common/forms/MemoryInput";
import TimeInput from "../../common/forms/TimeInput";

interface TrimmomaticPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const TrimmomaticPanel: React.FC<TrimmomaticPanelProps> = ({
  node,
  onSave,
}) => {
  // Trimmomatic-specific parameters (with best-practice defaults)
  const [leading, setLeading] = useState(node.data.leading ?? 3);
  const [trailing, setTrailing] = useState(node.data.trailing ?? 3);
  const [slidingwindow, setSlidingwindow] = useState(
    node.data.slidingwindow ?? "4:15"
  );
  const [minlen, setMinlen] = useState(node.data.minlen ?? 36);
  // Advanced
  const [adapterFile, setAdapterFile] = useState(node.data.adapter_file ?? "");
  const [customSteps, setCustomSteps] = useState(node.data.custom_steps ?? "");
  const [phredScore, setPhredScore] = useState(node.data.phred_score ?? "33");
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Container and resource settings
  const [containerImage, setContainerImage] = useState(
    node.data.containerImage ?? "staphb/trimmomatic:latest"
  );
  const [cpus, setCpus] = useState(node.data.cpus ?? 4);
  const [memory, setMemory] = useState(node.data.memory ?? "4.GB");
  const [timeLimit, setTimeLimit] = useState(node.data.timeLimit ?? "4.h");

  const handleSave = () => {
    const updateData = {
      leading,
      trailing,
      slidingwindow,
      minlen,
      adapter_file: adapterFile,
      custom_steps: customSteps,
      phred_score: phredScore,
      // Container and resource settings
      containerImage,
      cpus,
      memory,
      timeLimit,
      // Update labels based on configuration
      label: "Trimmomatic",
      subtitle: `Quality Trimming | MinLen: ${minlen} | ${memory} RAM`,
      // Mark this as a Trimmomatic process type
      processType: "trimmomatic",
    };
    onSave(node.id, updateData);
  };

  // Auto-save on changes
  React.useEffect(() => {
    handleSave();
  }, [
    leading,
    trailing,
    slidingwindow,
    minlen,
    adapterFile,
    customSteps,
    phredScore,
    containerImage,
    cpus,
    memory,
    timeLimit,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Scissors className="w-5 h-5 text-nextflow-green" />
        <h3 className="text-lg font-semibold text-text">
          Trimmomatic Configuration
        </h3>
      </div>

      {/* Basic Trimming Parameters */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Leading
            </label>
            <input
              type="number"
              min="0"
              max="40"
              value={leading}
              onChange={(e) => setLeading(Number.parseInt(e.target.value) || 0)}
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-1">
              Cut bases off start if quality below this threshold
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Trailing
            </label>
            <input
              type="number"
              min="0"
              max="40"
              value={trailing}
              onChange={(e) => setTrailing(Number.parseInt(e.target.value) || 0)}
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-1">
              Cut bases off end if quality below this threshold
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Sliding Window
            </label>
            <input
              type="text"
              value={slidingwindow}
              onChange={(e) => setSlidingwindow(e.target.value)}
              placeholder="4:15"
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-1">
              Window size:quality threshold (e.g., 4:15)
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Min Length
            </label>
            <input
              type="number"
              min="1"
              max="300"
              value={minlen}
              onChange={(e) => setMinlen(Number.parseInt(e.target.value) || 1)}
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-1">
              Drop reads shorter than this length
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Options Toggle */}
      <button
        type="button"
        className="flex items-center gap-2 text-sm text-nextflow-green font-semibold mt-2"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}{" "}
        Advanced Options
      </button>
      {showAdvanced && (
        <div className="border-t border-accent pt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Adapter File
            </label>
            <input
              type="text"
              value={adapterFile}
              onChange={(e) => setAdapterFile(e.target.value)}
              placeholder="path/to/adapters.fa"
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-1">
              FASTA file containing adapter sequences for removal
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Custom Steps
            </label>
            <textarea
              value={customSteps}
              onChange={(e) => setCustomSteps(e.target.value)}
              placeholder="ILLUMINACLIP:adapters.fa:2:30:10"
              rows={3}
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-1">
              Additional Trimmomatic steps (one per line)
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Phred Score
            </label>
            <select
              value={phredScore}
              onChange={(e) => setPhredScore(e.target.value)}
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            >
              <option value="33">Phred+33 (Sanger/Illumina 1.8+)</option>
              <option value="64">Phred+64 (Illumina 1.3-1.7)</option>
            </select>
            <p className="text-xs text-text-light mt-1">
              Quality score encoding format (hardcoded to phred33 in script)
            </p>
          </div>
        </div>
      )}

      {/* Container and Resource Settings */}
      <div className="border-t border-accent pt-4">
        <h4 className="text-sm font-semibold text-text mb-3">
          Container & Resources
        </h4>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Container Image
            </label>
            <select
              value={containerImage}
              onChange={(e) => setContainerImage(e.target.value)}
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            >
              <option value="staphb/trimmomatic:latest">
                Trimmomatic (StaPH-B)
              </option>
              <option value="biocontainers/trimmomatic:latest">
                Trimmomatic (BioContainers)
              </option>
              <option value="biocontainers/trimmomatic:0.39">
                Trimmomatic v0.39
              </option>
            </select>
            <p className="text-xs text-text-light mt-1">
              Docker container to use for Trimmomatic execution
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                CPUs
              </label>
              <input
                type="number"
                min="1"
                max="16"
                value={cpus}
                onChange={(e) => setCpus(Number.parseInt(e.target.value) || 1)}
                className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Memory
              </label>
              <MemoryInput value={memory} onChange={setMemory} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Time Limit
            </label>
            <TimeInput value={timeLimit} onChange={setTimeLimit} />
            <p className="text-xs text-text-light mt-1">
              Maximum execution time before timeout
            </p>
          </div>
        </div>
      </div>

      {/* Output Information */}
      <div className="border-t border-accent pt-4">
        <h4 className="text-sm font-semibold text-text mb-3">Outputs</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-light">
            <Scissors className="w-4 h-4" />
            <span>Trimmed paired-end FASTQ files</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-light">
            <Scissors className="w-4 h-4" />
            <span>Unpaired reads (survivors)</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-light">
            <Info className="w-4 h-4" />
            <span>Trimming summary log</span>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/20 dark:border-blue-800">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-700 dark:text-blue-400">
            <p className="font-medium mb-1">About Trimmomatic</p>
            <p>
              Trimmomatic performs quality trimming on FASTQ files. It can
              remove adapter sequences, trim low-quality bases, and filter reads
              by length. Use FastQC reports to inform trimming parameters.
            </p>
          </div>
        </div>
      </div>

      {/* Workflow Guidance */}
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-900/20 dark:border-yellow-800">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-yellow-700 dark:text-yellow-400">
            <p className="font-medium mb-1">Workflow Setup</p>
            <p>
              <strong>Correct:</strong> File Input → Trimmomatic (for trimming)
              <br />
              <strong>Also correct:</strong> File Input → FastQC (for QC
              reports)
              <br />
              <strong>Incorrect:</strong> FastQC → Trimmomatic (FastQC outputs
              ZIP/HTML, not FASTQ)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrimmomaticPanel;
