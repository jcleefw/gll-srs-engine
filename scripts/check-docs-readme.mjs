#!/usr/bin/env node
/**
 * Fails if any docs/*.md file is missing from docs/README.md.
 * Deterministic staleness check — doesn't judge whether the *description*
 * of each file is still accurate, only whether every file is linked at all.
 *
 * Usage: node scripts/check-docs-readme.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(REPO_ROOT, "docs");
const README_PATH = path.join(DOCS_DIR, "README.md");

const actualFiles = fs
  .readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .sort();

const readmeText = fs.readFileSync(README_PATH, "utf-8");

const missing = actualFiles.filter((f) => !readmeText.includes(`(${f})`));

if (missing.length > 0) {
  console.error("docs/README.md is missing links to these files:");
  for (const f of missing) console.error(`  - ${f}`);
  console.error("\nAdd a section for each in docs/README.md, then re-commit.");
  process.exit(1);
}

console.log("docs/README.md is in sync with docs/*.md.");
