import type React from "react";
import CsvViewer from "./CsvViewer";
import JsonViewer from "./JsonViewer";

interface FileViewerProps {
  content: string;
  fileName: string;
  fileType?: string;
}

export const detectFileType = (fileName: string): string => {
  return fileName.toLowerCase().split(".").pop() || "text";
};

const FastqViewer: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split("\n");
  const reads = [];

  for (let i = 0; i < lines.length; i += 4) {
    if (i + 3 < lines.length) {
      reads.push({
        header: lines[i],
        sequence: lines[i + 1],
        plus: lines[i + 2],
        quality: lines[i + 3],
      });
    }
  }

  return (
    <div className="text-sm text-gray-200 bg-transparent p-4 h-full w-full overflow-auto font-mono">
      {reads.slice(0, 100).map((read, index) => (
        <div key={index} className="mb-2 border-b border-gray-600 pb-2">
          <div className="text-blue-400">{read.header}</div>
          <div className="text-green-400 break-all">{read.sequence}</div>
          <div className="text-gray-500">{read.plus}</div>
          <div className="text-yellow-400 break-all">{read.quality}</div>
        </div>
      ))}
      {reads.length > 100 && (
        <div className="text-gray-400 text-center py-2">
          ... showing first 100 of {reads.length} reads
        </div>
      )}
    </div>
  );
};

const FastaViewer: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split("\n");
  const sequences = [];
  let currentSeq = { header: "", sequence: "" };

  for (const line of lines) {
    if (line.startsWith(">")) {
      if (currentSeq.header) {
        sequences.push(currentSeq);
      }
      currentSeq = { header: line, sequence: "" };
    } else {
      currentSeq.sequence += line;
    }
  }
  if (currentSeq.header) {
    sequences.push(currentSeq);
  }

  return (
    <div className="text-sm text-gray-200 bg-transparent p-4 h-full w-full overflow-auto font-mono">
      {sequences.slice(0, 50).map((seq, index) => (
        <div key={index} className="mb-3">
          <div className="text-blue-400 font-bold">{seq.header}</div>
          <div className="text-green-400 break-all mt-1">{seq.sequence}</div>
        </div>
      ))}
      {sequences.length > 50 && (
        <div className="text-gray-400 text-center py-2">
          ... showing first 50 of {sequences.length} sequences
        </div>
      )}
    </div>
  );
};

const TabularViewer: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split("\n").filter((line) => line.trim());
  const rows = lines.map((line) => line.split(/[\t,]/)); // Handle both tabs and commas

  return (
    <div className="text-sm text-gray-200 bg-transparent p-4 h-full w-full overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-600">
            {rows[0]?.map((cell, index) => (
              <th
                key={index}
                className="text-left p-2 text-blue-400 font-semibold"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1, 101).map((row, index) => (
            <tr key={index} className="border-b border-gray-700">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="p-2 truncate max-w-xs">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 101 && (
        <div className="text-gray-400 text-center py-2">
          ... showing first 100 of {rows.length - 1} rows
        </div>
      )}
    </div>
  );
};

const BinaryViewer: React.FC<{ fileName: string }> = ({ fileName }) => {
  return (
    <div className="text-sm text-gray-200 bg-transparent p-4 h-full w-full flex items-center justify-center">
      <div className="text-center">
        <div className="text-yellow-400 mb-2">📁 Binary File</div>
        <div className="text-gray-400">
          {fileName} cannot be displayed as text.
        </div>
      </div>
    </div>
  );
};

const TextViewer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <pre className="text-sm text-gray-200 whitespace-pre-wrap break-all bg-transparent p-4 h-full w-full overflow-auto">
      {content}
    </pre>
  );
};

const FileViewer: React.FC<FileViewerProps> = ({
  content,
  fileName,
  fileType,
}) => {
  const extension = fileType || detectFileType(fileName);

  // File type mapping
  const viewerMap: Record<string, React.ComponentType<any>> = {
    // Sequencing
    fastq: FastqViewer,
    fq: FastqViewer,
    fasta: FastaViewer,
    fa: FastaViewer,
    fas: FastaViewer,

    // Structured
    json: JsonViewer,

    // Tabular (use existing CsvViewer for CSV, TabularViewer for others)
    csv: CsvViewer,
    tsv: TabularViewer,
    tab: TabularViewer,
    gtf: TabularViewer,
    gff: TabularViewer,
    gff3: TabularViewer,
    bed: TabularViewer,
    vcf: TabularViewer,
    sam: TabularViewer,

    // Binary
    bam: BinaryViewer,
    gz: BinaryViewer,
    zip: BinaryViewer,
  };

  const ViewerComponent = viewerMap[extension] || TextViewer;

  // Pass appropriate props based on viewer type
  if (ViewerComponent === BinaryViewer) {
    return <ViewerComponent fileName={fileName} />;
  }

  return <ViewerComponent content={content} />;
};

export default FileViewer;
