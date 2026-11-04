"""Analyse a Nextflow project with BioFlow-Insight and write N-WAVE's JSON.

    python analyse.py <project folder> [--entry main.nf]
    python analyse.py --stdin < project.json

With --stdin, the project comes as JSON on stdin, `{"entry": "main.nf",
"files": {"main.nf": "...", "modules/local/x/main.nf": "..."}}`, and is
written to a temporary folder first: that is how N-WAVE's backend sends it,
so the container needs no access to N-WAVE's files.

Prints one JSON document (schema.json) to stdout: the workflow's steps
(processes as called), the connections between them, the subworkflows they
are called in, the conditions under which they run, groups of related steps,
a few counts, and the error BioFlow-Insight found in the code, if any.

N-WAVE relies on this JSON only, never on BioFlow-Insight's objects, so an
update of the package can change its internals without changing N-WAVE.
The output holds no paths outside the project, no memory addresses and no
times, so the same project always gives the same document.

BioFlow-Insight: Marchment et al., NAR Genomics and Bioinformatics 6(3),
lqae092, 2024, https://doi.org/10.1093/nargab/lqae092.
"""

from __future__ import annotations

import argparse
import contextlib
import copy
import json
import os
import re
import sys
import tempfile
from importlib import metadata
from pathlib import Path

SCHEMA = "n-wave-bioflow/1"
GROUP_KINDS = ("condition", "dominator", "parallel")


def bioflow_version() -> str:
    try:
        return metadata.version("bioflow-insight")
    except metadata.PackageNotFoundError:
        return "unknown"


def base_document(engine: str | None) -> dict:
    return {
        "schema": SCHEMA,
        "tool": {"name": "BioFlow-Insight", "version": bioflow_version(), "engine": engine},
        "dsl": None,
        "error": None,
        "notes": [],
        "steps": [],
        "connections": [],
        "subworkflows": [],
        "conditions": [],
        "groups": {kind: None for kind in GROUP_KINDS},
        # Steps, channel operations and the channels between them; null
        # when it could not be read (see notes).
        "specification": None,
        "metrics": {},
    }


def read_error(error: BaseException, project: Path) -> dict:
    """BioFlow-Insight's errors end with their code: `... ~[ccnbf]`."""
    text = str(error).strip()
    code_match = re.search(r"\s*~\[(\w+)\]\s*$", text)
    code = code_match.group(1) if code_match else "internal"
    message = text[: code_match.start()] if code_match else (text or type(error).__name__)
    file_match = re.match(r"Error in the file '([^']*)': ", message)
    file = None
    if file_match:
        file = file_match.group(1).lstrip("/")
        message = message[file_match.end() :]
    if code == "ewlsif":
        message = "Nextflow's parser found an error in the code."
    # Never a path of the machine the analysis ran on.
    message = message.replace(str(project), "").strip()
    return {"code": code, "message": message, "file": file}


def short_file(element) -> str | None:
    try:
        return element.get_file_address(short=True).lstrip("/")
    except Exception:
        return None


def subworkflow_name(key: str) -> str:
    """Subworkflow keys in BioFlow-Insight's graphs: `NAME_$$_<n>`."""
    return key.split("_$$_")[0]


def defined_name(code: str, kind: str) -> str:
    """The name in `process NAME {` or `workflow NAME {`."""
    match = re.match(rf"\s*{kind}\s+(\w+)", code or "")
    return match.group(1) if match else ""


INCLUDE = re.compile(r"include\s*\{([^}]*)\}\s*from")


def include_aliases(source: str) -> dict[str, list[str]]:
    """The names a script includes each definition as: `{ A as B; C }`."""
    aliases: dict[str, list[str]] = {}
    for block in INCLUDE.finditer(source):
        for item in re.split(r"[;\n]", block.group(1)):
            parts = item.split()
            if len(parts) == 3 and parts[1] == "as":
                aliases.setdefault(parts[0], []).append(parts[2])
            elif len(parts) == 1:
                aliases.setdefault(parts[0], []).append(parts[0])
    return aliases


PLUGIN_INCLUDE = re.compile(r"""from\s+['"]plugin/([\w.-]+)['"]""")


def plugins_included(project: Path) -> list[str]:
    """The plugins the project's scripts include (`from 'plugin/nf-schema'`)."""
    plugins = set()
    for script in project.rglob("*.nf"):
        with contextlib.suppress(OSError):
            plugins.update(PLUGIN_INCLUDE.findall(script.read_text()))
    return sorted(plugins)


