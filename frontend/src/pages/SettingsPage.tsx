import type React from "react";
import { useId } from "react";
import { Link } from "react-router";
import { ArrowLeft, Info } from "lucide-react";
import { isDemoMode } from "../api";
import PageLayout from "../components/layout/PageLayout";
import { useFeature } from "../settings/useFeatures";
import { buildInfo } from "../utils/buildInfo";
import AllCachesSettings from "./settings/AllCachesSettings";
import FeatureSettings from "./settings/FeatureSettings";
import NotificationSettings from "./settings/NotificationSettings";
import RunDefaultsSettings from "./settings/RunDefaultsSettings";

/** Global Settings: notifications, the limits and profile every run uses, the cache, features. */
const SettingsPage: React.FC = () => {
  const headingId = useId();
  const notificationsOn = useFeature("notifications");
  const glossaryOn = useFeature("glossary");
  return (
    <PageLayout>
      <main aria-labelledby={headingId} className="mx-auto max-w-3xl space-y-6 p-8">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-nextflow-green hover:underline">
            <ArrowLeft size={16} aria-hidden />
            Workflows
          </Link>
          <h1 id={headingId} className="mt-4 text-3xl font-bold text-text">
            Global Settings
          </h1>
          <p className="mt-1 text-sm text-text-light">
            For all workflows. In its Execution Settings, a workflow can choose another run
            profile and lower limits of its own, but never higher limits than these.
          </p>
        </div>

        {notificationsOn && <NotificationSettings />}
        <RunDefaultsSettings />
        {!isDemoMode && <AllCachesSettings />}
        <FeatureSettings />

        <section aria-label="About" className="rounded-lg border border-panel-border p-5 text-sm text-text-light">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
            <Info className="h-5 w-5" aria-hidden />
            About
          </h2>
          <p className="mt-1">
            N-WAVE {buildInfo.version} ({buildInfo.displayBuildDate}).{" "}
            {glossaryOn && (
              <Link to="/help" className="text-nextflow-green hover:underline">
                Help
              </Link>
            )}
          </p>
        </section>
      </main>
    </PageLayout>
  );
};

export default SettingsPage;
