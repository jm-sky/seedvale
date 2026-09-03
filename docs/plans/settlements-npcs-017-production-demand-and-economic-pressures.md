# Plan: Production Demand and Economic Pressures

**Created:** 2026-09-01  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** settlements-npcs-016  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy` `npc`  
**Tags:** `production` `demand` `pressure` `shortage`
**Roadmap:** `economy-production`  

## Goal

Połączyć rzeczywistą produkcję z istniejącym systemem `Needs → Problems → Pressures → Goals → Strategies`, tak aby istotny brak wymaganego dobra mógł generować konsekwencje w zachowaniu NPC i gospodarce osady.

Docelowy przepływ:

```text
production opportunity
        ↓
required input unavailable
        ↓
persistent production problem
        ↓
economic pressure
        ↓
existing NPC decision / strategy
        ↓
future action
```

Celem nie jest stworzenie osobnego `ProductionAI`, lecz wykorzystanie istniejących mechanizmów problemów, presji, celów i decyzji.

## Current State

`015` zapewnia rzeczywiste wykonywanie `ProductionDef` z walidacją inputów i `ProductionResult`.

`016` dostarcza pierwszy konkretny processing chain, którego shortage może mieć dalsze konsekwencje ekonomiczne.

Istniejące systemy NPC posiadają mechanizmy potrzebne do reprezentowania potrzeb, problemów, presji, celów i strategii. Przed implementacją należy jednak wykonać focused recon tych mechanizmów i dopasować integrację do aktualnych typów, lifecycle i ownership.

Brakuje jawnego połączenia:

```text
production blocked
        ↓
meaningful economic problem
```

Nie należy tworzyć drugiego systemu priorytetów tylko dla produkcji.

## Architectural Goal

Production dostarcza faktyczny stan świata, a istniejący AI interpretuje jego znaczenie.

```text
production state
    ↓
existing problem model
    ↓
existing pressure model
    ↓
existing goal / strategy
    ↓
existing decision / action systems
```

Nie tworzyć równoległego `ProductionAI`, `ProductionProblem`, `ProductionPressure`, `ProductionGoal` ani `ProductionStrategy`, jeżeli istniejące typy mogą wyrazić wymagany stan.

## 1. Focused AI Recon

Przed zmianami zidentyfikować:

- istniejące `Need / Problem / Pressure / Goal / Strategy` types,
- ich ownership i lifecycle,
- mechanizm tworzenia, aktualizacji i rozwiązywania problemów,
- punkt integracji z NPC decision evaluation,
- istniejące persistence,
- istniejące akcje mogące rozwiązywać shortage.

Plan implementation powinien wykorzystać istniejące mechanizmy zamiast projektować ich alternatywne wersje.

## 2. Persistent Production Shortage

Nie każdy pojedynczy `ProductionResult` powinien tworzyć problem NPC.

Rozróżnić:

```text
single failed attempt
```

od:

```text
persistent inability to obtain required input
```

Problem powinien reprezentować rzeczywisty, nadal istniejący shortage, a nie chwilowy race condition.

## 3. Economic Relevance

Sam brak inputu nie musi automatycznie oznaczać wysokiej presji.

Presja powinna zależeć od znaczenia shortage w istniejącym systemie, np.:

```text
production importance
shortage severity
duration
downstream dependency
available alternatives
```

Nie tworzyć nowej ekonomicznej wyceny ani dynamic pricing.

Jeżeli istniejący model nie obsługuje któregoś z tych wymiarów, implementować tylko minimalny zakres potrzebny do rozróżnienia istotnego shortage od chwilowego braku.

## 4. Problem Identity and Deduplication

Wielokrotne nieudane próby tej samej produkcji nie powinny tworzyć wielu problemów.

Problem musi mieć stabilną tożsamość zgodną z istniejącym problem model, np. przez odpowiednią kombinację producenta/household, inputu i kontekstu produkcji.

Dokładny key należy dopasować do istniejących conventions zamiast tworzyć osobny globalny registry.

## 5. Pressure Integration

Aktywny, istotny shortage powinien wpływać na istniejący pressure evaluation.

```text
shortage
    ↓
existing pressure
    ↓
decision weighting
```

Nie tworzyć nowego priority system.

Pressure nie powinno samo wykonywać action ani bezpośrednio sterować produkcją.

## 6. Decision Integration

Istniejący NPC decision flow powinien móc zobaczyć aktywny production shortage jako jeden z inputs decyzji.

```text
existing NPC decision evaluation
        ↓
production shortage pressure
        ↓
existing candidate goals / strategies
```

Jeżeli istniejący system nie posiada odpowiedniego punktu integracji, dodać minimalny adapter.

Nie tworzyć osobnego production AI tick.

## 7. Acquisition Boundary

Ten plan **nie rozwiązuje shortage bezpośrednio**.

Jeżeli istniejące actions/strategies potrafią zdobyć brakujące dobro, mogą zostać wykorzystane przez istniejący decision system.

Jeżeli żadna istniejąca akcja nie potrafi rozwiązać konkretnego shortage, problem może pozostać aktywny.

Nie dodawać specjalnego `AcquireMissingProductionInputAction` tylko na potrzeby tego planu.

Docelowe sposoby rozwiązania mogą obejmować:

```text
gather
trade
retrieve
transport
```

ale ich implementacja należy do odpowiednich systemów.

## 8. Trader and Transport Boundaries

Brak dobra lokalnie nie oznacza, że production może pobrać je z dowolnego miejsca.

```text
good exists elsewhere
        ↓
