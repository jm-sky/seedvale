# Plan: NPC Burial & Graves

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** npc-010
**Domain:** `npc`
**Roadmap:** `npc-professions-households-and-age`  

## Cel

Dodać społeczną reakcję na śmierć NPC oraz możliwość pochówku zmarłego, wykorzystując istniejące persisted `NpcAuthoritativeState`, households, NPC pressures/decisions/plans/actions, relationships, navigation, settlement streaming i world-object persistence.

`npc-011` nie tworzy własnego corpse systemu. Konsumuje faktyczny persisted post-death/corpse contract dostarczony przez `npc-010`.

Docelowy flow:

```text
persisted NPC death/post-death state (npc-010)
  ↓
corpse available for burial
  ↓
relevant NPC becomes aware
  ↓
burial problem/pressure candidate
  ↓
NPC decision + plan/strategy
  ↓
claim corpse
  ↓
approach corpse
  ↓
atomic burial transition
  ↓
persistent grave
```

System ma być niezależny od gracza i kamery. Nie oznacza to dodawania pełnego off-screen executora żywych NPC: wykonanie action chain korzysta z obecnego poziomu symulacji settlement/NPC, a authoritative death/corpse/grave state musi pozostać poprawny przez stream-out, rebuild i save/load.

## Zakres

### 1. Corpse contract z `npc-010`

`npc-010` jest właścicielem authoritative NPC post-death state i corpse lifecycle, rozszerzanego w istniejącym `NpcAuthoritativeState` / `NpcStateSnapshot` i persystowanego przez `SaveData.npcStates`.

`npc-011` ma przejąć z faktycznej implementacji `npc-010` co najmniej semantykę pozwalającą:

- znaleźć aktywny corpse po stabilnym `NpcId`,
- odczytać rzeczywistą death position/lifecycle state,
- rozróżnić active corpse od terminal cleanup/no-active-corpse,
- atomowo claimować/release'ować corpse do burial,
- zablokować natural cleanup podczas ważnego claimu,
- wykonać idempotentny transition `active corpse → buried/terminal`,
- po reconstruction nie odtwarzać już buried corpse.

Nie projektować równoległego `NpcCorpseManager`, drugiego corpse registry ani corpse-only save path.

### 2. Death awareness

Awareness ma być settlement/local-context-driven, nie globalne.

Preferowane źródła kandydatów:

1. członkowie tego samego household/family,
2. NPC z istniejącą relacją/rolą uzasadniającą reakcję,
3. inni lokalni NPC tylko jeżeli aktualny model decyzji/relacji daje ku temu rzeczywisty powód.

Nie tworzyć globalnego „everyone knows every death” event busa.

Awareness nie musi być osobnym persisted memory systemem. Jeżeli burial eligibility/problem można deterministycznie odtworzyć z persisted corpse state + household/relationship state, preferować re-derivation po stream/reload zamiast duplikowania knowledge flags.

### 3. Burial jako problem/pressure, nie `NeedId`

Aktualny `NpcPlan` jest związany z `NeedId` (`goalForNeed()` / `needForGoal()`), a top-level arbitration ma już wiele producerów pressure (`Needs`, weather, healing).

Burial nie jest fizjologiczną potrzebą i nie może dostać sztucznego `NeedId`.

Dodać minimalny social/world-problem pressure candidate do istniejącej arbitrażowej ścieżki. Po wybraniu burial może używać zwykłego persistent Plan/strategy/action lifecycle, ale plan/goal musi istnieć niezależnie od `goalForNeed()`.

Nie tworzyć `BurialManager`, osobnego burial scheduler ani burial-only scoring engine.

### 4. Eligibility i odpowiedzialność

Corpse kwalifikuje się do burial tylko jeśli:

- `npc-010` nadal raportuje aktywny, buryable corpse,
- corpse nie jest terminal/removed/buried,
- istnieje odpowiedni NPC z realnym lokalnym kontekstem społecznym,
- action jest wykonalna na aktualnym poziomie symulacji.

Wybór wykonawcy powinien korzystać z istniejących danych: household/family, NPC↔NPC relationship, rola, aktywne zobowiązania/plan, dystans i dostępność.

Nie zakładać „najbliższy zawsze grzebie” ani „każdy zmarły musi mieć grave”.

### 5. Persistent burial plan

Jeżeli burial wygra arbitration, NPC może dostać persistent plan typu `buryDeceased` (lub równoważny), niezależny od `NeedId`.

Plan przechowuje tylko minimalne identity/context potrzebne do ponownej walidacji, przede wszystkim stable deceased/corpse identity z `npc-010`.

Nie kopiować corpse lifecycle, position, loot ani burial flags do `NpcPlan`.

