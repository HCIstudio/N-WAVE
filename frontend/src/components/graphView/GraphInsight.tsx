// The side panel of a graph view: what the structure tells about the
// workflow (how big, how deep, what can run side by side, where it starts and
// ends, which steps many others hang on), and for a selected process what it
// depends on and what a change to it affects.

import { ArrowDownRight, ArrowUpLeft, Crosshair, Route } from "lucide-react";
import type React from "react";
import type { GraphKind, GraphModel, StructureInsight } from "../../analysis/graphViews";

export interface Selection {
  /** The selected node of the model, or a collapsed subworkflow (`cluster:<id>`). */
  id: string;
  title: string;
  kind: "step" | "operation" | "cluster";
  /** Where it is: its subworkflows, or the workflow a cluster calls. */
  where: string | null;
  conditions: string[];
  code: string;
  upstream: string[];
  downstream: string[];
  /** Shows its node in the editor; unset when it has none of its own. */
  onShowInEditor?: () => void;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-text-light first:mt-0">{children}</h3>
);

/** A node's name, and where it is (its subworkflows), if anywhere. */
export type LabelOf = (id: string) => { label: string; where: string | null };

const StepList: React.FC<{
  ids: string[];
  labelOf: LabelOf;
  onSelect: (id: string) => void;
  ordered?: boolean;
  label: string;
}> = ({ ids, labelOf, onSelect, ordered = false, label }) => {
  if (ids.length === 0) return <p className="text-sm text-text-light">None.</p>;
  const List = ordered ? "ol" : "ul";
  return (
    <List aria-label={label} className={ordered ? "list-decimal space-y-0.5 pl-5 text-sm" : "space-y-0.5 text-sm"}>
      {ids.map((id) => (
        <li key={id}>
          <button type="button" onClick={() => onSelect(id)} className="text-left text-text hover:text-primary hover:underline">
            {labelOf(id).label}
          </button>
          {labelOf(id).where && <span className="block text-xs text-text-light">{labelOf(id).where}</span>}
        </li>
      ))}
    </List>
  );
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const GraphInsight: React.FC<{
  kind: GraphKind;
  model: GraphModel;
  insight: StructureInsight;
  selection: Selection | null;
  labelOf: LabelOf;
  onSelect: (id: string) => void;
  showPath: boolean;
  onShowPath: (on: boolean) => void;
}> = ({ kind, model, insight, selection, labelOf, onSelect, showPath, onShowPath }) => {
  const stepIds = new Set(model.nodes.filter((node) => node.kind === "step").map((node) => node.id));
  const steps = (ids: string[]) => ids.filter((id) => stepIds.has(id));
  return (
    <aside
      aria-label="What the structure tells"
      className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-panel-border bg-panel-background px-4 pb-28 pt-4 text-text"
    >
      {selection && (
        <section aria-label="Selected" className="mb-4 rounded-md border border-blue-500/60 bg-blue-500/5 p-3">
          <p className="text-xs uppercase tracking-wide text-text-light">
            {selection.kind === "step" ? "Process" : selection.kind === "operation" ? "Channel operation" : "Subworkflow"}
          </p>
          <p className="break-words font-semibold">{selection.title}</p>
          {selection.where && <p className="text-xs text-text-light">{selection.where}</p>}
          {selection.conditions.length > 0 && (
            <p className="mt-1 text-xs text-violet-300">Runs if {selection.conditions.join(" and ")}</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <ArrowUpLeft className="h-4 w-4 text-sky-400" aria-hidden />
            Depends on {plural(steps(selection.upstream).length, "process", "processes")}
          </p>
          <p className="flex items-center gap-1.5 text-sm">
            <ArrowDownRight className="h-4 w-4 text-amber-400" aria-hidden />
            A change to it affects {plural(steps(selection.downstream).length, "process", "processes")}
          </p>
          {steps(selection.downstream).length > 0 && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-text-light">Affected processes</summary>
              <StepList ids={steps(selection.downstream)} labelOf={labelOf} onSelect={onSelect} label="Affected processes" />
            </details>
          )}
          {steps(selection.upstream).length > 0 && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-text-light">Processes it depends on</summary>
              <StepList ids={steps(selection.upstream)} labelOf={labelOf} onSelect={onSelect} label="Processes it depends on" />
            </details>
          )}
          {selection.code.trim() && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-text-light">Code</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/30 p-2 font-mono text-[11px] leading-snug">{selection.code}</pre>
            </details>
          )}
          {selection.onShowInEditor && (
            <button
              type="button"
              onClick={selection.onShowInEditor}
              className="mt-2 flex items-center gap-1 rounded border border-panel-border px-2 py-0.5 text-xs hover:bg-accent"
            >
              <Crosshair className="h-3.5 w-3.5" aria-hidden /> Show in the editor
            </button>
          )}
        </section>
      )}

      <SectionTitle>The structure</SectionTitle>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-text-light">Processes</dt>
        <dd>{insight.steps}</dd>
        {kind === "specification" && (
          <>
            <dt className="text-text-light">Channel operations</dt>
            <dd>{insight.operations}</dd>
          </>
        )}
        <dt className="text-text-light">Dependencies between processes</dt>
        <dd>{insight.dependencies}</dd>
        <dt className="text-text-light">Subworkflows</dt>
        <dd>{insight.subworkflows}</dd>
        <dt className="text-text-light" title="The most processes one after the other: a run waits for each of them in turn.">
          Longest chain
        </dt>
        <dd>{plural(insight.longestChain, "process", "processes")}</dd>
        <dt
          className="text-text-light"
          title="The most processes with no dependency between them at the same depth: they can run at the same time."
        >
          Side by side, at most
        </dt>
        <dd>{plural(insight.parallelWidth, "process", "processes")}</dd>
        <dt className="text-text-light">Under a condition</dt>
        <dd>{insight.conditionalSteps}</dd>
      </dl>

      <SectionTitle>Longest chain</SectionTitle>
      <p className="mb-1 text-xs text-text-light">
        The processes a run waits for one after the other: making one of them faster makes the whole run faster.
      </p>
      <label className="mb-1 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showPath} onChange={(event) => onShowPath(event.target.checked)} />
        <Route className="h-4 w-4 text-emerald-400" aria-hidden /> Highlight it
      </label>
      <StepList ids={steps(insight.path)} labelOf={labelOf} onSelect={onSelect} ordered label="Longest chain" />

      <SectionTitle>Starts with</SectionTitle>
      <StepList ids={insight.entrySteps} labelOf={labelOf} onSelect={onSelect} label="Processes it starts with" />
      <SectionTitle>Ends with</SectionTitle>
      <StepList ids={insight.endSteps} labelOf={labelOf} onSelect={onSelect} label="Processes it ends with" />

      <SectionTitle>Most depended on</SectionTitle>
      <p className="mb-1 text-xs text-text-light">A change to these affects the most processes after them.</p>
      {insight.mostDependedOn.length === 0 ? (
        <p className="text-sm text-text-light">None.</p>
      ) : (
        <ul aria-label="Most depended on" className="space-y-0.5 text-sm">
          {insight.mostDependedOn.map(({ id, count }) => (
            <li key={id}>
              <button type="button" onClick={() => onSelect(id)} className="text-left hover:text-primary hover:underline">
                {labelOf(id).label}
              </button>{" "}
              <span className="text-text-light">· {plural(count, "process", "processes")} after it</span>
            </li>
          ))}
        </ul>
      )}
      {insight.conditional.length > 0 && (
        <>
          <SectionTitle>Under a condition</SectionTitle>
          <StepList ids={insight.conditional} labelOf={labelOf} onSelect={onSelect} label="Processes under a condition" />
        </>
      )}
      <p className="mt-6 text-xs text-text-light">
        Select a process to see what it depends on and what a change to it affects.
      </p>
    </aside>
  );
};

export default GraphInsight;
