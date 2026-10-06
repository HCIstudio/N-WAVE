import { Check, Copy } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

// Read-only Nextflow/Groovy code with light syntax highlighting and a copy
// button. The tokenizer only colours comments, strings, keywords and
// numbers; it never changes the text.

const KEYWORDS = new Set([
  "process",
  "workflow",
  "input",
  "output",
  "script",
  "shell",
  "exec",
  "stub",
  "when",
  "tuple",
  "path",
  "val",
  "env",
  "stdin",
  "emit",
  "topic",
  "eval",
  "include",
  "from",
  "as",
  "def",
  "if",
  "else",
  "return",
  "container",
  "conda",
  "cpus",
  "memory",
  "time",
  "label",
  "tag",
  "publishDir",
  "withName",
  "true",
  "false",
  "null",
]);

const TOKEN_PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b([A-Za-z_][A-Za-z0-9_]*)\b|\b(\d+(?:\.\d+)?)\b/g;

type Token = {
  text: string;
  kind?: "comment" | "string" | "keyword" | "number";
};

export const tokenizeNextflow = (code: string): Token[] => {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN_PATTERN)) {
    const [text, comment, string, word, number] = match;
    const index = match.index ?? 0;
    if (word && !KEYWORDS.has(word)) continue;
    if (index > last) tokens.push({ text: code.slice(last, index) });
    tokens.push({
      text,
      kind: comment
        ? "comment"
        : string
          ? "string"
          : number
            ? "number"
            : "keyword",
    });
    last = index + text.length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last) });
  return tokens;
};

const TOKEN_CLASSES: Record<NonNullable<Token["kind"]>, string> = {
  comment: "text-text-light italic",
  string: "text-amber-300",
  keyword: "text-nextflow-green font-semibold",
  number: "text-sky-300",
};

interface CodeBlockProps {
  code: string;
  /** Accessible name of the block, e.g. "Process code". */
  label: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, label }) => {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => tokenizeNextflow(code), [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.warn("Could not copy code to the clipboard:", error);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md bg-accent p-1.5 text-text-light hover:bg-accent-hover hover:text-text"
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      >
        {copied ? (
          <Check size={14} aria-hidden />
        ) : (
          <Copy size={14} aria-hidden />
        )}
      </button>
      <pre
        aria-label={label}
        className="max-h-96 overflow-auto rounded-md border border-panel-border bg-background p-3 pr-10 font-mono text-xs leading-5 text-text"
      >
        <code>
          {tokens.map((token, index) =>
            token.kind ? (
              // Tokens are positional slices of immutable text.
              // biome-ignore lint/suspicious/noArrayIndexKey: see comment above.
              <span key={index} className={TOKEN_CLASSES[token.kind]}>
                {token.text}
              </span>
            ) : (
              token.text
            ),
          )}
        </code>
      </pre>
    </div>
  );
};

export default CodeBlock;
