import { BookOpen, ExternalLink, Loader } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { getNfCoreModuleInfo } from "../../../api/nfcore";
import {
  type NfCoreModuleDocs as Docs,
  type NfCorePortDoc,
  nfCoreDocsUrl,
  parseNfCoreMeta,
} from "../../../registry/nfcore/moduleDocs";
import { isNfCoreSubworkflowId } from "../../../registry/nfcore/subworkflow";
import { getErrorMessage } from "../../../utils/errors";
import type { PortData } from "../../nodes/BaseNode";

interface NfCoreModuleDocsProps {
  /** e.g. "nf-core/star/align" */
  moduleId: string;
  inputs: PortData[];
  outputs: PortData[];
}

type DocsState =
  | { status: "loading" }
  | { status: "loaded"; docs: Docs | null }
  | { status: "error"; message: string };

const ExternalLinkChip: React.FC<{ href: string; children: React.ReactNode }> =
  ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-accent px-2 py-1 text-xs text-nextflow-green hover:bg-accent"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );

const PortList: React.FC<{
  title: string;
  ports: PortData[];
  docs: NfCorePortDoc[] | undefined;
}> = ({ title, ports, docs }) => {
  if (ports.length === 0) return null;
  return (
    <details className="group rounded-md border border-accent">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-text">
        {title} ({ports.length})
      </summary>
      <ul aria-label={title} className="space-y-3 border-t border-accent p-3">
        {ports.map((port) => {
          const doc = docs?.find((entry) => entry.name === port.name);
          // List a tuple's files unless the node gives them their own ports.
          const parts = doc?.parts?.some(
            (part) =>
              part.name !== port.name &&
              ports.some((other) => other.name === part.name),
          )
            ? undefined
            : doc?.parts;
          return (
            <li key={port.name} className="text-sm">
              <p className="font-medium text-text">
                {port.label || port.name}{" "}
                <span className="font-mono text-xs font-normal text-text-light">
                  {port.name}
                </span>
              </p>
              {parts ? (
                <>
                  <p className="text-text-light">
                    Carries {parts.length} files together:
                  </p>
                  <ul className="ml-4 list-disc text-text-light">
                    {parts.map((part) => (
                      <li key={part.name}>
                        <span className="font-mono text-xs">{part.name}</span>
                        {part.description ? `: ${part.description}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-text-light">
                  {doc?.description ||
                    (docs ? "Not described in the module's meta.yml." : "")}
                </p>
              )}
              {doc?.pattern && (
                <p className="text-xs text-text-light">
                  Files: <code className="font-mono">{doc.pattern}</code>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
};

/**
 * What an nf-core module or subworkflow does and what each of its ports
 * holds, from its meta.yml, with links to its documentation.
 */
const NfCoreModuleDocs: React.FC<NfCoreModuleDocsProps> = ({
  moduleId,
  inputs,
  outputs,
}) => {
  const [state, setState] = useState<DocsState>({ status: "loading" });
  const kind = isNfCoreSubworkflowId(moduleId) ? "subworkflow" : "module";

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getNfCoreModuleInfo(moduleId).then(
      ({ meta }) => {
        if (!cancelled) {
          setState({
            status: "loaded",
            docs: meta ? parseNfCoreMeta(meta) : null,
          });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: getErrorMessage(
              error,
              `Could not load the ${kind}'s description.`,
            ),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [moduleId, kind]);

  const docs = state.status === "loaded" ? state.docs : null;

  return (
    <section aria-label={`About this nf-core ${kind}`} className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        <BookOpen className="h-4 w-4" aria-hidden />
        About this nf-core {kind}
      </h3>
      {docs?.description && (
        <p className="text-sm text-text">{docs.description}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <ExternalLinkChip href={nfCoreDocsUrl(moduleId)}>
          nf-core documentation
        </ExternalLinkChip>
        {docs?.tools.flatMap((tool) =>
          [
            tool.documentation && (
              <ExternalLinkChip
                key={`${tool.name}-documentation`}
                href={tool.documentation}
              >
                {tool.name} documentation
              </ExternalLinkChip>
            ),
            tool.homepage && tool.homepage !== tool.documentation && (
              <ExternalLinkChip
                key={`${tool.name}-homepage`}
                href={tool.homepage}
              >
                {tool.name} homepage
              </ExternalLinkChip>
            ),
          ].filter(Boolean),
        )}
      </div>
      <p className="text-xs text-text-light">
        The node&apos;s inputs and outputs are the {kind}&apos;s own channels,
        as nf-core defines them. Connect the inputs it needs and only the
        outputs you want to pass on to other nodes.
      </p>
      {state.status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-text-light">
          <Loader size={14} className="animate-spin" aria-hidden />
          Loading the {kind}&apos;s description…
        </p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-text-light">
          {state.message} The nf-core documentation describes every input
          and output.
        </p>
      )}
      <PortList title="Inputs" ports={inputs} docs={docs?.inputs} />
      <PortList title="Outputs" ports={outputs} docs={docs?.outputs} />
    </section>
  );
};

export default NfCoreModuleDocs;
