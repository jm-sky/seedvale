# Plan: Authored world pickup consumption state

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** fix
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `persistence`
**Subdomains:** `save-data` `serialization`
**Tags:** `world-pickup` `consumed-id` `persistence`
**Roadmap:** -

## Cel

Dostarczyć mały, generyczny persistence contract dla authored one-shot world pickups, jeśli implementacja `quests-progression-036` potwierdzi, że istniejące world flags nie reprezentują wystarczająco dokładnie faktu pobrania konkretnego stable pickup id.

Ten plan jest dependency/fallback planem architektonicznym: implementować tylko wtedy, gdy recon `quests-progression-036` wykaże potrzebę wspólnego mechanizmu. Nie persystować runtime `ItemSpawner`.

## Zakres

- Dodać do `SaveData` sparse collection stable consumed pickup ids.
- Udostępnić app-owned mutable `Set<string>` zgodnie z istniejącym wzorcem sparse persistent id sets.
- Collection semantics: `has(id)`, `markConsumed(id)`, clear on New Game, serialize/save/load.
- World composition/materialization czyta set i pomija consumed authored pickup.
- Pickup commit oznacza stable id consumed dopiero po udanym acquisition commit.
- Mechanizm ma być item-kind agnostic i nie zawierać quest-specific branchy.

## Guardrails

- Nie zapisywać `ItemSpawnPoint.timeSinceCollected`, meshes ani całego spawner runtime.
- Nie używać inventory contents jako persistence source of truth.
- Nie tworzyć drugiego world-flags bag dla pojedynczego questa.
- Jeśli istniejący canonical sparse-id mechanism już pokrywa ten kontrakt, reuse go zamiast implementować ten plan osobno.

## Relevant files

- `src/persistence/saveData.ts`
- `src/app/createApp.ts`
- existing world flags / sparse persisted id-set owners
- `src/app/worldBundle.ts`
- `src/items/createItemSpawners.ts`

## Verification

- migration/default dla starszego save daje pusty set,
- mark/save/load zachowuje id,
- New Game czyści collection,
- dwa różne stable ids nie wpływają na siebie.

Manual browser verification wykonuje User przez consumer plan `quests-progression-036`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
