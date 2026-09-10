# Plan: RPG settlement quest matrices

**Created:** 2026-09-10  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** quests-progression-015, quests-progression-016  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `relationships`  
**Tags:** `rpg-matrices` `settlements` `authored-generation`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać drugi typ proceduralnych questów dla innych osad: **RPG quest matrices**.

W przeciwieństwie do world-driven opportunities z `quests-progression-016`, te questy nie muszą wynikać z aktywnego problemu symulacji.

Mają jednak zawsze być osadzone w realnym świecie Seedvale:

```text
real settlement / NPC / place / item / route
+
authored scenario grammar
→ contextual RPG quest
→ normal QuestDef
→ existing QuestManager
```

Celem jest większa różnorodność i bardziej klasyczne RPG-owe sytuacje bez budowania proceduralnego quest engine, generic DSL ani losowej składanki objective × NPC × reward.

## Scope V1

Plan obejmuje trzy docelowe scenario matrices:

1. **Podejrzany transport** — mystery + choice,
2. **Sekret starego miejsca** — exploration + discovery,
3. **Umowa między osadami** — travel + trade/diplomacy framing.

V1 wymaga:

1. wspólnego RPG matrix candidate/materialization seam,
2. deterministycznej eligibility i materialization,
3. integracji ze shared opportunity/selection lifecycle z `quests-progression-016`,
4. stable NPC identity z `quests-progression-015`,
5. co najmniej dwóch pełnych scenario matrices.

**Sekret starego miejsca** jest obowiązkowym pierwszym vertical slice.

Drugi vertical slice powinien być jednym z:

- Podejrzany transport,
- Umowa między osadami.

Trzecia matrix jest wdrażana w tym planie tylko wtedy, gdy recon potwierdzi, że potrzebne domain seams już istnieją. Jeśli nie, brak należy udokumentować jako realny blocker/dependency zamiast implementować quest-only workaround.

## Główna zasada

RPG matrix może być authored fiction, ale nie może udawać mechaniki świata, której Seedvale nie posiada.

Dozwolone:

```text
real NPC
real settlement
real landmark
real item
real container
real destination
+
authored interpretation/story
```

Niedozwolone:

```text
fake diplomacy state
fake inter-settlement trade contract
fake missing NPC
fake ownership
fake crime evidence
```

jeżeli takie domain state faktycznie nie istnieje.

## Architecture

### Candidate → materialization

Rozdzielić dwa etapy:

```text
settlement context
→ lightweight eligible RPG candidate
→ shared selection
→ materialization
→ QuestDef
→ QuestManager
```

Eligibility odpowiada na pytanie, czy matrix pasuje do realnego kontekstu osady i jakie ma stabilne source refs.

Materialization dopiero po selection buduje pełny `QuestDef`.

Nie mieszać eligibility z tworzeniem runtime questa.

### Matrix layer

RPG matrix jest authored builderem normalnego questa.

Docelowy przepływ:

```text
Settlement context
        │
        ├─ NPCs
        ├─ nearby places
        ├─ items/containers
        ├─ other settlements
        └─ social state
                 │
                 v
          matrix eligibility
                 │
                 v
           RPG candidate
                 │
                 v
        shared selection
                 │
                 v
          materialization
                 │
                 v
              QuestDef
                 │
                 v
            QuestManager
```

Nie tworzyć:

```text
ProceduralQuestEngine
QuestGrammarInterpreter
QuestConditionDSL
QuestChainManager
RpgQuestOpportunityManager
```

### Matrix contract

Preferowany kierunek:

```ts
type RpgQuestMatrix = {
  id: string
  collectCandidate(...)
  materialize(...)
}
```

Dokładny contract ustalić na podstawie landed `quests-progression-016`.

Jeżeli trzy zwykłe funkcje builderów są prostsze niż wspólny interface, preferować funkcje. Nie tworzyć plugin frameworku tylko dla trzech matrices.

## Determinism

Selection i materialization muszą być deterministyczne względem stabilnych danych świata.

Preferowane inputs:

```text
world seed
settlementId
matrixId
stable source refs
optional local history/cooldown
```

Nie używać `Math.random()` do persistent quest identity ani wyboru wariantu.

Save/load nie może zmienić:

- givera,
- target NPC,
- destination settlement,
- landmark,
- item/container,
- choice variants,
- reward,
- quest ID.

## Shared selection

Reuse mechanism z `quests-progression-016`, jeżeli landed implementation posiada już:

- candidate selection,
- settlement-level availability limit,
- deterministic ordering,
- cooldown/history.

