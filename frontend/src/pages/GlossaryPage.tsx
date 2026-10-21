import type React from "react";
import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft } from "lucide-react";
import PageLayout from "../components/layout/PageLayout";
import SearchInput from "../components/common/forms/SearchInput";
import { GLOSSARY, glossaryEntry } from "../glossary/glossary";

/** Every term N-WAVE explains, on one page. */
const GlossaryPage: React.FC = () => {
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
      <main aria-labelledby={headingId} className="mx-auto max-w-3xl p-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-nextflow-green hover:underline">
          <ArrowLeft size={16} aria-hidden />
          Workflows
        </Link>
        <h1 id={headingId} className="mt-4 text-3xl font-bold text-text">
          Glossary
        </h1>
        <p className="mt-2 text-sm text-text-light">
          The terms N-WAVE uses, from Nextflow, nf-core and sequencing, in a sentence or two. The{" "}
          <span className="whitespace-nowrap">ⓘ buttons</span> next to them in the app show the same explanations.
        </p>
        <div className="mt-6">
          <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search terms..." />
        </div>
        {entries.length === 0 ? (
          <p className="mt-6 text-sm text-text-light">No term matches “{search}”.</p>
        ) : (
          <dl className="mt-6 space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                id={entry.id}
                className="scroll-mt-4 rounded-lg border border-accent bg-panel-background p-4 target:border-nextflow-green"
              >
                <dt className="font-semibold text-nextflow-green">{entry.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-text">{entry.definition}</dd>
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

export default GlossaryPage;
