// The publications N-WAVE builds on, and where it uses each: the References
// page (/references) shows them, and CITATION.cff lists the same ones (a
// test keeps the two in step).

import { type WikiPage, wikiUrl } from "../docs/links";

export interface Reference {
  id: string;
  authors: string;
  title: string;
  /** Journal or proceedings, with volume and pages. */
  venue: string;
  year: number;
  doi: string;
  /** The tool's or model's own site, when it has one. */
  url?: string;
  /** What it is, in one sentence. */
  about: string;
  /** Where N-WAVE uses it: what for, and the wiki page that says more. */
  usedFor: Array<{ text: string; wiki?: WikiPage; anchor?: string }>;
}

export const REFERENCES: Reference[] = [
  {
    id: "nextflow",
    authors: "Di Tommaso, P., Chatzou, M., Floden, E. W., Barja, P. P., Palumbo, E., Notredame, C.",
    title: "Nextflow enables reproducible computational workflows",
    venue: "Nature Biotechnology 35(4), 316–319",
    year: 2017,
    doi: "10.1038/nbt.3820",
    url: "https://www.nextflow.io",
    about: "The workflow language and engine N-WAVE writes and runs.",
    usedFor: [
      { text: "Every workflow on the canvas is written as a Nextflow script, and runs with Nextflow", wiki: "Running-Workflows" },
      { text: "Exported projects run with Nextflow alone", wiki: "Exporting-Projects" },
      { text: "Analyse checks the code with nextflow lint", wiki: "Workflow-Analysis" },
    ],
  },
  {
    id: "nf-core",
    authors: "Ewels, P. A., Peltzer, A., Fillinger, S., Patel, H., Alneberg, J., Wilm, A., Garcia, M. U., Di Tommaso, P., Nahnsen, S.",
    title: "The nf-core framework for community-curated bioinformatics pipelines",
    venue: "Nature Biotechnology 38(3), 276–278",
    year: 2020,
    doi: "10.1038/s41587-020-0439-x",
    url: "https://nf-co.re",
    about: "Community-curated Nextflow modules, subworkflows and pipelines.",
    usedFor: [
      { text: "The nf-core library: modules and subworkflows as nodes", wiki: "nf-core-Library" },
      { text: "The Pipeline node runs nf-core pipelines", wiki: "nf-core-Library" },
    ],
  },
  {
    id: "nf-core-rnaseq",
    authors: "Patel, H., Ewels, P., Manning, J., Garcia, M. U., Peltzer, A., et al.",
    title: "nf-core/rnaseq",
    venue: "Zenodo",
    year: 2018,
    doi: "10.5281/zenodo.1400710",
    url: "https://nf-co.re/rnaseq",
    about: "The nf-core RNA-seq analysis pipeline.",
    usedFor: [
      { text: "Demo 2 runs the pipeline", wiki: "Running-the-nf-core-rnaseq-Example" },
      { text: "Demo 3 rebuilds its default route from library nodes", wiki: "RNA-seq-STAR-Salmon-Example" },
    ],
  },
  {
    id: "bioflow-insight",
    authors: "Marchment, G., Brancotte, B., Schmit, M., Lemoine, F., Cohen-Boulakia, S.",
    title: "BioFlow-Insight: facilitating reuse of Nextflow workflows with structure reconstruction and visualization",
    venue: "NAR Genomics and Bioinformatics 6(3), lqae092",
    year: 2024,
    doi: "10.1093/nargab/lqae092",
    url: "https://gitlab.liris.cnrs.fr/sharefair/bioflow-insight",
    about: "Reconstructs the structure of a Nextflow workflow from its code.",
    usedFor: [
      { text: "Analyse: the workflow's structure, steps and connections", wiki: "Workflow-Analysis" },
      { text: "When a step runs: the conditions it runs under", wiki: "Workflow-Analysis", anchor: "when-a-step-runs" },
      { text: "Suggested groups of steps", wiki: "Workflow-Analysis", anchor: "steps-that-belong-together" },
    ],
  },
  {
    id: "daw-metamodel",
    authors: "Hilbrich, M., Müller, S., Kulagina, S., Lazik, C., De Mecquenem, N., Grunske, L.",
    title: "A Consolidated View on Specification Languages for Data Analysis Workflows",
    venue: "Leveraging Applications of Formal Methods, Verification and Validation (ISoLA 2022), LNCS 13702, 201–215",
    year: 2022,
    doi: "10.1007/978-3-031-19756-7_12",
    url: "https://github.com/CRC-FONDA/T1-DAW-Metamodel",
    about: "A metamodel that describes data analysis workflows across workflow languages.",
    usedFor: [{ text: "Export and import as a DAW model, and abstract workflows as placeholders", wiki: "DAW-Model" }],
  },
];

export const doiUrl = (doi: string): string => `https://doi.org/${doi}`;

/** Where a use is described: its wiki page (and section). */
export const usedForUrl = (use: Reference["usedFor"][number]): string | null =>
  use.wiki ? wikiUrl({ page: use.wiki, anchor: use.anchor }) : null;