local production source lacks it
        ↓
production blocked
        ↓
pressure
```

`017` nie wykonuje fizycznego transportu.

Jeżeli `014` zapewnia już lokalny goods/trader mechanism, należy wykorzystać istniejące możliwości, ale nie projektować nowego rynku.

Przyszły transport może rozwiązać shortage:

```text
pressure
    ↓
logistics
    ↓
input available
    ↓
production resumes
```

## 9. Recovery

Pełny cykl jest podstawowym kryterium:

```text
input available
    ↓
production works
    ↓
input becomes scarce
    ↓
production blocks
    ↓
problem appears
    ↓
pressure rises
    ↓
input becomes available
    ↓
problem resolves
    ↓
production resumes
```

System musi poprawnie reagować na odzyskanie dostępności dobra.

Nie pozostawiać rozwiązanych shortage problems jako aktywnych.

## 10. Persistence

Production shortage powinien korzystać z istniejącego persistence model problemów/AI.

Po reloadzie:

- aktywny problem pozostaje aktywny, jeżeli shortage nadal istnieje,
- rozwiązany problem nie wraca bez przyczyny,
- nie powstaje duplikat podczas rekonstrukcji stanu.

Jeżeli istniejący system rekonstruuje problemy ze świata zamiast je zapisywać, wykorzystać tę samą strategię.

## 11. Performance

Nie wykonywać globalnego skanowania:

```text
all NPCs
×
all recipes
×
all resources
```

na każdej klatce.

Shortage powinien być aktualizowany przez istniejący production/work event, relevant stock changes albo low-frequency AI evaluation — zależnie od aktualnej architektury.

Nie dodawać nowego globalnego tickera tylko dla production demand.

## Tests

### Shortage detection

- persistent failed production creates/reuses one problem,
- single transient failure does not create a persistent problem unnecessarily,
- insufficient quantity is represented correctly.

### Deduplication

- repeated failures do not create duplicate problems,
- independent producers can have independent shortages,
- different missing inputs remain distinguishable.

### Pressure

- meaningful persistent shortage affects existing pressure evaluation,
- irrelevant/transient shortage does not create excessive pressure,
- pressure uses existing conventions.

### Resolution

- input becomes available → problem resolves,
- pressure disappears or decays according to existing lifecycle,
- production can resume.

### Decision integration

- existing decision system can observe the shortage,
- existing compatible goals/strategies can respond,
- no separate production AI loop is required.

### Persistence

- active shortage survives reload according to existing persistence model,
- resolved shortage does not reappear incorrectly.

### Regression

- existing production remains functional,
- `016` processing chain remains functional,
- Hunter production remains functional,
- existing Needs/Problems/Pressures remain functional.

## Acceptance Criteria

- Persistent production shortages can be represented using the existing problem model.
- Production failure does not create a new AI subsystem.
- Existing `Needs / Problems / Pressures / Goals / Strategies` remain the primary decision architecture.
- Transient failures do not create persistent noise.
- Repeated failures do not create duplicate problems.
- Meaningful shortages can influence existing NPC decision evaluation.
- Resolving the shortage resolves the corresponding problem/pressure.
- Production becomes eligible again once required input is available.
- Existing trade/goods mechanisms can be used where already supported.
- Missing goods are never magically transported.
- No new physical logistics system is introduced.
- No new dynamic market/pricing system is introduced.
- No global per-frame production-demand scan is introduced.
- No duplicate AI state is created.
- The player is not required for the system to function.

## Out of Scope

- physical goods transport,
- inter-settlement logistics,
- new market system,
- dynamic pricing,
- full Trader AI redesign,
- new trade routes,
- new AI Need category,
- dedicated production acquisition action,
- new production scheduler,
- production UI,
- player crafting,
- economic history redesign.

## Dependency

```text
015 — Economic Production and Input Integration
```

`016` is the first concrete consumer/use case for this mechanism, but `017` should operate on production state established by `015` and must not be architecturally dependent on a particular processing chain.

## Verification

Automated:

- targeted production-demand tests,
- NPC problem/pressure tests,
- production regression tests,
- persistence tests,
- typecheck,
- production build,
- full test suite.

Runtime:

- start with sufficient production input,
- observe successful production,
- deplete the relevant input,
- observe production becoming blocked,
- verify one persistent problem appears,
- verify pressure affects existing NPC decision evaluation,
- restore input availability,
- verify problem/pressure resolves,
- verify production resumes without player intervention.

Manual browser verification remains the player's responsibility.

Implementation should add JSDoc with `@domain settlements-npcs` to important new public architectural functions/classes when needed for preflight discovery.

**Zrób git commit i push do main, rebase jeżeli trzeba**
