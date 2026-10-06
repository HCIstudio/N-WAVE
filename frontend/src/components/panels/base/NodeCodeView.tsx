import { FileCode, Loader, Pencil } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { Node } from "reactflow";
import { getNfCoreModuleSource } from "../../../api/nfcore";
import { isNfCoreSubworkflowId } from "../../../registry/nfcore/subworkflow";
import { getNodeCode } from "../../../registry/nodeCode";
import { getErrorMessage } from "../../../utils/errors";
import CodeBlock from "../../common/data/CodeBlock";
import type { NodeData } from "../../nodes/BaseNode";

interface NodeCodeViewProps {
  node: Node<NodeData>;
  /** Replace the node with an editable custom copy (bundled/nf-core nodes). */
  onConvertToCustom?: (
    node: Node<NodeData>,
    moduleSource?: string,
  ) => Promise<void>;
  /** Open the custom node editor (custom nodes). */
  onEditCustomNode?: (customNodeId: string) => void;
}

type ModuleSourceState =
  | { status: "idle" | "loading" }
  | { status: "loaded"; source: string }
  | { status: "error"; message: string };

const Section: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className="space-y-2">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-light">
      {title}
    </h3>
    {children}
  </section>
);

/** Read-only view of the Nextflow code a node contributes to the workflow. */
const NodeCodeView: React.FC<NodeCodeViewProps> = ({
  node,
  onConvertToCustom,
  onEditCustomNode,
}) => {
  const code = useMemo(() => getNodeCode(node), [node]);
  const moduleId = code?.nfCoreModule?.id;
  const moduleKind =
    moduleId && isNfCoreSubworkflowId(moduleId) ? "subworkflow" : "module";
  const [moduleSource, setModuleSource] = useState<ModuleSourceState>({
    status: "idle",
  });
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleId) return;
    let cancelled = false;
    setModuleSource({ status: "loading" });
    getNfCoreModuleSource(moduleId).then(
      (source) => {
        if (!cancelled) setModuleSource({ status: "loaded", source });
      },
      (error: unknown) => {
        if (!cancelled) {
          setModuleSource({
            status: "error",
            message: getErrorMessage(
              error,
              `Could not load the ${moduleKind} source.`,
            ),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [moduleId, moduleKind]);

  if (!code) {
    return (
      <p className="py-4 text-center text-sm text-text-light">
        This node doesn&apos;t generate a process. It only provides input data
        to the workflow.
      </p>
    );
  }

  const customNodeId =
    typeof node.data.customNodeId === "string" ? node.data.customNodeId : null;
  const canConvert =
    !code.isCustom &&
    Boolean(onConvertToCustom) &&
    (!code.nfCoreModule || moduleSource.status === "loaded");

  const convert = async () => {
    if (!onConvertToCustom) return;
    setIsConverting(true);
    setConvertError(null);
    try {
      await onConvertToCustom(
        node,
        moduleSource.status === "loaded" ? moduleSource.source : undefined,
      );
    } catch (error: unknown) {
      setConvertError(getErrorMessage(error, "Conversion failed."));
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-light">
        The Nextflow code this node adds to the generated workflow. It is
        read-only;{" "}
        {code.isCustom
          ? "edit the custom node to change it."
          : "convert the node to a custom node to edit it."}
      </p>

      {code.nfCoreModule ? (
        <Section
          title={
            <>
              nf-core {moduleKind}{" "}
              <span className="font-mono normal-case">
                {code.nfCoreModule.id}
              </span>
            </>
          }
        >
          {moduleSource.status === "loaded" && (
            <CodeBlock
              code={moduleSource.source}
              label={moduleKind === "module" ? "Module code" : "Subworkflow code"}
            />
          )}
          {moduleSource.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-text-light">
              <Loader size={14} className="animate-spin" aria-hidden />
              Loading {moduleKind} source…
            </p>
          )}
          {moduleSource.status === "error" && (
            <p role="alert" className="text-sm text-danger">
              {moduleSource.message}
            </p>
          )}
          <CodeBlock
            code={code.includeStatements.join("\n")}
            label="Include statement"
          />
        </Section>
      ) : (
        <Section title="Process">
          <CodeBlock code={code.processSource} label="Process code" />
          {code.includeStatements.length > 0 && (
            <CodeBlock
              code={code.includeStatements.join("\n")}
              label="Include statements"
            />
          )}
        </Section>
      )}

      {code.configBlocks.length > 0 && (
        <Section title="Configuration">
          <CodeBlock
            code={`process {\n${code.configBlocks
              .map((block) =>
                block
                  .split("\n")
                  .map((line) => `  ${line}`)
                  .join("\n"),
              )
              .join("\n")}\n}`}
            label="Process configuration"
          />
        </Section>
      )}

      <Section title="In the workflow block">
        <p className="text-xs text-text-light">
          Input channels are shown as placeholders (<code>&lt;port&gt;_ch</code>
          ); the generated script uses the channels of the connected nodes.
        </p>
        <CodeBlock code={code.workflowSnippet} label="Workflow code" />
      </Section>

      {customNodeId && onEditCustomNode && (
        <button
          type="button"
          onClick={() => onEditCustomNode(customNodeId)}
          className="inline-flex items-center gap-2 rounded-md bg-nextflow-green px-4 py-2 text-sm text-white hover:bg-nextflow-green-dark"
        >
          <Pencil size={16} aria-hidden />
          Edit custom node
        </button>
      )}

      {!code.isCustom && onConvertToCustom && (
        <div className="space-y-2 rounded-md border border-panel-border p-3">
          <p className="text-sm text-text-light">
            Convert this node into an editable custom node. The node is replaced
            in place; connections to ports that still exist are kept.
          </p>
          <button
            type="button"
            onClick={convert}
            disabled={!canConvert || isConverting}
            className="inline-flex items-center gap-2 rounded-md bg-nextflow-green px-4 py-2 text-sm text-white hover:bg-nextflow-green-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConverting ? (
              <Loader size={16} className="animate-spin" aria-hidden />
            ) : (
              <FileCode size={16} aria-hidden />
            )}
            Convert to custom node
          </button>
          {convertError && (
            <p role="alert" className="text-sm text-danger">
              {convertError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default NodeCodeView;
