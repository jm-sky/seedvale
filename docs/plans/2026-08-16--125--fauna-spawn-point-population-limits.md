---
domain: fauna
tags: [items-player, world-terrain]
---

# Plan: Fauna — limity populacji i wyczerpywanie spawn pointów

**Created:** 2026-08-16  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~110~~ ~~118~~

## Cel

Dopracować istniejący system animal spawn pointów tak, aby fauna miała kontrolowaną liczebność, a intensywne polowanie gracza mogło realnie zmienić stan lokalnego siedliska.

Mechanizm ma rozszerzać istniejący `PreySpawner` / `createFauna` / `AnimalAgent` zamiast tworzyć równoległy system spawnów lub osobny system populacji.

### Efekt gameplay

- każdy spawn point ma ograniczoną populację danego gatunku,
- zabijanie zwierząt może doprowadzić do wyczerpania lokalnego spawn pointu,
- gracz może podpalić/„zniszczyć” wyczerpane siedlisko,
- teren wyraźnie pokazuje, że miejsce zostało spalone,
- po czasie natura może odzyskać spawn point, ale tylko gdy gatunek nadal występuje w okolicy.

---

## 1. Istniejący system — najpierw rozszerzyć, nie dublować

Przed implementacją sprawdzić aktualne przepływy:

- `src/fauna/AnimalSpawner.ts` — `PreySpawner`, `updateSpawners`, `maxPreyCount`, respawn timer,
- `src/fauna/createFauna.ts` — tworzenie spawn pointów, początkowe spawnowanie i respawn,
- `src/fauna/AnimalAgent.ts` — `animalId`, śmierć i lifecycle zwierzęcia,
- `src/fauna/herdCohesion.ts` — obecne grupowanie/spawn młodych,
- `src/interaction/Interactable.ts` + `src/app/interactables.ts` — istniejący interaction pipeline dla spawnerów,
- `src/world/worldContext.ts` / `src/world/dayNight.ts` — `elapsedDays` i czas świata,
- istniejący system ognisk i zużywania gałęzi,
- istniejący system modyfikacji terenu / propsów / drzew.

Istotne: obecny `PreySpawner` już posiada `maxPreyCount`, ale jest to wyłącznie bieżący limit żywych zwierząt w promieniu spawnera. Nie zastępować go drugim, niezależnym limitem. Rozszerzyć jego znaczenie o lokalny stan populacji.

---

## 2. Konfigurowalny limit populacji per gatunek

Dodać jedno źródło konfiguracji limitów, łatwe do strojenia.

Przykładowo:

```ts
const SPAWN_POINT_POPULATION_LIMITS: Partial<Record<AnimalKind, number>> = {
  deer: 6,
  stag: 4,
  boar: 4,
  rabbit: 6,
  duck: 4,
}
```

Dokładne wartości należy dobrać na podstawie istniejącego spawnowania, a nie kopiować bezpośrednio powyższych przykładów.

Zasady:

- limit dotyczy konkretnego spawn pointu i gatunku,
- wartości są centralnie konfigurowalne,
- brak niekontrolowanego namnażania przez respawn,
- początkowy spawn również respektuje limit,
- herd/juvenile z planu 118 nie może omijać limitu spawn pointu.

Dla przykładu `deer = 6` oznacza maksymalnie 6 aktywnych osobników przypisanych do danego spawn pointu.

---

## 3. Tożsamość i stan spawn pointu

Obecny spawner ma pozycję, gatunek i timer, ale nie posiada pełnego lifecycle. Rozszerzyć istniejący typ o stabilny stan lokalnego siedliska.

Docelowo:

```text
active
   ↓
>50% populacji zabite
   ↓
depleted / eligible
   ↓
player pays 4 branches
   ↓
disabled
   ↓
14–30 dni
   + min. 2 osobniki gatunku w okolicy
   ↓
recovering
   ↓
active
```

Stan powinien być generyczny i niezależny od gatunku:

```ts
type SpawnPointState =
  | 'active'
  | 'depleted'
  | 'disabled'
  | 'recovering'
```

