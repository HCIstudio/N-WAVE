# Records BottleMod's results (their Python, their patched SciPy) for the TypeScript port's tests.
import json, math, sys
sys.path.insert(0, "/bottlemod")


from task import *
from func import *
from ppoly import *

def pp(p):
    return {"x": [float(v) for v in p.x], "c": [[float(v) for v in row] for row in p.c]}

out = {}

# PPoly operations, on ppoly.py's own examples.
p1 = PPoly([-10, 2, 100], [[2, 2], [1, 1], [-1, -4]])
p2 = PPoly([4, 8, 12, 17], [[-10, 2, 3], [1, 2, 3], [4, 5, 6]])
c = PPoly([-5, -2, 3, 10], [[5, 0, 1]])
out["ops"] = {
    "p1": pp(p1), "p2": pp(p2), "c": pp(c),
    "add": pp(p1 + p2), "mul": pp(p1 * p2), "div": pp(p2 / c),
    "eval": {str(x): [float(p1(x)), float(p2(x))] for x in [-20, -10, 0, 2, 5, 9.5, 17, 50, 120]},
    "derivative": pp(p1.derivative()), "antiderivative": pp(p1.antiderivative()),
    "integrate": float(p1.integrate(-3, 40)),
    "roots_p1": sorted(float(r) for r in p1.roots()), "solve_p2_20": sorted(float(r) for r in p2.solve(20)),
    "slice": pp(p2[5:13]), "piece": pp(p2[9]),
}
lin = PPoly([0, 10, 20], [[2, 1], [0, 10]])
quad = PPoly([0, 5, 50], [[0.1, 0], [0, 1], [0, 0]])
out["ops"]["compose"] = {"outer": pp(lin), "inner": pp(quad), "result": pp(lin(quad))}
p3 = PPoly([-10, 2, 100], [[2, 2], [1, 1], [-1, -4]])
p3[6:50] = p2
out["ops"]["setitem"] = pp(p3)

def run(out_cpu, in_cpu, out_data, in_data):
    for oc in out_cpu:
        oc.x[-1] = out_data[0](out_data[0].x[-1])
    r, b = TaskExecution(Task(out_cpu, out_data), in_cpu, in_data).get_result()
    return {"result": pp(r), "bottlenecks": [int(v) for v in b]}

# paper_figures_general.Test1 (with its expected result in their code).
out["test1"] = run(
    [PPoly([0, 10000], [[1]])] * 3,
    [PPoly([0, 100], [[3]]), PPoly([0, 60, 100], [[10, 1.5]]), PPoly([0, 40, 100], [[0.8, 10]])],
    [Func([0, 100], [[1, 0]])] * 3,
    [Func([0, 100], [[1, 0]]), Func([0, 50, 100], [[20], [100]]), Func([0, 63.245553203367586639977870888654], [[0.025, 0, 0]])])

# paper_figures_general.Test1_Plot (the paper's Fig. 4).
out["test1Plot"] = run(
    [PPoly([0, 20, 60, 10000], [[0.8, 4/3, 0.8/3]]), PPoly([0, 40, 90, 10000], [[0.4, 1, 0.3]]), PPoly([0, 30, 80, 10000], [[2, 0.8, 0.1]])],
    [PPoly([0, 100], [[4]]), PPoly([0, 60, 100], [[5, 1.5]]), PPoly([0, 40, 100], [[1.6, 6.5]])],
    [Func([0, 100], [[1, 0]])] * 3,
    [Func([0, 100], [[1, 0]]), Func([0, 50, 100], [[20], [100]]), Func([0, 63.245553203367586639977870888654, 100], [[0.025, 0, 0], [0, 0, 100]])])

