# Seedvale — Loose Ends

Krótkie notatki o pobocznych blokadach, konkretnych bugach i brakujących mechanizmach odkrytych podczas implementacji planów, ale poza ich zakresem.

To nie jest issue tracker ani historia zmian. Gdy wpis zostanie naprawiony, pokryty planem albo stanie się nieaktualny — usuń go. Gdy dojrzeje do osobnej pracy — przenieś go do planu / issue zamiast rozbudowywać tutaj.

Format: `- [ ] YYYY-MM-DD — opis (plan/plik, jeśli istotne)`

## Caves / terrain

- [ ] 2026-09-11 — Cave V3 heightfield: na seed `1136726869` (`cave:0e3cce97`, `seg-chamber`) podłoga koncentruje zjazd widening→chamber na granicy chamber lobe (~2.5 m / ~1.3 m, grade ≈ 4.06 wobec walk-max 1.43), mimo łagodnego centerline. Repro jest przypięte jako `it.fails` w `productionTopology.floor-continuity.test.ts`; poprawka należy do blendu lobe/ramp w `caveHeightfieldRepresentation.ts` (world-terrain-019).
- [ ] 2026-08-24 — `Przygotuj teren` na skalistym/górskim gruncie wymaga narzędzi, ale nie ma kary za trudność terenu; jeśli mechanika ma rozróżniać soil/sand/rock także dla większych prac, rozszerzyć istniejący `requiredWork` zamiast dodawać osobny system (world-terrain-002).

## Quest-enabling world mechanics

- [ ] 2026-09-12 — settlements-007 wystawia read-only `SettlementsManager.getStructureSnapshot`/`listRepairProblems`, ale żaden quest jeszcze tego nie konsumuje. quests-progression-016 mógłby dodać `structure:<structureId>:repair` opportunity (condition poniżej progu → problem, naprawa/przywrócenie condition → resolution) tym samym mechanizmem co istniejący wolf-den pressure hook — nie kopiować repair state do quest layer.

## Fauna

- [ ] 2026-09-12 — `wolfDen` pressure activation (`shouldActivateWolfDenProblem`) może dospawnować wilki poza initial fill; te osobniki są `normal`, nawet gdy oryginalna alfa zginęła. fauna-022 przypisuje alfę tylko do slotu 0 zwykłego initial fill (den ma `respawnIntervalDays: Infinity`). Jeśli odtworzony pack ma znowu mieć alfę, rozszerzyć ten sam slot/identity mechanizm, nie dodawać RNG ani osobnego alpha spawnera.
- [ ] 2026-09-02 — frenzy branches (`npc-attack-frenzied` / `frenzy-beeline`) nie wywołują `cancelSourceTarget()`, więc wilk może zachować `foodClaimedBy` na padlinie podczas szarży na osadę. Ujednolicić bookkeeping branchy, jeśli claim nie ma celowo przetrwać frenzy.
- [ ] 2026-09-08 — initial livestock `productionReadyAtDays` jest seedowane runtime RNG, a potem persystowane. Pierwsze utworzenie tej samej deterministycznej sztuki może więc dać różny stagger; użyć stabilnego rolla z identity/seed.

## Settlement / world correctness

- [ ] 2026-08-25 — `buildHouseWallCollidersLocal()` nadal iteruje tylko `def.walls`; `def.corners` nie mają własnego collidera. Zwykle maskują to sąsiednie ściany, ale corner przy otworze/door module nie ma takiego invariant — przy najbliższym dotykaniu house collision dodać jawne pokrycie/test.
- [ ] 2026-09-06 — river ford podnosi carved terrain, ale nie aktualizuje canonical `RiverChannelSegment.waterH/bedH`; `sampleLocalWater` nadal widzi pierwotną głębokość. Dziś zwykle nieszkodliwe, bo ford powstaje na małych kanałach, ale terrain i water authority są tam rozbieżne.
- [ ] 2026-09-06 — `roadNetwork.findRoute` nadal nie modeluje rzek: A* nie zna kanałów, więc crossing wynika przypadkowo z elevation cost; duża rzeka może dostać drogę bez brodu/mostu. Follow-up powinien dodać river-aware crossing cost oraz mosty jako istniejący world/road mechanism, nie specjalny wyjątek renderera.

## Off-screen simulation

- [ ] 2026-09-11 — off-screen `TransportOrder.execution` nie przesuwa potrzeb/vigoru/injury carrier NPC w czasie podróży. To ten sam brak co dla innych unloaded NPC, ale staje się istotny dla generic long-distance travel (`settlements-npcs-028` / `npc-029`). Naturalny seam: stanowy survival catch-up obok `resolveOffscreenTransportArrivals`, reuse istniejących `tickNeeds` / `tickVigorForSimulatedStep` / injury recovery helpers.
- [ ] 2026-09-12 — npc-029 accompany NPCs still unload with their home settlement (same detailed XOR off-screen rule as transport carriers). Visual follow therefore stops when the village streams out; long-distance live-agent travel with the player belongs with `settlements-npcs-028` / paid escort, not a companion-specific streaming owner.
