# CODEMAP.md — `src/`

No files directly in this folder — only module subfolders, each its own
subpath export (see package root `README.md` → Usage). There is no
`src/index.ts`.

---

## Subfolders

| Folder | Purpose | CODEMAP |
| --- | --- | --- |
| `src/learn/` (+ `engine/`, `types/`, `utils/`) | Quiz composition, adaptive session, batch queue, mastery/recheck, sentence scheduling — the `learn` subpath export | [CODEMAP.json](learn/CODEMAP.json) |
| `src/review/` | FSRS-backed review scheduling — the `review` subpath export | [CODEMAP.json](review/CODEMAP.json) |
| `src/shelving/` | Stuck-word shelving policy — the `shelving` subpath export | [CODEMAP.json](shelving/CODEMAP.json) |
| `src/config/` | Language config — `LANGUAGE_CONFIG` for space-less scripts | [CODEMAP.json](config/CODEMAP.json) |
