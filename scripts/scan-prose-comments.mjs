#!/usr/bin/env node
/**
 * Scans for comments that read as multi-sentence prose or justification
 * paragraphs instead of the short-sentence + before/after-example style in
 * AGENTS.md, and for exported functions missing a JSDoc block.
 *
 * Advisory only — reports, never edits, never fails the process.
 *
 * Usage: scan-prose-comments.mjs [path...]
 *        (defaults to src)
 * Example: scan-prose-comments.mjs src/learn/engine/adaptive-session.ts
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const DEFAULT_DIRS = ["src"];
const EXCLUDE_DIR_SEGMENTS = ["node_modules", "dist", ".claude"];
const EXCLUDE_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|vue)$/;
const BASELINE_PATH = path.join(
  "scripts",
  "reports",
  "prose-comments.baseline.json",
);

const JUSTIFICATION_PHRASES = [
  "because",
  "this ensures",
  "rather than",
  "so that",
  "in order to",
  "which means",
  "the reason",
  "not to",
  "as opposed to",
];
const NEGATION_CONTRAST = /\bnot\b[^.!?]{0,40}\bbut\b/i;
const MIN_PROSE_SENTENCES = 3;

const EXPORTED_FUNCTION_PATTERN =
  /^\s*export\s+(default\s+)?(async\s+)?function\s+\w+/;
const EXPORTED_ARROW_FN_PATTERN =
  /^\s*export\s+(default\s+)?const\s+\w+\s*(:\s*[^=]+)?=\s*(async\s*)?\(/;

/**
 * Walks source char-by-char, tracking string/template/comment state, and
 * returns raw comment tokens with their line ranges. Regex alone
 * misfires on things like `"http://x"`; a small state machine does not.
 * @example
 * input  = const u = "http://x"; // real comment
 * tokens = [{ type: 'line', text: ' real comment', startLine: 1 }]
 */
export function extractCommentTokens(content) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = content.length;

  while (i < n) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === "\n") {
      line++;
      i++;
      continue;
    }

    // string / template literal — skip to its closing quote, honoring escapes
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < n && content[i] !== quote) {
        if (content[i] === "\\") i++;
        if (content[i] === "\n") line++;
        i++;
      }
      i++;
      continue;
    }

    if (ch === "/" && next === "/") {
      const startLine = line;
      let j = i + 2;
      while (j < n && content[j] !== "\n") j++;
      tokens.push({
        type: "line",
        text: content.slice(i + 2, j),
        startLine,
        endLine: startLine,
      });
      i = j;
      continue;
    }

    if (ch === "/" && next === "*") {
      const startLine = line;
      let j = i + 2;
      while (j < n && !(content[j] === "*" && content[j + 1] === "/")) {
        if (content[j] === "\n") line++;
        j++;
      }
      const endLine = line;
      tokens.push({
        type: "block",
        text: content.slice(i + 2, j),
        startLine,
        endLine,
      });
      i = j + 2;
      continue;
    }

    i++;
  }

  return tokens;
}

/**
 * Merges adjacent `//` tokens (no blank line between, same start column
 * proxy via consecutive line numbers) into one logical comment block, the
 * way a reader would perceive a multi-line `//` explanation as one unit.
 * @example
 * lines  = [{startLine:5},{startLine:6},{startLine:9}]
 * merged = [{startLine:5,endLine:6}, {startLine:9,endLine:9}]
 */
export function mergeAdjacentLineTokens(tokens) {
  const merged = [];
  let current = null;

  for (const tok of tokens) {
    if (tok.type !== "line") {
      if (current) merged.push(current);
      current = null;
      merged.push(tok);
      continue;
    }
    if (current && tok.startLine === current.endLine + 1) {
      current.text += "\n" + tok.text;
      current.endLine = tok.endLine;
    } else {
      if (current) merged.push(current);
      current = { ...tok };
    }
  }
  if (current) merged.push(current);
  return merged;
}

function countSentences(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return 0;
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.length;
}

