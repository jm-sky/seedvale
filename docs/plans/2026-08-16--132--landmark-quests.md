---
domain: quests-progression
tags: [world-terrain, settlements-npcs]
---

# Plan: Landmark Quests

**Created:** 2026-08-16
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** ~~049~~ ~~093~~ ~~110~~

## Cel

Połączyć istniejące proceduralne landmarki z istniejącym systemem questów tak, aby eksploracja świata mogła tworzyć **world-driven content** wynikający z realnego miejsca, problemów NPC i settlementów.

Docelowy przepływ:

```text
Landmark / World State
        ↓
NPC / Settlement Problem
        ↓
Quest availability
        ↓
Landmark objective
        ↓
Player travel / discovery / interaction
        ↓
World change / consequence
        ↓
NPC relation / new pressure
```

Nie tworzyć osobnego `LandmarkQuestSystem`, globalnego rejestru landmarków ani drugiego systemu discovery. Rozszerzyć `QuestManager`, istniejące `QuestObjective`, interakcje gracza i istniejący pipeline `chunkEnvironment`.

## Stan obecny — zweryfikowany

### Landmarki

`src/terrain/chunkEnvironment.ts` generuje deterministyczne landmarki proceduralne:

- `monolith`
- `stoneCircle`
- `smallRuins`
- `cemetery`

Każdy z tych czterech typów ma stabilne `EnvironmentPlacement.id`, wyprowadzone z `(seed, chunk, kind, ordinal)`. ID regeneruje się identycznie po unload/reload chunka i nie wymaga persystencji. Obecnie `id` nie ma konsumentów ani runtime registry/lookup. fileciteturn11file0L2-L2

Plan 049 jest zakończony i świadomie ograniczył v1 do czterech landmarków; większe lokacje i nowe typy nie są zależnością tego planu. fileciteturn13file0L2-L6

### Questy

`QuestManager` / `QuestDef` obsługują już:

- wieloetapowe questy,
- objective'y world interaction,
- relation gates,
- efekty relation/EXP,
- wiązanie objective'u z konkretnym `animalId`,
- `failed` i `invalidated`,
- istniejące world-problem quests.

Aktualne objective'y obejmują m.in. `interact_spawner`, `spot_animal`, `gather_item`, `kill_target_animal`, `clear_wolf_den` i `find_animal`; nie ma objective'u dla konkretnego landmarku. fileciteturn9file0L2-L2

Plan 093 dostarczył fundament world-driven quests, a plan 110 domknął lifecycle i stabilną tożsamość świata. fileciteturn12file5L27-L30 fileciteturn7file1L7-L10

### Kierunek z NEXT-IDEAS

NEXT-IDEAS wskazuje landmark quests jako kolejny etap world-driven content po social/NPC life i natural resources. Zakładany model to `Landmark → stable landmarkId → Quest Objective → Discovery / Travel / Interaction`. fileciteturn5file0L2-L2

## Zakres

### 1. Wspólny landmark lookup

Dodać mały, istniejący w warstwie world/terrain punkt dostępu do landmarku po `landmarkId`, zamiast tworzyć globalny registry.

Preferowany model:

- funkcja/pure resolver korzystająca z deterministycznych danych chunk environment,
- lookup może zwrócić `EnvironmentPlacement` wraz z pozycją/kind,
- brak trwałej Mapy wszystkich landmarków,
- brak konieczności skanowania całego świata,
- lookup ma działać także wtedy, gdy chunk nie jest aktualnie załadowany, wykorzystując deterministyczność generatora.

Jeżeli aktualny pipeline nie pozwala na tani lookup po samym ID, najpierw rozłożyć ID na minimalny stabilny adres `(kind, chunk, ordinal, seed)` lub dodać równoległy deterministyczny resolver — nie utrzymywać drugiego stanu świata.

### 2. Nowy objective landmarku

Rozszerzyć istniejące `QuestObjective` o jeden ogólny typ, np.:

```ts
{ type: 'interact_landmark', landmarkId: string }
```

Nie tworzyć osobnych objective'ów typu `visit_monolith`, `visit_ruins`, `visit_cemetery` itd.