class Analysis:
    def __init__(self, workflow, get_object, project: Path, main_file: str):
        self.workflow = workflow
        self.get_object = get_object
        self.project = project
        self.main_file = main_file
        self.subworkflow_ids: list[dict] = []
        self.doc_steps: list[dict] = []
        self.step_id_set: set[str] = set()
        # BioFlow-Insight's id of each process call -> N-WAVE's step id.
        self.step_ids: dict[str, str] = {}

    def read_graph(self, graph: dict, doc: dict) -> None:
        """Steps, connections and subworkflows of the process dependency graph."""

        def visit(level: dict, path: list[str], parent: str | None, parent_file: str | None) -> None:
            for node in level["nodes"]:
                process = self.get_object(node["id"])
                alias = str(process.get_alias())
                code = process.get_code()
                step_id = ".".join([*path, alias])
                while step_id in self.step_ids.values():
                    step_id += "_"
                self.step_ids[str(node["id"])] = step_id
                doc["steps"].append(
                    {
                        "id": step_id,
                        "name": alias,
                        "process": str(process.get_name() or "") or defined_name(code, "process"),
                        "file": short_file(process),
                        "subworkflow": parent,
                        "code": code,
                        "conditions": [],
                    }
                )
            for key in sorted(level["subworkflows"], key=subworkflow_name):
                sub = level["subworkflows"][key]
                alias = subworkflow_name(key)
                name, file = alias, None
                if "id" in sub:
                    with contextlib.suppress(Exception):
                        definition = self.get_object(sub["id"])
                        name = str(definition.get_name() or alias)
                        alias = str(definition.get_alias() or alias)
                        file = short_file(definition)
                if alias == name:
                    alias = self.call_alias(name, parent_file)
                sub_id = ".".join([*path, alias])
                doc["subworkflows"].append({"id": sub_id, "name": alias, "workflow": name, "file": file, "parent": parent})
                self.subworkflow_ids.append({"id": sub_id, "path": [*path, alias], "workflow_path": [*path, name]})
                visit(sub, [*path, alias], sub_id, file)

        visit(graph, [], None, self.main_file)
        connections = set()

        def edges(level: dict) -> None:
            for edge in level["edges"]:
                a, b = self.step_ids.get(str(edge["A"])), self.step_ids.get(str(edge["B"]))
                if a and b:
                    connections.add((a, b))
            for sub in level["subworkflows"].values():
                edges(sub)

        edges(graph)
        doc["steps"].sort(key=lambda step: step["id"])
        self.doc_steps = doc["steps"]
        self.step_id_set = {step["id"] for step in doc["steps"]}
        doc["connections"] = [{"from": a, "to": b} for a, b in sorted(connections)]

    def call_alias(self, name: str, file: str | None) -> str:
        """
        The name a subworkflow is called by. Nextflow's parser gives the
        subworkflow's own name; the include in the calling file gives the
        alias, when it includes the subworkflow once.
        """
        if not file:
            return name
        try:
            source = (self.project / file).read_text()
        except OSError:
            return name
        aliases = include_aliases(source).get(name, [])
        return aliases[0] if len(aliases) == 1 else name

    def step_of(self, element) -> str | None:
        """The step a condition's element is: a process, or a call of one."""
        if element is None:
            return None
        key = str(element)
        if key in self.step_ids:
            return self.step_ids[key]
        with contextlib.suppress(Exception):
            if element.get_type() == "Call":
                return self.step_of(element.get_first_element_called())
        return None

    def read_specification(self, structure: dict) -> dict:
        """
        The specification graph: steps (as in `steps`), channel operations
        and the channels between them. Operations get ids `op1`, `op2`, ...
        in the order BioFlow-Insight lists them.
        """
        nodes: list[dict] = []
        edges = set()
        ids: dict[str, str] = {}

        def node_id(key: str, element, subworkflow: str | None) -> str | None:
            if key in ids:
                return ids[key]
            if key in self.step_ids:
                ids[key] = self.step_ids[key]
                return ids[key]
            try:
                kind = element.get_type()
            except Exception:
                return None
            if kind == "Process":
                # The same call as in `steps`: its name under the subworkflow call it's in.
                alias = str(element.get_alias())
                step_id = f"{subworkflow}.{alias}" if subworkflow else alias
                if step_id in self.step_id_set:
                    ids[key] = step_id
                    return step_id
                return None
            if kind != "Operation":
                return None
            op_id = f"op{sum(1 for entry in nodes if entry['kind'] == 'operation') + 1}"
            ids[key] = op_id
            code = ""
            with contextlib.suppress(Exception):
                code = str(element.get_code()).strip()
            nodes.append({"id": op_id, "kind": "operation", "subworkflow": subworkflow, "code": code})
            return op_id

        def visit(level: dict, subworkflow: str | None, path: list[str]) -> None:
            for node in level["nodes"]:
                key = str(node["id"])
                element = None
                with contextlib.suppress(Exception):
                    element = self.get_object(node["id"])
                node_id(key, element, subworkflow)
            for key in sorted(level["subworkflows"], key=subworkflow_name):
                sub = level["subworkflows"][key]
                alias = subworkflow_name(key)
                # The ids read_graph gave the same subworkflow call.
                sub_id = next(
                    (entry["id"] for entry in self.subworkflow_ids if entry["path"] == [*path, alias] or entry["workflow_path"] == [*path, alias]),
                    ".".join([*path, alias]),
                )
                visit(sub, sub_id, sub_id.split("."))

        visit(structure, None, [])

        def collect(level: dict) -> None:
            for edge in level["edges"]:
                a, b = ids.get(str(edge["A"])), ids.get(str(edge["B"]))
                if a and b and a != b:
                    edges.add((a, b, str(edge.get("label") or "")))
            for sub in level["subworkflows"].values():
                collect(sub)

        collect(structure)
        steps = [{"id": step["id"], "kind": "step", "subworkflow": step["subworkflow"], "code": ""} for step in self.doc_steps if step["id"] in ids.values()]
        return {
            "nodes": steps + nodes,
            "edges": [{"from": a, "to": b, "label": label} for a, b, label in sorted(edges)],
        }

    def read_conditions(self, doc: dict) -> None:
        conditions = self.workflow.get_most_influential_conditions(True)
        by_condition: dict[str, set[str]] = {}
        for condition, elements in conditions.items():
            value = str(condition.get_value()).strip()
            steps = {step for step in (self.step_of(element) for element in elements) if step}
            if value and steps:
                by_condition.setdefault(value, set()).update(steps)
        doc["conditions"] = [{"condition": value, "steps": sorted(steps)} for value, steps in sorted(by_condition.items())]
        steps = {step["id"]: step for step in doc["steps"]}
        for entry in doc["conditions"]:
            for step_id in entry["steps"]:
                steps[step_id]["conditions"].append(entry["condition"])

    def read_groups(self, kind: str, graph: dict) -> list[dict]:
        """Groups of steps an abstraction finds, nested as BioFlow-Insight nests them."""
        getattr(self.workflow, f"get_{kind}_abstraction")(True)
        abstraction = getattr(self.workflow, f"{kind}_abstraction")
        grouped = abstraction.get_workflow_with_subworkflows(copy.deepcopy(graph))
        groups: list[dict] = []

        def all_steps(level: dict) -> list[str]:
            found = [self.step_ids[str(node["id"])] for node in level["nodes"] if str(node["id"]) in self.step_ids]
            for sub in level["subworkflows"].values():
                found += all_steps(sub)
            return found

        def visit(level: dict, parent: int | None) -> None:
            for sub in level["subworkflows"].values():
                steps = sorted(set(all_steps(sub)))
                if len(steps) < 2:
                    visit(sub, parent)
                    continue
                groups.append({"steps": steps, "parent": parent})
                visit(sub, len(groups) - 1)

        visit(grouped, None)
        return groups

    def metrics(self, doc: dict) -> dict:
        depth = {}
        for sub in doc["subworkflows"]:
            depth[sub["id"]] = 1 + (depth[sub["parent"]] if sub["parent"] else 0)
        metrics = {
            "steps": len(doc["steps"]),
            "processes": len({(step["process"], step["file"]) for step in doc["steps"]}),
            "connections": len(doc["connections"]),
            "subworkflow_calls": len(doc["subworkflows"]),
            "subworkflow_depth": max(depth.values(), default=0),
            "conditions": len(doc["conditions"]),
            "conditional_steps": sum(1 for step in doc["steps"] if step["conditions"]),
        }
        # The files the steps and subworkflows are in, and the main script.
        files = {self.main_file} | {entry["file"] for entry in doc["steps"] + doc["subworkflows"] if entry["file"]}
        metrics["files"] = len(files)
        lines = 0
        for file in files:
            with contextlib.suppress(OSError):
                lines += len((self.project / file).read_text().splitlines())
        metrics["lines"] = lines
        return metrics


