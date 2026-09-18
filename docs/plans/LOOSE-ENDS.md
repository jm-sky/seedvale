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
- [ ] 2026-09-18 — `fauna-039` zaimplementował real `AnimalDef.pack`/`PackConfig`, equipped `AnimalPackState` i death-handoff ground `saddlebags` container jako authority dla przyszłego pack-transportu (plan §30). `settlements-npcs-047-merchant-transport-capacity-infrastructure.md` i `settlements-npcs-048-merchant-pack-animal-assignment-and-journey-continuity.md` (oba wciąż `planned`, nietknięte przez ten plan) powinny przy implementacji zintegrować się z tym systemem zamiast definiować własny `PackConfig`/syntetyczny saddlebags visual — zweryfikować ich treść wobec aktualnego `fauna/animalPack.ts` i `items/container.ts` (`pickupPolicy`) dopiero przy ich własnej implementacji.

## Settlement / world correctness

- [ ] 2026-09-15 — Village one-time spawners (`shovel`/`axe`/`pitchfork`/`sickle` in `createItemSpawners.ts`) use `respawnTime = Infinity` with generated `spawner:${index}` ids, so a `WorldBundle` rebuild rematerializes them the same way the authored treasure map used to. `consumedWorldPickupIds` (quests-progression-036) only gates `extraOneTimePickups` with stable authored ids; village tools need their own stable ids before they can reuse that set.
- [ ] 2026-08-25 — `buildHouseWallCollidersLocal()` nadal iteruje tylko `def.walls`; `def.corners` nie mają własnego collidera. Zwykle maskują to sąsiednie ściany, ale corner przy otworze/door module nie ma takiego invariant — przy najbliższym dotykaniu house collision dodać jawne pokrycie/test.
- [ ] 2026-09-15 — `world/containerProp.ts`'s `createPlacedContainerProp()` renderuje identycznym proceduralnym box+lid meshem magazyn gracza, meble domu **i** wszystkie skrzynie-skarby w świecie (dark forest, systemic treasure sites, dungeon/cave loot) — bez rozróżnienia stanu zamknięta/otwarta/złupiona. `public/models/items/chest_prop_closed.glb` / `chest_prop_open.glb` / `chest_prop_ingots.glb` (Quaternius Ultimate RPG Pack, `docs/assets/MODELS.md` M91, catalog task 2026-09-15) są gotowe jako realny zamiennik z prawdziwym przełączaniem stanu (np. wg `isWorldContainerLooted`/emptiness). Dotyka `containerProp.ts`, `worldGeneratedContainers.ts`, `createPlacedContainers.ts`, `settlement/props.ts` — osobny plan, świadomie nie zrobiony przy okazji dodawania assetów do katalogu.

## Items / assets

- [ ] 2026-09-15 — `wooden_bucket` / `copper_bucket` GLBs (Fantasy Props MegaKit) were converted from FBX **without albedo textures**, so the mesh reads gold/metallic. First-pass tint in `items/items.ts`'s `tintBucketGlb` (`ITEM_DEFS` brown / copper) — applied by `createItemMesh` and the asset browser (`item:wooden_bucket` / `item:copper_bucket`). Verify visually, then either keep the tint or reconvert with MegaKit glTF textures (the pack glTF shares a huge bin — isolate materials, don't copy the whole kit). Pocket `whetstone` is unrelated: MegaKit `Whetstone` is a workshop grindstone and must not be wired to the item.

## Characters / presentation

- [ ] 2026-09-17 — Blender exports for custom UBC `male_blacksmith_outfit` and `male_{leather,steel}_bracers` are currently **invalid for skinned runtime use**: `gltf-transform inspect` shows no `JOINTS_0` / `WEIGHTS_0` and therefore no usable skin binding, despite source Blender objects having Armature modifiers. `bindAccessoryToPlayerSkeleton` will skip such assets. The rejected source GLBs were also huge (~63 MB blacksmith, ~28 MB leather bracers, ~60 MB steel bracers) because Blender embedded 4K PNG atlases; mesh data itself was small. Do not restore/commit these GLBs until export preserves UBC joint weights/skin and the existing asset pipeline downsizes/converts textures. Detailed note: `docs/blender/TROUBLESHOOTING.md`; forearm work: `items-player-044`.
- [ ] 2026-09-15 — UBC player (`items-player-033` / `034` / `036`) jest tylko męski. Żeńskie outfity (`Female_Peasant` / `Female_Ranger` / Knight / Noble / Wizard) i fryzury są w `_temp/` na tym samym rigu — nie robić osobnego pipeline, reuse `compose_ubc_player.py`.
- [ ] 2026-09-15 — Runtime outfit jest całym meshem od slotu `body` (Peasant / Ranger / Knight), nie modularnymi Arms/Body/Legs. Wizard / Noble czekają na wearable (szata / strój); `Knight_Cloth` zostaje `?player=` debug. Sloty head/arms/legs nadal bez własnych meshy. Draft per-slot: `items-player-037-ubc-runtime-per-slot-outfits.md`.

