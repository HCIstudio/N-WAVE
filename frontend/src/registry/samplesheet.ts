// nf-core-style samplesheets: parsing and validation for the Samplesheet
// node's preview, and the Nextflow code that turns the CSV into a channel of
// `[ meta, [ reads ] ]` tuples, as nf-core modules expect.

/** Which columns hold the sample id and the reads; others go into meta. */
export interface SamplesheetMapping {
  idColumn: string;
  read1Column: string;
  /** Empty when the samplesheet only has single-end reads. */
  read2Column: string;
}

export const DEFAULT_SAMPLESHEET_MAPPING: SamplesheetMapping = {
  idColumn: "sample",
  read1Column: "fastq_1",
  read2Column: "fastq_2",
};

export const DEFAULT_SAMPLESHEET_FILE_NAME = "samplesheet.csv";

/** The nf-core/rnaseq samplesheet header. */
export const RNASEQ_SAMPLESHEET_TEMPLATE =
  "sample,fastq_1,fastq_2,strandedness\n";

export type SamplesheetIssueLevel = "error" | "warning";

export interface SamplesheetIssue {
  level: SamplesheetIssueLevel;
  /** 1-based CSV line, when the issue is about one row. */
  line?: number;
  message: string;
}

export interface SamplesheetRow {
  line: number;
  id: string;
  reads: string[];
  singleEnd: boolean;
  /** The other columns, as they will appear in `meta`. */
  meta: Record<string, string>;
}

export interface ParsedSamplesheet {
  columns: string[];
  rows: SamplesheetRow[];
  issues: SamplesheetIssue[];
}

/**
 * Split CSV text into records (RFC 4180: quoted fields may contain commas,
 * quotes as `""` and line breaks). Each record keeps its starting line.
 */
export const parseCsv = (
  text: string,
): Array<{ line: number; fields: string[] }> => {
  const records: Array<{ line: number; fields: string[] }> = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    fields.push(field);
    if (fields.length > 1 || fields[0].trim() !== "") {
      records.push({ line: recordLine, fields });
    }
    fields = [];
    field = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += char;
    }
  }
  if (field !== "" || fields.length > 0) endRecord();
  return records;
};

/** Absolute paths and URLs (https://, s3://, ...) are used as they are. */
export const isRemoteOrAbsolutePath = (path: string): boolean =>
  /^(\/|[A-Za-z][A-Za-z0-9+.-]*:\/\/)/.test(path);

/**
 * Parse and validate a samplesheet. `availableFiles` are the names of files
 * uploaded to File Input nodes; relative read paths must be one of them.
 */