Objective powinien:

- wskazywać konkretny stabilny landmark,
- zostać zaliczony przez istniejącą interakcję gracza / proximity interaction,
- nie wymagać utrzymywania runtime entity, gdy chunk jest poza streamingiem,
- działać deterministycznie po reloadzie,
- nie importować bezpośrednio całego `ChunkManager` do `QuestManager`.

Wzorem istniejącego rozwiązania dla fauna użyć dependency injection / resolvera z warstwy aplikacji, aby `QuestManager` pozostał niezależny od generatora terenu.

### 3. Rozszerzenie interakcji gracza

Wykorzystać istniejący mechanizm interakcji (`[E]` / target selection) i dodać landmark jako kolejny typ interakcji tylko tam, gdzie gracz rzeczywiście patrzy / znajduje się przy landmarku.

Nie budować drugiego systemu proximity ani osobnego quest interaction managera.

Dla aktywnego objective'u:

```text
player near landmark
        ↓
existing interaction target
        ↓
landmark interaction
        ↓
QuestManager reports objective progress
```

Poza aktywnym questem landmark może pozostać zwykłym elementem świata.

### 4. Questy wynikające z istniejących landmarków

Dodać mały zestaw ręcznie zdefiniowanych questów do `QUESTS`, wykorzystując istniejące `QuestDef` i `QuestStage`.

Questy nie powinny być generowane losowo jako nowe quest definitions. Landmark jest punktem zaczepienia, natomiast sens questa powinien wynikać z problemu NPC/settlementu.

Przykładowe wzorce:

#### Ruiny

```text
NPC problem: potrzebne informacje / miejsce zaginionego przedmiotu
        ↓
smallRuins
        ↓
zbadaj ruiny
        ↓
znajdź / potwierdź stan
        ↓
raport do NPC
```

#### Monolit / stone circle

```text
NPC problem: ktoś z osady zniknął / nie wrócił z wyprawy
        ↓
landmark jako ostatni znany punkt
        ↓
zbadaj miejsce
        ↓
kolejny etap istniejącego questa
```

#### Cemetery

```text
Settlement/NPC problem: zaniedbane miejsce / brak informacji o osobie
        ↓
cemetery
        ↓
interakcja / odkrycie
        ↓
world-state consequence / relation
```

To są wzorce projektowe, nie wymaganie implementacji wszystkich trzech rodzajów w v1. Priorytetem jest sprawdzenie, który istniejący NPC/world state najlepiej nadaje się do realnego questa.

### 5. Powiązanie z istniejącym world state

Quest nie powinien kończyć się wyłącznie na `complete` + EXP.

Tam, gdzie istnieje już odpowiedni mechanizm, użyć istniejących:

- relation effects,
- world flags,
- istniejących interakcji świata,
- istniejących problemów NPC/settlementu.

Nie tworzyć nowego `LandmarkState` tylko po to, aby przechowywać „odwiedzone”.

Jeżeli konsekwencja wymaga jednorazowego odkrycia, wykorzystać istniejące `worldFlags` / quest state tylko wtedy, gdy dokładnie odpowiada to semantyce problemu.

## Projekt objective'u

`interact_landmark` powinien być celowo mały:

```ts
type QuestObjective =
  | ...existing objectives
  | { type: 'interact_landmark', landmarkId: string }
```

`QuestManager` potrzebuje tylko:

- identyfikatora landmarku,
- callbacku/resolvera do sprawdzenia jego istnienia,
- eventu/progress dispatch z warstwy interakcji.

Nie powinien znać:

- chunk streaming,
- Three.js `Object3D`,
- generowania geometrii,
- `ChunkManager`.

## Binding landmarku do questa

Quest definition może zawierać stabilny `landmarkId`, ale nie powinien mieć ręcznie wpisanych przypadkowych współrzędnych.

Ponieważ obecne landmarki są deterministyczne względem seeda i chunka, v1 powinna wybrać landmark dopiero na podstawie istniejącego świata.

Preferowany mechanizm dla questów NPC:

