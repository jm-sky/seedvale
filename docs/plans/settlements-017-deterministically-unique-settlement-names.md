# Plan: Deterministically unique settlement names

**Created:** 2026-09-15
**Status:** `verification needed` 🔍 (implemented 2026-09-15 — browser checks are User-owned)
**Type:** bug
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `settlements`
**Subdomains:** `development`
**Tags:** `names` `worldgen` `determinism`
**Roadmap:** -
**Model:** `Sonnet`, `Composer`

## Cel

Zapobiec powstawaniu dwóch osad o tej samej nazwie w jednym świecie, zachowując pełną deterministyczność worldgen i bez dokładania mutable global state do generatora pojedynczej nazwy.

## Recon

- `src/shared/SettlementName.ts` generuje nazwę wyłącznie z `(seed, terrain, dominantResource)`.
- Pule `soloNames` zawierają m.in. `Lipowo`; kolizja między dwiema osadami jest więc legalnym wynikiem obecnego generatora.
- `src/settlement/settlementGenerator.ts` wywołuje `generateSettlementName(...)` dla pojedynczej osady i nie zna nazw innych settlementów.
- Nazwy nie są osobnym persisted state; deterministyczny worldgen jest obecnym kontraktem i ma zostać zachowany.

## Zakres

1. Pozostawić `generateSettlementName(...)` jako pure generator candidate name.
2. Rozwiązywać unikalność na poziomie deterministycznego settlement planning/generation/cache, gdzie dostępny jest porządek/zbiór settlement definitions.
3. Dla kolizji generować kolejne deterministic candidate variants przy użyciu stable attempt salt/index.
4. Nie opierać wyniku na kolejności stream-in zależnej od pozycji gracza/kamery. Resolution order musi wynikać ze stable world/cell identity.
5. Wprowadzić bounded retry i deterministic fallback suffix/variant na wypadek wyczerpania puli, tak aby gwarancja unikalności była totalna.
6. Nie persistować names tylko po to, aby naprawić kolizję.

## Relevant files

- `src/shared/SettlementName.ts`
- `src/settlement/settlementGenerator.ts`
- `src/settlement/settlementPlanCache.ts`
- settlement plan/world generation tests

## Guardrails

- Brak module-global `Set<string>` zależnego od runtime stream order.
- Brak random/non-seeded retry.
- Brak zmiany nazwy już wygenerowanej osady po jej materializacji.
- Brak zależności od kamery lub loaded settlements.

## Verification

- ten sam world seed daje identyczne settlement IDs i names między uruchomieniami,
- generacja większego bounded zestawu settlements nie zawiera duplicate names,
- inna kolejność odpytywania/streamowania settlement defs nie zmienia nazw,
- resource/terrain flavor nadal działa dla pierwszego candidate i retry variants.

Manual browser verification wykonuje User.

Przy helperze resolution dodać JSDoc z `@domain settlements`, jeśli jest publicznym architectural seam.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
