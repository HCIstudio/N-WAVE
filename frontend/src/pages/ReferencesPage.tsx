// The publications N-WAVE builds on (references/references.ts), each with
// where N-WAVE uses it and how to cite it. Linked from the home page's footer.

import { ArrowLeft, ExternalLink } from "lucide-react";
import type React from "react";
import { useId } from "react";
import { Link } from "react-router";
import PageLayout from "../components/layout/PageLayout";
import { REPOSITORY_URL } from "../docs/links";
import { doiUrl, REFERENCES, type Reference, usedForUrl } from "../references/references";

const linkClass = "text-nextflow-green hover:underline";

const ReferenceEntry: React.FC<{ reference: Reference }> = ({ reference }) => {
  const headingId = useId();
  return (
    <li>
      <article aria-labelledby={headingId} className="rounded-lg border border-panel-border bg-panel-background p-4">
        <h2 id={headingId} className="text-base font-semibold text-text">
          {reference.title}
        </h2>
        <p className="mt-1 text-sm text-text">
          {reference.authors} ({reference.year}). <em>{reference.venue}</em>.{" "}
          <a href={doiUrl(reference.doi)} target="_blank" rel="noreferrer" className={linkClass}>
            doi:{reference.doi}
          </a>
        </p>
        <p className="mt-2 text-sm text-text-light">
          {reference.about}
          {reference.url && (
            <>
              {" "}
              <a href={reference.url} target="_blank" rel="noreferrer" className={`${linkClass} inline-flex items-center gap-1`}>
                Website <ExternalLink size={12} aria-hidden />
              </a>
            </>
          )}
        </p>
        <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-light">Used in N-WAVE for</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text">
          {reference.usedFor.map((use) => {
            const url = usedForUrl(use);
            return (
              <li key={use.text}>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className={linkClass}>
                    {use.text}
                  </a>
                ) : (
                  use.text
                )}
              </li>
            );
          })}
        </ul>
      </article>
    </li>
  );
};

const ReferencesPage: React.FC = () => {
  const headingId = useId();
  return (
    <PageLayout>
      <main aria-labelledby={headingId} className="mx-auto max-w-4xl p-4 sm:p-8">
        <Link to="/" className={`inline-flex items-center gap-1 text-sm ${linkClass}`}>
          <ArrowLeft size={16} aria-hidden />
          Workflows
        </Link>
        <h1 id={headingId} className="mt-4 text-3xl font-bold text-text">
          References
        </h1>
        <p className="mt-2 text-text-light">
          N-WAVE builds on the following published work. Each entry says where N-WAVE uses it. If you publish results
          obtained with N-WAVE, please cite the work behind the parts you used, and N-WAVE itself (see{" "}
          <a href={`${REPOSITORY_URL}/blob/main/CITATION.cff`} target="_blank" rel="noreferrer" className={linkClass}>
            CITATION.cff
          </a>
          ). The nf-core modules and pipelines you use have their own citations, listed on their pages at nf-co.re.
        </p>
        <ol aria-label="References" className="mt-6 space-y-4">
          {REFERENCES.map((reference) => (
            <ReferenceEntry key={reference.id} reference={reference} />
          ))}
        </ol>
      </main>
    </PageLayout>
  );
};

export default ReferencesPage;
