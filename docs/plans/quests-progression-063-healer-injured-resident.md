# Plan: Healer — Injured Resident

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-025~~, ~~items-player-046~~, ~~quests-progression-015~~, ~~quests-progression-016~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships`
**Tags:** `healer` `injury` `treatment` `npc` `world-driven`
**Roadmap:** `quests-professions-and-world-consequences.md`
**Model:** Sonnet, Composer

## Cel

Dodać krótki lokalny quest Healer oparty wyłącznie o realny stan konkretnego settlement NPC:

```text
Herbalist zauważa realnie rannego mieszkańca
→ quest binduje się do stable NpcId
→ gracz dociera do tego NPC
→ używa istniejącej Medicine targeted treatment action
→ normalny NPC injury state zmienia się w authoritative systemie
→ quest obserwuje realną severity/recovery
→ powrót do givera + mały lokalny reward
```

Quest nie posiada własnego HP, injury progress, `treated`, recovery counter ani informacji `treatedByPlayer`.

## Ustalenia z reconu

### Healer identity

W aktualnym `Role` nie istnieje osobne `healer`. Istnieje `herbalist` i jest to pełnoprawna profesja:

- `src/ai/characters.ts::Role`;
- generation-time staffing w `src/settlement/professionStaffing.ts`;
- schedule w `src/ai/schedule.ts`;
- profession work w `src/ai/npcProfessionWork.ts`;
- workplace przez `src/settlement/places.ts::workplaceFor()`;
- produkcja dressingów w istniejącym Herbalist work/economy flow.

W tym queście **Herbalist jest gameplayowym Healer-giverem**. Nie dodawać nowego `Role`, aliasu `healer` ani quest-only profession.

### Injury source of truth

`NpcAuthoritativeState.physicalInjury` w `src/settlement/npcState.ts` jest jedyną authoritative ilością obrażeń fizycznych. Round-tripuje przez `NpcStateSnapshot` / `SaveData.npcStates`.

`InjurySeverity` z `src/shared/injurySeverity.ts` jest derived:

```text
none | minor | serious | critical
```

Natural recovery używa `src/shared/injuryRecovery.ts::resolveInjuryRecovery()` i elapsed world time. Quest nie kopiuje tych reguł.

### Player treatment

Player leczy NPC przez istniejący flow:

```text
treatableFromNpc()
→ resolveMedicalTreatmentPlan()
→ medicalTreatmentActions Busy Action
→ target.resolveInjuryRecovery(nowDays)
→ target.applyTreatment(...)
→ NpcAgent.applyPhysicalInjuryTreatment(...)
→ authoritative NPC health + physicalInjury
```

Materiały wybiera istniejący `Inventory.findInjuryTreatment(severity)` / catalog contract. Nie hardcodować w queście `bandage`, `dressing`, `yarrow` ani innego itemu jako osobnego objective.

## Scope V1

### Jeden bounded contextual quest

V1 rozszerza istniejący settlement quest-opportunity/materialization seam. Nie budować generic profession quest framework ani automatycznej kopii per settlement.

Materiał może powstać tylko dla settlementu, który ma jednocześnie:

1. normalnego alive adult NPC z `role === 'herbalist'` jako givera;
2. innego normalnego alive settlement NPC z realną derived severity `serious`;
3. stabilne `NpcId` dla obu stron;
4. target nadal ma `serious` injury w chwili offer eligibility.

W obrębie kwalifikujących się kandydatów wybór settlementu, givera i targetu musi być deterministic.

V1 **nie tworzy i nie ustawia authored injury**. Jeśli nie ma realnie rannego mieszkańca, quest nie istnieje. Jeżeli playtest pokaże, że content praktycznie się nie pojawia, authored persistent injury initialization ma być osobnym follow-upem zamiast dokładania recovery lock/quest flag do 063.

### Target selection

Preferować mieszkańca z profesją dającą naturalny kontekst codziennego urazu (np. `blacksmith`, `woodcutter`, `miner`, `farmer`, `hunter`) tylko jako deterministic tie-breaker.

Nie wymyślać przyczyny ani części ciała, których model injury nie przechowuje. Dialogue może mówić np. że kowal jest poważnie ranny, ale nie że „przeciął przedramię”, jeśli stan świata tego nie reprezentuje.

Giver nie może być jednocześnie targetem V1.

## Stable NPC binding

Quest binduje target dokładnie przez `NpcId`:

- używać `settlementNpcId()` / istniejących settlement opportunity descriptors;
- nie używać pozycji, indeksu live `NpcAgent`, display name ani „nearest injured NPC” po acceptance;
- po acceptance nigdy nie reselectować pacjenta.

Stable binding ma przeżyć:

- settlement unload/reload;
- WorldBundle rebuild;
- save/load.

Runtime `NpcAgent` jest tylko projekcją. Lookup questu czyta świeżo `NpcAuthoritativeState` z registry przez wąski injected resolver.

## Objective i warunek leczenia

Dodać najmniejszy state-bound objective dla konkretnego NPC, np.:

```ts
{ type: 'improve_npc_injury', npc: { npcId } }
```

Nazwa może zostać dopasowana do aktualnych conventions, ale objective musi oznaczać stan świata, nie event „Player użył itemu”.

### Initial eligibility

Target zaczyna quest z derived severity dokładnie `serious`.

### Success predicate

Objective jest spełniony, gdy bound target:

- żyje;
- po lazy recovery resolution ma derived severity `minor` albo `none`.

Nie wymagać `health === maxHp` ani `physicalInjury === 0`.

To świadomie sprawia, że zwykła stabilizacja bez materiału nie kończy serious injury: istniejący stabilize floor dla serious pozostaje na granicy serious, natomiast realny materiał/treatment albo normalna późniejsza recovery może zejść poniżej progu.

Quest nie sprawdza kto doprowadził do poprawy.

## Quest-facing NPC injury lookup

`QuestManager` nie może importować `SettlementsManager` ani `NpcStateRegistry`.

Wstrzyknąć wąski resolver z composition root, konceptualnie:

```ts
type QuestNpcInjuryState =
  | { status: 'missing' }
  | { status: 'dead' }
  | { status: 'alive', severity: InjurySeverity }

