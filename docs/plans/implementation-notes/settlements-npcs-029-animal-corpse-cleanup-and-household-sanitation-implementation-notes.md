# Animal Corpse Cleanup & Household Sanitation — Implementation Notes

**Plan:** `settlements-npcs-029-animal-corpse-cleanup-and-household-sanitation.md`  
**Recon:** 2026-09-09, current `main`

## Najważniejsze ustalenia

Plan jest zgodny z obecną architekturą: sanitation powinno być kolejnym lokalnym pressure/world-problemem w istniejącym NPC decision pipeline, a authoritative corpse state musi pozostać po stronie fauny.

Dwie rzeczy z aktualnego kodu wymagają jednak świadomego potraktowania:

1. obecny corpse claim w `src/fauna/animalCorpse.ts` jest **food-claimem drapieżnika**, nie generycznym reservation seamem;
2. naturalny corpse lifecycle jest bardzo krótki: `fresh` od śmierci, `rotting` od 20 s, `bones` od 40 s, natural removal po 60 s. Bez użycia istniejącego hold semantics NPC może przegrać wyścig z decay zanim dojdzie i skończy cleanup.

## Fauna corpse contract

### `src/fauna/animalCorpse.ts`

`AnimalCorpseState` pozostaje właściwym ownerem:

- `phase: 'fresh' | 'rotting' | 'bones'`,
- `buried`,
- `held`,
- `claimedBy`,
- `consumedPhase`,
- `timeSinceDeath`.

`buryCorpse(state)` ustawia `buried = true`, zatrzymuje rot FX i przesuwa corpse do istniejącego removal endpointu. Nie usuwać mesh ręcznie z NPC-side code.

`AnimalAgent` utrzymuje publiczne thin delegates (`corpsePhase()`, `bury()`, `holdCorpse()`, `releaseCorpseHold()`, `claimAsFood()`, `releaseFoodClaim()` itd.). Cleanup powinien kończyć się przez tę samą fauna-owned operację `bury()`.

### Claim — nie używać `claimAsFood()` jako cleanup locka

`AnimalCorpseState.claimedBy` i `AnimalAgent.claimAsFood()` mają dziś konkretną semantykę predator scavenging. Bezpośrednie włożenie tam `NpcAgent` jako cleanup ownera rozszerzyłoby znaczenie pola w sposób trudny do odczytania i może zepsuć feeding logic.

Preferowana minimalna zmiana:

- dodać do `animalCorpse.ts` wąski transient sanitation reservation seam, np. `cleanupClaimantNpcId: string | null` + claim/release helpers,
- albo jawnie zgeneralizować istniejący claim do typed exclusive corpse consumer reservation **tylko jeśli** wszystkie obecne food call-sites zostaną zachowane przez adaptery (`claimAsFood` pozostaje publicznym wrapperem).

Nie tworzyć settlementowego registry/lock managera.

Claim sanitation powinien być transient. Wild fauna i rats nie mają persisted individual runtime state; NPC execution również nie jest persisted. Po reconstruction ponowna arbitration jest bezpieczniejsza niż próba utrzymywania lease.

### Hold podczas aktywnej pracy

`AnimalAgent.holdCorpse()` już zatrzymuje corpse decay/removal podczas player harvest; komentarz w kodzie gwarantuje, że timer nie postępuje i `readyToRemove()` pozostaje false aż do `releaseCorpseHold()`.

To jest właściwy istniejący seam do zabezpieczenia długiego approach + timed cleanup:

```text
successful sanitation claim
→ holdCorpse()
→ approach + timed work
→ revalidate corpse + claimant
→ bury()
→ release claim / hold as cleanup finishes
```

Każdy cancel/failure/unreachable/dispose path musi zwolnić zarówno sanitation claim, jak i hold. Inaczej można stworzyć nieśmiertelne zwłoki.

Predator feeding nadal musi respektować cleanup reservation. Analogicznie cleanup eligibility musi odrzucać corpse skutecznie claimowane jako food; nie dopuszczać dwóch konkurencyjnych finalizacji.

## Skąd brać corpse candidates

Nie tworzyć globalnego corpse indexu.

