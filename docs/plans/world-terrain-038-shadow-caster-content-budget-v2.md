# Plan: Shadow caster/content budget v2

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** -
**Domain:** `world-terrain`
**Subdomains:** `rendering`
**Tags:** `shadows` `performance` `settlements` `agents`
**Model:** Sonnet, Composer

## Cel

Zmniejszyć koszt shadow passa w ciężkich osadach przez ograniczenie **zawartości renderowanej do shadow map**, bez dodawania nowego systemu cieni i bez zmiany symulacji.

Plan rozszerza istniejący `shadowBudget` i istniejące reguły `castShadow`/distance filtering. Nie zastępuje ich równoległym mechanizmem.

## Evidence / punkt startowy

Benchmark `docs/performance/results/2026-09-17--021--benchmark-settlement-heavy.md`:

- `full`: render ~46.5 ms,
- `no-shadows`: ~22.7 ms,
- scena ma ~2399 draw calls avg,
- settlement sam generuje ~1901 renderables/draws w censusie,
- NPC/fauna mają już osobne distance limits dla shadow casting.

Isolation delta jest górnym limitem potencjału, nie obietnicą poprawy. Najpierw trzeba ustalić, **co realnie wchodzi do shadow passa** i ile submissions/triangles pochodzi z poszczególnych kategorii.

## Zakres

### 1. Bounded shadow census

Najpierw dodać lub rozszerzyć minimalną diagnostykę tak, aby dla `settlement-heavy` rozdzielić shadow-pass content co najmniej na:

- settlement buildings / house statics,
- settlement props / fences / decorations,
- vegetation/environment,
- NPC,
- fauna/livestock,
- terrain,
- inne istotne shadow casters.

Preferować istniejące `src/perf/isolationProbe.ts`, renderer diagnostics i istniejące scene ownership. Nie dodawać stałego per-frame traversal tylko dla diagnostyki.

### Gate A

Jeżeli shadow census nie pokaże jednej lub kilku kategorii, których ograniczenie ma sensowny potencjał, zakończyć plan jako diagnostic-only zamiast komplikować pipeline.

### 2. Content budget

W oparciu o census wdrożyć najmniejszy wspólny mechanizm ograniczający mało istotne shadow casters.

Preferowana kolejność:

1. małe/dalekie settlement props i fence/decor categories,
2. daleka lub drobna vegetation/environment,
3. rewizja istniejącego NPC/fauna distance budget tylko jeśli pomiar pokaże realny udział,
4. terrain dopiero jeśli nadal jest istotnym kosztem.

Budżet powinien być oparty o istniejący lifecycle/ownership obiektów i aktualizowany tylko wtedy, gdy to potrzebne. Unikać per-frame traversal wszystkich meshów.

### 3. Reuse istniejącego shadow budget

Sprawdzić i rozszerzyć obecne seamy:

- `src/render/shadowBudget.ts`,
- `src/app/gameLoop.ts`,
- `src/world/createLights.ts`,
- `src/ai/NpcAgent.ts` (`NPC_SHADOW_DISTANCE`),
- `src/fauna/AnimalAgent.ts` (`FAUNA_SHADOW_DISTANCE`),
- settlement/vegetation creation paths, które ustawiają `castShadow`.

Nie tworzyć drugiego schedulera shadow-map updates. Plan 145 już dostarczył dirty/budget mechanism; ten plan dotyczy **contentu**, nie cadence.

## Architektoniczne decyzje

- Main camera visibility i simulation state są niezależne od shadow visibility.
- Nie usuwać obiektów ze sceny tylko po to, aby nie rzucały cienia.
- Nie mutować materiałów per frame.
- Preferować kategorię/distance flag ustawianą przy create/load/sync zamiast scene traversal.
- Zachować bliskie, czytelne cienie dla player/NPC/fauna oraz dużych budynków.
- Drobne propsy i detale mogą przestać rzucać cień wcześniej niż same znikają z main renderu.
- Jeśli potrzebna jest nowa publiczna funkcja budżetu, dodać JSDoc i `@domain world-terrain`.

## Non-goals

- nowy renderer cieni,
- cascaded shadow maps,
- baked lightmaps,
- nowy globalny visibility system,
- dynamiczne quality scaling zależne od frame time,
- zmiany światła/wizualnego kierunku grafiki,
- optymalizacja main-pass submissions niezwiązana z cieniami.

## Verification

AI agent:

- unit tests dla nowej logiki budżetu,
- type-check/lint/test/build według zakresu,
- nie wykonuje browser verification.

Użytkownik:

- `?benchmark=settlement-heavy` przed/po,
- opcjonalnie `?benchmark=stream`,
- porównać `RENDER`, FPS, frame p95, draw calls oraz shadow-specific census,
- wizualnie sprawdzić dużą osadę w dzień: budynki, płoty, NPC, livestock i vegetation przy graczu.

## Success gate

Utrzymać zmianę, jeśli w `settlement-heavy` daje mierzalny spadek render cost / shadow submissions bez widocznej utraty ważnych bliskich cieni. Jeśli efekt jest mały, nie dodawać kolejnych wyjątków tylko po to, by poprawić benchmark.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
