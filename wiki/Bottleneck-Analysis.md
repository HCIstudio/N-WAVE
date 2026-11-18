N-WAVE models a finished run with **BottleMod**, by Lößer, Witzke, Schintke and Scheuermann:
[BottleMod: Modeling Data Flows and Tasks for Fast Bottleneck Analysis](https://doi.org/10.1145/3676151.3719382)
(ICPE '25; [preprint](https://arxiv.org/abs/2209.05358), [their code](https://github.com/bottlemod/bottlemod)).
The model says what limited each step of the run over time, and predicts how long the run would
take with other resources. It needs an installation and a run with its trace; the browser demo
shows it on its recorded runs.

## The model

BottleMod describes a task by what it needs, apart from what its environment gives it:

- **Data**: for each input, how much progress a given amount of it allows. A step that can go
  on with every part of its input **streams** it; a step that needs all of it first takes it
  **at once** (a burst).
- **Resources**: for each resource, such as CPU time, how much of it a given progress needs.
- **Inputs**: how much of each input has arrived by time *t*, and how much of each resource
  there is per second.

From these it works out the task's progress over time, and for each interval what limited it:
an input that wasn't there yet, or a resource. A task's progress is the input of the next one,
so a whole workflow is modelled in a few milliseconds. With piecewise-linear resource needs, it
does so piece by piece, without solving differential equations.

N-WAVE runs a TypeScript port of their code (`frontend/src/insight/bottlemod/`): their
piecewise polynomials, including their change to SciPy's (each piece is a polynomial in the
time itself, not in the time since the piece's start), their task and its execution. It gives
the same results as their Python code on the paper's examples: their test of a task with three
inputs and three resources, the progress and bottlenecks of the paper's Fig. 4, and the video
workflow of their evaluation, for every link share of their Fig. 7 and 8. The tests compare
them number by number.

## A model of a run

Each node that ran tasks becomes one BottleMod process, and each connection on the canvas a
data dependency (nodes that run no tasks, such as **File Input**, pass their connections on).
The model is fitted to the run's trace:

| BottleMod | From the run |
| --- | --- |
| Progress | 0 to 100 % of the step's work. |
| CPU time (a resource) | Its tasks' running time × their %CPU. Available: the run's CPUs, less what steps earlier in the workflow use at the time. Each task uses at most as much CPU as it did in the run. |
| Task slots (a resource) | Its tasks' time from start to end × the CPUs they asked for. Available: the run's CPUs, less what other tasks hold. This is what limits a step whose tasks can't use more cores: one thread, waiting for files, starting containers. |
| Memory (a resource) | Its tasks' time × the memory they asked for, where they asked for any. Available: the run's memory. |
| Data | The progress of the steps it gets data from. A step streams an input when both it and the step before run a task per sample; otherwise it needs all of the input first (MultiQC, or an index made once and needed by every sample). |

Steps earlier in the workflow get the CPUs first, as the paper shares its link between two
downloads.

## How good it is

The model is an **estimate** fitted to the run it came from, and N-WAVE always shows it next to
the measured runtime. On the demo's recorded runs (4 CPUs, 4 GB):

| Run | Measured | Predicted |
| --- | --- | --- |
| Demo 1 | 19.9 s | 19.4 s (2.5 % less) |
| Demo 3 | 218.6 s | 209.7 s (4 % less) |

It knows less than Nextflow does: it doesn't model the time Nextflow takes to notice a finished
task and submit the next one, the order in which Nextflow starts waiting tasks, or files
that a task copies. Small test data make all of these weigh more.
