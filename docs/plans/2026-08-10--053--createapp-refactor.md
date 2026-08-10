# Plan: Rozbicie `createApp.ts` (R5) + drobne porządki (R6–R9)

**Status:** `verification needed`
**Created:** 2026-08-10
**Priority:** średni — czysto techniczny dług, żadna zmiana zachowania; robić przed kolejnym dużym dopisaniem do `createApp.ts` (dziś 1240 linii), nie w trybie pilnym

## Wykonanie (2026-08-10)

Zrobione w kolejności z planu, każdy krok zweryfikowany (`tsc --noEmit`, `vue-tsc --noEmit`, `eslint`, `npm run build`, `npm run test`) przed przejściem dalej:

1. `src/app/worldBundle.ts` — `WorldBundle` (const-kontener, pola podmieniane przez `rebuildWorldBundle`), `createWorldBundle`/`rebuildWorldBundle`/`disposeWorldBundle`; `resourceEnv` (dla `resourceDeposits`) przestał być długożyjącą indirekcją — budowany od nowa przy każdym wywołaniu z lokalnego `chunkManager`, bo `resourceDeposits` i tak ma cykl życia 1:1 z `chunkManager` (oba disposowane/budowane razem w rebuildzie), więc indirekcja nie była tu potrzebna (inaczej niż `ambientSamplers`, który przeżywa wiele rebuildów).
2. `src/app/interactables.ts` — `buildInteractables`/`collectItem` + stałe `INTERACT_RANGE`/`INTERACT_MIN_DOT`/`GAZE_RANGE`/`TREE_BRANCH_CHANCE`/`KNIFE_BRANCH_BONUS` (używane też w `tick()`, nie tylko w tych dwóch funkcjach — eksportowane, nie tylko lokalne).
3. `src/app/modalState.ts` — `ActiveModal` union + `activeModal()`; `tick()` woła ją raz i robi `switch` z trzema realnymi gałęziami (`npcDialog`/`questLog`/`inventory` mają dodatkową logikę, reszta to no-op) zamiast ośmiokrotnie powtarzanej kaskady `keyboard.consume*()`.
4. `src/app/gameLoop.ts` — `createGameLoop(deps)` zwraca `{ tick, resyncDayNight, forgetHighlight }`; `createApp.ts` trzyma tylko cienki `requestAnimationFrame` wrapper (`frameId` do `cancelAnimationFrame` w cleanup). `lastAppliedTimeOfDay`/`highlightedTarget`/`setHighlight`/`applyDayNight`/`timeOfDayDelta` przeniesione do środka jako stan modułu gameLoop — `resyncDayNight()`/`forgetHighlight()` to nowe metody zastępujące bezpośrednie odwołania z `createApp.ts` (initial setup, `rebuildWorld`, `onDayNightChange` GUI callback).
5. R6: `chunkManager.ts::ensureLoaded` — `apronOriginWorld`/`sampleTileHeight` liczone raz przed trzema blokami; generyczny `buildPlacementGroup<T>(name, placements, makeProp)` (wewnątrz `createChunkManager`, zamyka się nad `scene`) zastępuje trzy bliźniacze bloki dla vegetation/items/environment. `makeProp` zwracające `null` pomija placement (np. już zebrany item) bez dziury w grupie.

`createApp.ts`: 1240 → 573 linii. Zero zmiany zachowania (czysty przenośnik + ekstrakcja duplikatów) — wymaga ręcznej weryfikacji w przeglądarce (zmiana seeda z GUI, New Game, Continue z zapisu, dzień/noc, modale) zgodnie z `CLAUDE.md`.

## Źródło

