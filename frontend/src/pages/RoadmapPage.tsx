import type React from "react";
import { useId } from "react";
import { Link } from "react-router";
import { ArrowLeft, Circle, CircleCheck, CircleDot, ExternalLink } from "lucide-react";
import PageLayout from "../components/layout/PageLayout";
import { WIKI_PAGES, wikiUrl } from "../docs/links";
import {
  CONTRIBUTING_URL,
  featureStatus,
  ISSUES_URL,
  issueUrl,
  MILESTONES_URL,
  milestoneUrl,
  NEW_ISSUE_URL,
  RELEASES,
  ROADMAP_ISSUE,
  ROADMAP_UPDATED_FOR,
  type RoadmapRelease,
  type RoadmapStatus,
  TODAY,
} from "../roadmap/roadmap";

const STATUS: Record<RoadmapStatus, { label: string; chip: string; dot: string; icon: React.ReactNode }> = {
  released: {
    label: "Released",
    chip: "border-nextflow-green/50 bg-nextflow-green/15 text-nextflow-green",
    dot: "border-nextflow-green bg-nextflow-green",
    icon: <CircleCheck size={16} className="text-nextflow-green" aria-hidden />,
  },
  "in-progress": {
    label: "In progress",
    chip: "border-warning/50 bg-warning/15 text-warning",
    dot: "border-warning bg-background",
    icon: <CircleDot size={16} className="text-warning" aria-hidden />,
  },
  planned: {
    label: "Planned",
    chip: "border-panel-border text-text-light",
    dot: "border-panel-border bg-background",
    icon: <Circle size={16} className="text-text-light" aria-hidden />,
  },
};

const linkClass = "text-nextflow-green hover:underline";

const External: React.FC<{ href: string; children: React.ReactNode; label?: string }> = ({
  href,
  children,
  label,
}) => (
  <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={linkClass}>
    {children}
  </a>
);