```text
NPC / settlement problem
        ↓
resolver szuka pasującego istniejącego landmarku
        ↓
wybiera stabilny landmarkId
        ↓
quest stage zostaje związany z tym ID
```

Resolver powinien mieć ograniczony zakres (np. pobliski region/settlement), aby nie skanować całego proceduralnego świata.

Jeśli konkretne questy v1 mogą mieć sensowny, deterministyczny landmark z góry, dopuszczalne jest zapisanie jego adresu wynikającego z seed/chunk — ale bez hardcodowania world coordinates.

## Persistence

Nie dodawać nowego pola do `SaveData` tylko dla landmarków.

Stabilny `landmarkId` regeneruje się z world seed + chunk + kind + ordinal. fileciteturn11file0L2-L2

Stan aktywnego questa pozostaje w istniejącym `QuestState`.

Jeżeli stage przechowuje konkretny landmark ID, po reloadzie resolver powinien ponownie potwierdzić jego istnienie deterministycznie. Nie ma potrzeby zapisywania całego `EnvironmentPlacement`.

## Proponowane pliki / obszary zmian

Najpierw zweryfikować aktualne nazwy eksportów i przepływ danych; poniższa lista jest mapą implementacyjną, nie kontraktem:

- `src/quests/quests.ts` — `QuestObjective`, nowe definicje/stages landmark quests.
- `src/quests/QuestManager.ts` — obsługa nowego objective'u i injected landmark resolver/progress event, zgodnie z istniejącym wzorcem fauna.
- `src/terrain/chunkEnvironment.ts` — wykorzystanie istniejącego `EnvironmentPlacement.id`; ewentualny deterministyczny resolver/lookup bez globalnego registry.
- `src/app/worldBundle.ts` / `src/app/createApp.ts` — spięcie resolvera z `QuestManager`, jeśli tam znajduje się obecna composition root dla world systems.
- `src/app/interactables.ts` i/lub aktualny moduł interaction target — dodanie landmark interaction do istniejącego targetowania.
- odpowiedni moduł world/settlement state — tylko jeśli istniejący world problem wymaga już dostępnego hooka/flag, bez tworzenia nowego systemu.
- testy questów / terrain determinism — rozszerzyć istniejące testy zamiast tworzyć osobny harness.

## Etapy implementacji

### Etap 1 — Resolver landmarków

- ustalić najtańszy deterministyczny sposób `landmarkId → placement`;
- zachować brak globalnej Mapy landmarków;
- dodać test deterministyczności po seed/chunk/kind/ordinal;
- upewnić się, że lookup nie wymaga załadowanego chunka.

### Etap 2 — Quest objective

- dodać `interact_landmark` do istniejącego union type;
- podłączyć objective lifecycle w `QuestManager`;
- użyć injected resolver/callback zamiast importu world generation do questów;
- obsłużyć invalid/nieistniejący landmark zgodnie z istniejącym lifecycle questów, bez cichego zaliczania.

### Etap 3 — Interaction

- rozszerzyć istniejące targetowanie/interakcję o landmark;
- ograniczyć target do realnego landmarku w aktywnym świecie;
- wysłać istniejący typ progress event do `QuestManager`;
- nie tworzyć drugiego proximity systemu.

### Etap 4 — Pierwsze landmark quests

- wybrać 2–3 questy oparte na istniejących problemach NPC/settlementów;
- preferować różne landmarki (`smallRuins`, `stoneCircle`, `monolith`, ewentualnie `cemetery`);
- użyć relation gates/effects tylko tam, gdzie pasują do istniejącej relacji NPC;
- przynajmniej jeden quest powinien mieć konsekwencję poza samym EXP/relation, jeśli istniejący world state ma odpowiedni hook.

### Etap 5 — Testy i weryfikacja

Technicznie:

- TypeScript / lint / test / build;
- deterministyczność landmark IDs;
- objective completion i brak double-completion;
- save/load aktywnego questa;
- zachowanie, gdy landmark jest poza aktualnie załadowanym chunkiem;
- brak zależności `QuestManager` od Three.js/chunk runtime.

Browser/manual:

