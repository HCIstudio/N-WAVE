import type React from "react";
import { useRef, useState } from "react";
import { importPackNodes } from "../../api/nodePacks";

/**
 * Shown when nodes on the canvas use nf-core modules or subworkflows that
 * aren't installed (an example, or a workflow from another install).
 */
const MissingNfCoreBanner: React.FC<{
  components: string[];
  onInstalled: () => void;
}> = ({ components, onInstalled }) => {
  // What is being installed now, e.g. "nf-core/fastqc (1 of 3)".
  const [installing, setInstalling] = useState<string | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const cancel = useRef<AbortController | null>(null);

  if (components.length === 0) return null;

  const install = async () => {
    const controller = new AbortController();
    cancel.current = controller;
    setInstalling("…");
    setFailures([]);
    setCancelled(false);
    try {
      const result = await importPackNodes([], components, {
        signal: controller.signal,
        onInstalling: (id, position, count) =>
          setInstalling(count > 1 ? `${id} (${position} of ${count})` : id),
      });
      setFailures(result.failures);
      setCancelled(Boolean(result.cancelled));
    } finally {
      cancel.current = null;
      setInstalling(null);
      onInstalled();
    }
  };

  return (
    <div
      role="alert"
      aria-label="Missing nf-core components"
      className="pointer-events-auto flex max-h-[40vh] flex-wrap items-center gap-3 overflow-y-auto rounded-lg border border-yellow-700/40 bg-yellow-100 px-4 py-3 text-sm text-yellow-900 shadow-lg"
    >
      <p className="min-w-0 flex-1">
        {installing ? (
          <output>Installing {installing}</output>
        ) : (
          <>
            This workflow uses {components.length} nf-core component
            {components.length === 1 ? "" : "s"} that{" "}
            {components.length === 1 ? "isn't" : "aren't"} installed:{" "}
            {components.join(", ")}. Their nodes generate no code until they
            are.
            {cancelled &&
              " Installing was cancelled; what finished stays installed."}
          </>
        )}
      </p>
      {installing ? (
        <button
          type="button"
          onClick={() => cancel.current?.abort()}
          className="rounded-md border border-yellow-800/40 bg-white/70 px-3 py-1.5 font-medium text-yellow-900 hover:bg-white"
        >
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void install()}
          className="rounded-md bg-nextflow-green px-3 py-1.5 font-medium text-white hover:bg-nextflow-green-dark"
        >
          Install them
        </button>
      )}
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
