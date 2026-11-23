# BottleMod, in TypeScript

This folder is a TypeScript port of BottleMod by Lößer, Witzke, Schintke and Scheuermann:
[BottleMod: Modeling Data Flows and Tasks for Fast Bottleneck Analysis](https://doi.org/10.1145/3676151.3719382)
(ICPE '25; [preprint](https://arxiv.org/abs/2209.05358)). N-WAVE uses their code with the
authors' permission.

## Where the code comes from

| | |
| --- | --- |
| Repository | <https://github.com/bottlemod/bottlemod> |
| Commit | `05f2a6dcda5c96fe6794b89a4669f6fb0c0ec34a` ("Add bibtex and modify README a bit.") |

| Here | Ported from |
| --- | --- |
| `ppoly.ts` | `ppoly.py`, and the parts of SciPy's `PPoly` it uses in their modified form (`custom_scipy/_ppoly_v1.15.1.pyx`: each piece is a polynomial in x itself) |
| `task.ts` | `task.py` and `func.py` |
| `paperExamples.ts` | their test in `task.py` (Test1, the paper's Fig. 4) and the video workflow of `paper_figures_eval.py` (LinkPrio, Fig. 7 and 8) |

The port follows their code step by step, so that it gives the same results, including two
places where it does something one might not expect (`fixContinuity`, and `realRoots` across
a discontinuity).

`runModel.ts` and `runInsight.ts` are N-WAVE's own: they fit a model of a run to its trace
and say what limited it. The wiki's
[Bottleneck analysis](https://github.com/HCIstudio/N-WAVE/wiki/Bottleneck-Analysis) page
explains them.

## How it is checked

`bottlemod.test.ts` compares the port, number by number, with what their Python gives at the
commit above, recorded in `fixtures/bottlemod-python.json` by
[`scripts/bottlemod/`](../../../../scripts/bottlemod/README.md), which builds their code at that
commit. To move to a newer commit of theirs, change it there and here, record the results
again, and run the tests.