Nie tworzyć równoległego selection systemu.

Docelowo:

```text
world-driven candidates
+
RPG matrix candidates
→ one shared settlement opportunity selection layer
```

Realne problemy świata powinny mieć pierwszeństwo przed opcjonalnymi RPG stories, gdy limit opportunities jest mały. Rozszerzyć istniejący priority contract z 016, zamiast tworzyć drugą tabelę scoringową.

## Matrix 1 — Sekret starego miejsca

### Cel fabularny

Quest prowadzi gracza do realnego miejsca w świecie i daje powód do eksploracji.

Przykładowy flow:

```text
NPC daje wskazówkę
→ znajdź realne stare miejsce
→ odkryj / przeczytaj / zbadaj
→ wróć z informacją
```

### Existing mechanisms to reuse

Preferować istniejące:

- `interact_landmark`,
- `discover_location`,
- `read_item`,
- `loot_world_container`,
- procedural landmarks,
- world locations,
- existing discovery state.

To jest obowiązkowy pierwszy vertical slice, ponieważ najmocniej reuse'uje istniejące world/discovery objectives i ma najmniejsze ryzyko domenowe.

### Eligibility/source selection

Matrix musi wybrać realny world entity.

Preferować:

```text
settlement
→ bounded lookup nearby eligible landmark/location
→ stable landmarkId/locationId
→ lightweight RPG candidate
```

Nie generować fikcyjnego miejsca bez reprezentacji w świecie.

Jeżeli nie ma eligible source:

```text
matrix not eligible
```

zamiast tworzyć fallback coordinate.

### Variants

Różnorodność może pochodzić z authored templates tylko dla faktycznie istniejących `LandmarkKind` / location types.

Nie wymyślać nowych landmark kinds w tym planie.

## Matrix 2 — Podejrzany transport

### Cel fabularny

Gracz otrzymuje prośbę związaną z transportem lub przesyłką, której zawartość, pochodzenie albo odbiorca budzi wątpliwości.

Quest ma prowadzić do wyboru, a nie tylko dostarczenia przedmiotu.

Przykładowy flow:

```text
giver
→ odbierz / znajdź przesyłkę
→ odkryj coś podejrzanego
→ wybór:
   - dostarcz zgodnie z umową
   - oddaj komuś innemu / zgłoś
→ outcome
```

### Existing mechanisms to reuse

Preferować:

- `gather_item`,
- `read_item`,
- `loot_world_container`,
- `talk_to_npc`,
- `talk_to_npc_choice`,
- normal inventory items,
- quest outcomes,
- relation/reputation/renown consequences.

### Transport representation guardrail

Nie zakładać z góry, że matrix wymaga realnego world containera.

Preferowana kolejność:

1. real item + real NPC handoff, jeśli taki shared path istnieje,
2. real item z istniejącego world containera, jeśli obecny ownership/lifecycle to wspiera,
3. prostsza wersja oparta o istniejące inventory/talk objectives.

Najważniejsze dla V1 jest:

```text
mystery + meaningful choice
```

a nie konkretna techniczna forma przesyłki.

Nie tworzyć virtual quest parcel przechowywanego tylko w quest progress i nie dodawać generic quest-item ownership systemu w tym planie.

### Choice

Reuse `talk_to_npc_choice` jako wąski istniejący mechanizm.

Nie rozbudowywać go do dialogue tree.

Matrix może mieć authored branch outcomes, np. dostarczenie zgodnie z umową albo zgłoszenie transportu, ale tylko tyle wariantów, ile ma realne wsparcie w obecnych consequences.

### Consequences

Preferować:

- relation z giverem,
- relation z drugim NPC,
- settlement reputation,
- renown,
- reward item/coins.

Nie tworzyć crime/faction reputation systemu w tym planie.

## Matrix 3 — Umowa między osadami

### Cel fabularny

Dodać quest wykorzystujący fakt, że świat posiada wiele osad.

Gracz pełni rolę pośrednika lub kuriera:

```text
settlement A
→ NPC A
→ travel to settlement B
→ NPC B
→ decision / delivery / response
→ return or outcome
```

To ma być pierwszy naturalny consumer cross-settlement NPC identity z `quests-progression-015`.

### V1 framing

Nie zakładać, że Seedvale posiada pełną:

- settlement diplomacy,
- inter-settlement trade agreements,
- persistent treaty state,
- faction relations.

V1 może przedstawiać „umowę” fabularnie jako:

```text
request
offer
delivery
message
negotiation between named NPCs
```

