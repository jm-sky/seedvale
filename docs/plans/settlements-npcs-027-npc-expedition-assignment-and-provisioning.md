# Plan: NPC expedition assignment and provisioning

**Created:** 2026-09-08
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** settlements-npcs-026
**Domain:** `settlements-npcs`
**Subdomains:** `logistics` `household`
**Tags:** `expedition` `staffing` `provisioning` `assignment`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

> **Draft note:** ten plan jest wstępnym szkicem fundamentu pod ekspedycję NPC. Przed zmianą statusu na `planned` wymaga osobnego review aktualnego kodu, ustalenia candidate/staffing/provisioning contracts oraz poprawek wynikających z tych ustaleń. Nie implementować bez tego review.

## Goal

Dostarczyć reusable world mechanism, dzięki któremu mother/sponsoring settlement może deterministycznie wybrać i przygotować grupę realnych istniejących NPC do długiej ekspedycji.

Pierwszym use case jest wysłanie **3 NPC** do odległej lokalizacji w roadmapie opuszczonej kopalni. Plan nie implementuje questa, kopalni ani kolonii.

## Core invariants

```text
current settlement population
+ current authoritative NPC state
+ staffing safety
+ deterministic eligibility/ranking
+ real available equipment
↓
persistent expedition assignment
↓
3 existing NPC identities with real personal inventories
```

Nie:

- rezerwować trzech UUID podczas worldgen,
- spawnąć replacement człowieka przy rozpoczęciu questa,
- tworzyć questowych proxy NPC,
- wybierać martwego lub niezdolnego do wymaganej podróży NPC,
- niszczyć krytycznej obsady mother settlement.

## Existing fields confirmed during recon

Candidate selection może korzystać z rzeczywistych danych:

- gender: `male | female`,
- `age`,
- `CharacterDef.role`, w tym istniejący `miner`,
- authoritative health/death state,
- physical profile/SPEA: `strength`, `perception`, `endurance`, `agility`,
- settlement-scoped NPC identity,
- household/home relationships tam, gdzie potrzebne do staffing constraints.

Nie wymyślać `miningSkill`, `fit`, `healthy`, nowych traits ani nowych profession fields.

## Candidate eligibility

### Hard eligibility

Przed rankingiem kandydat musi:

- być członkiem population sponsor settlement,
- istnieć jako realny NPC identity,
- być żywy,
- spełniać minimalny adulthood/work/travel contract potwierdzony podczas review,
- nie należeć już do aktywnego incompatible assignment,
- móc zostać usunięty z bieżącej workforce bez złamania staffing-safety contract.

Nie zakładać osobnego `incapacitated` boolean, jeśli kod nadal go nie posiada. Eligibility ma wynikać z istniejącego authoritative health/physical state albo małego jawnego helpera nad tym stanem.

## Deterministic candidate hierarchy

Preferowany baseline:

```text
Tier 1: male, age 18–35, role === 'miner'
Tier 2: male, age 18–35
Tier 3: male, age 36–45
```

W obrębie tieru:

1. odfiltruj hard-ineligible,
2. odfiltruj kandydatów naruszających staffing safety,
3. opcjonalnie użyj istniejących `strength`/`endurance` jako jawnych tie-break signals tylko jeśli review uzasadni ich znaczenie,
4. finalny tie-break musi być stabilny i deterministyczny, oparty na istniejącej identity/order, nie `Math.random()`.

Nie wybierać z góry konkretnych osób przy worldgen.

## Atomic party resolution and fallback

Resolver ma oceniać pełną trójkę jako jeden dispatch decision.

Przed finalizacją assignment:

```text
resolve current candidates
→ validate all 3 still eligible
→ validate settlement after removing all 3
→ reserve/commit assignment atomically
```

Jeżeli kandydat umrze lub stanie się niekwalifikujący **przed commit/dispatch**, ponownie uruchomić deterministic resolver na aktualnym stanie.

Po commit nie podmieniać członka po cichu innym NPC. Późniejsza śmierć członka jest zdarzeniem ekspedycji, nie pre-dispatch fallback.

## Staffing safety

Plan ma zdefiniować mały reusable contract typu koncepcyjnego:

```text
canReleaseNpc(settlement, npcId, pendingReleasedIds)
canDispatchParty(settlement, npcIds)
```

Nie budować pełnego runtime workforce managera w tym planie.

Podczas review sprawdzić stan `settlements-npcs-023-profession-staffing-and-settlement-composition` i wykorzystać jego faktyczne guarantees, jeśli będzie już zaimplementowany.

Safety powinna co najmniej uwzględniać:

- rzeczywistą liczbę active adults po dispatch,
- reserved/forced inhabitants lub role, których aktualny system nie pozwala bezpiecznie usunąć,
- minimalną profession coverage faktycznie zdefiniowaną przez wdrożony staffing system.

Nie traktować planowanych reguł z 023 jako istniejącego runtime contractu przed ich implementacją.

## Mother settlement population

Ten plan **nie zwiększa worldgen population** tylko po to, aby zawsze znaleźć trzech kandydatów.

Sponsor settlement może być eligible tylko wtedy, gdy aktualna population/workforce pozwala na dispatch.