type QuestNpcInjuryLookup = (npcId: NpcId) => QuestNpcInjuryState
```

Resolver ma czytać authoritative `NpcAuthoritativeState` i przed oceną zastosować istniejące lazy `resolveInjuryRecovery(state, elapsedDays)`. Nie implementować recovery math w questach.

Nie używać snapshotu utrzymywanego przez quest.

## Polling / reconciliation

Nie dodawać globalnego per-frame skanu NPC.

State-bound objective ma być sprawdzany tylko dla odpowiednich questów w istniejących/bounded momentach:

- po zakończonym realnym medical treatment;
- po time skip;
- po save/load / WorldBundle rebuild reconciliation;
- przed istotną interakcją questową z giverem/targetem, aby natural recovery nie pozostawiło stale state.

Jeśli obecny quest lifecycle ma już wspólny poll dla state-bound objectives, rozszerzyć go zamiast tworzyć osobny scheduler.

## Lifecycle i invalidation

### Przed acceptance

- target dead → brak offer;
- target missing/identity unresolved → brak offer;
- target nie ma już `serious` injury → brak offer;
- target wyzdrowiał naturalnie lub został uleczony → brak reward i brak retroactive completion.

### Po acceptance

- severity `minor | none` → normalnie complete objective → `ready_to_report`;
- nadal `serious | critical` → quest pozostaje aktywny;
- realna śmierć targetu → authored failed outcome, bez reward;
- technicznie `missing` target → `invalidated`, bez replacementu;
- external/natural recovery → normalny success, bez actor attribution.

Nie respawnować, nie podmieniać i nie reselectować pacjenta.

## Dialogue i target location

Offer i reminder mają używać realnego target display data rozwiązanego podczas materialization.

Treść ma być codzienna i lokalna. Preferować role-aware copy, ale wyłącznie z faktów istniejących w modelu.

Przykład semantyczny:

```text
Herbalist:
"<imię> jest poważnie ranny. Jeśli potrafisz opatrywać rany, zajrzyj do niego."
```

Nie dodawać diagnozy, choroby, konkretnej przyczyny urazu ani body-part wound.

Do odnalezienia mieszkańca reuse stable NPC marker oraz normalne home/workplace/schedule zachowanie. Quest nie teleportuje targetu i nie tworzy osobnego place.

## Markery

Reuse istniejący quest marker/actionability pipeline:

1. przed acceptance — normalny offer marker na Herbalist giverze;
2. po acceptance — marker aktywnego celu na exact bound injured NPC;
3. po spełnieniu injury predicate — marker wraca do givera jako `ready_to_report`.

Nie tworzyć drugiego marker managera ani mesh-specific bindingu.

Marker targeta ma bazować na `NpcId`; unload usuwa tylko runtime presentation, nie logiczny target.

## Rewards

Mały lokalny reward przez istniejące `QuestOutcome` / `QuestConsequences`:

- `10 × coin`;
- giver relation `+2`;
- settlement reputation: `competence +1`, `benevolence +2`;
- bez renown;
- bez nowego Known Deed;
- bez unikalnego itemu.

Istniejący Settlement Known Deed `healer` może nadal zostać naliczony przez normalny successful Medicine treatment event. To efekt istniejącego gameplay systemu, nie dodatkowy quest reward.

## Persistence

Nie dodawać pola save dla injury questa.

Persisted owners pozostają:

```text
NpcStateRegistry / SaveData.npcStates
  → health, physicalInjury, recovery anchor, death