Plan zapisuje się przez już istniejący persisted `activePlan` w `NpcStateSnapshot`; zmiana jego unionów/semantyki musi przejść przez aktualny save-schema validation/migration contract.

### 6. Claim / coordination

Wymaganie:

```text
one corpse
→ at most one active burial claim
→ at most one successful burial transition
→ at most one grave
```

Claim/reservation powinien żyć w authoritative post-death state należącym do `npc-010`, nie w transient `NpcAgent` ani globalnym lock managerze.

Przy wykonaniu zawsze rewalidować claim i corpse state. Claim musi być zwalniany przy cancellation/obsolete plan/reconstruction, zgodnie z kontraktem ustalonym przez `npc-010`.

### 7. Action lifecycle i navigation

Burial jest zwykłym action chain opartym o istniejące `PlannedAction` / `ActionLifecycle` i `NpcAgent` FSM:

```text
resolve corpse + claim
→ resolve approach destination
→ goTo
→ execute timed interaction
→ atomic burial transition
→ create grave on success
```

Nie dodawać pathfindingu ani burial-specific FSM. Nie teleportować NPC do corpse w zwykłym execution flow.

Jeżeli corpse zniknie, claim przepadnie, plan stanie się obsolete lub destination będzie nieosiągalny, użyć istniejącego cancel/failure/replanning lifecycle i nie pozostawiać NPC w nieskończonym stanie.

### 8. Atomic burial transition i idempotencja

Finalizacja burial nie może być luźną sekwencją niezależnych zapisów typu „usuń corpse, potem spróbuj grave”.

Potrzebny jest wąski, idempotentny contract pomiędzy `npc-010` i `npc-011`, który pozwala dokładnie raz rozstrzygnąć corpse jako buried/terminal. Grave creation musi być powiązana z tym transition w sposób odporny na failure/retry/reload.

Po udanym burial:

- corpse nie wraca po settlement reload / `WorldBundle` rebuild / save-load,
- natural decay nie wykonuje ponownego cleanup consequence,
- drugi executor nie może zakończyć burial dla tego samego deceased,
- istniejący grave nie jest regenerowany z samego `health.dead`.

### 9. Grave jako persistent world object

Grave jest world state, nie NPC state.

Minimalny record:

- stable grave ID,
- world position/yaw tylko jeśli potrzebny prezentacji,
- stable deceased `NpcId` / death reference,
- burial/creation time tylko jeśli istniejąca semantyka world-time tego wymaga.

Nie duplikować corpse lifecycle ani household data.

Graves mają korzystać z istniejącego wzorca persistent world objects: runtime collection owned przez `WorldBundle` + `SaveData` field + create/rebuild carry + save/load restore.

Dodanie grave field do `SaveData` wymaga normalnego version bump, migration, validatorów i testów. Nie używać opcjonalnego pola jako obejścia migration pipeline.

### 10. Save/load i rebuild contract

Aktualny NPC health/death oraz `activePlan` już są persisted przez `SaveData.npcStates`. `npc-010` ma rozszerzyć ten sam snapshot o post-death/corpse state.

`npc-011` nie ma więc „dodać persistence NPC”. Ma zachować jeden ownership boundary:

```text
NpcStateSnapshot
→ dead/postDeath/corpse/claim truth

SaveGrave[] / grave collection
→ completed burial world result
```

Po load/rebuild trzeba rozstrzygnąć stan z authoritative records, nie z obecności mesh/runtime action:

- active corpse + brak grave → może ponownie wygenerować burial pressure,
- active corpse + stale/transient executor → action execution zaczyna się świeżo po normalnej rewalidacji,
- buried/terminal corpse + grave → nic nie wykonuje się ponownie,
- terminal/no-active-corpse bez grave → nie fabrykować burial/grave.

### 11. Streaming i off-screen behaviour

`SettlementsManager` aktualnie tickuje tylko loaded settlements; `NpcAgent` execution state (`phase`, `pendingAction`, pathfinding) nie jest persisted.

Dlatego `npc-011` nie dodaje fikcyjnego pełnego off-screen walking/action executora.

Wymagania są następujące:

- corpse/post-death truth nie zależy od mesh ani loaded settlement,
- grave truth nie zależy od loaded settlement,
- persistent burial plan/claim nie może prowadzić do duplikacji po reconstruction,
- jeżeli executor streamuje out w trakcie akcji, po stream-in/reload action jest rewalidowana/replanowana z authoritative state zamiast „wznawiania pathfindingu”,
- istniejące future adaptive/off-screen simulation może później konsumować te same contracts bez zmiany ownership.

### 12. Household / relationships

Household/family mapping i `NpcRelationships` są już stabilnymi źródłami social context i są persisted/reconstructed niezależnie od aktywnego `NpcAgent`.