- znaleźć landmark w świecie;
- rozpocząć quest od NPC;
- dotrzeć do właściwego landmarku;
- potwierdzić `[E]` / interaction prompt;
- zaliczyć objective;
- wrócić do NPC i zobaczyć właściwy dialog/reward/consequence;
- sprawdzić unload/reload chunku i ponowne wejście w interakcję;
- sprawdzić co najmniej jeden quest w pobliżu settlementu i jeden poza nim.

## Poza zakresem

- nowe typy landmarków;
- większe lokacje / prawdziwe jaskinie;
- globalny landmark registry;
- proceduralne generowanie questów przez LLM;
- osobny system discovery/map markers;
- teleportowanie gracza do landmarków;
- nowy system world-state tylko dla questów;
- bandyci jako nowa frakcja/przeciwnik;
- automatyczne tworzenie questa dla każdego landmarku.

## Kryteria ukończenia

- istniejący `landmarkId` jest faktycznie konsumowany przez quest system;
- quest może wskazać konkretny proceduralny landmark bez przechowywania jego runtime `Object3D`;
- landmark interaction korzysta z istniejącego mechanizmu interakcji;
- co najmniej 2 sensowne landmark quests działają end-to-end;
- quest wynika z realnego problemu NPC/settlementu, a nie jest „idź do losowego miejsca”;
- reload/unload nie zmienia tożsamości celu;
- brak równoległego systemu questów, discovery lub landmark registry;
- techniczna weryfikacja jest zielona, a browser verification jest wykonana i opisana osobno.

## Verification evidence

W planie końcowym należy wyraźnie rozdzielić:

- **implemented** — kod istnieje;
- **technically verified** — tsc/lint/test/build;
- **browser/manual verified** — rzeczywisty test w grze.

Nie oznaczać planu jako zweryfikowanego na podstawie samego builda.

## Implementation summary (2026-08-16)

