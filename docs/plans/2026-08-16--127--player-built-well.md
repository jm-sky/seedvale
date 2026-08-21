# Plan: Player-Built Well

**Created:** 2026-08-16
**Status:** `done` — implemented + technically verified (`tsc`/lint/build/test all green, save schema bumped to v23). Browser/manual verification not performed — see implementation notes below.
**Priority:** 🟡 medium · **Effort:** M
**Depends on:** ~~122~~
**domain:** `items-player`
**tags:** [world-terrain, settlements-npcs]

## Cel

Dodać możliwość zbudowania przez gracza fizycznej studni.

Studnia nie jest wyłącznie dekoracją. Po ukończeniu staje się istniejącym `WaterSource` i może być używana przez gracza, NPC, gospodarstwa i livestock.

Plan jest pierwszym małym krokiem w kierunku player-built structures, ale nie tworzy jeszcze generycznego systemu budowania.

## 1. Player Construction

Minimalny flow:

```text
łopata + wymagane materiały
        ↓
wykopanie dołu
        ↓
budowa studni
        ↓
budowa daszku
        ↓
gotowa studnia → WaterSource
```

Pierwszym typem konstrukcji jest `well`.

System może mieć prosty data-driven kontrakt pozwalający później dodać kolejne struktury, ale nie budować teraz pełnego frameworka.

## 2. Materials & Tool

Budowa wymaga:

- **łopaty** — narzędzie potrzebne do wykonania wykopu; nie jest zużywana jako materiał,
- **kamieni** — konstrukcja studni,
- **drewna** — konstrukcja i daszek.

Koszt korzysta z istniejących itemów/inventory. Nie tworzyć osobnego systemu resource economy.

## 3. Construction Stages

Studnia ma trzy widoczne etapy:

```text
1. pit     — wykopany dół
2. well    — wykonana właściwa studnia
3. roof    — ukończony daszek
```

Każdy etap jest rzeczywistym stanem świata.

Dopiero `roof` oznacza `completed` i aktywuje pełny `WaterSource`.

Wcześniejsze etapy pozostają widoczne jako niedokończona konstrukcja.

## 4. Construction Time

Budowa nie jest natychmiastowa.

Początkowe wartości:

```text
Dół       ~1 dzień
Studnia   ~1 dzień
Daszek    ~0.5 dnia
-------------------
Razem     ~2.5 dnia
```

Czas powinien być liczony przez istniejący czas świata, a nie przez real-time timer.

W przyszłości może być modyfikowany przez np. skill, narzędzie lub pomoc NPC bez zmiany modelu etapów.

Jeżeli gracz przerwie budowę, wykonana praca pozostaje. Można wrócić do konstrukcji później.

## 5. Placement

Przed rozpoczęciem sprawdzić:

- teren nie jest zbyt stromy,
- brak kolizji z istniejącymi strukturami,
- odpowiednią odległość od innych obiektów,
- podstawowe wymagania lokalizacji.

Nie wymagać realistycznej geologii ani systemu groundwater.

Wykorzystać istniejące funkcje próbkowania terenu i placementu.

## 6. Construction State

Struktura powinna mieć stabilne ID oraz minimalny zapis stanu:

```text
id
+
type = well
+
position
+
rotation
+
stage
+
stageStartedAt
```

Nie zapisywać stanu `WaterSource`, który można odtworzyć z ukończonej konstrukcji.

## 7. Stage Transitions

Preferowany flow:

```text
planned
  ↓
pit
  ↓
well
  ↓
roof
  ↓
completed
```

Przejście do kolejnego etapu wymaga:

- odpowiednich materiałów,
- odpowiedniego narzędzia, jeśli dany etap go wymaga,
- ukończenia czasu bieżącego etapu.

Na v1 można rozpocząć kolejny etap interakcją gracza po ukończeniu poprzedniego.

Nie implementować automatycznej budowy przez NPC.

## 8. Visuals

Każdy etap powinien mieć własną reprezentację:

- `pit` — wykop / dół,
- `well` — kamienny/wooden well body,
- `roof` — daszek.

Po zakończeniu etapu nie powinno być konieczne utrzymywanie wszystkich wcześniejszych elementów jako osobnych systemów runtime; można je złożyć w statyczną strukturę.

Nie tworzyć osobnego render managera.

## 9. WaterSource Integration

Najważniejsza zasada:

```text
Completed Well
      ↓
  WaterSource
```

Wykorzystać istniejący `WaterSource` oraz logikę planu 122.

Nie tworzyć `PlayerWellWaterSystem`.

Po ukończeniu studnia powinna automatycznie wejść do istniejącego mechanizmu wyszukiwania źródeł wody.

## 10. NPC Integration

Nie dodawać specjalnego zachowania:

```text
if playerBuiltWell then ...
```