Obecny runtime jest już podzielony:

- `Fauna.getAgents()` — wild fauna z `src/fauna/createFauna.ts`,
- `Settlement.livestock` — household-owned animals,
- `Settlement.rats` — settlement-local wild rats.

`Settlement` w `src/settlement/createSettlement.ts` już expose'uje `npcs`, `households`, `livestock`, `rats`, `landmarks`, `center`.

Najmniejszy spójny kierunek: zbudować dla loaded settlement mały caller-bounded corpse candidate view z:

```text
settlement.rats
+ settlement.livestock
+ bounded nearby wild fauna supplied from SettlementsManager / existing Fauna.getAgents()
```

Nie skanować całego świata per NPC. Candidate listę policzyć raz na settlement/update cadence i przekazać NPC-side przez mały hook/context, podobnie jak istniejące `nearbyAnimalThreats`, `nearbyPredators` i hunting hooks.

Uwaga: wild `Fauna` jest obecnie oddzielnym systemem od per-settlement rats/livestock. Nie zakładać, że `Settlement.livestock` lub `rats` pojawią się w `Fauna.getAgents()`.

## Settlement influence i responsible household

Household ma authoritative `homeId`; `homePlaceId(settlementId, index)` oraz index alignment `homes[i]` / `households[i]` są już kanoniczne w `createSettlement.ts` / `places.ts`.

Nie wyliczać nearest household z NPC position. Użyć fizycznego home anchoru tego samego indexu, który już służy m.in. livestock ownership i rat household targeting.

Najlepiej wyciągnąć mały pure resolver:

```text
resolveResponsibleHousehold(corpsePosition, household/home anchors)
```

- filtr settlement influence najpierw,
- potem nearest squared distance,
- deterministic tie-break po stable `household.id` albo indeksie.

Nie zapisywać wyniku w Household; po zmianie świata/stream-in ma być re-derived.

Influence radius powinien korzystać z istniejącego settlement footprint/center context, nie z nowej stałej „village radius” oderwanej od `SettlementDef`/`VillageInfo`.

## NPC pressure / decision integration

Najbliższy istniejący wzorzec to `src/ai/burialPressure.ts` + `npc-011`, ale sanitation pozostaje odrębną semantyką.

Aktualny `NpcAgent.choose()` ma już wiele niezależnych producerów oraz top-level targets m.in. `buryDeceased`, `heal`, `seekShelter`, `visitGrave`; `src/ai/npcDecision.ts` nadaje im sequencing priority.

Dla 029:

- dodać nowy target, np. `cleanAnimalCorpse`, zamiast `NeedId`,
- osobny pure producer, np. `animalCorpseCleanupPressure.ts`,
- producer powinien widzieć tylko corpse candidates odpowiedzialnego household + aktualnego claimant NPC,
- score opierać na phase + liczbie lokalnych corpse + koszt/dystans w prostym bounded modelu,
- winner dopiero uruchamia claim/action; pressure evaluation nie mutuje corpse.

Nie wciskać sanitation do `Needs.ts` ani profession-work table.

### Priority

Nie nadawać sanitation priorytetu wyższego niż krytyczne potrzeby/healing/weather emergency. To porządkowa praca household, nie survival emergency.

Dobrym punktem odniesienia jest obecne `buryDeceased` (`npcDecision.ts` ma sequencing priority 78). Animal cleanup powinno być niżej niż social burial człowieka i realne needs, ale wyżej niż czysty idle/work-opportunity, żeby rotting corpse rzeczywiście było podejmowane.

Finalne numery ustalić w istniejącej tabeli priority, nie w producerze jako drugi system priorytetów.

## Executor eligibility

Household responsibility nie oznacza stałego przypisania do konkretnego NPC.

Do producer input przekazać household id aktualnego NPC i odrzucać candidate, jeżeli odpowiedzialny household jest inny. Dzięki temu zwykła arbitration każdego członka rodziny sama wybierze wykonawcę.

Nie trzeba osobnego „pick household member” managera.

Eligibility powinno korzystać z istniejącego `NpcAgent.choose()` availability/lifecycle: dead/collapse/combat/current higher-priority activity nie powinny być obchodzone przez sanitation-specific scheduler.