ale rzeczywisty persistent effect powinien korzystać tylko z istniejących systems.

### Existing mechanisms to reuse

Preferować:

- stable NPC refs z 015,
- `talk_to_npc`,
- `talk_to_npc_choice`,
- `gather_item` / inventory,
- relation,
- settlement reputation,
- renown,
- real settlement IDs,
- normal world travel.

### Cross-settlement source guardrail

Target settlement i target NPC muszą być wybierani z trwałych registry/definitions albo innego world-independent stable source.

Nie wybierać na podstawie:

```text
currently loaded settlements
currently instantiated NPC agents
nearest streamed settlement
NPC nearest player
```

Stream state, camera position ani obecność gracza nie mogą wpływać na selection ani późniejsze odtworzenie questa.

Selection musi być stabilne przez:

```text
stream-out/in
save/load
world rebuild
```

### No fake economy

Jeżeli quest mówi o dostawie towaru, a realny system nie potrafi wprowadzić towaru do target settlement economy/storage, nie symulować tego przez samo usunięcie itemu w `QuestManager`.

V1 może zostać uproszczone do realnego supported handoff/message/negotiation flow.

Jeżeli persistent settlement stock transfer jest konieczny do wybranego wariantu, wydzielić osobny plan w odpowiedniej domenie.

## Materialization context

RPG matrix powinna dostawać bounded read-only context potrzebny do wyboru realnych źródeł.

Preferować wąskie dane:

```text
settlementId
eligible stable NPC refs
eligible nearby landmarks/locations
eligible other settlement refs
eligible real item/container refs where supported
social state if actually required
```

Nie przekazywać całych managerów do matrix builderów, jeśli composition root może przygotować mały data-only context.

Nie snapshotować authoritative mutable state, jeśli potrzebny jest późniejszy live lookup.

## Giver selection

Po 015 giver musi używać stable NPC identity.

Selection powinien być deterministyczny.

Matrix może preferować istniejące role/professions tylko wtedy, gdy aktualny NPC state faktycznie je udostępnia i są stabilnym kryterium.

Fallback:

```text
stable eligible resident
```

Nie wybierać NPC zależnie od pozycji gracza ani aktualnego stream state.

## Target NPC selection

Target NPC również musi używać stable identity.

Duplicate display names między osadami nie mogą powodować kolizji.

`talk_to_npc` i `talk_to_npc_choice` powinny korzystać z landed stable identity contract z 015, nie z name-based fallbacku wprowadzonego lokalnie w 017.

## Authored text templates

Matrices powinny używać authored tekstów z ograniczoną interpolacją.

Dozwolone interpolacje:

- NPC display name,
- settlement name,
- item name,
- landmark/location description.

Nie budować generic templating engine ani proceduralnego NLP/LLM generation.

## Quest IDs

Generated RPG quest ID musi być stabilny.

Preferowany koncept:

```text
rpg:<matrixId>:<settlementId>:<variantSourceId>
```

Dokładny format dopasować do landed conventions 016.

Jeżeli matrix może wystąpić ponownie po cooldownie, potrzebny jest deterministic occurrence discriminator/history key.

Nie używać losowego runtime UUID.

## Persistence

Reuse contract z 016.

Generated `QuestDef` musi być rekonstruowany przy boot z tym samym:

- ID,
- giverem,
- targetami,
- matrix variant,
- source refs,
- outcomes.

Jeżeli materialization opiera się na historii/cooldownie, minimalny wybór wariantu musi być persistowany albo deterministycznie odtwarzalny.

Nie persistować runtime NPC/world object refs.

## Cooldown / repetition

RPG matrices są szczególnie podatne na powtarzalność.

Reuse shared history/cooldown mechanism z 016, jeśli istnieje.

Minimalne reguły:

- ten sam matrix nie pojawia się wielokrotnie jednocześnie w jednej osadzie,
- completed matrix nie powinien natychmiast pojawić się ponownie z tym samym zestawem NPC/source,
- preferować inną matrix/source przy kolejnej generacji.

Nie budować procedural narrative memory systemu.

## Shared opportunity layer

017 ma rozszerzyć landed opportunity mechanism z 016, nie tworzyć równoległego systemu.

Jeżeli 016 posiada origin/kind discriminator, użyć go. Jeżeli nie, dodać najmniejszy potrzebny discriminator dopiero wtedy, gdy shared selection naprawdę go wymaga.

Docelowo ownership pozostaje:

```text
world/domain systems own world state
matrix builders own authored scenario composition
shared opportunity layer owns candidate selection lifecycle
QuestManager owns runtime quest progress
```