# paper_figures_eval.LinkPrio: the video workflow (Fig. 7 and 8), copied from their file without the plotting.
def LinkPrio(linkPrio1, linkPrio2):
    dl1InSize = 1137486559
    dl1OutSize = dl1InSize
    dl1Data = Func([0, dl1InSize], [[1, 0]])
    dl1Rate = PPoly([0, dl1OutSize], [[1]])
    dl1 = Task([dl1Rate], [dl1Data])
    dl2OutSize = dl2InSize = dl1InSize
    dl2 = dl1
    t1InSize = dl1OutSize
    t1OutSize = 80 * 1024 * 1024
    t1OutTime = 82
    t1Cpu = PPoly([0, t1OutSize], [[t1OutTime / t1OutSize]])
    t1Data = Func([0, t1InSize - 0.0001, t1InSize], [[0], [t1OutSize]])
    t1 = Task([t1Cpu], [t1Data])
    t2InSize = t1InSize
    t2OutSize = t1OutSize
    t2OutTime = t1OutTime
    t2Cpu = PPoly([0, t2OutSize], [[t2OutTime / t2OutSize]])
    t2Data = Func([0, t2InSize - 0.0001, t2InSize], [[t2OutSize / t2InSize, 0], [0, t2OutSize]])
    t2 = Task([t2Cpu], [t2Data])
    t3OutTime = 1
    t3In1Size = t1OutSize
    t3In2Size = t2OutSize
    t3OutSize = t3In1Size + t3In2Size
    t3Cpu = PPoly([0, t3OutSize], [[t3OutTime / t3OutSize]])
    t3Data1 = Func([0, t3In1Size], [[t3OutSize / t3In1Size, 0]])
    t3Data2 = Func([0, t3In2Size], [[t3OutSize / t3In2Size, 0]])
    t3 = Task([t3Cpu], [t3Data1, t3Data2])
    linkRate = 12481*1024
    linkRate1 = linkRate * linkPrio1 / (linkPrio1 + linkPrio2)
    linkRate2 = linkRate * linkPrio2 / (linkPrio1 + linkPrio2)
    dl1DataRate = PPoly([0, 500], [[linkRate1]])
    dl1Exec = TaskExecution(dl1, [dl1DataRate], [Func([0, 500], [[dl1InSize]])])
    dl1DataOut, dl1Bn = dl1Exec.get_result()
    t1TransferTime = dl1DataOut.x[1]
    dl1DataRate = PPoly([0, t1TransferTime, 500], [[linkRate1, 0]])
    t1Exec = TaskExecution(t1, [PPoly([0, 500], [[1]])], [dl1DataOut])
    t1DataOut, t1Bn = t1Exec.get_result()
    dl2DataRate = PPoly([0, 500], [[linkRate]]) - dl1DataRate
    dl2Exec = TaskExecution(dl2, [dl2DataRate], [Func([0, 500], [[dl2InSize]])])
    dl2DataOut, dl2Bn = dl2Exec.get_result()
    t2Exec = TaskExecution(t2, [PPoly([0, 500], [[1]])], [dl2DataOut])
    t2DataOut, t2Bn = t2Exec.get_result()
    t3Exec = TaskExecution(t3, [PPoly([0, 500], [[1]])], [t1DataOut, t2DataOut])
    t3DataOut, t3Bn = t3Exec.get_result()
    return {"total": float(t3DataOut.x[-1]), "t3": pp(t3DataOut), "t3Bottlenecks": [int(v) for v in t3Bn],
            "t1": pp(t1DataOut), "t1Bottlenecks": [int(v) for v in t1Bn], "t2": pp(t2DataOut), "t2Bottlenecks": [int(v) for v in t2Bn],
            "dl1": pp(dl1DataOut), "dl2": pp(dl2DataOut)}

out["linkPrio"] = {"50:50": LinkPrio(50, 50), "95:5": LinkPrio(95, 5)}
sweep = {}
for i in range(6400, 12700, 100):
    try:
        sweep[str(i)] = LinkPrio(i, 12800 - i)["total"]
    except Exception as e:
        sweep[str(i)] = None
out["linkPrioSweep"] = sweep
json.dump(out, sys.stdout, indent=1)
