# Rules

Every change must comply with [`docs/08-boundaries.md`](docs/08-boundaries.md).

## Documentation references

- **No hand-typed cross-reference lists.** Don't write "See X, Y, Z" lists pointing at other doc files inside a doc's body. Point to [`docs/README.md`](docs/README.md) instead — it's the single enforced index of every file in `docs/`, kept in sync by a blocking pre-commit check. A hand-typed list is a second copy of that index; copies drift.
- **External references need a real link, or an explicit label.** You can reference things outside this repo (a product spec, a roadmap, another team's doc). Don't write them as a bare name that implies they're a resolvable, in-repo reference (e.g. "the PRD") unless you have a working link/path to it. If there's no physical link, say so explicitly — e.g. "the product spec (maintained externally, no link on file)" — instead of a bare capitalized name that reads as a checked-in file.
- **Review checklist.** When reviewing any doc, check references, not just prose: broken relative links, stale hand-typed cross-reference lists, and bare external references with no working link that wrongly imply repo scope.
