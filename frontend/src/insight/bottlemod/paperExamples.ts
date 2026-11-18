// The BottleMod paper's evaluation workflow (Lößer et al., ICPE '25, section
// 5; their paper_figures_eval.py, LinkPrio): two videos are downloaded over a
// shared 100 Mbit/s link, one is reversed (it needs all of its input first,
// a burst), the other rotated (frame by frame, a stream), and both are
// merged. `linkShare1` and `linkShare2` split the link between the downloads.

import { lastOf, PPoly } from "./ppoly";
import { func, Task, TaskExecution } from "./task";

export const linkPrio = (linkShare1: number, linkShare2: number) => {
  const dl1InSize = 1137486559;
  const dl1OutSize = dl1InSize;
  const dl1 = new Task([new PPoly([0, dl1OutSize], [[1]])], [func([0, dl1InSize], [[1, 0]])]);
  // The second download is exactly like the first; only its execution differs.
  const dl2InSize = dl1InSize;
  const dl2 = dl1;

  const t1InSize = dl1OutSize;
  const t1OutSize = 80 * 1024 * 1024;
  const t1OutTime = 82;
  const t1 = new Task([new PPoly([0, t1OutSize], [[t1OutTime / t1OutSize]])], [func([0, t1InSize - 0.0001, t1InSize], [[0], [t1OutSize]])]);

  const t2InSize = t1InSize;
  const t2OutSize = t1OutSize;
  const t2 = new Task(
    [new PPoly([0, t2OutSize], [[t1OutTime / t2OutSize]])],
    [func([0, t2InSize - 0.0001, t2InSize], [[t2OutSize / t2InSize, 0], [0, t2OutSize]])],
  );

  const t3OutTime = 1;
  const t3OutSize = t1OutSize + t2OutSize;
  const t3 = new Task(
    [new PPoly([0, t3OutSize], [[t3OutTime / t3OutSize]])],
    [func([0, t1OutSize], [[t3OutSize / t1OutSize, 0]]), func([0, t2OutSize], [[t3OutSize / t2OutSize, 0]])],
  );

  const linkRate = 12481 * 1024;
  const linkRate1 = (linkRate * linkShare1) / (linkShare1 + linkShare2);

  let dl1DataRate = new PPoly([0, 500], [[linkRate1]]);
  const dl1Out = new TaskExecution(dl1, [dl1DataRate], [func([0, 500], [[dl1InSize]])]).result();
  // The first download's share goes to the second once it is done.
  const t1TransferTime = dl1Out.progress.x[1] as number;
  dl1DataRate = new PPoly([0, t1TransferTime, 500], [[linkRate1, 0]]);
  const t1Out = new TaskExecution(t1, [new PPoly([0, 500], [[1]])], [dl1Out.progress]).result();
  const dl2DataRate = new PPoly([0, 500], [[linkRate]]).sub(dl1DataRate);
  const dl2Out = new TaskExecution(dl2, [dl2DataRate], [func([0, 500], [[dl2InSize]])]).result();
  const t2Out = new TaskExecution(t2, [new PPoly([0, 500], [[1]])], [dl2Out.progress]).result();
  const t3Out = new TaskExecution(t3, [new PPoly([0, 500], [[1]])], [t1Out.progress, t2Out.progress]).result();
  return {
    total: lastOf(t3Out.progress.x) as number,
    dl1: dl1Out.progress,
    dl2: dl2Out.progress,
    t1: t1Out.progress,
    t1Bottlenecks: t1Out.bottlenecks,
    t2: t2Out.progress,
    t2Bottlenecks: t2Out.bottlenecks,
    t3: t3Out.progress,
    t3Bottlenecks: t3Out.bottlenecks,
  };
};