Można ich użyć do awareness/responsibility, ale nie dodawać w tym planie:

- grief/mourning,
- inheritance,
- funeral ceremonies,
- household restructuring,
- legal ownership system.

Po burial nie jest wymagany osobny persisted „memory of funeral”, jeśli istniejący grave + dead NPC + relationship/household state wystarczają do przyszłych systemów.

## Ownership

```text
HealthState
  → alive/dead source of truth

NpcAuthoritativeState / NpcStateRegistry (npc-010 extension)
  → persisted post-death/corpse/claim state

Household / families / NpcRelationships
  → local social context / responsibility inputs

NPC pressure + decision + Plan
  → chooses burial work and preserves intent

NpcAgent + PlannedAction / ActionLifecycle
  → loaded-settlement execution only

Grave world-object collection / WorldBundle
  → persistent completed burial result

SaveData + migrations
  → serialization of both existing NpcStateSnapshot extension and graves
```

## Contracts pozostawione `npc-010`

`npc-011` nie ustala nazw API, ale implementacja `npc-010` musi przed rozpoczęciem 011 dostarczyć jednoznaczne odpowiedzi na:

1. Jak rozpoznać active/buryable corpse vs terminal/no-active-corpse?
2. Jaka jest stable identity corpse — czy wystarcza `NpcId`, czy istnieje dodatkowe death/corpse id?
3. Jak atomowo acquire/release burial claim i jak jest on persisted?
4. Jak claim blokuje natural decay/cleanup?
5. Jak wykonać idempotentny terminal transition oznaczający burial bez tworzenia grave po stronie `npc-010`?
6. Jak rozstrzygać stale claim po reconstruction/crash/save-load, skoro runtime executor nie jest persisted?

`npc-011` ma dopasować się do faktycznej implementacji tych kontraktów, nie odwrotnie.

## Debug

Rozszerzyć istniejące NPC/world debug facilities o minimum:

- deceased NPC id + corpse state z `npc-010`,
- awareness/eligibility result,
- burial pressure/decision/plan,
- claim owner/state,
- action lifecycle/cancellation reason,
- burial transition result,
- grave id/location,
- reload/rebuild reconstruction result.

Nie tworzyć osobnego debug frameworka.

## Verification

### Social / decision

1. Relevant household member może dostać burial candidate.
2. NPC bez social reason nie dostaje automatycznie burial.
3. Burial nie jest `NeedId`.
4. Existing pressure arbitration nadal rozstrzyga między burial a innymi aktywnościami deterministycznie.

### Claim / action

1. Dwóch NPC nie utrzymuje skutecznie tego samego claimu.
2. Claim jest rewalidowany przed execution.
3. Unreachable/disappeared/decayed corpse kończy action bez stuck state.
4. Stream-out/reconstruction nie wznawia transient path state i nie duplikuje action consequence.

### Burial / grave

1. Udany burial wykonuje dokładnie jeden corpse terminal transition.
2. Powstaje dokładnie jeden grave.
3. Corpse nie wraca po reload/rebuild.
4. Grave nie powstaje ponownie z `health.dead` ani z reconstruction planu.
5. Failure pomiędzy validation a finalization nie zostawia dwóch źródeł prawdy.

### Persistence

1. `NpcStateSnapshot` post-death/claim state round-tripuje przez save/load zgodnie z implementacją `npc-010`.
2. Burial `activePlan` round-tripuje bez fake `NeedId`.
3. Graves round-tripują przez `SaveData` i `WorldBundle` rebuild.
4. Migration starych save'ów nie fabrykuje graves ani burial dla legacy dead NPC bez aktywnego corpse.
5. Stale claim po load/rebuild ma deterministyczną recovery rule.

### Regression

Podczas implementacji uruchomić focused NPC/persistence/world-object tests i build. Dodać testy dla claim idempotency, duplicate executors, save/load/rebuild oraz grave uniqueness.

Nie uruchamiać `pnpm docs:sync` ręcznie — robi to GitHub workflow.

## Poza zakresem

- combat feedback — `npc-009`,
- NPC death/corpse creation/decay/loot — `npc-010`,
- grief/mourning/funeral ceremony,
- inheritance,
- household restructuring,
- player-only burial quest,
- global death/memory registry,
- nowy pathfinding/navigation system,
- pełny unloaded-settlement NPC executor,
- legal ownership/reputation consequences,
- osobny corpse/grave manager posiadający state NPC.

## Powiązane plany

- **007 — Interaction Destination Approach**
- **009 — NPC Combat Feedback**
- **010 — NPC Death & Corpse Lifecycle**

> **Zrób git commit i push do main, rebase jeżeli trzeba**