Istniejący water logistics powinien znaleźć nową studnię przez wspólny mechanizm.

Docelowy przepływ:

```text
NPC
 ↓
find WaterSource
 ↓
player-built well
 ↓
carry water
 ↓
household.water
```

To jest podstawowy gameplayowy efekt budowy.

## 11. Player Interaction

Gracz powinien móc korzystać z ukończonej studni przez istniejący interaction flow.

Przykładowe prompty:

```text
[E] Wykop dół
[E] Buduj studnię
[E] Zbuduj daszek
[E] Nabierz wodę
```

Nie tworzyć osobnego input systemu.

Jeżeli istniejący system pobierania wody nie wymaga fizycznego itemu, zachować obecny model zamiast tworzyć specjalny `WellBucket`.

## 12. Persistence & Streaming

Studnia musi przetrwać:

- save/load,
- chunk unload/load,
- rebuild world.

Wszystkie etapy muszą być odtwarzalne z zapisanego stanu.

`WaterSource` powinien być rekonstruowany po załadowaniu ukończonej studni.

Należy zapobiec duplikacji źródeł wody przy ponownym streamingu/rebuildzie.

## 13. Future-proofing

Nie tworzyć teraz pełnego Building System.

Jednocześnie kontrakt może później umożliwić:

```text
PlayerStructure
├── Well
├── Fence
├── Campfire
├── Storage
└── ...
```

Struktury mogą opcjonalnie zapewniać usługi świata:

```text
Well       → WaterSource
Storage    → Storage
Campfire   → Heat/Rest
Workshop   → Production
```

Dzięki temu budowanie rozszerza istniejące systemy zamiast tworzyć player-only gameplay.

## 14. Performance

Budowanie jest zdarzeniem rzadkim.

- brak kosztownych obliczeń co frame,
- brak per-frame simulation konstrukcji,
- statyczna reprezentacja po ukończeniu,
- wykorzystanie istniejącego chunk lifecycle,
- brak Web Workera.

## 15. Verification

### Technical

- `tsc`
- lint
- tests
- build

### Browser

Sprawdzić:

- placement preview,
- poprawny/niepoprawny placement,
- wymaganie łopaty,
- wymagane ilości kamienia i drewna,
- zużycie materiałów,
- rozpoczęcie etapu,
- upływ czasu,
- przejście `pit → well → roof`,
- możliwość odejścia i powrotu do budowy,
- ukończona studnia jako `WaterSource`,
- pobieranie wody przez gracza,
- znalezienie studni przez NPC,
- transport wody do household,
- save/load,
- chunk unload/load,
- brak duplikacji `WaterSource`,
- poprawny dispose/rebuild.

### Gameplay

Najważniejszy test end-to-end:

```text
player builds well
        ↓
well becomes completed
        ↓
WaterSource becomes available
        ↓
NPC discovers it
        ↓
NPC collects water
        ↓
household water reserve increases
```

## Out of scope

Nie implementować:

- budowania domów przez gracza,
- systemu fundamentów,
- voxel/block building,
- blueprintów,
- NPC builders,
- automatycznego budowania,
- wieloetapowych konstrukcji innych niż studnia,
- edytora konstrukcji,
- zaawansowanego systemu placement grid.

## Implementation summary (2026-08-21)

**Implemented:**