Jeżeli review/testy pokażą, że aktualny worldgen praktycznie nigdy nie tworzy settlement z odpowiednią nadwyżką, należy poprawić generation/staffing w jego authoritative systemie lub utworzyć osobny plan. Nie seedować quest-specific ludzi.

## Persistent expedition assignment

Assignment ma być world-owned plain data, nie closure/action należące do `NpcAgent`.

Minimalne dane do rozważenia podczas review:

- stable assignment ID,
- sponsor settlement ID,
- destination world/location reference,
- ordered member NPC IDs,
- lifecycle state,
- provisioning status,
- timestamps potrzebne do idempotency.

Nie dodawać travel/path state — należy do kolejnego planu.

## Lifecycle

Preferować mały lifecycle:

```text
forming
  ↓
provisioned
  ↓
ready/departing
```

Dokładne states ustalić podczas review tak, aby nie dublowały travel lifecycle z `settlements-npcs-028`.

Repeated dispatch/reload nie może utworzyć drugiego assignment dla tego samego commitment.

## Provisioning

Każdy członek ekspedycji ma dostać realne wyposażenie do personal inventory z `settlements-npcs-026` **przed wyruszeniem**.

Provisioning jest transactional:

```text
authoritative source storage
→ validate complete required loadout
→ transfer real items/instances
→ NPC personal inventory
→ mark member/assignment provisioned
```

Brak itemu nie może być naprawiany przez `inventory.add()` tworzące go znikąd.

## Initial expedition loadout target

Podczas review potwierdzić dokładny source i quantities. Plan ma używać istniejących kinds/instances, m.in.:

- `pickaxe`,
- `knife`,
- `shovel`,
- `tent`,
- `blanket`,
- `dried_meat` i/lub `dried_fish`,
- `firestarter`,
- `bandage`,
- właściwy istniejący waterskin liquid-container instance.

Nie wymyślać `medical_kit`, `expedition_food`, `water_bottle` itp.

### Per-NPC vs shared gear

Domyślny kierunek use case mówi, że każdy NPC ma własny realny ekwipunek ekspedycyjny. Podczas review rozstrzygnąć, które items są faktycznie per-NPC, a które mogą być wspólnym wyposażeniem grupy. Nie wprowadzać group inventory bez wyraźnej potrzeby — preferować ownership przez konkretnego NPC.

## Provisioning source

Nie zakładać arbitralnie, że dowolny `Household.items` jest magazynem sponsor settlement.

Review ma ustalić najmniejszy authoritative source zgodny z aktualną gospodarką/storage. Jeżeli potrzebne jest kilka źródeł, provisioning powinien składać transfery bez tworzenia nowego równoległego stock systemu.

## Failure semantics

### Not enough candidates

Assignment pozostaje nieutworzony / forming. Quest lub caller dostaje jawny failure reason. Nie spawnować NPC.

### Staffing unsafe

Nie dispatchować częściowej grupy.

### Missing equipment

Nie rozpoczynać podróży. Nie tworzyć brakujących itemów.

### Candidate death before commit

Re-resolve current candidates deterministycznie.

### Candidate death after commit

Nie robić automatycznego replacement. Travel/expedition lifecycle obsłuży konsekwencję później.

## Persistence and idempotency

Assignment musi przeżyć:

- settlement streaming,
- `NpcAgent` reconstruction,
- WorldBundle rebuild, jeśli nadal jest istotnym boundary,
- save/load.

Repeated restoration nie może:

- ponownie wybrać party,
- ponownie pobrać equipment,
- zmienić member IDs,
- ponownie oznaczyć tych samych NPC jako available.

## Relationship with households/home/membership

Dispatch nie zmienia jeszcze formalnie settlement membership/home ani household identity.

NPC pozostaje tą samą osobą należącą do mother settlement podczas ekspedycji. Formalne relocation do przyszłej kolonii jest osobnym późniejszym zakresem.

Nie zmieniać NPC ID na ID destination settlement.

## Non-goals

- global/off-screen travel implementation,
- colony settlement creation,
- relocation/migration membership transfer,
- runtime profession changes,
- quest stages/dialogue/rewards,
- worldgen UUID reservation,
- zwiększanie population specjalnie dla questa,
- expedition combat/encounters,
- camp setup at destination.

## Dependencies and related plans

- `settlements-npcs-026` — authoritative personal belongings,
- `settlements-npcs-023` — generation-time profession staffing/composition; sprawdzić status podczas review,
- istniejące household/work plans — reuse faktycznych constraints,
- `settlements-npcs-028` — będzie konsumentem assignment do travel.

## Verification

Automated tests powinny objąć:

- deterministic selection,
- dokładną hierarchy 18–35 miner → 18–35 male → 36–45 male,
- death-before-commit fallback,
- brak spawn fallback,
- staffing safety dla pełnej trójki,
- atomic provisioning,
- missing-equipment failure,
- save/load/idempotent restoration.

Manual browser verification wykonuje użytkownik; AI nie wykonuje browser verification.

## Documentation

Dla ważnych nowych public/architectural functions/classes dodać JSDoc, gdy pomaga preflight discovery; użyć `@domain settlements-npcs` tam, gdzie pasuje.

> **Zrób git commit i push do main, rebase jeżeli trzeba**