[reviews/2026-08-08--002--app-performance-and-code-health.md](../reviews/2026-08-08--002--app-performance-and-code-health.md), sekcje R5–R9 + tabela „Sugerowana kolejność" (pozycja 12: `refactor / duży`) + „Follow-up" (pozycje 11–12 „zasługują na własne plany").

Weryfikacja wobec aktualnego kodu (plik urósł 1018 → 1240 linii między review a dziś):

| # | Status w review #002 | Status dziś (2026-08-10) |
|---|---|---|
| R5 | otwarte | **nadal otwarte** — kaskada modali urosła z 6 do 8 gałęzi, `WorldBundle` urósł z 7 do 8 obiektów (doszedł `resourceDeposits`) |
| R6 | otwarte | **nadal otwarte** — trzy identyczne bloki w `chunkManager.ts::ensureLoaded` |
| R7 | otwarte | **już zrobione** — `memoTemplates()` (`chunkManager.ts:60-66`) zastąpił cztery bliźniacze fabryki |
| R8 | otwarte | **już zrobione** — `src/fauna/HealthState.ts` nie istnieje, zastąpiony przez `src/fauna/faunaCombat.ts` (re-eksportuje `shared/HealthState.ts` + tabele obrażeń) |
| R9 | otwarte | **już zrobione** — `NpcAgent.ts:152-161` używa `ReadonlySet<Phase>.has()`, nie `Array.includes()` |

Ten plan więc realnie obejmuje **R5 (główna robota) + R6 (mały dodatek)**. R7-R9 zostają jako pozycje „done" w tabeli wyżej, bez akcji.

## R5 — rozbicie `createApp.ts`

### Stan dziś

`createApp.ts` (1240 linii) miesza cztery odpowiedzialności w jednej funkcji `createApp()` + kilku module-level helperach:

1. **Bootstrap** (`:141-621`) — renderer/scene/kamera/UI/input/save-load wiring, jednorazowe.
2. **`WorldBundle`** — osiem obiektów tworzonych/dysponowanych/podmienianych zawsze razem:
   `chunkManager` (`:214`, rebuild `:343`), `ocean` (`:246`, `:347`), `settlementsManager` (`:247`, `:355`),
   `fauna` (`:248`, `:359`), `itemSpawners` (`:249`, `:360`), `resourceDeposits` (`:244`, `:361`),
   `droppedItems` (`:250`, `:362`), `placedFires` (`:251`, `:363`) — dispose w `rebuildWorld` na `:316-327`,
   dispose w cleanup na `:942-951`. Budowane przez osiem module-level helperów na końcu pliku
   (`buildChunkManager :1143`, `buildOcean :1170`, `buildSettlementsManager :1182`, `buildFauna :1208`,
   `buildItemSpawners :1225`; `createResourceDeposits`/`createDroppedItems`/`createPlacedFires` wołane inline).
3. **Kaskada stanu modali** (`:672-837`) — dziś **8** gałęzi (`menuPaused`, `vueUi.isNpcDialogueMenuOpen()`,
   `npcDialog.isOpen()`, `questLog.isOpen()`, `vueUi.isVillagersOpen()`, `inventoryScreen.isOpen()`,
   `quickActions.isOpen()`, `timeSkip.isActive()`), siedem z nich robi to samo („skonsumuj klawisze +
   wyczyść highlight"), różniąc się jednym-dwoma szczegółami. Urosła od review #002 (były 2 nowe modale:
   quick actions, npc dialogue menu).
4. **Pętla** `tick()` (`:650-914`) + jej pomocnicze funkcje na końcu pliku: `buildInteractables` (`:968-1079`),
   `collectItem` (`:1084-1098`), `applyDayNight`/`timeOfDayDelta`/`DAY_NIGHT_APPLY_THRESHOLD` (`:1100-1141`).

### Kluczowy problem do rozwiązania: świeżość stanu po `rebuildWorld()`

Dziś `chunkManager`, `ocean`, `settlementsManager`, `fauna`, `itemSpawners`, `droppedItems`, `placedFires`,
`resourceDeposits` to osiem **`let`-zmiennych w zasięgu `createApp()`**. `rebuildWorld()` (`:306-372`)
dysponuje starymi instancjami i **przypisuje na nowo do tych samych zmiennych** (`chunkManager =
buildChunkManager(...)`, itd.) — nie tworzy nowego scope'u. Każde domknięcie zdefiniowane w `createApp()`
(np. `tick()`, `ambientSamplers`, `resourceEnv`, `buildInteractables` wołanie w `tick()`) domyka się nad
**zmienną**, nie nad jej wartością w momencie utworzenia domknięcia — więc automatycznie widzi nową instancję
po reassignmencie. To działa dziś tylko dlatego, że wszystko żyje w jednym pliku/jednym zasięgu funkcji.
Kod już to explicite dokumentuje dla `ambientSamplers`/`resourceEnv` (`:218-219`, `:231-234`):

> „Indirection (not a direct destructure) so this keeps sampling whichever chunkManager/config.terrain are
> current across `rebuildWorld()` reassignments."

Rozbicie na moduły **rozrywa ten pojedynczy zasięg** — jeśli `worldBundle.ts` eksportowałby osiem osobnych
`let`, nic poza tym plikiem by ich nie widziało; gdyby `createGameLoop()` dostał osiem wartości jako
argumenty przy jednorazowym wywołaniu, zamroziłby stare referencje na zawsze (dokładnie błąd, przed którym
broni się dzisiejszy komentarz).

**Decyzja: `WorldBundle` to jeden mutowalny kontener (`const bundle`), którego *pola* rebuild podmienia —
nie zmienna `bundle` podmieniana na nowy obiekt.**

```ts
// src/app/worldBundle.ts
export type WorldBundle = {
  chunkManager: ChunkManager
  ocean: WorldOcean
  settlementsManager: SettlementsManager
  fauna: Fauna
  itemSpawners: ItemSpawners
  resourceDeposits: ResourceDeposits
  droppedItems: DroppedItems
  placedFires: PlacedFires
}

export function createWorldBundle(scene: Scene, config: WorldConfig, ...): Promise<WorldBundle> { ... }

/** Disposes every member's old instance and mutates `bundle`'s fields in place
 *  with fresh ones — callers holding `bundle` (not a destructured field) see
 *  the new world on their next read, no different from today's `let chunkManager`
 *  reassignment. Never replace `bundle` itself with a new object — every closure
 *  created before a rebuild (ambientSamplers, resourceEnv, the game loop) holds
 *  the original object reference. */
export async function rebuildWorldBundle(
  bundle: WorldBundle,
  scene: Scene,
  config: WorldConfig,
  resetCollectedItems: boolean,
  ...
): Promise<{ carriedDrops: DroppedItemRecord[], carriedFires: PlacedFireRecord[] }> {
  bundle.fauna.dispose()
  bundle.itemSpawners.dispose()
  const carriedDrops = resetCollectedItems ? [] : [...bundle.droppedItems.nodes()]
  bundle.droppedItems.dispose()
  // ...
  bundle.chunkManager = buildChunkManager(scene, config, collectedItemIds)
  await bundle.chunkManager.waitForChunks(homeChunks())
  bundle.ocean = buildOcean(scene, config)
  // ...
  return { carriedDrops, carriedFires }
}

export function disposeWorldBundle(bundle: WorldBundle): void {
  bundle.fauna.dispose()
  bundle.itemSpawners.dispose()
  bundle.droppedItems.dispose()
  bundle.placedFires.dispose()
  bundle.resourceDeposits.dispose()
  bundle.settlementsManager.dispose()
  bundle.ocean.dispose()
  bundle.chunkManager.dispose()
}
```

`createApp()` then does `const bundle = await createWorldBundle(...)` (once, `const`) and every later
consumer — `ambientSamplers`, `resourceEnv`, `createGameLoop(bundle, ...)`, `buildSaveData()` — reads
`bundle.chunkManager` / `bundle.fauna` etc. **at call time**, not via a field captured up front. The `const`
on `bundle` is deliberate: it makes "only `rebuildWorldBundle` reassigns fields" grep-able and rules out the
failure mode of some other code accidentally doing `bundle = ...` and silently detaching every earlier
closure from the live world. `rebuildWorld()` in `createApp.ts` shrinks to: call `rebuildWorldBundle(bundle,
...)`, then the collected-items-reset / save-data / HUD-resync side effects that aren't part of the bundle
itself (`inventory.clear()`, `questManager.reset()`, `hud.setSeed()`, `pauseMenu.setSeed()` — these stay in
`createApp.ts`, they're not world-bundle state).

Same reasoning applies to `collectedItemIds` (`let` today, `:213`, mutated via `.add()` in
`chunkManager.collectItem` and reassigned wholesale on reset `:329`) — keep it as a field the bundle's
`chunkManager` closes over via the same `ChunkManagerConfig.collectedItemIds` passed at construction (already
how it works today, no change needed there, just noting it's part of what `buildChunkManager` needs each
rebuild).

### Cel: nowe pliki pod `src/app/`

| Plik | Zawartość | Źródło (linie dziś) |
|---|---|---|
| `src/app/worldBundle.ts` | `WorldBundle` type, `createWorldBundle`, `rebuildWorldBundle`, `disposeWorldBundle`; przenosi `buildChunkManager`/`buildOcean`/`buildSettlementsManager`/`buildFauna`/`buildItemSpawners` + inline `createResourceDeposits`/`createDroppedItems`/`createPlacedFires` calls; przenosi `HOME_RADIUS`/`SETTLEMENT_LOAD_RADIUS`/`SETTLEMENT_UNLOAD_RADIUS`/`homeChunks()` (jedyni konsumenci) | `:74-130` (stałe+`homeChunks`), `:1143-1240` (helpery), `:214-251`/`:306-372` (tworzenie/rebuild) |
| `src/app/modalState.ts` | `type ActiveModal = 'menu' \| 'npcDialogueMenu' \| 'npcDialog' \| 'questLog' \| 'villagers' \| 'inventory' \| 'quickActions' \| 'timeSkip' \| null` + `activeModal(pauseMenu, npcDialog, questLog, vueUi, inventoryScreen, quickActions, timeSkip): ActiveModal` — jedna funkcja zwracająca union zamiast 8-gałęziowej kaskady `if`; `tick()` robi `switch` na wyniku zamiast powtarzać `keyboard.consume*()` w każdej gałęzi (wspólna ścieżka „modal otwarty" wyodrębniona, per-modal różnice — czy `setPrompt(null)`, czy obsłużyć `consumeInteract()` — zostają jako mały `switch`) | `:672-837` |
| `src/app/gameLoop.ts` | `createGameLoop(bundle, ui-handles, player, camera, ...)` zwracające `{ tick: () => void }`; przenosi ciało `tick()` (`:650-914`) + `applyDayNight`/`timeOfDayDelta`/`DAY_NIGHT_APPLY_THRESHOLD` (te trzy zostają obok pętli, która jest ich jedynym callerem poza `rebuildWorld`, więc `rebuildWorld`/`worldBundle.ts` importuje `applyDayNight` stąd) | `:650-914`, `:1100-1141` |
| `src/app/interactables.ts` | `buildInteractables`, `collectItem` — czysta budowa danych, osobna odpowiedzialność od samej pętli; przenosi `INTERACT_RANGE`/`INTERACT_MIN_DOT`/`GAZE_RANGE`/`TREE_BRANCH_CHANCE`/`KNIFE_BRANCH_BONUS` (jedyni konsumenci) | `:87-101` (stałe), `:963-1098` |
| `src/app/createApp.ts` (zostaje) | Bootstrap: renderer/scene/kamera/input/UI-screen wiring, `rebuildWorld()` jako cienki wrapper nad `rebuildWorldBundle` + reset-collected-items/save/HUD side effects, `buildSaveData`, event listenery (resize/visibility/autosave), `dispose()` na powrocie | reszta |

`Highlightable`, `STARTING_LOADOUT`, `grantStartingLoadout`, `REST_IN_TOWN_RADIUS` zostają w `createApp.ts`
— używane tylko przy bootstrapie/inventory, nie należą do żadnego z powyższych.

### Kolejność wdrożenia (żeby nie robić tego w jednym wielkim diffie)

1. `worldBundle.ts` — najwyższe ryzyko regresji (dispose/rebuild kolejność ma znaczenie, patrz komentarze
   przy `resourceDeposits`/`droppedItems`/`placedFires` w dzisiejszym `rebuildWorld`), zrobić i zweryfikować
   osobno (`npx tsc --noEmit`, ręczny smoke test: zmiana seeda z GUI + New Game + Continue z zapisu).
2. `interactables.ts` — czyste przeniesienie, zero zmiany logiki.
3. `modalState.ts` + refaktor kaskady w `tick()` — zmiana zachowania zerowa, ale dotyka najbardziej
   rozgałęzionego kodu w pliku; zrobić z uwagą na to, że siódma gałąź (`else`) to *jedyna*, w której coś
   realnie się dzieje (cała reszta pętli).
4. `gameLoop.ts` — po 2-3, żeby `tick()` już był mniejszy i czystszy do przeniesienia.

## R6 — `chunkManager.ensureLoaded`: trzykrotnie ten sam blok

`src/terrain/chunkManager.ts:362-430` — trzy niemal identyczne bloki dla `vegetation`
(`:362-394`), `items` (`:396-413`), `environment` (`:415-430`), każdy zaczyna się od tego samego
`apronOriginWorld(...)` + definicji `sampleTileHeight` (`:363-364`, `:397-399`, `:416-418`), różniąc się
tylko treścią pętli budującej propsy.

Fix: policzyć `apronOriginWorld`/`sampleTileHeight` **raz** przed trzema blokami (identyczne dla wszystkich
trzech — apron/origin nie zależy od tego co się na nim stawia), potem jedna funkcja
`buildPlacementGroup<T>(name: string, placements: T[], makeProp: (p: T) => THREE.Object3D | null): THREE.Group | undefined`
wołana trzy razy z różnym `makeProp`:

```ts
const group = buildPlacementGroup('chunk-vegetation', tile.vegetation, (p) => {
  const templates = templatesByKind[p.kind]
  const prop = cloneProp(templates, p.speciesIndex, p.scale)
  prop.rotation.y = p.rotationY
  placeOnGround(prop, p.x, p.z, sampleTileHeight)
  return prop
})
if (group) { scene.add(group); rec.vegetation = group }
```

Uwaga: `vegetation`'s callback jest `async` dziś (czeka na `Promise.all` template loadów) zanim pętla się
zaczyna — `items`/`environment` nie czekają na nic. `buildPlacementGroup` sam w sobie zostaje synchroniczny;
`await Promise.all([...])` dla template'ów zostaje przed jego wywołaniem, tak jak dziś.

## Świadomie poza zakresem

- Żadna zmiana zachowania — to czysty przenośnik kodu + ekstrakcja duplikatów, weryfikowalne przez
  `tsc --noEmit` + `lint` + `build` (patrz `CLAUDE.md` „Testowanie zmian") i ręczny smoke test w przeglądarce
  (nie automatyczny — user testuje).
- Bug #6 z review #002 („`tick()` nie jest wstrzymywany na czas `rebuildWorld()`") — `WorldBundle` z jednym
  mutowalnym kontenerem ułatwia dodanie tam bramki (`bundle.rebuilding`), ale to osobna zmiana zachowania,
  nie ten plan.
- P4 (`buildInteractables` cache'owanie) — wymieniona w tej samej sekcji review co R5, ale to zmiana
  wydajnościowa, nie strukturalna; osobny plan/issue jeśli profiler to potwierdzi wąskim gardłem.

## Powiązane

- [reviews/2026-08-08--002--app-performance-and-code-health.md](../reviews/2026-08-08--002--app-performance-and-code-health.md) — źródło R5-R9
- [reviews/2026-08-10--004--to-do--dedicated-union-types.md](../reviews/2026-08-10--004--to-do--dedicated-union-types.md) — audyt równoległy (inline union types), niezależny od tego planu, może się zazębiać przy dotykaniu tych samych plików (`Interactable`, `chunkVegetation.ts`)
