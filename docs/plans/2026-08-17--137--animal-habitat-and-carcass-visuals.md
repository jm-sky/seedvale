---
domain: fauna
tags: [items-player, world-terrain]
---

# Plan: Fauna — wizualny feedback zniszczenia siedliska i oprawionych zwłok

**Created:** 2026-08-17  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~125~~

## Cel

Dopracować istniejący feedback po `[E] Zniszcz` na wyczerpanym spawn poincie oraz po nożowym oprawieniu zwłok. Cave/thicket ma zostać w świecie jako wypalone siedlisko (kanał z progress barem, palący się ogień, czytelna czarna ziemia). Po harvestzie ciało nie ma dalej wyglądać jak nietknięta padlina — zamienia się w pozostałości z własnym TTL.

Rozszerza plan 125 (`PreySpawner` lifecycle) i plan 106 (`meatHarvested` / `harvestMeat()`). Bez nowego menedżera, bez osobnego systemu dekoracji, bez nowych GLB (nie ma ich w repo).

### Efekt gameplay

- zniszczenie siedliska trwa kilka sekund i pokazuje progress bar,
- po zakończeniu jaskinia/zagajnik zostaje, wygląda na spalony, ziemia wokół jest czarna, ogień pali się kilka minut,
- po wycięciu mięsa na ziemi zostają kości / skrawki / skóra, które znikają po własnym czasie życia.

---

## 1. Stan obecny

### Siedlisko (plan 125)

`[E]` w `gameLoop.ts` jest natychmiastowe: 4 gałęzie, `fauna.destroySpawner()`, `placedFires.place(..., 'pit')`. Prop zostaje i dostaje tint `0x241d17`. Ogień startuje zimny (`'pit'` nie woła `light()` — tylko `'simple'`). Spalenizna to `modifyTerrain` r=2.5 / d=0.35, wyłącznie wysokość; vertex colors wracają z biomu, trawa nie jest przebudowywana.

### Zwłoki (plan 106 / 134)

`collapse()` kładzie ten sam mesh na bok + blood splat. `harvestMeat()` ustawia tylko `meatHarvested`. Po oprawieniu ciało wygląda identycznie aż do `CORPSE_LINGER_SECONDS = 60` albo zakopania.

Busy overlay już istnieje (`busyAction.ts` + `BusyOverlay.vue`). Wzorzec: `startHarvestMeat` / `startIgniteFire` w `createApp.ts`.

---

## 2. Zniszczenie siedliska — kanał

Przenieść niszczenie z inline `[E]` do `startDestroySpawner(spawner)` w `createApp.ts`:

- warunki startu: `depleted`, nie busy/timeSkip/rest, `inventory.has('branch', 4)`,
- `DESTROY_SPAWNER_DURATION_SEC = 5`, label `Podpalanie siedliska…`, `{ blurred: true }`,
- gałęzie zdejmować dopiero na complete (Esc = zero kosztu),
- na complete: `remove(4)` → `destroySpawner` → zapalić ognisko; przy nieudanym destroy refund,
- `gameLoop.ts` tylko woła starter; `resolveInteraction` zostaje (quest `interact_spawner` nie ginie).

---

## 3. Płomienie na kilka minut

Rozszerzyć `PlacedFires.place()` tak, by zwracał `PlacedFireEntry` (albo dodać `placeLit`).

Po destroy: `place(x, z, 'pit')` + `light('player')` + `addFuel()` ×3. Cztery zużyte gałęzie = paliwo paleniska (`FUEL_PER_BRANCH = 75` → ~300 s). Istniejące `CampfireFlame` / `fx/fire.glb` / loop ognia działają same. Po wypaleniu pierścień zostaje (`PIT_FIRE_DESPAWN_DELAY`).

---

## 4. Większa czarna ziemia

Dodać `mode: 'scorch'` w `TerrainModification`:

- promień ~7, płytki dip (~0.15) — nie druga jaskinia,
- w `applyModificationToTile`: podbić `tile.roadTint` w plamie (istniejący fade trawy),
- w `buildChunkGeometry.ts`: po `colorForTerrain` lerp vertex color → węgiel (`~0x1a1410`) wg falloffu scorcha; `aBareGround` w górę,
- po scorch: `removeGrass` + `ensureGrass` na ruszonych chunkach.

Bez per-frame burn uniforms.

---

## 5. Prop destroyed/burned

`destroySpawner` nadal nie usuwa meshu. Wzmocnić `BURNED_SPAWNER_TINT_HEX` (bliżej czerni). Tint zostaje jedynym stanem wizualnym propa (brak burned GLB). Prompt `Zbadaj: … (wypalone)` bez zmian. `wolfDen` poza zakresem.

---

## 6. Pozostałości po oprawieniu