## Relevant files / systems

Przed implementacją zweryfikować:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/QuestManager.test.ts
src/app/createApp.ts

landmark quest builders
world location/discovery
world containers/items

settlement registry/definitions
NPC stable identity from quests-progression-015

opportunity/materialization system from quests-progression-016

inventory interaction / handoff paths
quest rewards/consequences
reputation/renown
quest persistence
```

Dodatkowo przejrzeć implementation notes dla:

```text
quests-progression-005 authored RPG quests
quests-progression-009 world/discovery objectives
quests-progression-015 stable NPC identity
quests-progression-016 world-driven opportunities
```

Aktualny kod ma pierwszeństwo nad planami i wcześniejszymi notes.

## Existing design to preserve

`quests-progression-005` już potwierdził, że authored RPG stories mogą działać przez obecny runtime bez:

- quest chain managera,
- generic dialogue tree,
- condition DSL,
- scripting engine.

017 ma rozszerzyć ten kierunek na contextual procedural materialization, nie zastąpić go nową architekturą.

## Proposed modules

Dopasować po reconie do landed 016.

Preferowany kierunek:

```text
src/quests/opportunities/
  ...
  rpgQuestMatrices.ts
  rpgQuestMaterialization.ts
```

albo scenario-specific builders:

```text
buildOldPlaceSecretQuest(...)
buildSuspiciousTransportQuest(...)
buildSettlementAgreementQuest(...)
```

Jeżeli zwykłe funkcje są wystarczające, nie tworzyć dodatkowej klasy/frameworku.

## Implementation order

### Phase 1 — dependency preflight

1. Sprawdzić status i landed contract `quests-progression-015`.
2. Sprawdzić status i landed contract `quests-progression-016`.
3. Zidentyfikować shared candidate/materialization/selection seam.
4. Sprawdzić persistence reconstruction generated definitions.
5. Nie implementować lokalnych fallbacków dla brakującego contractu dependency.

### Phase 2 — Sekret starego miejsca

6. Zidentyfikować eligible existing landmark/location kinds.
7. Zaimplementować lightweight eligibility candidate.
8. Zaimplementować deterministic source selection.
9. Zmaterializować `Sekret starego miejsca` dopiero po shared selection.
10. Zweryfikować save/load i duplicate prevention.

### Phase 3 — wybór drugiego vertical slice

11. Wykonać bounded recon transport item/handoff oraz cross-settlement stable selection.
12. Wybrać matrix z najmniejszą liczbą brakujących domain seams:
    - `Podejrzany transport`, albo
    - `Umowa między osadami`.
13. Zaimplementować drugi pełny vertical slice.

### Phase 4 — opcjonalna trzecia matrix

14. Wdrożyć pozostałą matrix tylko jeśli wymagane mechanizmy domenowe już istnieją.
15. Jeśli nie — zapisać konkretny blocker/dependency i nie budować workaroundu wewnątrz quest layer.

### Phase 5 — repetition/shared selection

16. Reuse/rozszerzyć cooldown/history z 016.
17. Dodać matrix/source duplicate guards.
18. Zweryfikować selection przy jednoczesnych world-driven opportunities.
19. Regression tests.

## Tests

### Eligibility vs materialization

Pokryć osobno:

```text
no real source
→ no candidate

eligible real source
→ stable lightweight candidate

