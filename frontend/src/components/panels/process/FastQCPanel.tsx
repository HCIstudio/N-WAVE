import React, { useState } from "react";
import ResourceSettingsPanel from "../shared/ResourceSettingsPanel";
import type { Node } from "reactflow";
import { ClipboardCheck, Info, FileText, Archive } from "lucide-react";
import type { NodeData } from "../../nodes/BaseNode";

interface FastQCPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const FastQCPanel: React.FC<FastQCPanelProps> = ({ node, onSave }) => {
  // FastQC-specific parameters
  const [adapters, setAdapters] = useState(node.data.adapters || "");
  const [limits, setLimits] = useState(node.data.limits || "");
  const [kmers, setKmers] = useState(node.data.kmers || 7);
  const [nogroup, setNogroup] = useState(node.data.nogroup || false);
  const [format, setFormat] = useState(node.data.format || "");
  const [threads, setThreads] = useState(node.data.threads || 1);

  // Container and resource settings
  const [containerImage, setContainerImage] = useState(
    node.data.containerImage || "biocontainers/fastqc:latest"
  );
  const [cpus, setCpus] = useState(node.data.cpus || 2);
  const [memory, setMemory] = useState(node.data.memory || "4.GB");
  const [timeLimit, setTimeLimit] = useState(node.data.timeLimit || "2.h");
  const [overrideResources, setOverrideResources] = useState<boolean>(
    node.data.overrideResources || false
  );

  const handleSave = () => {
    const updateData = {
      adapters,
      limits,
      kmers,
      nogroup,
      format,
      threads,
      // Container and resource settings
      overrideResources,
      containerImage: overrideResources ? containerImage : undefined,
      cpus: overrideResources ? cpus : undefined,
      memory: overrideResources ? memory : undefined,
      timeLimit: overrideResources ? timeLimit : undefined,
      // Update labels based on configuration
      label: "FastQC",
      subtitle: `Quality Control${
        threads > 1 ? ` (${threads} threads)` : ""
      } | ${memory} RAM`,
      // Mark this as a FastQC process type
      processType: "fastqc",
    };
    onSave(node.id, updateData);
  };

  // Auto-save on changes
  React.useEffect(() => {
    handleSave();
  }, [
    adapters,
    limits,
    kmers,
    nogroup,
    format,
    threads,
    containerImage,
    cpus,
    memory,
    timeLimit,
    overrideResources,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck className="w-5 h-5 text-nextflow-green" />
        <h3 className="text-lg font-semibold text-text">
          FastQC Configuration
        </h3>
      </div>

      {/* Basic Parameters */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Format
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
          >
            <option value="">Auto-detect</option>
            <option value="fastq">FASTQ</option>
            <option value="bam">BAM</option>
            <option value="sam">SAM</option>
          </select>
          <p className="text-xs text-text-light mt-1">
            Leave blank for automatic format detection
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Threads
          </label>
          <input
            type="number"
            min="1"
            max="16"
            value={threads}
            onChange={(e) => setThreads(Number.parseInt(e.target.value) || 1)}
            className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
          />
          <p className="text-xs text-text-light mt-1">
            Number of parallel threads to use
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            K-mer size
          </label>
          <input
            type="number"
            min="2"
            max="10"
            value={kmers}
            onChange={(e) => setKmers(Number.parseInt(e.target.value) || 7)}
            className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
          />
          <p className="text-xs text-text-light mt-1">
            K-mer size for over-representation analysis (default: 7)
          </p>
        </div>
      </div>

      {/* Advanced Options */}
      <div className="border-t border-accent pt-4">
        <h4 className="text-sm font-semibold text-text mb-3">
          Advanced Options
        </h4>

        <div className="space-y-3">
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={nogroup}
                onChange={(e) => setNogroup(e.target.checked)}
                className="rounded border-accent"
              />
              <span className="text-sm text-text">
                Disable grouping of bases for reads &gt;50bp
              </span>
            </label>
            <p className="text-xs text-text-light mt-1 ml-6">
              Useful for very long reads where grouping may obscure important
              patterns
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Adapters file
            </label>
            <input
              type="text"
              value={adapters}
              onChange={(e) => setAdapters(e.target.value)}
              placeholder="path/to/adapters.txt"
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-1">
              Optional file with adapter sequences for contamination check
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Limits file
            </label>
            <input
              type="text"
              value={limits}
              onChange={(e) => setLimits(e.target.value)}
              placeholder="path/to/limits.txt"
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-1">
              Optional file specifying alternative quality thresholds
            </p>
          </div>
        </div>
      </div>

      <ResourceSettingsPanel
        containerImage={containerImage}
        setContainerImage={setContainerImage}
        cpus={cpus}
        setCpus={setCpus}
        memory={memory}
        setMemory={setMemory}
        timeLimit={timeLimit}
        setTimeLimit={setTimeLimit}
        overrideResources={overrideResources}
        setOverrideResources={setOverrideResources}
      />

      {/* Output Information */}
      <div className="border-t border-accent pt-4">
        <h4 className="text-sm font-semibold text-text mb-3">Outputs</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-light">
            <Archive className="w-4 h-4" />
            <span>FastQC ZIP archive (detailed results)</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-light">
            <FileText className="w-4 h-4" />
            <span>FastQC HTML report (visual results)</span>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/20 dark:border-blue-800">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-700 dark:text-blue-400">
            <p className="font-medium mb-1">About FastQC</p>
            <p>
              FastQC aims to provide a QC report which can spot problems which
              originate either in the sequencer or in the starting library
              material. It provides information about sequence quality, GC
              content, adapter contamination, and more.
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
              <strong>Correct:</strong> File Input → FastQC (for quality
              reports)
              <br />
              <strong>Also correct:</strong> File Input → Trimmomatic (for
              trimming)
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

export default FastQCPanel;