Źródło prawdy: istniejące `meatHarvested` / `harvestMeat()` / `canHarvestMeat()` / `holdCorpse`. Żadnego `CarcassDecorationManager`.

W `harvestMeat()`:

1. ukryć żywy mesh,
2. wyzerować `mesh.rotation.z` (ciało jest przewrócone o 90°),
3. dodać proceduralną grupę `createHarvestedRemains(kind, modelHeight)`: kości, 1–2 skrawki mięsa, opcjonalnie skóra — nie pickup,
4. zresetować `timeSinceDeath = 0`; `readyToRemove()` przy `meatHarvested` używa `HARVESTED_REMAINS_LINGER_SECONDS = 90`,
5. scavenger: `meatHarvested` ⇒ nieżywność,
6. blood splat i `bury()` bez zmian; `dispose()` sprząta remains.

Kanał harvestu 4 s zostaje. Brak kości/tuszy GLB: v1 proceduralnie; wiersz `needed` w `docs/assets/MODELS.md`.

---

## 7. Poza zakresem

- persystencja stanu spawn pointu (już w `docs/plans/LOOSE-ENDS.md`) i zwłok,
- nowe GLB jaskini/kości, smoke GPU, osobny system pożaru,
- `wolfDen`, zmiana limitu populacji / recovery 21 dni,
- drop mięsa/skóry na ziemię jako zbieralne itemy.

---

## Kryteria akceptacji

1. `[E] Zniszcz` na `depleted` spawn poincie uruchamia kanał ~5 s z progress barem; Esc nic nie zużywa i nic nie mutuje.
2. Po complete zużyte są 4 gałęzie, stan przechodzi w `disabled`, prop zostaje i wygląda na spalony.
3. W miejscu pojawia się zapalone palenisko palące się ~5 minut.
4. Wokół siedliska jest większy, czarny obszar zwęglonej ziemi; trawa w plamie zanika.
5. Po nożowym harvestcie ciało nie wygląda jak nietknięta padlina — widać kości / skrawki / skórę.
6. Pozostałości mają własny TTL (~90 s) i znikają; zakopanie nadal działa; predator nie je oprawionych zwłok.
7. `tsc`, lint, testy i build przechodzą.
8. Wymagana weryfikacja w przeglądarce (wizualia).

---

## Weryfikacja

Techniczna:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Browser/play:

- wyczerpać cave/thicket, `[E] Zniszcz`, potwierdzić bar, Esc-cancel, complete,
- jaskinia zostaje spalona, czarna ziemia, ogień ~5 min,
- zabić zwierzę, wyciąć mięso, potwierdzić pozostałości i zniknięcie po ~90 s / zakopanie.

## Implementation summary (2026-08-17)

Implemented as an extension of plan 125 spawn-point destroy and plan 106 `meatHarvested`, no new managers.

- **Destroy channel** — `[E] Zniszcz` in `gameLoop.ts` calls `startDestroySpawner` in `createApp.ts` (`DESTROY_SPAWNER_DURATION_SEC = 5`, label `Podpalanie siedliska…`, blurred progress bar). Branches (`SPAWNER_DESTROY_BRANCH_COST = 4`) are spent only on complete; Esc is a no-op. `resolveInteraction` still runs so `interact_spawner` quests stay reachable.
- **Lit fire** — `PlacedFires.place()` returns the entry. On complete: `place(..., 'pit')` + `light('player')` + `addFuel()` ×3 → ~300 s burn from the 4 consumed branches.
- **Scorch** — `TerrainModification` `mode: 'scorch'`; `ChunkManager.scorchTerrain()` (r=7, d=0.15) dips height/`floorHeights`, bumps `roadTint` (grass fade), rebuilds grass on touched chunks. `buildChunkGeometry` lerps vertex color toward `SCORCH_CHARCOAL` (`0x1a1410`) and raises `aBareGround`.
- **Burned prop** — mesh stays; `BURNED_SPAWNER_TINT_HEX = 0x0a0806`.
- **Harvested remains** — `harvestMeat()` hides the living visual, resets tip rotation, parents `createHarvestedRemains()` (procedural bones + meat/hide scraps). Linger `HARVESTED_REMAINS_LINGER_SECONDS = 90`. `isCarcassEdible` rejects `harvested`. `bury()` still disposes immediately.

### Verification

- **Implemented** — all of the above.
- **Technically verified** — `npx tsc --noEmit` clean; `npm run test` 901/901; `npm run build` clean. `npm run lint` — 1 pre-existing `prefer-const` in `settlement/props.ts`, unrelated.
- **Browser/manual verified** — **not done**. Needs: deplete cave/thicket, `[E] Zniszcz` bar + Esc-cancel + complete; burned cave stays, black ground, fire ~5 min; harvest meat → bones/scraps, gone after ~90 s or bury.

