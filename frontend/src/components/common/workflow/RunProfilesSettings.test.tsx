import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { RunProfile } from "../../../execution/runProfiles";
import RunProfilesSettings from "./RunProfilesSettings";

/** The tab with its own state, as the settings dialog keeps it. */
const Harness = ({ initial = [] as RunProfile[], initialRun = "" }) => {
  const [profiles, setProfiles] = useState(initial);
  const [runProfile, setRunProfile] = useState(initialRun);
  return (
    <>
      <RunProfilesSettings
        profiles={profiles}
        runProfile={runProfile}
        onChange={(change) => {
          if (change.runProfiles) setProfiles(change.runProfiles);
          if (change.runProfile !== undefined) setRunProfile(change.runProfile);
        }}
      />
      <output data-testid="state">{JSON.stringify({ profiles, runProfile })}</output>
    </>
  );
};

const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}");

describe("RunProfilesSettings", () => {
  it("adds a SLURM profile from its preset and edits it", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "SLURM cluster profile" }));
    const card = screen.getByRole("listitem", { name: "Profile slurm" });
    fireEvent.change(within(card).getByLabelText("Partition (queue)"), { target: { value: "short" } });
    fireEvent.change(within(card).getByLabelText("Extra sbatch options"), {
      target: { value: "--account=lab" },
    });
    expect(state().profiles[0]).toMatchObject({
      name: "slurm",
      executor: "slurm",
      queue: "short",
      containerEngine: "singularity",
      clusterOptions: "--account=lab",
    });
    // A second one gets a name of its own.
    await userEvent.click(screen.getByRole("button", { name: "SLURM cluster profile" }));
    expect(state().profiles.map((profile: RunProfile) => profile.name)).toEqual(["slurm", "slurm_2"]);
  });

  it("shows a profile's problems and keeps it out of the runs", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "AWS Batch profile" }));
    const problems = screen.getByRole("list", { name: "Problems of profile awsbatch" });
    expect(problems.textContent).toContain("needs a job queue");
    const run = screen.getByLabelText("Runs from N-WAVE use") as HTMLSelectElement;
    expect([...run.options].map((option) => option.textContent)).toEqual([
      "This computer (Execution and Resources settings)",
    ]);
  });

  it("chooses the profile runs use, and follows a rename or removal", async () => {
    render(
      <Harness
        initial={[{ name: "hpc", executor: "slurm", containerEngine: "none" }]}
        initialRun="hpc"
      />,
    );
    const run = screen.getByLabelText("Runs from N-WAVE use") as HTMLSelectElement;
    expect(run.value).toBe("hpc");
    const card = screen.getByRole("listitem", { name: "Profile hpc" });
    fireEvent.change(within(card).getByLabelText("Name"), { target: { value: "cluster" } });
    expect(state().runProfile).toBe("cluster");
    await userEvent.click(screen.getByRole("button", { name: "Remove profile cluster" }));
    expect(state()).toEqual({ profiles: [], runProfile: "" });
  });
});
