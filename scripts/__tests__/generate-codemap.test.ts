/**
 * Behavioral tests for scripts/generate-codemap.mjs, exercised as a black
 * box: invoke the CLI, then assert on the CODEMAP.json files it writes to
 * disk. This matches the guarded-CLI convention in scan-prose-comments.mjs
 * (internals importable, but the contract that matters here is "what does
 * running the script produce"), and avoids asserting on internal function
 * names that were never specified.
 *
 * Covers AC1 (per-file JSON shape), AC2 (one JSON file per top-level
 * module), AC3 (scope is exactly 4 modules, data/ excluded), and AC7
 * (generator is independently runnable).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MODULE_CODEMAP_PATHS = {
  config: 'src/config/CODEMAP.json',
  learn: 'src/learn/CODEMAP.json',
  review: 'src/review/CODEMAP.json',
  shelving: 'src/shelving/CODEMAP.json',
} as const;

interface CodemapEntry {
  file: string;
  exports: Array<{
    name: string;
    kind: string;
    signature?: string;
    members?: Array<{ name: string; type: string; optional: boolean }>;
  }>;
  imports: Array<{ from: string; names: string[] }>;
}

function readCodemap(relPath: string): CodemapEntry[] {
  return JSON.parse(readFileSync(path.join(repoRoot, relPath), 'utf-8')) as CodemapEntry[];
}

function runGenerator(): void {
  execFileSync('node', ['scripts/generate-codemap.mjs'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
}

describe('generate-codemap.mjs', () => {
  beforeAll(() => {
    // AC7: the generator must be runnable directly by a developer, not only
    // through the pre-commit hook.
    runGenerator();
  });

  describe('AC1 — per-file JSON shape', () => {
    let entry: CodemapEntry | undefined;

    beforeAll(() => {
      const entries = readCodemap(MODULE_CODEMAP_PATHS.learn);
      entry = entries.find((e) => e.file === 'src/learn/engine/assemble-batch.ts');
    });

    it('has one entry for the file, keyed by its repo-relative path', () => {
      expect(entry).toBeDefined();
    });

    it('records the exported function as a FunctionDeclaration with a signature string', () => {
      const fn = entry?.exports.find((e) => e.name === 'assembleBatch');
      expect(fn).toBeDefined();
      expect(fn?.kind).toBe('FunctionDeclaration');
      expect(typeof fn?.signature).toBe('string');
      expect((fn?.signature ?? '').length).toBeGreaterThan(0);
    });

    it('records the exported interface as an InterfaceDeclaration with typed, optional-flagged members', () => {
      const iface = entry?.exports.find((e) => e.name === 'AssembleBatchOptions');
      expect(iface).toBeDefined();
      expect(iface?.kind).toBe('InterfaceDeclaration');
      expect(iface?.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'shuffle', type: 'boolean', optional: true }),
          expect.objectContaining({ name: 'excludeIds', type: 'Set<string>', optional: true }),
        ]),
      );
    });

    it('records named imports as { from, names }', () => {
      const quizImport = entry?.imports.find((i) => i.from === '../types/quiz.js');
      expect(quizImport).toBeDefined();
      expect(quizImport?.names).toContain('QuizQuestion');
    });
  });

  describe('AC2 — one JSON file per top-level module (full subtree, not per-subfolder)', () => {
    it('writes exactly one src/learn/CODEMAP.json, no separate JSON per subfolder', () => {
      expect(existsSync(path.join(repoRoot, 'src/learn/CODEMAP.json'))).toBe(true);
      expect(existsSync(path.join(repoRoot, 'src/learn/engine/CODEMAP.json'))).toBe(false);
      expect(existsSync(path.join(repoRoot, 'src/learn/types/CODEMAP.json'))).toBe(false);
      expect(existsSync(path.join(repoRoot, 'src/learn/utils/CODEMAP.json'))).toBe(false);
    });

    it('includes files from engine/, types/, utils/, and index.ts together in one array', () => {
      const files = readCodemap(MODULE_CODEMAP_PATHS.learn).map((e) => e.file);
      expect(files).toContain('src/learn/engine/assemble-batch.ts');
      expect(files).toContain('src/learn/types/quiz.ts');
      expect(files).toContain('src/learn/utils/shuffle.ts');
      expect(files).toContain('src/learn/index.ts');
    });
  });

  describe('AC3 — scope is exactly 4 modules, data/ excluded', () => {
    it('produces exactly the four expected module CODEMAP.json files', () => {
      for (const rel of Object.values(MODULE_CODEMAP_PATHS)) {
        expect(existsSync(path.join(repoRoot, rel))).toBe(true);
      }
    });

    it('does not write a CODEMAP.json under data/, demo/, docs/, or the repo root', () => {
      expect(existsSync(path.join(repoRoot, 'data/CODEMAP.json'))).toBe(false);
      expect(existsSync(path.join(repoRoot, 'demo/CODEMAP.json'))).toBe(false);
      expect(existsSync(path.join(repoRoot, 'docs/CODEMAP.json'))).toBe(false);
      expect(existsSync(path.join(repoRoot, 'CODEMAP.json'))).toBe(false);
    });

    it('finds no CODEMAP.json anywhere under data/ on disk after a full run', () => {
      const found = execFileSync('find', ['data', '-name', 'CODEMAP.json'], {
        cwd: repoRoot,
        encoding: 'utf-8',
      }).trim();
      expect(found).toBe('');
    });

    it('never records a file path under data/ in any module entry (proxy for "does not read from data/")', () => {
      const allFiles = Object.values(MODULE_CODEMAP_PATHS)
        .flatMap((rel) => readCodemap(rel))
        .map((e) => e.file);
      expect(allFiles.every((f) => !f.startsWith('data/'))).toBe(true);
    });
  });

  describe('AC7 — generator is independently runnable', () => {
    it('regenerates all four module CODEMAP.json files from current source in one direct invocation', () => {
      const checks: Array<[string, string]> = [
        [MODULE_CODEMAP_PATHS.config, 'src/config/language.ts'],
        [MODULE_CODEMAP_PATHS.learn, 'src/learn/engine/assemble-batch.ts'],
        [MODULE_CODEMAP_PATHS.review, 'src/review/FsrsScheduler.ts'],
        [MODULE_CODEMAP_PATHS.shelving, 'src/shelving/policy.ts'],
      ];
      for (const [jsonRel, expectedFile] of checks) {
        const files = readCodemap(jsonRel).map((e) => e.file);
        expect(files).toContain(expectedFile);
      }
    });

    it('exits cleanly when invoked directly as "node scripts/generate-codemap.mjs", outside the pre-commit hook', () => {
      expect(() => {
        runGenerator();
      }).not.toThrow();
    });
  });
});