const StatusChip: React.FC<{ status: RoadmapStatus }> = ({ status }) => (
  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS[status].chip}`}>
    {STATUS[status].label}
  </span>
);

/** One release on the timeline: what it does, why, and its features with their issues. */
const ReleaseCard: React.FC<{ release: RoadmapRelease; current: boolean }> = ({ release, current }) => {
  const headingId = useId();
  return (
    <li className="relative pb-8 pl-8 last:pb-0">
      <span
        aria-hidden
        className={`absolute left-0 top-5 h-4 w-4 -translate-x-1/2 rounded-full border-2 ${STATUS[release.status].dot}`}
      />
      <article
        aria-labelledby={headingId}
        className={`rounded-lg border bg-panel-background p-4 ${
          current ? "border-nextflow-green" : "border-panel-border"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={headingId} className="text-lg font-semibold text-text">
            <span className="font-mono text-text-light">v{release.version}</span> {release.name}
          </h3>
          <StatusChip status={release.status} />
          {current && <span className="text-xs text-text-light">The current version</span>}
        </div>
        <p className="mt-2 text-sm text-text">{release.goal}</p>
        {release.why && <p className="mt-1 text-sm text-text-light">{release.why}</p>}
        {release.features.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm" aria-label={`Planned in v${release.version}`}>
            {release.features.map((feature) => {
              const status = featureStatus(feature, release);
              return (
                <li key={feature.title} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0" title={STATUS[status].label}>
                    {STATUS[status].icon}
                    <span className="sr-only">{STATUS[status].label}: </span>
                  </span>
                  <span className="text-text">
                    {feature.title}
                    {feature.issue !== undefined && (
                      <>
                        {" "}
                        <External href={issueUrl(feature.issue)} label={`Issue ${feature.issue}: ${feature.title}`}>
                          #{feature.issue}
                        </External>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs">
          <External href={milestoneUrl(release.milestone)}>
            All issues for v{release.version}
            <ExternalLink size={12} className="ml-1 inline" aria-hidden />
          </External>
        </p>
      </article>
    </li>
  );
};

/** Why N-WAVE exists, what it does today, and what the next releases bring. */
const RoadmapPage: React.FC = () => {
  const headingId = useId();
  const latestReleased = RELEASES.filter((release) => release.status === "released").pop();
  const earlier = RELEASES.filter((release) => release.status === "released" && release !== latestReleased);
  const ahead = RELEASES.filter((release) => release.status !== "released");
  const timeline = latestReleased ? [latestReleased, ...ahead] : ahead;

  return (
    <PageLayout>
      <main aria-labelledby={headingId} className="mx-auto max-w-4xl p-4 sm:p-8">
        <Link to="/" className={`inline-flex items-center gap-1 text-sm ${linkClass}`}>
          <ArrowLeft size={16} aria-hidden />
          Workflows
        </Link>
        <h1 id={headingId} className="mt-4 text-3xl font-bold text-text">
          Roadmap
        </h1>
        <p className="mt-1 text-text-light">Where N-WAVE is going, and why.</p>

        <section aria-labelledby="why" className="mt-8 space-y-3 text-sm leading-relaxed text-text">
          <h2 id="why" className="text-xl font-semibold">
            Why N-WAVE
          </h2>
          <p>
            Nextflow is one of the most widely used systems for data analysis workflows, from genomics to imaging. It
            is powerful, but writing workflows means writing code in its own language, and running them means knowing
            containers, clusters and command lines. Many of the scientists who need these workflows are not programmers.
          </p>
          <p>
            N-WAVE lets you build Nextflow workflows on a visual canvas, run them, and see what each step produced. It
            writes standard Nextflow that runs anywhere, with or without N-WAVE. N-WAVE is also a research platform for
            studying how people work with workflows, and for trying out new ways of making them easier to build,
            understand and steer.
          </p>
        </section>

        <section aria-labelledby="today" className="mt-10">
          <h2 id="today" className="text-xl font-semibold text-text">
            What it does today (v{ROADMAP_UPDATED_FOR})
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {TODAY.map((feature) => (
              <li key={feature.title} className="rounded-lg border border-panel-border bg-panel-background p-3 text-sm">
                <p className="font-medium text-text">{feature.title}</p>
                <p className="mt-1 text-text-light">{feature.text}</p>
                <p className="mt-2 text-xs">
                  <External href={wikiUrl({ page: feature.wiki })}>
                    Guide: {WIKI_PAGES[feature.wiki]}
                    <ExternalLink size={12} className="ml-1 inline" aria-hidden />
                  </External>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="next" className="mt-10">
          <h2 id="next" className="text-xl font-semibold text-text">
            What's next
          </h2>
          <p className="mt-1 text-sm text-text-light">
            The releases in the order they are planned. Each feature links to the GitHub issue that describes it.
          </p>
          <ul aria-label="Status" className="mt-3 flex flex-wrap gap-4 text-xs text-text-light">
            {(Object.keys(STATUS) as RoadmapStatus[]).map((status) => (
              <li key={status} className="flex items-center gap-1.5">
                {STATUS[status].icon}
                {STATUS[status].label}
              </li>
            ))}
          </ul>
          <ol aria-label="Releases" className="ml-2 mt-5 border-l-2 border-panel-border">
            {timeline.map((release) => (
              <ReleaseCard key={release.version} release={release} current={release === latestReleased} />
            ))}
          </ol>
          {earlier.length > 0 && (
            <details className="mt-6 text-sm">
              <summary className="cursor-pointer text-text-light hover:text-text">Earlier releases</summary>
              <ul className="mt-2 space-y-1.5">
                {[...earlier].reverse().map((release) => (
                  <li key={release.version}>
                    <External href={milestoneUrl(release.milestone)}>
                      v{release.version} {release.name}
                    </External>
                    <span className="text-text-light">: {release.goal}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section aria-labelledby="involved" className="mt-10 text-sm text-text">
          <h2 id="involved" className="text-xl font-semibold">
            Get involved
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <External href={issueUrl(ROADMAP_ISSUE)}>The roadmap issue</External> lists every planned issue, its order
              and what depends on what.
            </li>
            <li>
              Browse the <External href={ISSUES_URL}>issues</External> and{" "}
              <External href={MILESTONES_URL}>milestones</External>, or comment on a plan you care about.
            </li>
            <li>
              <External href={NEW_ISSUE_URL}>Report a bug or suggest a feature</External>.
            </li>
            <li>
              Want to help build it? Start with <External href={CONTRIBUTING_URL}>CONTRIBUTING</External>.
            </li>
          </ul>
        </section>

        <footer className="mt-10 border-t border-panel-border pt-4 text-xs text-text-light">
          Last updated for v{ROADMAP_UPDATED_FOR}. Releases are shown in order; plans can change as we learn from the
          people using N-WAVE.
        </footer>
      </main>
    </PageLayout>
  );
};

export default RoadmapPage;