Nie implementować osobnych flag typu `isDeerSpawnDestroyed`.

### Stan `active`

- normalny respawn,
- limit populacji działa,
- śmierć przypisanego zwierzęcia zwiększa licznik strat danego spawn pointu,
- po przekroczeniu 50% początkowej/ustalonej populacji spawn point przechodzi do `depleted`.

### Stan `depleted`

- nie tworzyć nowych zwierząt ponad istniejący stan,
- spawn point nadal istnieje w świecie,
- interaction może pokazać możliwość `Zniszcz`,
- nie uruchamiać automatycznie kolejnego respawnu.

### Stan `disabled`

Po wykonaniu interakcji:

- spawn point przestaje generować zwierzęta,
- zapisuje czas rozpoczęcia regeneracji,
- pozostaje wizualnie spalony,
- istniejące zwierzęta nie są magicznie usuwane — świat reaguje tylko na faktyczne śmierci/odejście.

### Stan `recovering`

Po upływie okresu regeneracji:

- sprawdzić, czy w odpowiednim promieniu istnieją co najmniej 2 żywe osobniki tego samego gatunku,
- jeśli nie → pozostawić `disabled` i sprawdzać ponownie przy kolejnych dniach/odświeżeniu stanu,
- jeśli tak → przywrócić `active` i rozpocząć normalne zasiedlanie spawn pointu.

Okres regeneracji powinien być konfigurowalny, np. `14–30` dni. Na v1 wybrać jedną wartość domyślną, łatwą do późniejszego strojenia.

---

## 4. Jak liczyć „>50% populacji”

Nie opierać tego wyłącznie na chwilowym `nearby` count.

Spawn point powinien znać swój limit/populację referencyjną i liczbę osobników, które zginęły po aktywacji danego cyklu.

Przykład dla saren:

```text
limit = 6

0–3 deaths → active
4 deaths   → depleted / eligible
```

Ważne:

- śmierć musi być przypisana do konkretnego spawn pointu,
- jedno zwierzę nie może zostać policzone dwa razy,
- śmierć z dowolnego źródła (gracz, predator, potrzeby/lifecycle) powinna korzystać z istniejącego hooka śmierci,
- usunięcie/despawn bez śmierci nie powinno sztucznie zwiększać licznika zabitych.

Jeżeli istniejący lifecycle nie niesie jeszcze `spawnPointId`, rozszerzyć `AnimalAgent`/spawn path minimalnie tak, aby informacja była dostępna bez globalnego managera.

---

## 5. Przypisanie zwierzęcia do spawn pointu

Każde zwierzę wygenerowane przez spawn point powinno znać jego stabilną tożsamość, np.:

```ts
spawnPointId?: string
```

ID musi być deterministyczne dla danego świata/settlementu/pozycji/gatunku i nie może zależeć od kolejności runtime spawnu.

Nie wymagać osobnego `SpawnPointManager`.

Preferowane rozwiązanie:

- `PreySpawner` pozostaje właścicielem stanu spawn pointu,
- `AnimalAgent` przechowuje tylko `spawnPointId`,
- istniejący `Fauna`/`createFauna` przepina zdarzenie śmierci do właściwego spawnera,
- agregacja stanu pozostaje lokalna dla spawnera.

Jeżeli obecne ring spawny (`SPAWNS`) również są traktowane jako spawn pointy, zachować jedną semantykę identyfikacji zamiast tworzyć osobny mechanizm tylko dla cave/thicket/grove.

---

## 6. Interakcja „Zniszcz”

Dla spawn pointu w stanie `depleted` dodać istniejącym pipeline'em interaction nową akcję:

```text
[E] Zniszcz
```

Warunek:

- stan `depleted`,
- gracz ma co najmniej 4 gałęzie.

Po wykonaniu:

1. zużyć 4 gałęzie,
2. zmienić stan na `disabled`,
3. utworzyć duże ognisko w miejscu spawn pointu,
4. rozpocząć okres regeneracji,
5. uruchomić wizualne spalenie miejsca.

Nie tworzyć osobnego `SpawnPointInteractionSystem` — użyć istniejącego `Interactable` / handlera interakcji.

