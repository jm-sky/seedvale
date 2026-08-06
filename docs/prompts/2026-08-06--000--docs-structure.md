# Prompt: wdrożenie struktury dokumentacji

> Meta-dokument skopiowany ze standardu [gear-stack](../../gear-stack/docs/prompts/2026-07-06--000--docs-structure-rollout.md) (ścieżka względna tylko w monorepo private — tu treść jest samodzielna).
> Struktura `docs/` w tym repo została już wdrożona (2026-08-06).

## Konwencja nazw plików

**Tylko `docs/issues/`** używa numeru ID w nazwie pliku. Pozostałe katalogi — data + slug.

### issues

```
YYYY-MM-DD--NNN--kebab-tytul.md
```

### reviews, research, plans

```
YYYY-MM-DD-kebab-tytul.md
```

## Statusy

`todo` · `planned` · `in progress` · `done` · `verification needed`

## Szablon pojedynczego pliku

```markdown
# Tytuł czytelny dla człowieka

**Status:** `todo`  
**Created:** YYYY-MM-DD  
**Updated:** YYYY-MM-DD  

## Context

Dlaczego ten wpis istnieje.

## …

## Follow-ups

Linki do innych plików w `docs/`.
```

### Różnice per katalog

- **issues** — Context, Symptoms, Root cause, Suggested fix, Files, Related
- **reviews** — Scope, Baseline, Checklist, Findings, Follow-ups
- **research** — Question, Method, Findings, Conclusion, Decision
- **plans** — Goal, Scope, Out of scope, Phases / tasks, Acceptance criteria, Related issues