QuestManager / SaveData.quests
  → quest progress/outcome/relation
```

Quest definition musi rekonstruować ten sam quest id, giver `NpcId` i target `NpcId` z deterministic contextual source.

Nie zapisujemy:

- injury severity;
- treatment requirement;
- marker state;
- target position;
- runtime agent reference;
- treated actor attribution.

## Nie dublować animal treatment quests

063 jest human-only i nie dodaje animal treatment event/objective.

Plan 057/058 może mieć event semantics wymagające potwierdzenia konkretnego Player Medicine action. 063 celowo jest **state-based**, bo jego domenowym celem jest realne rozwiązanie problemu mieszkańca niezależnie od aktora.

Nie współdzielić z 057 logiki „Player performed treatment”, jeśli wymuszałoby to `treatedByPlayer`.

## Non-goals

- nowy health/injury system;
- authored injury/recovery lock;
- Healer AI / autonomous doctor action;
- hospital/clinic manager;
- diagnosis framework;
- diseases;
- multi-stage difficult case;
- fetch stage;
- animal/companion treatment;
- quest-only NPC;
- duplicate medical inventory;
- `treatedByPlayer`;
- specjalny recovery tick;
- nowy profession quest framework;
- nowy marker pipeline.

## Pliki / integration scope

Najbardziej prawdopodobne miejsca zmian:

- `src/quests/quests.ts` — state-bound NPC injury objective;
- `src/quests/QuestManager.ts` — injected lookup + completion/failure/invalidation handling + marker contribution;
- `src/quests/opportunities/` — bounded contextual opportunity/materialization;
- `src/app/createApp.ts` — composition/injected authoritative lookup i bounded poll hooks;
- `src/app/actions/medicalTreatmentActions.ts` / istniejący completion callback — tylko jako trigger do re-poll, bez zmiany treatment ownership;
- testy przy powyższych ownerach.

Nie zmieniać `NpcAgent` injury math, `NpcStateSnapshot` ani save schema, chyba że aktualny codebase podczas implementacji wykaże niezgodność z tym reconem.

## Testy

Focused coverage co najmniej:

1. deterministic quest → exact target `NpcId` binding;
2. only alive `serious` resident + Herbalist context materializes;
3. dead/missing/recovered target nie dostaje offer;
4. objective czyta authoritative `physicalInjury`/derived severity, bez quest injury field;
5. existing player treatment mutuje ten sam `NpcAuthoritativeState`;
6. `serious → minor/none` kończy objective;
7. natural/external recovery po acceptance także kończy objective;
8. further injury / `critical` nie daje false completion;
9. death po acceptance daje failed outcome bez reward;
10. technical missing po acceptance daje invalidated bez replacementu;
11. settlement unload/reload zachowuje exact target;
12. save/load i WorldBundle rebuild zachowują exact binding i nie duplikują offer/reward;
13. repeat poll/report jest idempotent;
14. marker przechodzi giver → patient → giver w istniejącym pipeline;
15. zwykły NPC injury/treatment bez aktywnego questa działa bez regresji;
16. brak animal-treatment regression dla 057/058 seams.

## Weryfikacja

AI implementation agent wykonuje tylko focused automated tests/typecheck potrzebne do zmian.

Browser/manual verification wykonuje User. AI nie uruchamia browser verification i nie uruchamia `pnpm docs:sync`.

Dla nowych publicznych quest-facing lookup/objective helpers dodać JSDoc z `@domain quests-progression`, jeśli poprawia preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