## Action lifecycle

Wzorować orchestration na `npc-011`, ale bez grave/cemetery i bez persistent plan targetu, jeśli runtime-only re-evaluation wystarcza.

Preferowany flow:

```text
pressure winner
→ resolve target by stable animalId
→ claim sanitation
→ hold corpse
→ ordinary goTo corpse position
→ timed execute
→ final invariant re-check
→ AnimalAgent.bury()
→ release reservation/hold
→ complete
→ next choose() re-derives remaining sanitation pressure
```

Nie przechowywać `AnimalAgent` reference w persisted `activePlan`. Wild/rats mogą zostać reconstructed/removed. Jeżeli implementacja potrzebuje targetu przez kilka action phases, trzymaj runtime `animalId`/resolver w action state analogicznie do innych transient targets.

Przed finalizacją sprawdzić co najmniej:

- agent nadal istnieje,
- `isDead()`,
- nie jest już `buried`,
- sanitation claimant nadal jest ten sam,
- corpse nie przeszło w harvested/terminal state niezgodny z cleanup,
- pozycja jest nadal osiągalna na normalnym navigation path.

`bury()` musi być jedyną skuteczną finalizacją; ponowne wywołanie po utracie targetu ma fail/no-op zamiast generować drugi efekt.

## Player interaction / scavenging race

Player burial i harvest mogą wejść w konflikt z NPC action.

- Player powinien móc wygrać przed claimem sanitation.
- Gdy sanitation już aktywnie trzyma corpse, player interaction powinna dostać fail/busy albo spowodować jawne cancellation NPC — nie wykonywać dwóch mutacji równocześnie.
- Predator food claim i sanitation claim muszą być wzajemnie wykluczające.

Nie zmieniać `consumedPhase` ani harvest semantics tylko po to, by oznaczyć cleanup.

## Persistence

029 nie wymaga nowego persisted sanitation state ani bumpu save schema, o ile cleanup claim/target pozostaje transient.

Ważne: livestock `AnimalSaveState` persistuje corpse-related fields przez istniejący `AnimalAgent.snapshot()/hydrate()` path, natomiast wild fauna i rats nie persistują individual corpse execution state. Nie dodawać sanitation claim do snapshotu bez bardzo mocnego powodu — reconstruction powinno go zwolnić i ponownie wyprowadzić problem.

## Debug

Rozszerzyć istniejący NPC inspection/history zamiast osobnego sanitation debug store.

Najbardziej użyteczne pola:

- selected `animalId` / kind / phase,
- rejection reason (`outside-influence`, `other-household`, `food-claimed`, `cleanup-claimed`, `not-dead`, `buried`),
- responsible household id,
- pressure score,
- claim owner,
- action state/cancel reason.

Fauna inspector może pozostać ownerem corpse-side state; nie duplikować pełnego corpse snapshotu po stronie NPC debug.

## Testy o najwyższym ROI

1. Pure responsible-household resolver: nearest + deterministic tie.
2. Pressure producer: fresh < rotting, bones eligible, wrong household rejected, multiple corpses increase pressure boundedly.
3. Corpse reservation: one sanitation claimant; food claim vs sanitation mutually exclusive; release on cancel.
4. Hold lifecycle: claimed cleanup corpse nie znika po 60 s; po release natural lifecycle znów działa.
5. Finalization: successful cleanup calls fauna burial transition once; already buried/removed target safely cancels.
6. Candidate coverage: rat + livestock + nearby wild corpse używają tego samego path.
7. Regression: predator feeding, player harvest/bury i natural decay poza settlement pozostają bez zmian.

## Guardrails

Nie tworzyć:

- `CorpseCleanupManager`,
- settlement/household corpse registry,
- persisted sanitation task queue,
- sanitation-specific pathfinding/FSM,
- species-specific cleanup,
- generic hygiene/disease system,
- powiązania z NPC grave/cemetery lifecycle.

Najważniejsza granica: **fauna owns corpse; settlement derives local responsibility; NPC owns decision/execution**.

Docs-only review: bez browser verification i bez ręcznego `pnpm docs:sync`.
