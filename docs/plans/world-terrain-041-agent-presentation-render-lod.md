# Plan: Agent presentation render LOD

**Created:** 2026-09-17
**Status:** `planned` 📋
**Model:** Sonnet, Composer
**Type:** optimization
**Priority:** high · **Effort:** L
**Depends on:** -
**Domain:** `world-terrain`
**Subdomains:** `rendering`
**Tags:** `npc` `fauna` `lod` `performance`

## Cel

Zmniejszyć koszt renderowania NPC i fauna/livestock przez wspólną politykę presentation LOD, bez obniżania jakości ich symulacji i bez tworzenia osobnych mechanizmów dla NPC i zwierząt.

## Evidence / punkt startowy

`settlement-heavy`:

- NPC: ~487 draws / ~694k triangles,
- fauna: ~397 draws / ~151.6k triangles,
- `full`: ~46.5 ms,
- `hide-npc-fauna`: ~18.3 ms,
- CPU simulation pozostaje dużo niżej: NPC ~6.2 ms, fauna ~2.8 ms.

Wskazuje to na duży potencjał presentation/render path, ale isolation delta zawiera także powiązane GPU/shadow effects. Najpierw trzeba rozdzielić main-pass geometry/submesh/shadow contribution.

Aktualne seamy:

- `src/ai/NpcAgent.ts`,
- `src/fauna/AnimalAgent.ts`,
- `src/assets/loadGltf.ts` / skinned clone path,
- `AGENT_RENDER_LAYER` i `assignRenderLayer()` w `src/world/waterMirror.ts`,
- istniejące `NPC_SHADOW_DISTANCE` / `FAUNA_SHADOW_DISTANCE`,
- istniejąca adaptive simulation cadence pozostaje niezależna od tego planu.

## Zakres

### 1. Agent render census

Dla `settlement-heavy` ustalić osobno dla NPC, livestock i wild fauna:

- średnią liczbę renderable/skinned submeshes na agenta,
- materials/program groups,
- triangle count per agent/model family,
- main-pass submissions,
- shadow submissions,
- udział widocznych agentów według distance bands.

Nie budować stałego per-frame scene traversal. Diagnostyka ma być bounded i benchmark/debug-only.

### Gate A

Jeżeli koszt jest głównie shadow-pass, zatrzymać production scope i pozostawić rozwiązanie planowi shadow-budget. Ten plan ma wejść w main presentation tylko wtedy, gdy census potwierdzi istotny koszt pełnych modeli/submeshes w main pass.

### 2. Wspólny presentation LOD contract

Wprowadzić jedną współdzieloną politykę distance/importance dla renderowej prezentacji agentów, używaną przez NPC i fauna.

Preferowane poziomy:

- **near / important** — pełny obecny model,
- **mid** — tańszy istniejący wariant modelu/submesh/material, jeśli assets pozwalają,
- **far** — dalej redukowany presentation cost, ale bez znikania gameplayowo istotnej sylwetki przed obecnym visibility cutoff.

Najpierw wykorzystać możliwości obecnych assetów i hierarchy. Nie generować runtime mesh simplification per agent.

Jeśli repo nie ma odpowiednich low-poly variants, plan może zakończyć się przygotowaniem minimalnego shared visibility/submesh budget i udokumentowaniem asset requirement zamiast implementowania złego proxy systemu.

### 3. Semantyka importance

Pełny presentation level musi być zachowany co najmniej dla:

- bardzo bliskich agentów,
- aktualnego interaction/dialogue target,
- combat/flee/important event participants, jeśli obecne state seamy pozwalają to ustalić bez nowych cross-system dependencies,
- mounted/player-owned mount w bezpośrednim kontekście gracza.

Nie wiązać render LOD z tym, czy agent jest symulowany w reduced cadence.

### 4. Lifecycle i animacje

LOD transition nie może:

- resetować simulation state,
- tworzyć drugiego Agent object,
- gubić animation state przy powrocie do near,
- zmieniać collider/interaction identity,
- zmieniać persistence identity.

Preferować zmianę presentation child/visibility/model representation pod istniejącym agent ownerem.

## Architektoniczne decyzje

- Jedna polityka presentation LOD dla NPC i fauna, z adapterami tylko tam, gdzie ich model hierarchy się różni.
- Simulation cadence i presentation LOD są odrębnymi mechanizmami.
- `AGENT_RENDER_LAYER` semantics pozostają zachowane.
- Nie reużywać mirror LOD jako main-pass LOD.
- Nie tworzyć osobnych globalnych managerów NPC LOD i fauna LOD.
- Nowe wspólne API musi mieć JSDoc; użyć `@domain world-terrain` dla renderowego kontraktu.

## Non-goals

- zmiana AI/needs/decision cadence,
- spatial grid dla sensing,
- impostory tłumu,
- GPU skinning rewrite,
- runtime decimation,
- wymiana wszystkich modeli NPC/fauna,
- multiplayer-specific replication.

## Verification

AI agent:

- unit tests dla shared LOD policy/state transitions,
- testy zachowania identity/layer semantics tam, gdzie możliwe,
- type-check/lint/test/build,
- bez browser verification.

Użytkownik:

- `?benchmark=settlement-heavy`,
- porównać NPC/fauna draws/triangles, `RENDER`, FPS, p95,
- przejść przez osadę i obserwować transitions,
- sprawdzić dialogue target, combat, livestock i mount pod kątem popów/znikania/animacji.

## Success gate

Plan ma zostać utrzymany tylko jeśli main-pass census pokaże duży koszt agentów i zastosowany LOD redukuje submissions/triangles bez wpływu na światową symulację i czytelność bliskich postaci. Jeśli assets nie pozwalają na dobry LOD, nie budować ciężkiego proxy systemu w ramach tego planu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
