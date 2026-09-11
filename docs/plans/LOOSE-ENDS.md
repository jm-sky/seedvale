# Seedvale — Loose Ends

Krótkie notatki o pobocznych blokadach, konkretnych bugach i brakujących mechanizmach odkrytych podczas implementacji planów, ale poza ich zakresem.

To nie jest issue tracker ani historia zmian. Gdy wpis zostanie naprawiony, pokryty planem albo stanie się nieaktualny — usuń go. Gdy dojrzeje do osobnej pracy — przenieś go do planu / issue zamiast rozbudowywać tutaj.

Format: `- [ ] YYYY-MM-DD — opis (plan/plik, jeśli istotne)`

## Caves / terrain

- [ ] 2026-09-11 — Cave V3 heightfield: na seed `1136726869` (`cave:0e3cce97`, `seg-chamber`) podłoga koncentruje zjazd widening→chamber na granicy chamber lobe (~2.5 m / ~1.3 m, grade ≈ 4.06 wobec walk-max 1.43), mimo łagodnego centerline. Repro jest przypięte jako `it.fails` w `productionTopology.floor-continuity.test.ts`; poprawka należy do blendu lobe/ramp w `caveHeightfieldRepresentation.ts` (world-terrain-019).
- [ ] 2026-08-24 — `Przygotuj teren` na skalistym/górskim gruncie wymaga narzędzi, ale nie ma kary za trudność terenu; jeśli mechanika ma rozróżniać soil/sand/rock także dla większych prac, rozszerzyć istniejący `requiredWork` zamiast dodawać osobny system (world-terrain-002).

## Quest-enabling world mechanics

- [ ] 2026-09-10 — quests-progression-016: household food-shortage opportunity nie ma player → household food transfer. `Household.shortage('food')` istnieje, ale wpłata do magazynu osady nie rozwiązuje niedoboru konkretnego gospodarstwa. Rozszerzyć istniejący inventory/household transfer flow, nie quest-specific bypass.
- [ ] 2026-09-10 — quests-progression-016: lost-livestock opportunity nie ma realnego predicate/state „zwierzę zaginęło”; `find_animal` jest tylko objective. Potrzebny mechanizm w `fauna`.
- [ ] 2026-09-10 — quests-progression-016: settlement structure-repair opportunity nie ma generic settlement-building repair + player path. Reuse `world/repair.ts`, nie tworzyć osobnej questowej naprawy.

## NPC / households / work

- [ ] 2026-09-09 — NPC death handoff nadal filtruje loot przez `extractNpcLoadoutLoot`; corpse loot nie przenosi pełnego `personalInventory` ani freshness batches. Lossless transfer perishables wymaga rozszerzenia corpse-loot persistence (npc-010 / settlements-npcs-026 follow-up).
- [ ] 2026-09-05 — `WorkContracts.post()` / `canPostContract` nie sprawdzają proaktywnie, czy target istnieje i jest unfinished. Martwy target może chwilowo wisieć jako `advertised`; system sam naprawia stan dopiero przy akceptacji. Jeśli ma zniknąć wcześniej, walidację trzeba oprzeć o istniejący target resolver zamiast filtrować osobno każde UI (npc-018).
- [ ] 2026-09-04 — `NpcAgent.maybeMaintainNearbyGarden` / `maybeWaterNearbyGarden` nadal używają `Math.random()` do mutacji persystowanego `PlayerGardenRecord.care` / `hydration`. Zastąpić seedowanym/deterministycznym roll'em; niekontrolowane RNG nie powinno wpływać na zapisany stan świata.
- [ ] 2026-09-04 — najęty NPC przy budowie studni nadal omija playerową bramkę `wellStageCapabilities` (`advanceWellConstruction(... capabilities: null)`). Do decyzji projektowej: albo NPC ma własne realne capability/tool requirements, albo jawnie dokumentujemy, że kontrakt pracy zastępuje tę bramkę; nie pozostawiać przypadkowej asymetrii.

## Fauna

- [ ] 2026-09-02 — `AnimalAgent.resolveNpcTarget()` stosuje village exclusion tylko przy acquisition. Predator, który zablokował NPC poza osadą, może kontynuować pościg po wejściu NPC do osady; jeśli granica osady ma być ochroną zachowania, lock trzeba rewalidować w trakcie pościgu.
- [ ] 2026-09-02 — frenzy branches (`npc-attack-frenzied` / `frenzy-beeline`) nie wywołują `cancelSourceTarget()`, więc wilk może zachować `foodClaimedBy` na padlinie podczas szarży na osadę. Ujednolicić bookkeeping branchy, jeśli claim nie ma celowo przetrwać frenzy.
- [ ] 2026-09-08 — `AnimalAgent.hydrate()` losuje corpse tip-side przy load dla persystowanego livestock corpse bez death clip; ten sam save może wizualnie odtworzyć zwłoki po przeciwnej stronie. Cosmetic, ale niedeterministyczne.
- [ ] 2026-09-08 — initial livestock `productionReadyAtDays` jest seedowane runtime RNG, a potem persystowane. Pierwsze utworzenie tej samej deterministycznej sztuki może więc dać różny stagger; użyć stabilnego rolla z identity/seed.

## Settlement / world correctness

- [ ] 2026-08-25 — `buildHouseWallCollidersLocal()` nadal iteruje tylko `def.walls`; `def.corners` nie mają własnego collidera. Zwykle maskują to sąsiednie ściany, ale corner przy otworze/door module nie ma takiego invariant — przy najbliższym dotykaniu house collision dodać jawne pokrycie/test.
- [ ] 2026-09-06 — river ford podnosi carved terrain, ale nie aktualizuje canonical `RiverChannelSegment.waterH/bedH`; `sampleLocalWater` nadal widzi pierwotną głębokość. Dziś zwykle nieszkodliwe, bo ford powstaje na małych kanałach, ale terrain i water authority są tam rozbieżne.
- [ ] 2026-09-06 — `roadNetwork.findRoute` nadal nie modeluje rzek: A* nie zna kanałów, więc crossing wynika przypadkowo z elevation cost; duża rzeka może dostać drogę bez brodu/mostu. Follow-up powinien dodać river-aware crossing cost oraz mosty jako istniejący world/road mechanism, nie specjalny wyjątek renderera.

## Off-screen simulation

- [ ] 2026-09-11 — off-screen `TransportOrder.execution` nie przesuwa potrzeb/vigoru/injury carrier NPC w czasie podróży. To ten sam brak co dla innych unloaded NPC, ale staje się istotny dla generic long-distance travel (`settlements-npcs-028` / `npc-029`). Naturalny seam: stanowy survival catch-up obok `resolveOffscreenTransportArrivals`, reuse istniejących `tickNeeds` / `tickVigorForSimulatedStep` / injury recovery helpers.