def analyse(project: Path, entry: str) -> dict:
    main = project / entry
    if not main.is_file():
        doc = base_document(None)
        doc["error"] = {"code": "nomain", "message": f"No {entry} in the project.", "file": None}
        return doc

    # BioFlow-Insight prints (its citation, progress) and writes a results
    # folder; neither may reach N-WAVE's output or the project.
    with tempfile.TemporaryDirectory(prefix="bioflow-") as results, contextlib.redirect_stdout(sys.stderr):
        from src.workflow import Workflow, get_object  # bioflow-insight's package is called `src`

        cwd = os.getcwd()
        try:
            try:
                workflow = Workflow(str(main), display_info=False, output_dir=results)
            except Exception as error:
                doc = base_document(None)
                doc["error"] = read_error(error, project)
                return doc

            dsl = workflow.get_DSL()
            notes = []
            parser_error = None
            # Nextflow's own parser (its language server) for DSL2, the
            # package's own parser for DSL1 or when the first one fails.
            engines = ["nls", "bioflow"] if dsl == "DSL2" else ["bioflow"]
            for engine in engines:
                if engine == "bioflow" and workflow.language_server is not None:
                    workflow = Workflow(str(main), display_info=False, output_dir=results)
                doc = base_document(engine)
                doc["dsl"] = dsl
                analysis = Analysis(workflow, get_object, project, entry)
                try:
                    if engine == "nls":
                        workflow.initialise_with_language_server()
                    else:
                        workflow.initialise_with_bioflow()
                    graph = workflow.get_process_dependency_graph_dico()
                    analysis.read_graph(graph, doc)
                except Exception as error:
                    doc["error"] = parser_error or read_error(error, project)
                    if engine != engines[-1]:
                        parser_error = read_error(error, project)
                        continue
                    break
                if parser_error:
                    plugins = plugins_included(project)
                    if parser_error["code"] == "ewlsif" and plugins:
                        # Not an error in the code: the bundled parser can't
                        # read plugins (it has no network to look them up).
                        notes.append(
                            "Nextflow's parser couldn't check the code: it includes plugins "
                            f"({', '.join(plugins)}), which the analysis can't read without network. "
                            "BioFlow-Insight's own parser read the structure."
                        )
                    else:
                        # The code has an error Nextflow's parser found; the
                        # structure comes from BioFlow-Insight's own parser.
                        doc["error"] = parser_error
                        notes.append("Nextflow's parser found an error, so BioFlow-Insight's own parser read the structure.")
                try:
                    analysis.read_conditions(doc)
                except Exception as error:
                    notes.append(f"Conditions could not be read: {read_error(error, project)['message']}")
                try:
                    doc["specification"] = analysis.read_specification(workflow.get_structure())
                except Exception as error:
                    notes.append(f"The specification graph could not be read: {read_error(error, project)['message']}")
                for kind in GROUP_KINDS:
                    try:
                        doc["groups"][kind] = analysis.read_groups(kind, graph)
                    except Exception as error:
                        notes.append(f"Groups by {kind} could not be read: {read_error(error, project)['message']}")
                doc["metrics"] = analysis.metrics(doc)
                break
            doc["notes"] = notes
            return doc
        finally:
            os.chdir(cwd)