Jeżeli istniejący `VillageFire` jest ograniczony do ognisk osad, nie kopiować go bezpośrednio. W takim przypadku wydzielić z niego minimalny, wspólny mechanizm ognia możliwy do użycia przez światowe ognisko, bez przebudowy całego systemu.

---

## 7. Spalone miejsce

Po zniszczeniu spawn pointu miejsce powinno wyraźnie wyglądać na wypalone.

Minimalny efekt v1:

- duże ognisko,
- ciemniejszy obszar ziemi,
- kilka widocznych spalonych/suchych drzew lub istniejących propsów odpowiednio zmienionych,
- brak nowych zwierząt z tego punktu.

Preferować istniejące mechanizmy:

- `ChunkManager.modifyTerrain()` / istniejące modyfikacje terenu,
- istniejące drzewo/prop pipeline,
- istniejący system ognia.

Nie budować nowego ciężkiego systemu shaderów tylko dla jednego efektu.

Zmiana terenu ma być lokalna i tania. Nie deformować dużego obszaru świata.

---

## 8. Regeneracja i warunek lokalnej populacji

Po `14–30` dniach od zniszczenia:

```text
elapsedDays - disabledAtDay >= RECOVERY_DAYS
```

Następnie sprawdzać lokalną populację gatunku.

Minimalny warunek:

```text
nearby living animals of same kind >= 2
```

Promień sprawdzania powinien być powiązany z istniejącym `SPAWNER_RADIUS` lub inną istniejącą lokalną skalą spawnera, a nie definiowany arbitralnie w kilku miejscach.

Jeśli warunek jest spełniony:

- `disabled → recovering → active`,
- wyzerować licznik strat dla nowego cyklu,
- przywrócić normalny respawn zgodnie z limitem,
- zachować istniejące herd/mother mechanizmy.

Nie tworzyć sztucznie dwóch zwierząt tylko po to, aby spełnić warunek regeneracji.

---

## 9. Determinizm i wydajność

Mechanizm musi pozostać deterministyczny.

- brak `Math.random()` w logice stanu spawn pointu,
- recovery nie powinno być sprawdzane ciężkim skanem co klatkę,
- wykorzystać istniejące ticki/symulację czasu świata,
- stan spawn pointu aktualizować przy śmierci, interakcji i niskoczęstotliwościowym ticku recovery,
- nie wykonywać globalnego `O(spawners × animals)` co frame.

W szczególności nie zwiększać kosztu aktualizacji wszystkich zwierząt tylko dlatego, że spawn point otrzymuje lifecycle.

---

## 10. Poza zakresem

- ❌ pełna persystencja wszystkich zwierząt,
- ❌ migracja między spawn pointami,
- ❌ naturalna reprodukcja jako źródło populacji,
- ❌ dynamiczne wyznaczanie limitu na podstawie biomu,
- ❌ osobny globalny `SpawnPointManager`,
- ❌ osobny system AI spawn pointów,
- ❌ specjalne reguły tylko dla saren,
- ❌ rozbudowany system ekologicznej sukcesji po spaleniu.

Plan ma stworzyć prosty lifecycle spawn pointu, który później można rozszerzyć o naturalną dynamikę populacji.

---

## Kryteria akceptacji

1. 🦌 Każdy gatunek korzystający ze spawn pointów ma konfigurowalny limit populacji.
2. 🔢 Limit jest respektowany zarówno przy początkowym spawnie, jak i respawnie.
3. ☠️ Śmierć zwierzęcia jest przypisana do właściwego spawn pointu i nie jest liczona podwójnie.
4. ⚠️ Po śmierci >50% referencyjnej populacji spawn point przechodzi do `depleted`.
5. 🪵 W stanie `depleted` gracz może wykonać `Zniszcz`, jeśli ma 4 gałęzie.
6. 🔥 Interakcja zużywa 4 gałęzie i tworzy duże ognisko.
7. 🌑 Zniszczony punkt ma widoczny ślad spalenia na terenie.
8. 🚫 `disabled` nie generuje nowych zwierząt.
9. 🌱 Po skonfigurowanym okresie regeneracji punkt może wrócić do `active` tylko przy co najmniej 2 żywych osobnikach tego gatunku w okolicy.
10. 🐾 Mechanizm działa również dla innych gatunków bez kopiowania logiki per gatunek.
11. 🦌 Stada i młode z planu 118 respektują limit spawn pointu.
12. ⚡ Recovery i liczniki nie wprowadzają kosztu per-frame zależnego od liczby wszystkich zwierząt.
13. 🧪 `tsc`, lint, testy i build przechodzą.
14. 🌐 Wymagana jest weryfikacja w przeglądarce: normalny spawn, przekroczenie progu, `Zniszcz`, ognisko/spalenizna, brak respawnu i późniejsza regeneracja.

