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

## What limited this run

After a run, its **Performance** tab (in History: **Show on canvas**, then **Performance**) ends
with **What limited this run**:

- **Predicted** and **measured**: how long the model says the run takes, next to how long it
  took, and how far apart they are. It is an estimate, fitted to this run, with the CPUs and
  memory the run had.
- **What limited each step**: a bar per step over the run's time, coloured by what limited it
  in each interval, as in the paper's Fig. 4 and 8:
  - **CPU**: the step used all the CPU time it could get.
  - **Its tasks' running time**: its tasks ran as fast as they do, as many at once as the CPUs
    they asked for allow. More CPUs only help a step limited by this if it has tasks waiting.
  - **Memory**: the memory its tasks asked for kept some of them waiting.
  - **Waiting for an input**: it waited for a step before it.

  The thin grey bar below is when the step ran in the measured run. Under each bar, a sentence
  says the same, for example "STAR alignment: limited by waiting for STAR index for 42 %, then
  its tasks' running time for 58 %."
- **The chain that set the runtime**: from the step that ends last, back through the inputs
  each step waited for. Making a step outside this chain faster doesn't make the run
  faster. **Show the chain on the canvas** outlines its nodes.

## What if?

Below **What limited this run**, **What if?** changes the run's resources in its model and says
at once how long the run would take, and which chain of steps would set the time:

- **CPUs**: the CPUs the run's tasks share, the computer's or a cluster's. More let more tasks
  run at once.
- **Most CPUs per step**: N-WAVE's **Maximum CPU Cores**. It caps what each step may ask for
  (Nextflow's `process.resourceLimits`); it doesn't limit how many tasks run at once, which is
  as many as the computer has CPUs. A step whose tasks ask for one CPU doesn't change with it.
- **Memory**: more helps where the tasks' memory held them back.
- **Give a step the CPUs first**: that step, and the steps it waits for, get the CPUs before
  the others.
- **A run profile's resources**: a cluster profile's queue of jobs, each with the profile's CPUs
  and memory.

The model takes milliseconds, so the prediction follows the sliders. It was fitted to the run
it came from: settings more than twice or less than half of that run's are marked **Less
certain**. **Execution Settings → Resources** shows the same prediction for the workflow's
limits, from the run shown on the canvas.

## How good it is

The model is an **estimate** fitted to the run it came from, and N-WAVE always shows it next to
the measured runtime. On the demo's recorded runs (4 CPUs, 4 GB):

| Run | Measured | Predicted |
| --- | --- | --- |
| Demo 1 | 19.9 s | 19.4 s (2.5 % less) |
| Demo 3 | 218.6 s | 209.7 s (4 % less) |

Compared with real runs with other settings, on the same computer (4 CPUs, Docker Desktop with
WSL 2). The runs with 2 and 4 CPUs in all ran Demo 3's exported workflow with Nextflow's local
executor limited to that many CPUs, without the I/O monitor:

| Fitted on the run with | Predicted for | Predicted | Measured |
| --- | --- | --- | --- |
| 4 CPUs | 4 CPUs (itself) | 173.8 s | 185.7 s (6 % less) |
| 2 CPUs | 2 CPUs (itself) | 238.1 s | 243.9 s (2 % less) |
| 4 CPUs | 2 CPUs | 323.4 s | 243.9 s (33 % more) |
| 2 CPUs | 4 CPUs | 129.5 s | 185.7 s (30 % less) |
| 4 CPUs, I/O monitor on | 2 CPUs | 377.7 s | 243.9 s (55 % more) |
| 4 CPUs, I/O monitor on | 4 CPUs, Maximum CPU Cores 2 | 209.7 s | 212.4 s (1 % less) |

So the model fits the run it came from, and it **overrates what CPUs change**: on Demo 3, half
or twice the CPUs changed the runtime by about a quarter, and the model said by a half.
Steps' tasks run faster when fewer share the CPUs, and Nextflow starts tasks in its own order;
the model keeps each task's time from the run it was fitted to. A run with the I/O monitor on is
slower (its probes see every file the computer opens): fit the model to a run without it to
predict runs without it.

It knows less than Nextflow does: it doesn't model the time Nextflow takes to notice a finished
task and submit the next one, the order in which Nextflow starts waiting tasks, or files
that a task copies. Small test data make all of these weigh more.