function findJustificationPhrase(text) {
  const lower = text.toLowerCase();
  for (const phrase of JUSTIFICATION_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  if (NEGATION_CONTRAST.test(text)) return "not X, but Y contrast";
  return null;
}

function hasExample(text) {
  return /@example/.test(text) || /```/.test(text);
}

/**
 * Stable identifier for one comment's text, independent of its line number.
 * Line numbers drift as unrelated code around a comment changes; the
 * comment's own wording does not, until someone actually rewrites it.
 * @example
 * text    = "  Review unlock gate.\nEpic: ..."
 * snippet = "review unlock gate. epic: ..." (first 60 chars, normalized)
 */
function snippetOf(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60);
}

/**
 * Key a finding by file + rule + comment snippet instead of file + rule +
 * line, so a baseline entry survives nearby edits that shift line numbers.
 */
export function findingKey(file, finding) {
  return `${file}::${finding.rule}::${finding.snippet}`;
}

/**
 * Runs the three heuristic checks against one file's content and returns a
 * bounded list of findings — never mutates, never touches disk.
 */
export function scanContent(content) {
  const findings = [];
  const lines = content.split("\n");
  const tokens = mergeAdjacentLineTokens(extractCommentTokens(content));

  for (const tok of tokens) {
    const isJsDoc = tok.type === "block" && /^\*/.test(tok.text.trimStart());
    const sentenceCount = countSentences(tok.text);
    const justification = findJustificationPhrase(tok.text);

    const snippet = snippetOf(tok.text);

    if (!hasExample(tok.text) && sentenceCount >= MIN_PROSE_SENTENCES) {
      findings.push({
        line: tok.startLine,
        rule: "prose-paragraph",
        detail: `${sentenceCount} sentences, no @example`,
        snippet,
      });
    }
    if (justification) {
      findings.push({
        line: tok.startLine,
        rule: "justification-phrase",
        detail: `contains "${justification}"`,
        snippet,
      });
    }
    if (
      isJsDoc &&
      !hasExample(tok.text) &&
      sentenceCount >= MIN_PROSE_SENTENCES
    ) {
      findings.push({
        line: tok.startLine,
        rule: "jsdoc-too-long",
        detail: `JSDoc block has ${sentenceCount} sentences — should be one summary line`,
        snippet,
      });
    }
  }

  // Missing-JSDoc check: an exported function/arrow-fn line with no /** */
  // block ending on the line directly above it.
  const blockEndLines = new Set(
    tokens
      .filter((t) => t.type === "block" && /^\*/.test(t.text.trimStart()))
      .map((t) => t.endLine),
  );

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const isExportedFn =
      EXPORTED_FUNCTION_PATTERN.test(rawLine) ||
      EXPORTED_ARROW_FN_PATTERN.test(rawLine);
    if (!isExportedFn) return;

    // A block comment's `*/` line is one line above the declaration once you
    // account for the closing-line offset used above.
    const precedingLine = lineNo - 1;
    if (!blockEndLines.has(precedingLine)) {
      findings.push({
        line: lineNo,
        rule: "missing-jsdoc",
        detail: rawLine.trim().slice(0, 60),
        snippet: snippetOf(rawLine),
      });
    }
  });

  return findings.sort((a, b) => a.line - b.line);
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function discoverFiles(args) {
  const targets = args.length > 0 ? args : DEFAULT_DIRS;
  const dirs = targets.filter(isDirectory);
  const explicitFiles = targets.filter((t) => !isDirectory(t));

  let files = [...explicitFiles];
  if (dirs.length > 0) {
    const findPattern = dirs.map((d) => `"${d}"`).join(" ");
    const prune = EXCLUDE_DIR_SEGMENTS.map(
      (seg) => `-path "*/${seg}/*" -prune -o`,
    ).join(" ");
    const found = execSync(
      `find ${findPattern} ${prune} -type f \\( -name "*.ts" -o -name "*.vue" \\) -print 2>/dev/null`,
      { encoding: "utf-8" },
    )
      .split("\n")
      .filter(Boolean);
    files.push(...found);
  }

  return [...new Set(files)].filter((f) => !EXCLUDE_FILE_PATTERN.test(f));
}

function buildMarkdownReport(results) {
  const lines = [
    "# Prose Comment Scan",
    "",
    `Generated ${new Date().toISOString()}`,
    "",
  ];
  const withFindings = results.filter((r) => r.findings.length > 0);

  if (withFindings.length === 0) {
    lines.push("No findings.");
    return lines.join("\n") + "\n";
  }

  lines.push(`Files with findings: ${withFindings.length}`, "");

  for (const { file, findings } of withFindings) {
    lines.push(`## ${file}`, "");
    for (const f of findings) {
      lines.push(`- L${f.line} **${f.rule}** — ${f.detail}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function scanFiles(files) {
  return files.map((file) => {
    const content = fs.readFileSync(file, "utf-8");
    return { file, findings: scanContent(content) };
  });
}

function loadBaseline() {
  try {
    const raw = fs.readFileSync(BASELINE_PATH, "utf-8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveBaseline(keys) {
  const outDir = path.dirname(BASELINE_PATH);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify([...keys].sort(), null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Regenerates the baseline from a full repo scan — today's known debt,
 * everything already-flagged gets grandfathered in so the pre-commit gate
 * only ever fires on genuinely new prose comments going forward.
 */
function runUpdateBaseline() {
  const files = discoverFiles([]);
  const results = scanFiles(files);
  const keys = new Set();
  for (const { file, findings } of results) {
    for (const f of findings) keys.add(findingKey(file, f));
  }
  saveBaseline(keys);
  console.log(
    `Baseline written: ${keys.size} known findings across ${files.length} files.`,
  );
}

/**
 * Pre-commit gate — scans only the given (staged) files and fails only on
 * findings whose (file, rule, snippet) key is not already in the baseline.
 * Existing debt on those files is left alone; only new comments block.
 */
function runCheck(args) {
  const files = args.filter(
    (f) =>
      !isDirectory(f) && !EXCLUDE_FILE_PATTERN.test(f) && /\.(ts|vue)$/.test(f),
  );
  if (files.length === 0) {
    console.log("No staged .ts/.vue files to check.");
    return;
  }

  const baseline = loadBaseline();
  const results = scanFiles(files);
  const newFindings = [];

  for (const { file, findings } of results) {
    const relFile = path.relative(process.cwd(), path.resolve(file));
    for (const f of findings) {
      const key = findingKey(relFile, f);
      if (!baseline.has(key)) {
        newFindings.push({ file: relFile, ...f });
      }
    }
  }

  if (newFindings.length === 0) {
    console.log("No new prose-comment findings in staged files.");
    return;
  }

  console.error(
    `\n\u2717 ${newFindings.length} new prose-comment finding(s) not in baseline:\n`,
  );
  for (const f of newFindings) {
    console.error(`  ${f.file}:${f.line} [${f.rule}] ${f.detail}`);
  }
  console.error(
    "\nThese are new comments written prose-style instead of the short-sentence + example style in AGENTS.md.",
  );
  console.error(
    "Fix the comment, or if this is pre-existing debt you are only moving, run: node scripts/scan-prose-comments.mjs --update-baseline\n",
  );
  process.exit(1);
}

function main(args) {
  if (args[0] === "--update-baseline") {
    runUpdateBaseline();
    return;
  }
  if (args[0] === "--check") {
    runCheck(args.slice(1));
    return;
  }

  const files = discoverFiles(args);
  const results = scanFiles(files);

  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
  const filesWithFindings = results.filter((r) => r.findings.length > 0).length;

  const report = buildMarkdownReport(results);
  const outDir = path.join("scripts", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "prose-comments.md");
  fs.writeFileSync(outPath, report, "utf-8");

  console.log(`Scanned ${files.length} files.`);
  console.log(
    `${filesWithFindings} files with findings, ${totalFindings} findings total.`,
  );
  console.log(`Report written to ${outPath}`);
}

// Only run the CLI when this file is executed directly, not when imported (e.g. by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
