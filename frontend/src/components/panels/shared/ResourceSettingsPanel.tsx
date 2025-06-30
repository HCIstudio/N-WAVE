import type React from "react";
import { MemoryInput, TimeInput } from "../../common/forms";

interface ResourceSettingsPanelProps {
  containerImage: string;
  setContainerImage: (v: string) => void;
  cpus: number;
  setCpus: (v: number) => void;
  memory: string;
  setMemory: (v: string) => void;
  timeLimit: string;
  setTimeLimit: (v: string) => void;
  overrideResources: boolean;
  setOverrideResources: (v: boolean) => void;
}

const ResourceSettingsPanel: React.FC<ResourceSettingsPanelProps> = ({
  containerImage,
  setContainerImage,
  cpus,
  setCpus,
  memory,
  setMemory,
  timeLimit,
  setTimeLimit,
  overrideResources,
  setOverrideResources,
}) => {
  return (
    <div className="border-t border-accent pt-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-text">
          Container & Resources
        </h4>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={overrideResources}
            onChange={(e) => setOverrideResources(e.target.checked)}
            className="rounded border-accent"
          />
          Override defaults
        </label>
      </div>

      {overrideResources && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Container image
            </label>
            <input
              type="text"
              value={containerImage}
              onChange={(e) => setContainerImage(e.target.value)}
              className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
            />
          </div>

          <div className="flex flex-row flex-wrap gap-2 mt-2">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-sm font-medium text-text mb-1">
                CPUs
              </label>
              <input
                type="number"
                min="1"
                value={cpus}
                onChange={(e) => setCpus(Number.parseInt(e.target.value) || 1)}
                className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-sm font-medium text-text mb-1">
                Memory
              </label>
              <MemoryInput value={memory} onChange={setMemory} />
            </div>
          </div>

          <div className="mt-2">
            <label className="block text-sm font-medium text-text mb-1">
              Time limit
            </label>
            <TimeInput value={timeLimit} onChange={setTimeLimit} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceSettingsPanel;
