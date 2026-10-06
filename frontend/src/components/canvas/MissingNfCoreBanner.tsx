import type React from "react";
import { useState } from "react";
import { importPackNodes } from "../../api/nodePacks";

/**
 * Shown when nodes on the canvas use nf-core modules or subworkflows that
 * aren't installed (an example, or a workflow from another install).
 */
const MissingNfCoreBanner: React.FC<{
  components: string[];
  onInstalled: () => void;
}> = ({ components, onInstalled }) => {
  const [installing, setInstalling] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  if (components.length === 0) return null;

  const install = async () => {
    setInstalling(true);
    setFailures([]);
    try {
      const result = await importPackNodes([], components);
      setFailures(result.failures);
    } finally {
      setInstalling(false);
      onInstalled();
    }
  };

  return (
    <div
      role="alert"
      aria-label="Missing nf-core components"
      className="flex flex-wrap items-center gap-3 border-t border-yellow-700/40 bg-yellow-100/90 px-4 py-3 text-sm text-yellow-900"
    >
      <p className="min-w-0 flex-1">
        This workflow uses {components.length} nf-core component
        {components.length === 1 ? "" : "s"} that{" "}
        {components.length === 1 ? "isn't" : "aren't"} installed:{" "}
        {components.join(", ")}. Their nodes generate no code until they are.
      </p>
      <button
        type="button"
        disabled={installing}
        onClick={() => void install()}
        className="rounded-md bg-nextflow-green px-3 py-1.5 font-medium text-white hover:bg-nextflow-green-dark disabled:opacity-60"
      >
        {installing ? "Installing..." : "Install them"}
      </button>
      {failures.length > 0 && (
        <ul className="basis-full list-disc pl-5 text-red-800">
          {failures.map((failure) => (
            <li key={failure}>{failure}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MissingNfCoreBanner;