---

## Weryfikacja

Techniczna:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Browser/play:

- sprawdzić kilka spawn pointów różnych gatunków,
- zweryfikować limit populacji,
- zabić wystarczającą liczbę zwierząt i potwierdzić przejście do `depleted`,
- wykonać `Zniszcz` mając 4 gałęzie,
- potwierdzić zużycie gałęzi i powstanie dużego ogniska,
- potwierdzić widoczny spalony teren,
- potwierdzić brak respawnu,
- przeskoczyć/odczekać okres regeneracji i sprawdzić warunek 2 osobników,
- potwierdzić ponowne aktywowanie spawn pointu bez błędów i bez nadmiernego namnażania.

Nie uznawać planu za zweryfikowany wyłącznie na podstawie testów TypeScript/build — wizualne spalenie i zachowanie spawn pointu wymagają browser/play check.

**Zrób git commit i push do main, rebase jeżeli trzeba**

## Implementation summary (2026-08-16)

Implemented as an extension of the existing `PreySpawner`/`createFauna`/`AnimalAgent`/interaction pipeline, per the review notes — no `SpawnPointManager`, no second death/config system.

- **`src/fauna/AnimalSpawner.ts`** — `PreySpawner` gains `id` (stable, `settlementId:type`), `state: SpawnPointState` (`active`/`depleted`/`disabled`/`recovering`), `deathsThisCycle`, `disabledAtDay`. `maxPreyCount` stays the single population reference (both the pre-existing live-nearby respawn cap and the new `>50%` depletion threshold) — no parallel `SPAWN_POINT_POPULATION_LIMITS` map was added, since `SPAWNER_SPECS` in `createFauna.ts` already is that one central per-species/per-type config, and the review notes explicitly warned against introducing a second one. New pure/exported helpers: `depletionThreshold(maxPreyCount)` (`floor(limit/2)+1`, unit-tested for 2/3/4/6), `shouldDeplete()`, `tickSpawnPointRecovery()` (day-gated, `RECOVERY_DAYS = 21`, `MIN_RECOVERY_POPULATION = 2`). `updateSpawners()` now skips any non-`active` spawner before touching its timer.
- **`src/fauna/AnimalAgent.ts`** — new optional `readonly spawnPointId?: string`, metadata only (last constructor param, so every existing call site stays source-compatible).
- **`src/fauna/createFauna.ts`** — new required `settlementId` param (from `Settlement.id`) seeds each managed spawner's `id`. `spawnAgent()` takes an optional trailing `spawnPointId`; when present it registers `animalId → spawnerId` in a local `animalToSpawner` map before constructing the `AnimalAgent`. Every animal this factory spawns now goes through one `handleAnimalDeath` wrapper (not the raw injected `onAnimalDeath`) that consumes the map entry once, increments the owning spawner's `deathsThisCycle` while `active`, and flips it to `depleted` past the threshold — then always forwards to `onAnimalDeath` so the plan-110 quest hook is untouched. Only the cave/thicket spawner-driven respawn path passes a `spawnPointId`; ring spawns, livestock and the one-time `wolfDen` pack deliberately don't, so herd/juvenile spawns never touch a managed spawn point's population accounting (criterion 11 — currently moot, since spawner-driven respawn stays solitary) and `wolfDen` structurally can never reach `depleted` (its wolves' deaths are never counted), preserving its one-time-pack quest semantics without a `type === 'wolfDen'` special case anywhere in the lifecycle logic. `update()` gained a `worldDays` param driving a recovery scan gated to at most once per in-game day (`Math.floor(worldDays)` change), scoped only to spawners currently `disabled`/`recovering`, counting same-kind live `agents` within `SPAWNER_RADIUS` — no per-frame or `O(spawners×animals)` cost. New `destroySpawner(spawnerId, nowDays)`: `depleted → disabled`, tints the spawner's own prop mesh dark (`tintPropMaterials`, the same technique `markDangerous()` already uses) and carves a small shallow scorch depression via the existing `terrainCarving.modifyTerrain()` seam (already threaded in for the cave's own depression, plan 083) — deliberately shallower/narrower than the cave-mouth carve so it doesn't read as a second cave. Returns `false` (no mutation) if the id is unknown or the spawner isn't currently `depleted`.
- **`src/app/worldBundle.ts`** — `buildFauna()` passes `settlement.id` through to `createFauna()`.
- **`src/app/interactables.ts`** — spawner prompt is now state-aware (`spawnerPromptLabel()`): `depleted` → `[E] Zniszcz: <label>`, `disabled`/`recovering` → an annotated inspect prompt, everything else unchanged.
- **`src/app/gameLoop.ts`** — new `spawner` branch in the `[E]` handler: non-`depleted` keeps the existing `resolveInteraction` + dialog flow untouched; `depleted` still resolves any bound `interact_spawner` quest objective (so a quest step can't become unreachable just because the habitat was exhausted first) but skips the dialog, then atomically consumes `SPAWNER_DESTROY_BRANCH_COST = 4` branches, calls `fauna.destroySpawner()`, and only on success places a `bundle.placedFires` `'pit'` fire at the spot (reusing the existing campfire/`VillageFire` pipeline — "duże ognisko" is the existing stone-ring pit, no new fire asset per the review notes). Branches are refunded if `destroySpawner()` unexpectedly fails (stale state), and never spent at all if the player doesn't have 4.
- **Tests** — `src/fauna/AnimalSpawner.test.ts` (new): `depletionThreshold`/`shouldDeplete` rounding, `updateSpawners`' state gating + live-cap behaviour, `tickSpawnPointRecovery`'s day-gate/population-gate/reset/no-op-for-active-or-depleted.

### Deliberate scope decision: no save persistence

The implementation notes flagged persistence as an open plan gap ("should be made explicit before implementation"). The plan's own acceptance criteria and browser/play checklist never exercise reload, so — to avoid expanding an already-L-effort plan's scope on an ambiguous point — spawn-point lifecycle state (`state`/`deathsThisCycle`/`disabledAtDay`) is **not** persisted in this pass; reloading regenerates every spawner as `active` from the seed, same as before this plan. Logged in `docs/plans/LOOSE-ENDS.md` rather than silently dropped, with the concrete follow-up (a compact `SaveData` collection keyed by `PreySpawner.id`) named there.

### Verification

- **Implemented** — all of the above.
- **Technically verified** — `npx tsc --noEmit` clean; `npm run test` 890/890 passing (9 new); `npm run build` clean (`vue-tsc` + `vite build`). `npm run lint` **not run**, per explicit instruction for this task.
- **Browser/manual verified** — **not done**, per explicit instruction for this task. Needs: observe cave/thicket spawn + respawn under the existing cap; kill deer/stag past the `>50%` threshold and confirm `depleted` (no further respawn, `[E]` prompt changes to "Zniszcz"); destroy with ≥4 branches and confirm branches are spent, a lit fire pit appears, the cave/thicket prop visibly darkens, and a small ground depression appears; confirm no branches are spent with <4; skip/advance time past `RECOVERY_DAYS` with <2 nearby same-kind animals (stays `disabled`) and then with ≥2 (returns `active`, respawn resumes, counters reset); confirm `wolfDen`'s pack/quest behaviour (`isWolfDenCleared`) is unaffected and it never offers "Zniszcz".
