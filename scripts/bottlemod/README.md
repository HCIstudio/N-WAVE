# BottleMod's Python results, for the TypeScript port's tests

`frontend/src/insight/bottlemod/` is a TypeScript port of BottleMod's model
(Lößer, Witzke, Schintke, Scheuermann: "BottleMod: Modeling Data Flows and
Tasks for Fast Bottleneck Analysis", ICPE '25,
https://doi.org/10.1145/3676151.3719382; code: https://github.com/bottlemod/bottlemod).
Its tests compare it with what the authors' own Python gives, recorded in
`frontend/src/insight/bottlemod/fixtures/bottlemod-python.json` by
`recordPython.py`:

```bash
# Their func.py, ppoly.py, task.py and custom_scipy/ next to this Dockerfile:
cp -r /path/to/bottlemod/{custom_scipy,func.py,ppoly.py,task.py} scripts/bottlemod/
docker build -t bottlemod-python scripts/bottlemod
docker run --rm -v "$PWD/scripts/bottlemod:/golden:ro" bottlemod-python python /golden/recordPython.py \
  > frontend/src/insight/bottlemod/fixtures/bottlemod-python.json
```

The Dockerfile builds SciPy 1.15.1 with their modified `_ppoly.pyx`, against
the NumPy, Cython and Python of that SciPy's time: their own Dockerfile
creates SciPy's conda environment without versions, which no longer builds
SciPy 1.15.1.

What it records: the piecewise polynomials' operations on ppoly.py's own
examples, their Test1 and Test1_Plot (the paper's Fig. 4), and the video
workflow of their evaluation (LinkPrio: Fig. 7 and 8).
