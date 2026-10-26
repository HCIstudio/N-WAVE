import type React from "react";
import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft } from "lucide-react";
import PageLayout from "../components/layout/PageLayout";
import SearchInput from "../components/common/forms/SearchInput";
import { NodeKindSwatch } from "../components/common/workflow/NodeKindLegend";
import { NODE_KIND_ORDER, NODE_KINDS } from "../workflows/nodeKinds";
import { GLOSSARY, glossaryEntry } from "../glossary/glossary";
import { README_URL, WIKI_PAGES, WIKI_URL, wikiUrl } from "../docs/links";

/** What a part of the canvas does, for the "On the canvas" list. */
const CANVAS_PARTS: { name: string; what: string }[] = [
  { name: "Add node", what: "Adds inputs, nf-core tools, operators, your own processes and outputs." },
  { name: "Connecting", what: "Drag from an output to an input; inputs that fit light up while you drag." },
  { name: "Workflow check", what: "The shield next to Run lists what keeps the workflow from running." },
  { name: "Run and Resume", what: "Run starts it; with Resume on, it reuses the steps an earlier run finished." },
  { name: "Runs", what: "The bar at the bottom right: the run's steps, log and results, and earlier runs." },
  { name: "Execution settings", what: "Docker or not, resource limits, where results go, run profiles." },
  { name: "Export Project", what: "A folder with the script, config, modules and inputs, to run anywhere." },
  { name: "Keyboard shortcuts", what: "Press ? on the canvas: undo, copy, paste, duplicate and more." },
];

/** What N-WAVE does and how to use it, and every term it explains, on one page. */
const HelpPage: React.FC = () => {
  const headingId = useId();
  const { hash } = useLocation();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const entries = query
    ? GLOSSARY.filter((entry) => `${entry.term} ${entry.definition}`.toLowerCase().includes(query))
    : GLOSSARY;

  // The page is loaded on demand, after the browser looked for the anchor.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <PageLayout>
      <main aria-labelledby={headingId} className="mx-auto max-w-6xl p-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-nextflow-green hover:underline">
          <ArrowLeft size={16} aria-hidden />
          Workflows
        </Link>
        <h1 id={headingId} className="mt-4 text-3xl font-bold text-text">
          Help
        </h1>

        <section aria-labelledby="what-it-does" className="mt-4 max-w-3xl space-y-2 text-sm leading-relaxed text-text">
          <h2 id="what-it-does" className="text-xl font-semibold">
            What N-WAVE does
          </h2>
          <p>
            N-WAVE builds bioinformatics workflows without writing code. You put nodes on a canvas (your input
            files, tools such as FastQC or STAR from nf-core, and steps that sort, filter or combine data) and
            connect them. N-WAVE writes the <a href="#nextflow" className="text-nextflow-green hover:underline">Nextflow</a>{" "}
            script for it and runs it, each tool in its own{" "}
            <a href="#container" className="text-nextflow-green hover:underline">container</a>, on this computer or a
            cluster.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Start a workflow: empty, from a template, from an example, or import a .nf file.</li>
            <li>Add nodes and connect them; the workflow check says what is still missing.</li>
            <li>Run it. The Runs bar shows each step, the log and, when it's done, the results.</li>
            <li>Change something and run again with Resume on: only what changed runs again.</li>
            <li>Export the project to run it elsewhere with plain Nextflow, or download the script.</li>
          </ol>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section aria-labelledby="node-kinds" className="text-sm">
            <h2 id="node-kinds" className="text-xl font-semibold text-text">
              Node colors and shapes
            </h2>
            <ul className="mt-2 space-y-1.5">
              {NODE_KIND_ORDER.map((kind) => (
                <li key={kind} className="flex items-center gap-2 text-text">
                  <NodeKindSwatch kind={kind} />
                  <span className="font-medium">{NODE_KINDS[kind].label}</span>
                  <span className="text-text-light">{NODE_KINDS[kind].description}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="canvas-parts" className="text-sm">
            <h2 id="canvas-parts" className="text-xl font-semibold text-text">
              On the canvas
            </h2>
            <ul className="mt-2 space-y-1">
              {CANVAS_PARTS.map((part) => (
                <li key={part.name}>
                  <span className="font-medium text-text">{part.name}:</span>{" "}
                  <span className="text-text-light">{part.what}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <nav aria-label="More help" className="mt-3 text-sm text-text-light">
          More help:{" "}
          <a href={WIKI_URL} target="_blank" rel="noreferrer" className="text-nextflow-green hover:underline">
            the wiki's guides
          </a>
          {", starting with "}
          <a
            href={wikiUrl({ page: "First-Workflow" })}
            target="_blank"
            rel="noreferrer"
            className="text-nextflow-green hover:underline"
          >
            {WIKI_PAGES["First-Workflow"].toLowerCase()}
          </a>
          {"; "}
          <a
            href={wikiUrl({ page: "Troubleshooting" })}
            target="_blank"
            rel="noreferrer"
            className="text-nextflow-green hover:underline"
          >
            troubleshooting
          </a>
          {" for failed runs; and the "}
          <a href={README_URL} target="_blank" rel="noreferrer" className="text-nextflow-green hover:underline">
            README
          </a>{" "}
          for installation and settings.
        </nav>
        <h2 id="glossary" className="mt-8 text-xl font-semibold text-text">
          Glossary
        </h2>
        <p className="mt-1 text-sm text-text-light">
          The terms N-WAVE uses, from Nextflow, nf-core and sequencing, in a sentence or two. The{" "}
          <span className="whitespace-nowrap">ⓘ buttons</span> next to them in the app show the same explanations.
        </p>
        <div className="mt-3 max-w-md">
          <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search terms..." />
        </div>
        {entries.length === 0 ? (
          <p className="mt-6 text-sm text-text-light">No term matches “{search}”.</p>
        ) : (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                id={entry.id}
                className="scroll-mt-4 rounded-lg border border-accent bg-panel-background p-3 target:border-nextflow-green"
              >
                <dt className="font-semibold text-nextflow-green">{entry.term}</dt>
                <dd className="mt-1 text-sm leading-snug text-text">{entry.definition}</dd>
                {entry.docs && (
                  <dd className="mt-2 text-xs text-text-light">
                    Guide:{" "}
                    <a
                      href={wikiUrl(entry.docs)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-nextflow-green hover:underline"
                    >
                      {WIKI_PAGES[entry.docs.page]}
                    </a>
                  </dd>
                )}
                {entry.related && entry.related.length > 0 && (
                  <dd className="mt-2 text-xs text-text-light">
                    See also:{" "}
                    {entry.related.map((id, index) => (
                      <span key={id}>
                        {index > 0 && ", "}
                        <a href={`#${id}`} className="text-nextflow-green hover:underline">
                          {glossaryEntry(id).term}
                        </a>
                      </span>
                    ))}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        )}
      </main>
    </PageLayout>
  );
};

export default HelpPage;
