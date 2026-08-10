# Reviews

Planned review runs — **one AI session per file**. Split scopes where useful.

## Status values

`todo` · `planned` · `in progress` · `done` · `verification needed`

## Queue for Claude (`to-do--*`)

Tematy wymagające **głębszej analizy** (nie quick fix w tej samej sesji): plik  
`docs/reviews/to-do--<slug>.md`  
→ użytkownik zleca Claude osobno. Po starcie: przenieś/przemianuj na `YYYY-MM-DD--{NNN}--slug.md` (next sequential number in reviews) i zaktualizuj tabelę.

| Review | Scope | Status | File |
|--------|-------|--------|------|
| — | — | — | — |

## Completed / scheduled

| Review | Scope | Status | File |
|--------|-------|--------|------|
| Water quality | Stylized woda — brzegi, shader, vs Water.js | `done` | [2026-08-07--001--water-quality.md](./2026-08-07--001--water-quality.md) |
| App performance & code health | Całość aplikacji — perf, refactoring, błędy (pierwsze ogólne review) | `done` | [2026-08-08--002--app-performance-and-code-health.md](./2026-08-08--002--app-performance-and-code-health.md) |
| Terrain surface detail | Detal powierzchni terenu („teren wygląda płasko") — normal-mapa, micro-tint, trawa, AO; **+ instrukcja strojenia dla kolejnych agentów** | `verification needed` | [2026-08-10--003--terrain-surface-detail.md](./2026-08-10--003--terrain-surface-detail.md) |
| Dedicated union types | Audyt inline union types (`kind: 'a' \| 'b'` na polu/parametrze zamiast nazwanego type alias) w `src/` | `done` | [2026-08-10--004--to-do--dedicated-union-types.md](./2026-08-10--004--to-do--dedicated-union-types.md) |

## After each run

1. Set status in this table and in the review file.
2. Record findings under **Findings** (severity + file refs).
3. Add or update rows in [issues/README.md](../issues/README.md) for actionable follow-ups.
