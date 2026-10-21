# Wiki pages

The source of the [N-WAVE wiki](https://github.com/HCIstudio/N-WAVE/wiki). Pages are changed
here, in the same pull request as the code they describe. After the merge, the Wiki workflow
(`.github/workflows/wiki.yml`, using `scripts/publish-wiki.sh`) copies them to the wiki: each
file becomes the wiki page of the same name (`Running-Workflows.md` → `wiki/Running-Workflows`),
`_Sidebar.md` the sidebar. Edits made directly in the wiki are overwritten by the next copy. Links between pages use full wiki URLs,
so they work both here and in the wiki; `scripts/docsLinks.test.mjs` checks them.

Keep pages short and task-based, start sections at `##` (the wiki adds the page title), give
images alt text, and link to the README for configuration and to CONTRIBUTING.md for
development instead of repeating them.

Pages of the old wiki stay as pointers to the pages that replaced them, so old links keep
working; `scripts/publish-wiki.sh` lists them.
