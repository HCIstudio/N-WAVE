# Wiki pages

The source of the [N-WAVE wiki](https://github.com/HCIstudio/N-WAVE/wiki). Pages are changed
here, in the same pull request as the code they describe, and copied to the wiki once merged:
each file becomes the wiki page of the same name (`Running-Workflows.md` →
`wiki/Running-Workflows`), `_Sidebar.md` the sidebar. Links between pages use full wiki URLs,
so they work both here and in the wiki; `scripts/docsLinks.test.mjs` checks them.

Keep pages short and task-based, start sections at `##` (the wiki adds the page title), give
images alt text, and link to the README for configuration and to CONTRIBUTING.md for
development instead of repeating them.

Pages replaced by these, now pointing to their successors in the wiki:
Dockerized-Installation, Manual-Installation, Shell‐supported-Installation → Installation;
Using-N‐WAVE → First-Workflow and Building-Workflows; Workflow-Nodes → Nodes;
Using-Custom-Nodes → Custom-Nodes; Using-The-nf‐core-Libary-(EXPERIMENTAL) → nf-core-Library.
