// The courses: the basics, which run in the browser (the demo too), and the
// advanced ones, which need N-WAVE installed (they run and analyse workflows
// on its server). Each says what it teaches, how long it takes, and whether
// it is done.

import { ArrowLeft, CircleCheck, Clock, GraduationCap, Lock } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link } from "react-router";
import { isDemoMode } from "../api";
import { NeedsInstallNote } from "../components/common/ui/NeedsInstall";
import PageLayout from "../components/layout/PageLayout";
import { COURSES, type CourseInfo } from "../courses/courses";
import { completedCourses } from "../courses/courseState";
import { useStartCourse } from "../courses/useStartCourse";
import { wikiUrl } from "../docs/links";
import { issueUrl } from "../roadmap/roadmap";

const linkClass = "text-nextflow-green hover:underline";

const CourseCard: React.FC<{
  info: CourseInfo;
  done: boolean;
  onStart?: () => void;
  starting: boolean;
  /** Why it can't be taken here (needs an installation, not written yet). */
  locked?: string;
}> = ({ info, done, onStart, starting, locked }) => (
  <li
    aria-label={info.title}
    className={`flex flex-col rounded-lg border border-panel-border bg-panel-background p-4 ${locked ? "opacity-60" : ""}`}
  >
    <div className="flex items-start justify-between gap-2">
      <h3 className="font-semibold text-text">{info.title}</h3>
      {done && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-nextflow-green">
          <CircleCheck size={14} aria-hidden /> Done
        </span>
      )}
    </div>
    <p className="mt-1 text-sm text-text-light">{info.summary}</p>
    <ul aria-label="What it teaches" className="mt-2 flex flex-wrap gap-1">
      {info.topics.map((topic) => (
        <li key={topic} className="rounded-full bg-background px-2 py-0.5 text-xs text-text-light">
          {topic}
        </li>
      ))}
    </ul>
    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
      <span className="flex items-center gap-1 text-xs text-text-light">
        <Clock size={14} aria-hidden /> About {info.minutes} minutes
      </span>
      {locked ? (
        <span className="flex items-center gap-1 text-xs text-text-light">
          <Lock size={14} aria-hidden /> {locked}
          {info.issue && (
            <a href={issueUrl(info.issue)} target="_blank" rel="noreferrer" className="pointer-events-auto underline">
              #{info.issue}
            </a>
          )}
        </span>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark disabled:opacity-60"
        >
          {done ? "Take it again" : "Start"}
        </button>
      )}
    </div>
  </li>
);

const CoursesPage: React.FC = () => {
  const [done] = useState(completedCourses);
  const starter = useStartCourse();
  const basics = COURSES.filter((info) => info.level === "basics");
  const advanced = COURSES.filter((info) => info.level === "advanced");
  const basicsDone = basics.every((info) => !info.course || done.has(info.course));

  return (
    <PageLayout>
      <main aria-labelledby="courses-title" className="mx-auto max-w-4xl p-4 sm:p-8">
        <Link to="/" className={`inline-flex items-center gap-1 text-sm ${linkClass}`}>
          <ArrowLeft size={16} aria-hidden />
          Workflows
        </Link>
        <h1 id="courses-title" className="mt-4 flex items-center gap-2 text-3xl font-bold text-text">
          <GraduationCap size={28} aria-hidden /> Courses
        </h1>
        <p className="mt-1 text-text-light">
          Short hands-on lessons, in N-WAVE itself: each step shows you something or asks you to do it, and goes on
          once you have.
        </p>
        {starter.error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {starter.error}
          </p>
        )}

        <section aria-labelledby="courses-basics" className="mt-8">
          <h2 id="courses-basics" className="text-xl font-semibold text-text">
            Basics
          </h2>
          <p className="mt-1 text-sm text-text-light">In the browser: no installation needed, the online demo too.</p>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2">
            {basics.map((info) => (
              <CourseCard
                key={info.id}
                info={info}
                done={Boolean(info.course && done.has(info.course))}
                starting={starter.starting}
                locked={info.course ? undefined : "Coming soon"}
                onStart={() => info.course && void starter.start(info.course)}
              />
            ))}
          </ol>
        </section>

        <section
          aria-label="Install N-WAVE"
          className={`mt-8 rounded-lg border p-4 text-sm ${basicsDone ? "border-nextflow-green/60" : "border-panel-border"}`}
        >
          {isDemoMode ? (
            <>
              <p className="font-semibold text-text">
                {basicsDone ? "Done with the basics? Install N-WAVE for the rest." : "Then: install N-WAVE"}
              </p>
              <p className="mt-1 text-text-light">
                The advanced courses run workflows and analyse them, which takes N-WAVE&apos;s server: install it on
                your machine with Docker (one command), and they work there straight away.{" "}
                <a href={wikiUrl({ page: "Installation" })} target="_blank" rel="noreferrer" className={linkClass}>
                  How to install N-WAVE
                </a>
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-text">This is a full installation</p>
              <p className="mt-1 text-text-light">
                The advanced courses run and analyse workflows on this installation&apos;s server: they work here.
              </p>
            </>
          )}
        </section>

        <section aria-labelledby="courses-advanced" className="mt-8">
          <h2 id="courses-advanced" className="text-xl font-semibold text-text">
            Advanced
          </h2>
          <p className="mt-1 text-sm text-text-light">Need a full installation of N-WAVE: they run workflows and analyse them.</p>
          {isDemoMode && <NeedsInstallNote className="mt-2" />}
          <ol className="mt-4 grid gap-4 sm:grid-cols-2">
            {advanced.map((info) => (
              <CourseCard
                key={info.id}
                info={info}
                done={false}
                starting={false}
                locked={info.course ? (isDemoMode ? "Needs a full install" : undefined) : "Coming soon"}
                onStart={() => info.course && void starter.start(info.course)}
              />
            ))}
          </ol>
        </section>
      </main>
    </PageLayout>
  );
};

export default CoursesPage;