MAX_STDIN_BYTES = 50 * 1024 * 1024


def inside_project(relative: str) -> bool:
    path = Path(relative)
    return bool(relative) and not path.is_absolute() and ".." not in path.parts and "\\" not in relative


def write_project(request: dict, folder: Path) -> str:
    """The project sent on stdin, written into `folder`; returns its entry."""
    files = request.get("files")
    entry = request.get("entry", "main.nf")
    if not isinstance(files, dict) or not isinstance(entry, str) or not inside_project(entry):
        raise ValueError("expected {\"entry\": \"main.nf\", \"files\": {path: text}}")
    for relative, text in files.items():
        if not isinstance(relative, str) or not isinstance(text, str) or not inside_project(relative):
            raise ValueError(f"not a file inside the project: {relative!r}")
        target = folder / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("project", type=Path, nargs="?", help="the project folder")
    parser.add_argument("--entry", default="main.nf", help="the main script, from the project folder")
    parser.add_argument("--stdin", action="store_true", help="read the project as JSON from stdin")
    args = parser.parse_args()

    if args.stdin:
        raw = sys.stdin.buffer.read(MAX_STDIN_BYTES + 1)
        if len(raw) > MAX_STDIN_BYTES:
            print("the project is too large", file=sys.stderr)
            return 2
        with tempfile.TemporaryDirectory(prefix="project-") as folder:
            try:
                entry = write_project(json.loads(raw), Path(folder))
            except (ValueError, OSError) as error:
                print(f"could not read the project: {error}", file=sys.stderr)
                return 2
            doc = analyse(Path(folder).resolve(), entry)
    elif args.project:
        if not inside_project(args.entry):
            print("--entry must be a path inside the project", file=sys.stderr)
            return 2
        doc = analyse(args.project.resolve(), args.entry)
    else:
        parser.error("give a project folder or --stdin")
    json.dump(doc, sys.stdout, indent=1, sort_keys=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
