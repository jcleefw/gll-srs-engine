/**
 * Structural tests for the CODEMAP.md -> CODEMAP.json migration. These do
 * not run the generator: they assert facts about the current repo file
 * tree, which is what AC4 (old hand-written files deleted) and AC5
 * (navigation-style files untouched) actually specify.
 *
 * AC5's "unchanged" is pinned with a sha256 hash of each file's content
 * captured before this migration, so any accidental edit to a navigation
 * CODEMAP.md is caught as a byte-for-byte diff, not just an existence check.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function sha256(relPath: string): string {
  return createHash('sha256').update(readFileSync(path.join(repoRoot, relPath))).digest('hex');
}

describe('AC4 — old hand-written per-leaf CODEMAP.md files are deleted', () => {
  const deletedPaths = [
    'src/config/CODEMAP.md',
    'src/learn/CODEMAP.md',
    'src/learn/engine/CODEMAP.md',
    'src/learn/types/CODEMAP.md',
    'src/learn/utils/CODEMAP.md',
    'src/review/CODEMAP.md',
    'src/shelving/CODEMAP.md',
  ];

  it.each(deletedPaths)('%s no longer exists', (rel) => {
    expect(existsSync(path.join(repoRoot, rel))).toBe(false);
  });
});

describe('AC5 — navigation-style CODEMAP.md files are untouched', () => {
  // Hashes captured from the repo at the start of this migration, before any
  // generator changes landed.
  const preserved: Array<[string, string]> = [
    ['CODEMAP.md', '6f821563d25d7204327890c8ea22b36376bcd796c390be8374a30b4d6ccc3317'],
    ['src/CODEMAP.md', '2ebf4ca8c774e84dc1071b8269bbd5ed4896f0009ec8440385325ff89d36415d'],
    ['demo/CODEMAP.md', 'a0eef4c82d3a9b35453191f7d32717375b180aa7dceba469e8c01912f50223e5'],
    ['docs/CODEMAP.md', 'a7cd73ab0e0293f88f7b0c4c5a5d276c45467b574aee0be91c70ba7dfd5ec330'],
  ];

  it.each(preserved)('%s still exists', (rel) => {
    expect(existsSync(path.join(repoRoot, rel))).toBe(true);
  });

  it.each(preserved)('%s content is byte-for-byte unchanged (pinned sha256)', (rel, expectedHash) => {
    expect(sha256(rel)).toBe(expectedHash);
  });
});
