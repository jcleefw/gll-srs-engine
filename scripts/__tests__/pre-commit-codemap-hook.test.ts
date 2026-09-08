/**
 * AC6 — pre-commit auto-regenerates and auto-stages, non-blocking.
 *
 * Asserted against the content of .husky/pre-commit rather than a full
 * git-integration test, per the acceptance contract for this AC: the hook
 * must reference the codemap generator, stage its output with `git add`,
 * and be structured so that step can never fail or block the commit.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const preCommitPath = path.join(repoRoot, '.husky', 'pre-commit');

describe('AC6 — .husky/pre-commit regenerates and stages CODEMAP.json, non-blocking', () => {
  let hook: string;
  let lines: string[];

  beforeAll(() => {
    hook = readFileSync(preCommitPath, 'utf-8');
    lines = hook.split('\n');
  });

  it('references the codemap generator script', () => {
    expect(hook).toMatch(/generate-codemap(\.mjs)?/);
  });

  it('stages the regenerated CODEMAP.json output with git add', () => {
    expect(hook).toMatch(/git add/);
  });

  it('the existing prose-comment check is still present (this hook is additive, not a replacement)', () => {
    expect(hook).toMatch(/scan-prose-comments/);
  });

  it('the codemap regeneration step is structured so it cannot fail or block the commit', () => {
    const idx = lines.findIndex((line) => /generate-codemap/.test(line));
    expect(idx).toBeGreaterThanOrEqual(0);

    // Look at the lines immediately around the codemap invocation for a
    // non-blocking guard: `|| true`, `|| :`, or a `set +e` bracketing the
    // block. Any of these keep a non-zero exit from the generator (or a
    // failed `git add`) from propagating to the hook's own exit code.
    const windowStart = Math.max(0, idx - 3);
    const windowEnd = Math.min(lines.length, idx + 6);
    const window = lines.slice(windowStart, windowEnd).join('\n');

    const hasNonBlockingGuard =
      /\|\|\s*true\b/.test(window) || /\|\|\s*:/.test(window) || /set\s+\+e/.test(window);

    expect(hasNonBlockingGuard).toBe(true);
  });

  it('does not use "set -e" (or equivalent) in a way that would make the codemap step fatal', () => {
    // If the hook opts into strict mode, the codemap block must locally
    // relax it (`set +e` ... `set -e`) rather than leaving it in effect
    // across the codemap invocation.
    const strictModeOn = /^\s*set\s+-e\b/m.test(hook);
    if (!strictModeOn) {
      return;
    }
    const idx = lines.findIndex((line) => /generate-codemap/.test(line));
    const before = lines.slice(0, idx).join('\n');
    const relaxedBeforeCodemap = /set\s+\+e/.test(before);
    expect(relaxedBeforeCodemap).toBe(true);
  });
});