export const parseSamplesheet = (
  text: string,
  mapping: SamplesheetMapping,
  availableFiles: string[] = [],
): ParsedSamplesheet => {
  const records = parseCsv(text);
  const issues: SamplesheetIssue[] = [];
  if (records.length === 0) {
    return {
      columns: [],
      rows: [],
      issues: [{ level: "error", message: "The samplesheet is empty." }],
    };
  }

  const [header, ...dataRecords] = records;
  const columns = header.fields.map((column) => column.trim());
  const columnIndex = new Map(columns.map((column, index) => [column, index]));

  for (const [label, column] of [
    ["sample id", mapping.idColumn],
    ["read 1", mapping.read1Column],
  ] as const) {
    if (!columnIndex.has(column)) {
      issues.push({
        level: "error",
        message: `The ${label} column "${column}" is missing from the header.`,
      });
    }
  }
  if (mapping.read2Column && !columnIndex.has(mapping.read2Column)) {
    issues.push({
      level: "error",
      message: `The read 2 column "${mapping.read2Column}" is missing from the header.`,
    });
  }
  const duplicateColumns = columns.filter(
    (column, index) => columns.indexOf(column) !== index,
  );
  if (duplicateColumns.length > 0) {
    issues.push({
      level: "error",
      message: `Duplicate column names: ${Array.from(new Set(duplicateColumns)).join(", ")}.`,
    });
  }
  if (issues.length > 0) return { columns, rows: [], issues };

  const available = new Set(availableFiles);
  const readColumns = [mapping.read1Column, mapping.read2Column].filter(
    Boolean,
  );
  const rows: SamplesheetRow[] = [];
  const seenIds = new Map<string, number>();

  for (const record of dataRecords) {
    const { line } = record;
    if (record.fields.length !== columns.length) {
      issues.push({
        level: "error",
        line,
        message: `Line ${line} has ${record.fields.length} fields, the header has ${columns.length}.`,
      });
      continue;
    }
    const value = (column: string) =>
      (record.fields[columnIndex.get(column) ?? -1] ?? "").trim();

    const id = value(mapping.idColumn);
    const reads = readColumns.map(value).filter(Boolean);

    if (!id) {
      issues.push({
        level: "error",
        line,
        message: `Line ${line} has no sample id.`,
      });
    } else if (/\s/.test(id)) {
      issues.push({
        level: "error",
        line,
        message: `Sample id "${id}" on line ${line} contains spaces.`,
      });
    }
    if (!value(mapping.read1Column)) {
      issues.push({
        level: "error",
        line,
        message: `Line ${line} has no ${mapping.read1Column} file.`,
      });
    }
    for (const read of reads) {
      if (!isRemoteOrAbsolutePath(read) && !available.has(read)) {
        issues.push({
          level: "error",
          line,
          message: `"${read}" (line ${line}) isn't uploaded. Add it to a File Input node, or use an absolute path or URL.`,
        });
      }
    }
    if (id && seenIds.has(id)) {
      issues.push({
        level: "warning",
        line,
        message: `Sample "${id}" also appears on line ${seenIds.get(id)}; each row is processed separately.`,
      });
    } else if (id) {
      seenIds.set(id, line);
    }

    rows.push({
      line,
      id,
      reads,
      singleEnd: reads.length === 1,
      meta: Object.fromEntries(
        columns
          .filter(
            (column) =>
              column !== mapping.idColumn && !readColumns.includes(column),
          )
          .map((column) => [column, value(column)]),
      ),
    });
  }

  if (dataRecords.length === 0) {
    issues.push({
      level: "warning",
      message: "The samplesheet has no samples yet.",
    });
  }
  // Rows without reads already have an error; don't count their layout.
  const pairing = new Set(
    rows.filter((row) => row.reads.length > 0).map((row) => row.singleEnd),
  );
  if (pairing.size > 1) {
    issues.push({
      level: "warning",
      message: "The samplesheet mixes single-end and paired-end samples.",
    });
  }

  return { columns, rows, issues };
};

/** The mapping stored on a Samplesheet node, with defaults filled in. */
export const getSamplesheetMapping = (
  data: Record<string, unknown>,
): SamplesheetMapping => ({
  ...DEFAULT_SAMPLESHEET_MAPPING,
  ...((data.samplesheetMapping as Partial<SamplesheetMapping> | undefined) ??
    {}),
});

/** File name of a Samplesheet node's CSV in the input directory. */
export const getSamplesheetFileName = (
  data: Record<string, unknown>,
): string => {
  const name =
    typeof data.samplesheetFileName === "string"
      ? data.samplesheetFileName.trim()
      : "";
  return /^[A-Za-z0-9._-]+$/.test(name) ? name : DEFAULT_SAMPLESHEET_FILE_NAME;
};

const groovyString = (value: string): string =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/**
 * Nextflow code for a Samplesheet node: a param pointing at the CSV in the
 * input directory, and a channel of `[ meta, [ reads ] ]` tuples with
 * `meta.id`, `meta.single_end` and the other columns.
 */
export const generateSamplesheetChannel = ({
  channelName,
  paramName,
  fileName,
  mapping,
}: {
  channelName: string;
  paramName: string;
  fileName: string;
  mapping: SamplesheetMapping;
}): { params: string; channel: string } => {
  const readColumns = [mapping.read1Column, mapping.read2Column].filter(
    Boolean,
  );
  const mappedColumns = [mapping.idColumn, ...readColumns];
  return {
    params: `params.${paramName} = "\${params.inputdir}/${fileName.replace(/["\\$]/g, "")}"\n`,
    channel: [
      `${channelName} = Channel.fromPath(params.${paramName}, checkIfExists: true)`,
      "    .splitCsv(header: true, strip: true)",
      "    .map { row ->",
      "        // Absolute paths and URLs are used as they are; other paths are in the input directory.",
      '        def resolve = { path -> path ==~ /^(\\/|[A-Za-z][A-Za-z0-9+.-]*:\\/\\/).*/ ? file(path, checkIfExists: true) : file("${params.inputdir}/${path}", checkIfExists: true) }',
      `        def reads = [${readColumns.map((column) => `row[${groovyString(column)}]`).join(", ")}].findAll { it }.collect { resolve(it) }`,
      `        def meta = row.findAll { key, value -> !(key in [${mappedColumns.map(groovyString).join(", ")}]) } + [id: row[${groovyString(mapping.idColumn)}], single_end: reads.size() == 1]`,
      "        tuple(meta, reads)",
      "    }",
      "",
    ].join("\n"),
  };
};