selected candidate
→ QuestDef materialized
```

Niewybrany candidate nie powinien wymagać tworzenia pełnego `QuestDef`.

### Deterministic materialization

Dla identycznego świata:

```text
same seed
same settlement
same history
→ same matrix/source refs
→ same QuestDef.id
→ same NPC targets
```

### Duplicate NPC names

Pokryć cross-settlement case z identycznymi display names. Quest musi wskazać właściwe stable IDs.

### Sekret starego miejsca

Pokryć:

- real eligible place,
- stable source ID,
- no eligible place → no candidate,
- discovery/interact objective kończy się normalnym QuestManager path,
- save/load nie zmienia miejsca.

### Podejrzany transport

Jeśli matrix zostanie wdrożona, pokryć:

- real supported item/handoff/container source,
- choice A/B daje właściwy outcome,
- outcomes nie są wykonywane dwukrotnie,
- item handling używa normalnego inventory/world path,
- brak fake quest-owned parcel state.

### Umowa między osadami

Jeśli matrix zostanie wdrożona, pokryć:

- giver i target są w różnych osadach,
- target selection jest deterministic,
- selection nie zależy od current stream state,
- stream-out/in target settlement nie zrywa quest identity,
- duplicate display names nie powodują kolizji,
- save/load zachowuje ten sam target settlement/NPC.

### Opportunity coexistence

Jeżeli shared selection z 016 istnieje:

```text
world-driven candidate
+
RPG candidate
→ deterministic shared selection
```

RPG candidate nie powinien wypierać realnego pilnego world-driven problemu wbrew priority contract 016.

## Performance

Matrices są zbierane/materializowane rzadko.

Nie wykonywać:

- per-frame world scans,
- pełnego skanowania wszystkich NPC wszystkich settlements,
- nieograniczonych nearest-landmark searches,
- dynamicznego pathfindingu tylko do selection,
- kosztownego procedural story generation.

Preferować:

- bounded settlement-level candidate lists,
- stable registries/definitions,
- deterministic lookup,
- existing spatial/world query helpers.

## No new domain mechanics guardrail

017 może:

- wybierać istniejących NPC,
- wybierać istniejące miejsca,
- używać istniejących items/containers,
- używać istniejącego inventory/handoff path,
- używać istniejących social consequences,
- używać istniejącej shared opportunity layer.

017 nie powinien tworzyć:

- diplomacy simulation,
- faction system,
- inter-settlement economy,
- crime/witness system,
- generic ownership system,
- new landmark generation,
- new item logistics framework,
- missing NPC lifecycle.

Jeżeli konkretny matrix wymaga którejś z tych mechanik, uprościć story do istniejącego domain contract albo wydzielić dependency.

## Non-goals

Plan nie obejmuje:

- world-driven quest source mechanics,
- procedural world problem detection,
- generic quest DSL,
- procedural dialogue generation,
- LLM quest writing,
- dynamic narrative director,
- faction/diplomacy simulation,
- generic quest chains,
- witness/gossip,
- procedural NPC disappearance,
- global economy redesign,
- procedural dungeon system.

## Implementation notes

Podczas implementacji utworzyć:

```text
docs/plans/implementation-notes/quests-progression-017-rpg-settlement-quest-matrices-implementation-notes.md
```

Notes powinny zapisać tylko implementation-relevant findings:

- landed opportunity/materialization contract z 016,
- stable NPC contract z 015,
- exact candidate selection seam,
- exact settlement registry/source,
- eligible landmark/location APIs,
- item/container/handoff APIs użyte przez transport,
- cross-settlement target resolution,
- persistence reconstruction path,
- cooldown/history ownership,
- scenario-specific blockers,
- concrete call-sites.

Nie powtarzać planu.

## JSDoc / preflight

Dodać JSDoc dla ważnych publicznych matrix candidate/materialization functions.

Tam gdzie pomaga discovery:

```text
@domain quests-progression
```

Ownership powinien być jasny:

```text
matrix owns authored scenario composition
world systems own world entities/state
shared opportunity layer owns candidate selection lifecycle
QuestManager owns runtime quest progress
```

## Weryfikacja

AI:

- typecheck,
- focused unit tests,
- deterministic eligibility/materialization tests,
- quest lifecycle regression,
- persistence tests,
- cross-settlement identity tests dla wdrożonego cross-settlement scenario,
- build zgodnie ze standardem repo.

AI nie wykonuje browser verification.

Manualną weryfikację gameplay wykonuje użytkownik.

## Definition of Done

Plan jest zakończony, gdy:

- działa wspólny RPG matrix candidate/materialization seam,
- eligibility jest oddzielona od materialization,
- działa obowiązkowy vertical slice `Sekret starego miejsca`,
- działa co najmniej jeden z dwóch pozostałych vertical slices:
  - `Podejrzany transport`, albo
  - `Umowa między osadami`,
- ewentualna niewdrożona trzecia matrix ma udokumentowany realny blocker/dependency,
- wszystkie wdrożone matrices materializują normalne `QuestDef`,
- korzystają z jednego istniejącego `QuestManager`,
- korzystają ze stable NPC identity z 015,
- reuse'ują shared opportunity/selection lifecycle z 016,
- nie tworzą fikcyjnego domain state,
- cross-settlement selection, jeśli używane, opiera się na trwałych world-independent refs, a nie current stream state,
- selection/materialization jest deterministic,
- save/load odtwarza te same questy i targety,
- duplicate names między osadami nie powodują kolizji,
- RPG candidates współistnieją z world-driven opportunities,
- nie powstał generic procedural quest engine ani quest DSL,
- brakujące mechaniki domenowe zostały wydzielone zamiast zasymulowane wewnątrz quest layer.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