- Pure domain logic: `world/playerWell.ts` — `WellStage` (`pit`/`well`/`roof`), `PlayerWellRecord`, `WELL_STAGE_DURATION_DAYS` (1 / 1 / 0.5 days, matches §4), `WELL_STAGE_COST` (stone for `well`, `branch` for `well`+`roof`, matching §2's "kamienie for the well body, drewno for both body and roof"; `stone`/`branch` are the existing `ItemKind`s — no new "construction material" items), `isWellStageComplete`/`isWellCompleted` (lazy, evaluated whenever looked at — no per-frame timer), `wellAdvanceCost`, ground-placement reasons/messages (reuses `items/tentPlacement.ts`'s shared `evaluateGroundPlacement`), and `NearbyPlayerWellLookup` (the NPC discovery contract, §10).
- Visuals: `world/playerWellProp.ts` — one procedural prop per stage; `pit` and `well` are new small procedural meshes (`docs/assets/MODELS.md` M54, no GLB planned), `roof` (completed) reuses the existing settlement `createWell()` fallback directly, so a finished player well looks like any other well.
- World lifecycle: `world/createPlayerWells.ts` (`createPlayerWells`) — same "player chose the spot, whole record round-trips through the save" shape as `PlacedTents`/`PlacedTraps`; registers/replaces a collider through the existing `ColliderRegistry` (`chunkManager.registerColliders`/`clearColliders`, same mechanism settlement wells use) keyed by the well's own id, so a stage change or chunk/settlement rebuild never duplicates or leaks a collider (§12/§16). `nearestCompleted()` is the bounded, deterministic query `NpcAgent` uses (§10).
- Placement: Quick Actions → "Zbuduj studnię" (shovel group, requires a shovel — never consumed) → `placeWellAtAim()` (`createApp.ts`) validates ground placement (slope/water/collision/spacing, same shared validator as tents/traps/containers) and starts a short busy channel; completing it creates the record in `pit` stage and starts that stage's world-time clock — this *is* the plan's "[E] Wykop dół" (the codebase's placement convention is a Quick Action + busy channel, not a gaze `[E]`, for every player-placed object; implemented to match the existing convention rather than the plan's illustrative keybind).
- Stage advancement: a new `Interactable{kind:'playerWell'}` (`app/interactables.ts`, handled directly in `gameLoop.ts`/`createApp.ts`'s `advanceWellStage` since it needs `Inventory` access, same as `dig`/`tent`/`trap`) shows a progress prompt while the current stage's clock hasn't elapsed, or `[E] Buduj studnię` / `[E] Zbuduj daszek` once it has; pressing `[E]` validates + atomically consumes that next stage's materials, then calls `PlayerWells.advanceStage()`. Walking away and returning costs nothing — the persisted `stageStartedAt` is the only clock.
- Completion & `WaterSource`: once `stage === 'roof'` and its own duration has elapsed, `buildInteractables()` stops emitting a `playerWell` candidate and instead emits a plain `{kind:'well', promptLabel: WATER_SOURCE_PROMPT}` — the *exact* existing settlement-well interaction path (`gameLoop.ts`'s `target.kind === 'well'` branch, `createWaterSource('well')`, `resolveInteraction`'s flavor line). No `PlayerWellWaterSystem`, no second `WaterSource`, no special "player well" prompt (§9, notes §4).
- NPC discovery (§10): the actual plan-122 water-fetch implementation (`NpcAgent.beginNeed`) is not a generic multi-source resolver — it targets each settlement's own fixed `landmarks.well` (with an interaction queue). No such resolver existed to "extend" (implementation notes §5/§24 anticipated this and asked to verify before assuming). Added the smallest bounded extension that fits: `NpcAgent.resolveWaterWellTarget()` compares the settlement's own well against `getNearbyPlayerWell(home, PLAYER_WELL_WATER_SEARCH_RADIUS=60)` and prefers whichever is closer to the NPC's household home; a player well is used as a plain, queue-less destination through the same `kind:'drink'`/`kind:'deposit'` action chain — no `if (playerBuiltWell)` branch, no well-specific FSM. `getNearbyPlayerWell` is threaded through the existing `getPlayerSocial`-style optional-callback chain (`worldBundle.ts` → `SettlementsManager.ts` → `createSettlement.ts` → `NpcAgent`), resolved lazily against `bundle.playerWells` via the same "target assigned after `bundle` exists" indirection `onAnimalDeath`/`getPlayerSocial` already use — survives `rebuildWorldBundle()` for free.
- Persistence: `SaveDataV23` (`playerWells: SavePlayerWell[]`), full migration chain from every older version; a pre-v23 save restores with no player-built wells. Streaming (chunk/settlement unload-load, in-session world rebuild) carries the record array through the same `nodes()`/dispose/recreate contract as `PlacedTents`/`PlacedTraps`/`PlacedContainers`.

**Technically verified:** `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` all pass (1339 tests, including new `world/playerWell.test.ts` pure-logic coverage and `persistence/saveData.test.ts`'s v23 block).

**Not done / deliberately deferred:**

- No new GLB for the `pit`/`well`-body stages (procedural only, `docs/assets/MODELS.md` M54) — the completed well reuses the wired `well.glb`/`createWell` fallback (M32).
- The player-well "queue" a completed well offers is unqueued (a plain destination point), unlike the settlement well's FIFO interaction queue — acceptable per §10/notes (no well-specific NPC controller); a real queue could be added later if multiple NPCs contending for one player well turns out to matter.

**Browser/manual verification — not performed** (per repo convention, TS/lint/build/test passing is not proof of correct visual/gameplay behavior). Needs a manual pass in the running dev server, following the plan's §15/gameplay end-to-end scenario:

- Placement preview/rejection (too steep, in water, too close to another well/object), shovel requirement, Quick Actions → "Zbuduj studnię".
- `pit → well → roof` stage progression: prompt text while in progress, `[E]` advance once each stage's world-time duration elapses, material consumption (stone/branch) and toasts for missing materials.
- Leaving and returning mid-stage (including a real save/load and a chunk unload/reload) preserves progress without duplicating the well/collider/interaction.
- Completed well: `[E]` drink / `[R]` fill waterskin behave exactly like a normal well; NPC discovers a nearby completed player well (closer than their settlement well) and carries water back to household stock; multiple wells in one area; NPC pathing doesn't get stuck on the well collider.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