- [ ] 2026-09-15 — `?playerTint=brown` nie jest persystowany; character appearance (wybór koloru bez query) to osobna praca.
- [ ] 2026-09-15 — UAL2 (combat/work: `TreeChopping_Loop`, `Consume`, `Walk_Carry_Loop`, `Farm_*`, `LayToIdle`) is on the same UBC rig as UAL1; extract a second subset after `items-player-035` locomotion/combat clips. No retarget.
- [ ] 2026-09-15 — Remaining NPC roles (blacksmith, …) and children still use Ultimate Modular Men/Women (different skeleton from UBC). Adult farmer/woodcutter/trader/hunter are UBC + UAL1 with seeded hair/beard/clothing-hue variants (`npc-039` / `npc-040`). Adult male `guard` is a single unhelmeted Knight GLB (`male_knight_unhelmeted.glb` + `T_Knight_3`), not an npc-040 matrix; female guards stay Modular. Do not mix UAL clips onto Modular rigs. Female traders always use `Hair_Long` (`Female_Wizard` has no hat). Male Wizard-hat vs Long/Buns and Ranger-hood vs Long/Buns clipping is a browser check, not a resolver filter.

- [ ] 2026-09-18 — UAL paid/Source animation enrichment after `npc-055`: investigate exact clips only from a legitimately obtained archive and only where they map to real Seedvale actions. Highest-value gaps: fishing/casting+reeling, mining/pickaxe, blacksmith hammering/forging/sharpening, sheep shearing, textile weaving/spinning/sewing, herbal ground forage/gather, proper drinking, ground pickup, digging/burying/corpse work, and—if later useful—container/chest interaction variants. Mechanically inventory exact clip names before planning; never infer names from trailers/viewer/marketing. Standard fallbacks from `npc-055` remain valid until then.

- [ ] 2026-09-18 — Campfire social seating: add a bench / explicit seat anchors near settlement campfires so existing NPC seated presentation can use `Sitting_Idle_Loop` / `Sitting_Talking_Loop` without inventing fake sitting positions. Reuse settlement place/social state rather than adding an animation-only seating system; discovered while scoping `npc-055`.

## Off-screen simulation

- [ ] 2026-09-11 — off-screen `TransportOrder.execution` nie przesuwa potrzeb/vigoru/injury carrier NPC w czasie podróży. To ten sam brak co dla innych unloaded NPC, ale staje się istotny dla generic long-distance travel (`settlements-npcs-028` / `npc-029`). Naturalny seam: stanowy survival catch-up obok `resolveOffscreenTransportArrivals`, reuse istniejących `tickNeeds` / `tickVigorForSimulatedStep` / injury recovery helpers.
- [ ] 2026-09-12 — npc-029 accompany NPCs still unload with their home settlement (same detailed XOR off-screen rule as transport carriers). Visual follow therefore stops when the village streams out; long-distance live-agent travel with the player belongs with `settlements-npcs-028` / paid escort, not a companion-specific streaming owner.

## Performance / rendering

- [ ] 2026-09-18 — Po zamknięciu `world-terrain-038`: w `settlement-heavy` 027 settlement shadow nadal ciąży `decor` (~399k tris) oraz `houseStatic`; garden zostawił Dirt jako grounding caster (rośliny już no-shadow). Nie dokładać kolejnych `castShadow=false` bez benchmarku + visual OK. Submission/geometria → `settlements-019`; N8AO/post → `world-terrain-039`; terrain/vegetation shadow tylko jeśli świeży isolation wskaże dominację.
