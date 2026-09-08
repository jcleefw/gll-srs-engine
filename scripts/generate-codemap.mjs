#!/usr/bin/env node
/**
 * Generates one CODEMAP.json per top-level src/ module (config, learn,
 * review, shelving), covering that module and every subfolder beneath it.
 * Each entry records a file's exported functions/interfaces (with
 * signatures / typed members) and its named imports, for machine-readable
 * navigation — the JSON counterpart to the hand-written CODEMAP.md files.
 *
 * Uses ts-morph against the repo's tsconfig.json so re-exports through
 * barrel files (e.g. `export { shuffle } from './utils/shuffle.js'` in
 * index.ts) resolve to the real declaration, not just the barrel line.
 *
 * Usage: node scripts/generate-codemap.mjs
 * Example: pnpm run codemap
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Project } from "ts-morph";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSCONFIG_PATH = path.join(REPO_ROOT, "tsconfig.json");

const MODULES = ["config", "learn", "review", "shelving"];
const EXCLUDE_DIR_SEGMENTS = ["__tests__", "__fixtures__"];
const EXCLUDE_FILE_PATTERN = /\.(test|spec)\.ts$/;

function isExcluded(relPath) {
  const segments = relPath.split(path.sep);
  if (segments.some((seg) => EXCLUDE_DIR_SEGMENTS.includes(seg))) return true;
  if (EXCLUDE_FILE_PATTERN.test(relPath)) return true;
  if (relPath.endsWith("CODEMAP.json")) return true;
  return false;
}

/**
 * Builds a readable "(params) => returnType" string from a function
 * declaration's own written syntax — no type inference, so it stays fast
 * and matches what a reader sees in the source.
 * @example
 * fn        = function assembleBatch(active: QuizItem[]): QuizQuestion[] {}
 * signature = "(active: QuizItem[]) => QuizQuestion[]"
 */
function buildFunctionSignature(fn) {
  const params = fn.getParameters().map((p) => p.getText()).join(", ");
  const returnTypeNode = fn.getReturnTypeNode();
  const returnType = returnTypeNode ? returnTypeNode.getText() : fn.getType().getText();
  return `(${params}) => ${returnType}`;
}

/**
 * Builds { name, type, optional } for each property of an interface, using
 * each member's own type annotation text rather than a resolved type, so
 * `Set<string>` stays `Set<string>` instead of expanding structurally.
 *
 * Method-shorthand members (e.g. `seed(...): ReviewCard;`) are
 * `MethodSignature` nodes, not `PropertySignature` — they have no
 * `getTypeNode()`, so falling back to `m.getType().getText()` would ask the
 * checker to print a resolved type, which for cross-file return/param types
 * prints an absolute `import("/abs/path/to/file").Type` clause and bakes
 * the current machine's filesystem path into the committed JSON. Build
 * their signature from the member's own written syntax instead, the same
 * way buildFunctionSignature does for function declarations.
 */
function buildInterfaceMembers(iface) {
  return iface
    .getMembers()
    .filter((m) => typeof m.getName === "function")
    .map((m) => {
      const isMethodSignature = typeof m.getParameters === "function";
      const type = isMethodSignature
        ? buildFunctionSignature(m)
        : (() => {
            const typeNode = typeof m.getTypeNode === "function" ? m.getTypeNode() : undefined;
            return typeNode ? typeNode.getText() : m.getType().getText();
          })();
      const optional = typeof m.hasQuestionToken === "function" ? m.hasQuestionToken() : false;
      return { name: m.getName(), type, optional };
    });
}

function buildExportEntry(name, declaration) {
  const kind = declaration.getKindName();
  if (kind === "FunctionDeclaration") {
    return { name, kind, signature: buildFunctionSignature(declaration) };
  }
  if (kind === "InterfaceDeclaration") {
    return { name, kind, members: buildInterfaceMembers(declaration) };
  }
  return { name, kind };
}

function buildImports(sourceFile) {
  return sourceFile
    .getImportDeclarations()
    .map((imp) => ({
      from: imp.getModuleSpecifierValue(),
      names: imp.getNamedImports().map((n) => n.getName()),
    }))
    .filter((imp) => imp.names.length > 0);
}

function buildFileEntry(sourceFile) {
  const relFile = path.relative(REPO_ROOT, sourceFile.getFilePath());
  const exports = [];
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    exports.push(buildExportEntry(name, declarations[0]));
  }
  return {
    file: relFile,
    exports,
    imports: buildImports(sourceFile),
  };
}

function discoverModuleFiles(project, moduleDir) {
  return project
    .getSourceFiles()
    .filter((sf) => {
      const relFromModule = path.relative(moduleDir, sf.getFilePath());
      return !relFromModule.startsWith("..") && !path.isAbsolute(relFromModule);
    })
    .filter((sf) => !isExcluded(path.relative(REPO_ROOT, sf.getFilePath())))
    .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));
}

function generate() {
  const project = new Project({ tsConfigFilePath: TSCONFIG_PATH });

  for (const moduleName of MODULES) {
    const moduleDir = path.join(REPO_ROOT, "src", moduleName);
    const files = discoverModuleFiles(project, moduleDir);
    const entries = files.map((sf) => buildFileEntry(sf));
    const outPath = path.join(moduleDir, "CODEMAP.json");
    fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n", "utf-8");
    console.log(`Wrote ${path.relative(REPO_ROOT, outPath)} (${entries.length} files)`);
  }
}

// Only run the CLI when this file is executed directly, not when imported (e.g. by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generate();
}
