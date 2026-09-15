# Seedvale — Loose Ends

Krótkie notatki o pobocznych blokadach, konkretnych bugach i brakujących mechanizmach odkrytych podczas implementacji planów, ale poza ich zakresem.

To nie jest issue tracker ani historia zmian. Gdy wpis zostanie naprawiony, pokryty planem albo stanie się nieaktualny — usuń go. Gdy dojrzeje do osobnej pracy — przenieś go do planu / issue zamiast rozbudowywać tutaj.

Format: `- [ ] YYYY-MM-DD — opis (plan/plik, jeśli istotne)`

## Caves / terrain

- [ ] 2026-08-24 — `Przygotuj teren` na skalistym/górskim gruncie wymaga narzędzi, ale nie ma kary za trudność terenu; jeśli mechanika ma rozróżniać soil/sand/rock także dla większych prac, rozszerzyć istniejący `requiredWork` zamiast dodawać osobny system (world-terrain-002).

## Quest-enabling world mechanics

- [ ] 2026-09-12 — settlements-007 wystawia read-only `SettlementsManager.getStructureSnapshot`/`listRepairProblems`, ale żaden quest jeszcze tego nie konsumuje. Po `quests-progression-030`/`031` dodać `structure:<structureId>:repair` opportunity tym samym mechanizmem co wolf-den pressure (016) — nie kopiować repair state do quest layer. Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md`.
- [ ] 2026-09-13 — Authored `wilki-pod-osada` i generated `world:wolf-den-pressure:*` opowiadają tę samą historię destroy-den; authored `zagubiona-owca` (`find_animal`) nakłada się na `world:lost-livestock:*`. Nie scalać w infrastrukturze — osobny content cleanup po 030/031.

## Quest system architecture

- [ ] 2026-09-14 — Quest giver / target lifecycle: brak spójnej polityki dla śmierci, zniknięcia albo zmiany roli NPC będącego giverem, beneficiary lub wymaganym targetem aktywnego questa. Do ustalenia: invalidation, przejęcie przez innego NPC, alternatywne hand-in i konsekwencje dla outcome. Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md`.
- [ ] 2026-09-14 — Deadlines / time pressure: brak ogólnego mechanizmu typu „do jutra”, „przed zmrokiem”, „zanim ktoś umrze”. Powinien opierać się na authoritative world time i lifecycle questa, bez quest-local zegara równoległego do symulacji. Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md`.
- [ ] 2026-09-14 — Truly dynamic runtime opportunities: `quests-progression-031` rozwiązuje live gating dla stabilnych source identities znanych przy boot/rebuild, ale nie dla nowych source identities powstających całkowicie w runtime. Potrzebny osobny mechanizm dopiero przy konkretnym consumerze, bez ogólnego `QuestFactory` na zapas. Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md`.
- [ ] 2026-09-14 — NPC jako resolver / współuczestnik: quest runtime słabo modeluje sytuację, gdy NPC sam rozwiązuje problem albo wykonuje część tego samego zadania razem z graczem. Docelowo reuse world facts / source state i quest outcomes zamiast player-only duplikacji akcji. Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md`.

## Fauna

- [ ] 2026-09-14 — `settlements-013` świadomie używa nowego paddock haystack jako **nieskończonego** źródła pożywienia dla vendor horses. Docelowo zastąpić to finite authoritative hay stock + realnym consumption/replenishment, bez łączenia z istniejącym sleep haystack i bez tworzenia osobnej horse-food economy. Paddock haystack ma pozostać food-only, bez capability noclegu.
- [ ] 2026-09-12 — `wolfDen` pressure activation (`shouldActivateWolfDenProblem`) może dospawnować wilki poza initial fill; te osobniki są `normal`, nawet gdy oryginalna alfa zginęła. fauna-022 przypisuje alfę tylko do slotu 0 zwykłego initial fill (den ma `respawnIntervalDays: Infinity`). Jeśli odtworzony pack ma znowu mieć alfę, rozszerzyć ten sam slot/identity mechanizm, nie dodawać RNG ani osobnego alpha spawnera.
- [ ] 2026-09-02 — frenzy branches (`npc-attack-frenzied` / `frenzy-beeline`) nie wywołują `cancelSourceTarget()`, więc wilk może zachować `foodClaimedBy` na padlinie podczas szarży na osadę. Ujednolicić bookkeeping branchy, jeśli claim nie ma celowo przetrwać frenzy.
- [ ] 2026-09-08 — initial livestock `productionReadyAtDays` jest seedowane runtime RNG, a potem persystowane. Pierwsze utworzenie tej samej deterministycznej sztuki może więc dać różny stagger; użyć stabilnego rolla z identity/seed.

## Settlement / world correctness

- [ ] 2026-09-15 — Village one-time spawners (`shovel`/`axe`/`pitchfork`/`sickle` in `createItemSpawners.ts`) use `respawnTime = Infinity` with generated `spawner:${index}` ids, so a `WorldBundle` rebuild rematerializes them the same way the authored treasure map used to. `consumedWorldPickupIds` (quests-progression-036) only gates `extraOneTimePickups` with stable authored ids; village tools need their own stable ids before they can reuse that set.
- [ ] 2026-08-25 — `buildHouseWallCollidersLocal()` nadal iteruje tylko `def.walls`; `def.corners` nie mają własnego collidera. Zwykle maskują to sąsiednie ściany, ale corner przy otworze/door module nie ma takiego invariant — przy najbliższym dotykaniu house collision dodać jawne pokrycie/test.
- [ ] 2026-09-15 — `world/containerProp.ts`'s `createPlacedContainerProp()` renderuje identycznym proceduralnym box+lid meshem magazyn gracza, meble domu **i** wszystkie skrzynie-skarby w świecie (dark forest, systemic treasure sites, dungeon/cave loot) — bez rozróżnienia stanu zamknięta/otwarta/złupiona. `public/models/items/chest_prop_closed.glb` / `chest_prop_open.glb` / `chest_prop_ingots.glb` (Quaternius Ultimate RPG Pack, `docs/assets/MODELS.md` M91, catalog task 2026-09-15) są gotowe jako realny zamiennik z prawdziwym przełączaniem stanu (np. wg `isWorldContainerLooted`/emptiness). Dotyka `containerProp.ts`, `worldGeneratedContainers.ts`, `createPlacedContainers.ts`, `settlement/props.ts` — osobny plan, świadomie nie zrobiony przy okazji dodawania assetów do katalogu.

## Characters / presentation

- [ ] 2026-09-15 — UBC player (`items-player-033` / `034`) jest tylko męski Peasant/Ranger. Żeńskie outfity (`Female_Peasant` / `Female_Ranger`) i fryzury są w `_temp/` na tym samym rigu — nie robić osobnego pipeline, reuse `compose_ubc_player.py`.
- [ ] 2026-09-15 — Runtime outfit jest całym Peasant vs Ranger od slotu `body`, nie modularnymi Arms/Body/Legs. Osobny mesh kolczugi / gambesonu i sloty head/arms/legs czekają na konkretne assety.
- [ ] 2026-09-15 — `?playerTint=brown` nie jest persystowany; character appearance (wybór koloru bez query) to osobna praca.
- [ ] 2026-09-15 — UAL2 (combat/work: `TreeChopping_Loop`, `Walk_Carry_Loop`, `Farm_*`) jest na tym samym UBC rigu co UAL1; dodać subset analogicznie do `ual1_player.glb`, bez retargetu. Jump/crouch/swim clipy z UAL1 czekają aż `PlayerController` zacznie je napędzać.
- [ ] 2026-09-15 — NPC nadal na Ultimate Modular Men/Women (inny szkielet). Retarget UAL→Modular albo migracja NPC na UBC to osobna praca; nie mieszać clipów między rygami.
- [ ] 2026-09-15 — `HELD_ATTACH` jest strojone pod Adventurer `WristR` (+Y ≈ palce). UBC `hand_r` może trzymać narzędzie krzywo; korekta dopiero po weryfikacji w przeglądarce, bez drugiego zestawu offsetów „na zapas”.

## Off-screen simulation

- [ ] 2026-09-11 — off-screen `TransportOrder.execution` nie przesuwa potrzeb/vigoru/injury carrier NPC w czasie podróży. To ten sam brak co dla innych unloaded NPC, ale staje się istotny dla generic long-distance travel (`settlements-npcs-028` / `npc-029`). Naturalny seam: stanowy survival catch-up obok `resolveOffscreenTransportArrivals`, reuse istniejących `tickNeeds` / `tickVigorForSimulatedStep` / injury recovery helpers.
- [ ] 2026-09-12 — npc-029 accompany NPCs still unload with their home settlement (same detailed XOR off-screen rule as transport carriers). Visual follow therefore stops when the village streams out; long-distance live-agent travel with the player belongs with `settlements-npcs-028` / paid escort, not a companion-specific streaming owner.