No pre-existing implementation-notes file was found for this plan (the task pointed at one, but it doesn't exist in the repo) — implemented directly from this plan against the current codebase, deviating where the plan's own text names the tension explicitly (the `landmarkId`-in-static-`QuestDef` question, see below).

Implemented as scoped, no parallel landmark/discovery/quest system introduced.

- **`src/terrain/chunkEnvironment.ts`** — `LandmarkKind` (the four id-bearing kinds) and `LANDMARK_LABELS` (Polish display labels), reused by both the interaction layer and dialogue.
- **`src/terrain/chunkManager.ts`** — two additions to `ChunkManager`, no new persistent registry:
  - `getNearbyLandmarks(pos, radius)` — loaded-chunk-only query mirroring `getNearbyItems`'s contract, reading straight from each chunk's already-computed `tile.environment` (no mesh/userData round-trip). Used for `[E]` interaction targeting.
  - `findLandmarkNear(kind, worldX, worldZ, maxChunkRadius)` — the plan's "cheap lookup" resolver. Deterministic, bounded: walks chunk coordinates in expanding rings (`ringChunkOffsets`, exported/unit-tested) out to `maxChunkRadius`, checking each already-loaded chunk's cached tile first and falling back to synchronously recomputing that one chunk's tile + environment (`computeChunkTile` + `computeChunkEnvironment`, the same pure pipeline the worker pool already runs) only when it isn't loaded. Stops at the first match. Not a global registry, not a full-world scan, and it works for landmarks outside the streaming radius as the plan required.
- **`src/quests/quests.ts`** — `interact_landmark` added to `QuestObjective` (`{ type, landmarkId }`, exactly the shape the plan sketched). `buildLandmarkQuests(resolve: LandmarkResolver)` builds 3 hand-authored `QuestDef`s (`stare-ruiny`/Piotr/smallRuins, `slad-przy-monolicie`/Anna/monolith, `zapomniany-cmentarz`/Kasia/cemetery), each grounded in one of the four existing NPCs' established persona rather than inventing a new mechanic; a kind `resolve` can't find within its bound is simply omitted that session (matches "nie wymaganie implementacji wszystkich trzech rodzajów w v1").
- **`src/quests/QuestManager.ts`** — `interact_landmark` added to `ObjectiveRef`/`objectiveMatchesRef` as plain string-equality matching, same shape as `interact_well`/`interact_spawner`. **Deliberate deviation from the plan's literal Etap-2 wording** ("QuestManager potrzebuje... callbacku/resolvera do sprawdzenia jego istnienia"): no resolver is injected into `QuestManager` for landmarks, and none is needed. Unlike `kill_target_animal`/`find_animal`, a landmark never dies or changes once generated, so there is nothing to rebind or invalidate at runtime or on restore — see the next point.
- **`src/app/createApp.ts`** — `buildLandmarkQuests` is called once per app boot (new game and loaded save alike) with a resolver closing over `bundle.chunkManager.findLandmarkNear` anchored at `bundle.settlementsManager.home.center`, search radius 10 chunks (`LANDMARK_QUEST_SEARCH_CHUNK_RADIUS`). The result is concatenated with the static `QUESTS` and passed into `new QuestManager(...)` — this is where "landmark → real placement" binding happens, once, outside `QuestManager` entirely (plan's "resolver szuka pasującego istniejącego landmarku... quest stage zostaje związany z tym ID", done at the composition root rather than dynamically during play, because landmarks — unlike animals — don't need a live retry).
- **`src/interaction/Interactable.ts`** / **`src/app/interactables.ts`** / **`src/interaction/resolveInteraction.ts`** — `kind: 'landmark'` added to the existing `Interactable` union and `buildInteractables()` (same `GAZE_RANGE` pattern as `well`/`spawner`/`house`); `resolveInteraction.ts` gets one more switch case reporting `interact_landmark` to `QuestManager` and falling back to a per-kind flavor line. `gameLoop.ts` needed **no change** — landmark falls into the existing generic `else` branch that already opens the NPC-dialog-style outcome for `spawner`/`house`, exactly the "extend, don't add a second interaction manager" instruction.

### Why persistence needed no new code

The plan's Persistence section asks for re-confirmation of a bound landmark's existence after reload. That turned out to be unnecessary here: `buildLandmarkQuests` re-runs the identical deterministic search on every app boot (same seed, same settlement position ⇒ same `landmarkId`), so a persisted `active`/`ready_to_report` quest state keyed by the quest's own static `id` (e.g. `'stare-ruiny'`) lines up against the freshly rebuilt `QuestDef` automatically, through the exact same generic `QuestManager` restore path every other quest already uses. No `invalidated` special-case, no extra `SaveData` field.

### Accepted trade-off

`findLandmarkNear`'s unloaded-chunk fallback (`computeChunkTile` + `computeChunkEnvironment`) is a synchronous main-thread recompute — the same per-chunk cost the worker pool normally pays, just inline. It only runs during `createApp()`'s one-time world setup (not per-frame), and the ring search stops at the first hit, so in practice most of it resolves against chunks already streamed in around the home settlement. The rarest landmark tier (`smallRuins`, ~0.8%/chunk) is the one most likely to walk past the loaded radius before finding (or failing to find) a match within the radius-10 bound — an accepted, bounded, one-off cost, not a per-frame regression.

### Verification

- **Implemented** — all of the above.
- **Technically verified** — `npx tsc --noEmit` clean; `npm run test` 860/860 passing (new: `chunkManager.test.ts`'s `ringChunkOffsets` determinism/coverage, `quests.test.ts`'s `buildLandmarkQuests`, `QuestManager.test.ts`'s `interact_landmark` binding/no-double-complete); `npm run build` clean (`vue-tsc` + `vite build`). `npm run lint` **not run**, per explicit instruction for this task.
- **Browser/manual verified** — **not done**, per explicit instruction for this task. Needs: find a landmark, accept one of the three new quests from Piotr/Anna/Kasia (relation ≥ their existing gate, if any — these three are ungated), travel to the bound landmark, confirm the `[E]` prompt reads "Zbadaj: <label>", confirm objective completion + report dialogue, confirm unload/reload of the landmark's chunk doesn't change target identity, and confirm a world whose home settlement rolls no `smallRuins`/`monolith` within 10 chunks simply omits that quest rather than breaking.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
