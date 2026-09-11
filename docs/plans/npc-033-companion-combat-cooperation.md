# Plan: Companion combat cooperation

**Created:** 2026-09-11
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** npc-029, npc-032, items-player-027, ~~npc-025~~
**Domain:** `npc`
**Subdomains:** `combat` `behavior` `decision-making` `relationships`
**Tags:** `companions` `expedition` `combat` `mutual-defense` `threats` `equipment`
**Roadmap:** `companions.md`

> **Draft note:** ten plan opisuje roadmapowy slice „Companion combat cooperation”. Przed zmianą statusu na `planned` należy zweryfikować finalne API `npc-029`, `npc-032` i `items-player-027`. `npc-025` jest już wdrożonym foundation dla injury severity. Nie tworzyć companion-specific combat AI, party combat managera ani równoległego threat/damage pipeline.

## Goal

Pozwolić zwykłemu NPC z aktywnym `accompany/follow commitment` sensownie współpracować bojowo z graczem i innymi uczestnikami wyprawy, nadal używając zwykłego NPC combat, threat response, inventory, health/injury i decision pipeline.

NPC powinien móc:

- bronić siebie,
- rozpoznać realne bezpośrednie zagrożenie wobec gracza lub innego uczestnika wyprawy,
- zdecydować, czy pomóc, walczyć, disengage czy uciec,
- użyć normalnie posiadanej broni — także otrzymanej wcześniej od gracza,
- wybrać sensowną combat capability przez shared weapon/mode resolver,
- walczyć przez istniejący `CombatIntent` i `NpcAgent` combat phase,
- krótko ścigać przeciwnika tylko tak długo, jak sytuacja pozostaje lokalnie istotnym zagrożeniem,
- przeżyć injuries/death przez istniejące systemy,
- po walce wrócić do normalnej re-arbitracji,
- po ciężkim urazie, strachu lub overwhelming danger uciec albo jawnie przerwać wyprawę przez shared accompany-continuation lifecycle.

Towarzyszenie zwiększa kontekst do ochrony innych, ale nie daje bezwarunkowego rozkazu walki ani „suicidal loyalty”.

Docelowo:

```text
ordinary NPC
+
active accompany commitment
+
real local hostile threat
+
relationship / commitment context
+
health + injury + personality + usable equipment
        ↓
bounded threat perception
        ↓
protection / self-preservation evaluation
        ↓
response
    ignore / hold
    fight / protect
    disengage
    flee
        ↓
existing CombatIntent + NpcAgent combat execution
        ↓
existing damage / defense / injury / death
        ↓
re-evaluate threat + own state
        ↓
resume accompany
OR
explicitly abandon through shared continuation lifecycle
```

Nie tworzyć:

- `CompanionCombatAI`,
- `PartyCombatManager`,
- `CompanionThreatRegistry`,
- companion-only target selection,
- osobnego combat FSM,
- companion weapon slots,
- companion HP/injury/fear meters,
- persistent party target,
- unconditional loyalty override.

## Current architecture and verified constraints

### NPC combat execution already exists and must remain the executor

`NpcAgent` ma istniejący `combat` phase oraz:

```text
beginCombat(intent: CombatIntent)
cancelCombat()
```

Melee i ranged wykorzystują wspólne lifecycle z `src/combat/`.

`NpcAgent.beginCombat()` celowo nie wybiera:

- powodu walki,
- celu,
- trybu melee/ranged.

Otrzymuje gotowy `CombatIntent` od zewnętrznego decision systemu.

**Implication:** ten plan rozszerza perception/decision/context przed `beginCombat()`. Nie zmienia ownership attack execution.

### `CombatTargetHandle` is already the neutral target seam

`src/combat/combatIntent.ts::CombatTargetHandle` posiada tylko:

```ts
ref
getPosition()
isAlive()
applyDamage()
```

Target owner odpowiada za własne defense/HP/death consequences.

To jest właściwa granica także dla cooperative combat. Nie dodawać `CompanionCombatTarget`, `PartyEnemy` ani nowej hierarchii `Combatant`.

### Current NPC threat response is animal-specific but has the correct shape

`src/ai/npcAnimalThreat.ts` obecnie rozdziela:

```text
senseImmediateAnimalThreat()
→ ImmediateAnimalThreat
→ decideAnimalThreatResponse()
→ defend | flee
```

Decision bierze pod uwagę:

- melee capability,
- ranged capability,
- HP ratio,
- neuroticism.

Brak usable weapon/ammo sprawia, że `defend` nie jest realną opcją.

`NpcAgent.reactToAnimalThreat()` następnie uruchamia zwykły `beginCombat()` albo istniejący flee/wander path.

To jest foundation do rozszerzenia. Nie budować obok drugiego expedition-only threat evaluatora.

### Threat candidates are caller-bounded, not discovered by every NPC

Aktualny animal-threat path dostaje do NPC małą listę `ThreateningAnimalCandidate[]` przygotowaną wyżej w runtime i przekazywaną przez:

```text
gameLoop
→ SettlementsManager.update()
→ Settlement.update()
→ NpcAgent.update()
```

Candidate zawiera już `CombatTargetHandle` do konkretnego zwierzęcia.

Zachować ten wzorzec. Nie skanować całego świata/fauny/NPC osobno dla każdego NPC.

### Equipment is ordinary personal ownership

NPC weapons i defense są rozwiązywane z `NpcAuthoritativeState.personalInventory` przez `src/ai/npcCombat.ts`.

Nie istnieje persistent NPC equipment-slot state.

`items-player-027` definiuje prawidłowy flow:

```text
Player Inventory
→ ownership transfer
→ NPC personalInventory
→ normal NPC action-time selection
```

Broń otrzymana od gracza nie jest „companion weapon”. Staje się zwykłą własnością NPC i musi wejść do tego samego resolvera.

### Current ranged ammo ownership is asymmetric

Bow resolution korzysta z `personalInventory`, ale aktualny ranged combat nadal może konsumować ammo z transient `NpcAgent.carried`.

Player-given ammunition zgodnie z `items-player-027` należy do `personalInventory`.

`npc-033` ma konsumować finalny general resolver z `items-player-027`. Nie kopiować arrows do `carried` i nie tworzyć companion ammo pool.

### Incoming NPC damage is unified, but the full attacker matrix is not

`NpcAgent.applyIncomingCombatDamage()` jest jednym NPC-owned incoming damage entry point dla animal/NPC/player callers:

```text
defense
→ final damage
→ takeDamage()
→ HealthState
→ physicalInjury
→ vigor impact
→ death
```

Jednocześnie neutralny incoming seam **nie oznacza**, że każdy attacker→target kierunek jest obecnie gameplayowo podłączony.

Aktualny stan trzeba traktować jawnie:

```text
player → fauna        implemented
NPC → fauna           implemented
animal → NPC          implemented

NPC incoming damage   structurally accepts animal/NPC/player callers

player → NPC          normal player attack acquisition/delivery is not fully wired
NPC → NPC             execution plumbing is possible, but no general hostile-NPC decision pipeline exists

fauna outgoing damage uses its older separate outgoing-attack path
```

Przed implementacją ponownie zweryfikować tę macierz na aktualnym `main`.

Nie implementować brakującego generic direction jako companion-only workaround.

### Injury/death already have authoritative ownership

Combat damage już prowadzi do:

```text
HealthState
→ physicalInjury
→ derived InjurySeverity
→ effective physical penalties
→ normal healing/recovery
```

NPC death używa zwykłego post-death/corpse/loot lifecycle.

`npc-033` nie dodaje `combatWounded`, `companionCritical`, revive ani drugiego injury state.

### `npc-029` owns accompany lifecycle

Accompany commitment jest source-neutral persistent intent podróży. Combat/flee mogą przerwać follow execution bez automatycznego usuwania commitmentu.

Commitment nie może przechowywać:

- combat target,
- stance,
- aggro table,
- party target,
- squad order,
- transient fight state.

### `npc-032` owns continuation / abandonment integration

`npc-032` rozdziela dwa pytania:

```text
what should NPC do now?
```

od:

```text
is continuing this accompany commitment still viable?
```

Combat-related abandonment musi korzystać z tego samego continuation lifecycle.

`npc-033` nie może tworzyć niezależnego `CombatContinuationEvaluator`, jeżeli finalny `npc-032` udostępnia neutralne `AccompanyContinuationEvaluation`.

## Architectural decisions

### 1. Split perception, response policy and execution

Zachować trzy wyraźne warstwy:

```text
THREAT PERCEPTION
who is genuinely threatening whom?
        ↓
RESPONSE EVALUATION
fight / protect / flee / disengage?
        ↓
EXECUTION
existing CombatIntent / flee movement
```

Nie mieszać target discovery, willingness scoring i attack execution w jednym companion branchu.

### 2. Generalize the immediate threat situation narrowly

Obecny `ImmediateAnimalThreat` reprezentuje tylko threat to self.

Potrzebny jest mały neutralniejszy local combat-threat context, który potrafi odpowiedzieć przynajmniej:

- kto jest agresorem,
- czy zagraża temu NPC,
- czy zagraża istotnemu uczestnikowi wyprawy,
- gdzie znajduje się agresor,
- jaki `CombatTargetHandle` prowadzi do realnego targetu.

Koncepcyjnie:

```ts
type ImmediateCombatThreat = {
  source: CombatTargetHandle
  sourcePosition: { x: number, z: number }
  threatensSelf: boolean
  threatenedParticipant?: {
    ref: SimulationEntityRef
    relation: 'player' | 'expedition-npc'
    position: { x: number, z: number }
  }
  distanceToNpc: number
}
```

Exact shape ma wynikać z finalnych call-sites.

Nie tworzyć globalnego hostility registry, persisted aggro table ani universal combat-query service.

### 3. Existing animal self-defense must remain a specialization of the same rule family

Nie pozostawiać dwóch równoległych polityk:

```text
animal threatens self → old evaluator
animal threatens player → companion evaluator
```

Preferować rozszerzenie/generalizację obecnego `npcAnimalThreat` decision seam tak, aby ordinary self-defense i expedition protection korzystały z tej samej podstawowej fight/flee/self-preservation policy.

Animal-specific candidate production może pozostać animal-specific.

### 4. Protection context modifies willingness; it never commands attack

Active accompany commitment oraz relationship mogą zwiększyć skłonność do ochrony participant.

Nie oznacza to:

```text
participant attacked
→ always attack
```

Fight/protect nadal konkuruje z self-preservation.

NPC może odmówić walki, disengage albo flee, szczególnie gdy jest:

- unarmed,
- out of ammo,
- seriously/critically injured,
- exhausted/collapsing,
- overwhelmed,
- bardzo risk-sensitive.

### 5. Relationship and commitment are context, not a loyalty meter

Player↔NPC relation może zwiększać protection willingness.

Dla innego expedition NPC można użyć istniejącego NPC↔NPC relationship, jeśli jest dostępny bez tworzenia nowego plumbing/managera.

Nie dodawać:

```text
companionLoyalty
partyBond
combatTrust
```

Paid escort również nie oznacza suicidal duty. Voluntary joining również nie daje bezwarunkowej lojalności.

### 6. V1 threat producers should be concrete, not speculative

Pierwszy realny producer to fauna, ponieważ dziś istnieją:

- active human-threat state,
- bounded candidate forwarding,
- animal→NPC damage,
- NPC→animal combat target,
- ordinary defend/flee decision.

Pierwszy slice powinien więc realnie obsłużyć:

```text
animal threatens player
→ nearby accompanying NPC may protect
```

oraz, jeśli participant lookup jest dostępny bez nowego managera:

```text
animal threatens another expedition NPC
→ nearby participant may protect
```

Hostile NPC/bandit producer może później wpiąć się w ten sam neutral threat shape. Nie implementować bandit AI tylko po to, aby „udowodnić” generalność.

### 7. Real hostility is required; proximity is insufficient

NPC nie może atakować neutralnego aktora tylko dlatego, że stoi blisko gracza.

Protection wymaga authoritative hostility/threat signal, np. istniejący attacker target/attack state.

Samo:

```text
distance < X
```

nie jest dowodem zagrożenia.

### 8. Player-caused aggression does not imply automatic support

Jeśli gracz sam zaatakuje neutralny target, accompany nie może automatycznie znaczyć „pomóż graczowi”.

V1 nie potrzebuje morality/crime systemu.

Jeżeli current APIs nie potrafią wiarygodnie rozróżnić tej sytuacji, ograniczyć concrete V1 protection producer do jasno hostile animal threats zamiast zgadywać intencję.

### 9. Target selection stays bounded and local

Nie tworzyć tactical target managera.

Jeśli kilka realnych threatów jest aktywnych, deterministic target selection może użyć małego zestawu sygnałów:

1. threat to self,
2. direct attacker of protected participant,
3. immediacy/distance,
4. target alive/valid,
5. stable tie-breaker.

Nie skanować route/world, nie liczyć globalnej aggro wartości i nie budować party focus fire.

### 10. „Overwhelmed” must be cheap and bounded

Nie budować estimatorów „kto wygra walkę”.

V1 może używać istniejących lokalnych sygnałów, np.:

- number of active immediate threats in the bounded candidate set,
- health ratio,
- derived injury severity,
- current usable weapon/ammo capability,
- stamina/vigor collapse state,
- neuroticism/risk sensitivity.

Jeżeli wiarygodny sygnał nie istnieje, użyć neutralnego defaultu zamiast route/combat simulation.

### 11. Weapon ownership and weapon selection remain general NPC mechanics

Player-given weapon:

```text
player transfer
→ NPC personalInventory owns item
→ normal combat capability resolver sees it
```

Nie przechowywać:

```text
expeditionWeapon
equippedByPlayer
companionWeapon
```

`npc-033` ma konsumować shared weapon-selection contract z `items-player-027`.

### 12. Weapon/mode choice should be sensible and shared

Aktualny self-defense path preferuje ranged, jeśli ranged capability istnieje, inaczej melee.

To może być zbyt uproszczone dla cooperative combat.

Przykład:

```text
wolf 1 m away
NPC owns bow + sword
```

nie powinien automatycznie oznaczać bow tylko dlatego, że arrows istnieją.

Jeżeli `items-player-027` nie wyodrębni jeszcze odpowiedniego resolvera, wydzielić mały **general NPC combat capability/mode resolver** używany przez ordinary self-defense i expedition protection.

Uwzględniać tylko realne istniejące dane, np.:

- target distance,
- melee/ranged effective range,
- ammo availability,
- weapon suitability/stats,
- deterministic tie-break.

Nie budować tactical loadout planner.

### 13. Combat execution remains unchanged after response selection

Po decyzji fight/protect:

```text
selected target + mode
→ CombatIntent
→ NpcAgent.beginCombat()
→ existing melee/ranged lifecycle
```

Nie dodawać companion branches do melee hit resolution, projectile logic, defense resolver czy `HealthState`.

### 14. Cooperative combat needs bounded continuation/disengagement

Obecny combat executor może podążać za żywym targetem dopóki intent pozostaje aktywny.

W expedition context NPC nie może ścigać jednego wilka bez końca daleko od grupy.

Potrzebna jest bounded revalidation odpowiadająca:

> czy ten combat intent nadal jest uzasadniony aktualną sytuacją zagrożenia?

Przykładowe warunki zakończenia:

- target przestał być realnym threatem,
- threat oddalił się materialnie od expedition locality,
- protected participant nie jest już zagrożony,
- NPC stał się seriously/critically injured,
- local threat set stał się overwhelming,
- target jest invalid/dead — istniejące combat lifecycle już to obsługuje.

### 15. Do not equate chase with one raw distance threshold

Nie implementować:

```text
distanceFromPlayer > 10
→ cancel combat
```

Krótki pursuit może być sensowny, jeśli threat nadal zagraża grupie albo samemu NPC.

Preferować mały contextual pursuit budget/hysteresis oparty na:

- real threat validity,
- locality relative to protected actor/accompany target,
- bounded separation,
- current self-preservation state.

Nie tworzyć globalnego `ChaseSystem`.

### 16. Combat policy must be re-evaluable without rescoring every frame

Existing attack lifecycle pozostaje execution ownerem.

Re-evaluate response/continuation na bounded meaningful boundaries, np.:

- throttled interval,
- accepted hit / injury severity change,
- active threat-set change,
- protected actor threat ends,
- target leaves local relevance.

Nie uruchamiać pełnego scoringu każdej klatki per NPC.

### 17. Flee reuses existing movement

`flee` pozostaje zwykłym NPC response i korzysta z istniejącego movement/wander stack.

Jeśli wiele threatów jest aktywnych, ewentualny kierunek ucieczki powinien pochodzić z małego shared local-threat resolvera, nie companion navigation.

### 18. Flee and expedition abandonment are separate decisions

```text
combat flee
→ immediate tactical survival response
```

nie jest tym samym co:

```text
end accompany commitment
→ long-lived expedition decision
```

NPC może:

```text
flee
→ threat resolves
→ calm / re-arbitrate
→ resume accompany
```

albo:

```text
severe injury / overwhelming danger / inability to continue
→ flee/disengage
→ npc-032 continuation evaluation
→ abandon
→ npc-029 ends commitment
→ generic return travel
```

Nie kasować commitmentu bezpośrednio w flee code.

### 19. Combat abandonment must reuse `npc-032`

Finalny `npc-032` powinien być jedynym shared continuation/viability boundary.

`npc-033` może dostarczyć combat-relevant inputs/reasons, np.:

- `serious_injury`,
- `critical_injury`,
- `overwhelmed`,
- `unable_to_defend`,
- `severe_fear`,
- `repeated_danger`,

ale nie powinien posiadać drugiego lifecycle.

Exact reason vocabulary dopasować do finalnego `npc-032`/`npc-029` API zamiast tworzyć z góry osobny enum.

### 20. Ordinary combat interruption does not end accompaniment

Normalna walka, hit albo pojedynczy flee nie kończą commitmentu automatycznie.

Commitment kończy się dopiero przez jawny lifecycle decision.

### 21. Injury affects decisions through existing severity/effective state

Combat hit:

```text
accepted damage
→ physicalInjury
→ InjurySeverity
→ effective physical penalties
```

Protection/self-preservation evaluation powinno czytać ten sam state.

Nie utrzymywać osobnych combat-health thresholds, jeśli istniejące severity semantics wystarczają.

### 22. Critical/serious injury can trigger disengagement; healing remains post-combat autonomy

Obecny combat phase nie powinien być rozszerzony o instant bandage/heal.

Zachować:

```text
combat damage
→ injury
→ disengage/flee if response evaluation says so
→ normal decision arbitration
→ existing healing pressure may win
```

Nie dodawać combat medicine.

### 23. Death is ordinary NPC death

NPC może zginąć podczas wspólnej walki.

Używać istniejącego:

```text
HealthState.dead
→ commitNpcDeath()
→ postDeath/corpse/loot
```

Player-given belongings nadal są zwykłą własnością NPC i naturalnie przechodzą do existing corpse-loot path, jeśli nadal były posiadane przy śmierci.

Accompany commitment kończy się przez normalny death/lifecycle contract z `npc-029`.

### 24. Combat execution state remains transient

Nie persistować:

- `CombatTargetHandle`,
- current enemy id jako companion combat state,
- attack phase,
- projectile,
- chase path,
- `protectingPlayer`,
- `partyCombatState`.

Save/load / stream-out kończy transient detailed combat execution; po reification aktualna sytuacja threat jest ponownie wykrywana z authoritative world state.

### 25. Off-screen cooperative combat is out of scope

Ten plan nie tworzy off-screen battle simulatora.

V1 cooperative combat działa w detailed/local simulation.

Jeżeli finalny shared travel/off-screen system ma później encounter abstraction, może użyć tych samych authoritative health/injury/death konsekwencji, ale nie należy tego implementować w `npc-033`.

### 26. Multiple participants act independently

Nie dodawać:

```text
party.inCombat
party.currentTarget
leaderTarget
formation
```

Każdy NPC zachowuje własne:

- health/injury,
- weapon capability,
- threat evaluation,
- decision,
- combat execution.

Kilku NPC może niezależnie wybrać tego samego agresora.

### 27. Keep candidate collection scalable

Przy wielu uczestnikach nie dopuścić do naiwnego:

```text
N NPC × all fauna × all NPC
```

per frame.

Threat producers powinny tworzyć bounded local candidate/context raz per locality/frame tam, gdzie aktualny architecture owner już zna attacker state.

### 28. Diagnostics must explain why the NPC fought or fled

Rozszerzyć existing NPC trace/inspection, żeby można było odpowiedzieć:

- kto był threatem,
- kto był threatened actor,
- czy threat dotyczył self czy participant,
- jaki response został wybrany,
- jaka capability była dostępna,
- jaki weapon/mode został wybrany,
- health ratio / injury severity,
- czy NPC był overwhelmed,
- czy relationship/commitment wpłynęły na ochronę,
- dlaczego combat zakończył się / NPC disengage/fled,
- czy po walce continuation pozostało viable.

Nie dodawać osobnego Companion Combat Debug UI.

Important new public/shared helpers powinny otrzymać zwięzły JSDoc z `@domain npc` tam, gdzie pomaga to preflight/navigation.

## Response model

Nie wymaga się finalnych wag w planie, ale model powinien być mały, deterministic i inspectable.

Koncepcyjnie:

```text
hard gates
    target alive/valid
    actor alive
    usable combat capability?
        ↓
situation
    threat to self
    threat to protected participant
    immediacy / distance
    local active threat count
        ↓
engage motivation
    self-defense urgency
  + accompany commitment context
  + Player↔NPC relation
  + NPC↔NPC relation where available
  + modest personality cooperation effects
        ↓
risk
    low health
  + serious/critical injury
  + no suitable weapon/ammo
  + exhaustion/vigor risk
  + overwhelmed local threat set
  + neuroticism / danger sensitivity
        ↓
response
    fight/protect
    disengage
    flee
```

Neutral NPC z accompany commitmentem nie powinien automatycznie wybierać fight tylko dlatego, że `commitment != null`.

## Concrete V1 threat flow — fauna

Pierwszy realny end-to-end slice powinien wyglądać tak:

```text
AnimalAgent has real hostile-human target/state
        ↓
existing fauna/app layer builds bounded threat candidate/context
        ↓
participant relation identifies:
    self threatened
    OR player threatened
    OR another expedition NPC threatened
        ↓
cooperative threat response evaluator
        ↓
fight/protect OR flee/disengage
        ↓
combatTargetForAnimal()
        ↓
existing CombatIntent
        ↓
NpcAgent.beginCombat()
```

Nie odtwarzać fauna hostility w NPC przez proximity inference.

## Damage / threat asymmetry guardrail

Implementation preflight musi jawnie zaktualizować poniższą macierz z bieżącego kodu:

| Direction / capability | Current expectation | `npc-033` rule |
|---|---|---|
| player → fauna | implemented | reuse unchanged |
| NPC → fauna | implemented | primary V1 cooperative attack path |
| animal → NPC | implemented | reuse unchanged |
| animal → player | implemented existing fauna path | protection may observe this threat |
| NPC incoming from generic caller | shared NPC entry point exists | do not infer caller wiring from this alone |
| player → NPC | incomplete normal player combat wiring | do not add companion-only path |
| NPC → NPC | execution seam structurally possible, general hostility producer absent | future producer may reuse neutral threat context |
| fauna outgoing attack mechanics | separate older fauna mechanism | out of scope to unify globally |

Jeżeli aktualny `main` zmieni tę tabelę przed implementacją, kod jest źródłem prawdy i plan należy odpowiednio zaadaptować.

## Expected integration points

Zweryfikować exact final seams podczas implementation preflight.

### Threat / decision

- `src/ai/npcAnimalThreat.ts` — current immediate-threat sensing/scoring; primary seam to generalize rather than duplicate.
- `src/ai/NpcAgent.ts` — current `reactToAnimalThreat()`, combat start/cancel, flee, trace/inspection and bounded combat revalidation.
- caller-bounded `ThreateningAnimalCandidate` construction/forwarding in app/fauna/settlement update flow.

### Combat execution

- `src/combat/combatIntent.ts` — target + execution intent contract.
- `src/ai/npcCombat.ts` — general NPC weapon/defense/ammo capability and hit glue.
- existing `NpcAgent` melee/ranged combat methods — reuse, no companion fork.

### Inventory/equipment

Consume final API/semantics from:

- `items-player-027-player-to-npc-item-transfer-and-equipment`,
- `src/items/Inventory.ts`,
- `src/items/itemCatalog.ts`.

Do not reimplement transfer or equipment ownership.

### Injury / survival

- `src/shared/injurySeverity.ts`,
- shared effective-physical-attribute resolver,
- existing NPC health/injury/healing path,
- final `npc-032` accompany continuation evaluator.

### Accompany / social context

- final `npc-029` public accompany commitment seam,
- existing Player↔NPC social lookup already injected into `NpcAgent`,
- existing NPC↔NPC relationship lookup only if available without adding a new manager dependency into combat code.

## Scope

- protection context for active accompany commitment;
- direct local threat to player during detailed simulation;
- protection of another expedition NPC where participant lookup can be expressed without a party manager;
- generalization/reuse of existing immediate threat response;
- deterministic/inspectable fight/protect vs flee/disengage evaluation;
- relationship/commitment as contextual modifiers;
- real health/injury/personality/self-preservation inputs;
- bounded `overwhelmed` signal from local real threats;
- player-given weapon/ammo capability through normal `personalInventory` path;
- shared sensible combat mode/weapon selection;
- existing `CombatIntent` and NPC combat executor;
- bounded chase/continuation revalidation;
- normal flee movement;
- severe injury/danger feeding shared `npc-032` continuation/abandonment lifecycle;
- ordinary injury/death consequences;
- existing trace/debug extension;
- regressions for ordinary non-accompanying NPC defense.

## Non-goals

- `CompanionCombatAI`;
- PartyManager / group combat controller;
- formations / focus fire / party target;
- explicit tactical player commands (`Attack`, `Defend Me`, `Hold Fire`, etc.);
- player-managed NPC equipment slots;
- companion inventory/ammo pool;
- companion health/injury/fear/morale meter;
- player→NPC combat implementation unrelated to generic combat architecture;
- bandit/hostile-NPC AI framework;
- crime/morality/faction/witness systems;
- companion betrayal;
- mounted combat;
- combat medicine / revive / resurrection;
- armor/equipment-slot framework;
- relationship consequences after combat;
- long-term companion loyalty progression;
- general fauna outgoing-combat rewrite;
- global hostility/threat registry;
- route-wide threat scan or combat-outcome simulation;
- full off-screen combat encounters;
- LLM-driven combat decisions.

## Related plans

### `npc-029` — NPC accompany/follow commitment

Hard dependency.

Owns persistent source-neutral temporary accompany lifecycle, interruption/resume and ending/return semantics.

`npc-033` consumes that context but does not store combat state in the commitment.

### `npc-032` — Expedition needs and survival

Hard dependency for the final continuation/abandonment boundary.

Owns the shared question:

> czy utrzymywanie accompany commitmentu nadal ma sens po uwzględnieniu current NPC state?

Combat-specific severe danger/injury może dostarczyć dodatkowe inputs/reasons, ale nie tworzy drugiego lifecycle.

### `items-player-027` — Player-to-NPC item transfer and equipment

Hard dependency for player-supplied weapons/ammunition.

Owns transfer to `personalInventory` oraz general action-time equipment/weapon selection corrections required by ordinary NPC actions.

`npc-033` nie może wprowadzać workaroundu dla player-given gear.

### `npc-025` — Injury severity and treatment requirements

Implemented foundation.

Reuse `physicalInjury`, derived severity i effective physical impairment. Nie kopiować injury thresholds do companion combat state.

## Implementation order

1. Verify final implemented contracts of `npc-029`, `npc-032` and `items-player-027`.
2. Re-run exact player/NPC/fauna damage + hostility/threat matrix recon on current `main`.
3. Trace current fauna hostile-human candidate construction from owner to `NpcAgent.update()`.
4. Define the smallest neutral immediate-threat context needed for self + participant protection.
5. Generalize current animal self-defense response policy rather than adding a second companion evaluator.
6. Preserve existing ordinary NPC defend/flee regression tests first.
7. Wire active accompany participant context into threat evaluation without storing party/combat state.
8. Reuse final general weapon/ammo resolver; add only the smallest shared mode-suitability improvement still missing after `items-player-027`.
9. Implement fauna→player protection end-to-end through unchanged `CombatIntent → beginCombat()` execution.
10. Add another expedition-NPC protection path only if participant lookup is already available without a new manager.
11. Add bounded combat continuation/disengagement revalidation and short-pursuit semantics.
12. Feed severe injury/overwhelmed/fear outcomes into the single `npc-032` continuation boundary.
13. Extend trace/inspection with threat, protected actor, response and disengage reasons.
14. Add targeted automated tests and update state docs only after actual implementation.

## Verification

### Automated — ordinary NPC regression

- NPC without accompany commitment keeps current animal-threat defend/flee semantics.
- Existing self-defense requires real weapon/ammo capability.
- Generalizing threat representation does not turn neutral fauna proximity into hostility.

### Automated — protection of player

- Real hostile animal targets/threatens player inside bounded local context.
- Nearby accompanying NPC receives a participant-threat context.
- Capable healthy NPC may choose protect and starts existing combat against the real animal target.
- Dead/non-threatening/invalid target is ignored.
- Unrelated nearby animal does not trigger protection.

### Automated — protection of another expedition NPC

Where participant lookup exists without a new party manager:

- animal threatens NPC A,
- NPC B shares relevant expedition context,
- NPC B may evaluate protection independently,
- no shared party target is required.

### Automated — autonomy / self-preservation

Verify active accompany does not force fight when:

- NPC is unarmed,
- ranged weapon lacks real ammo,
- injury is serious/critical,
- vigor/collapse state makes continued fight unreasonable,
- bounded local threat set is overwhelming.

Relationship/commitment modifiers may shift willingness but not override impossible/hard survival constraints.

### Automated — player-given weapon

After `items-player-027`:

```text
NPC lacks useful weapon
→ player transfers weapon
→ weapon belongs to personalInventory
→ normal capability resolver sees it
→ protection decision can use it
→ existing combat executor uses the same ordinary weapon path
```

No Equip command or companion equipment state.

### Automated — ranged ammunition ownership

- gifted ammo remains in `personalInventory`,
- final shared ammo resolver recognizes the real owner,
- consumed shot removes ammo from the inventory that supplied it,
- no copy into companion/transient ammo pool.

### Automated — weapon/mode selection

Cover at least:

```text
knife + stronger sword, close threat
bow + melee weapon, very close threat
bow + ammo, distant threat
```

Selection remains deterministic and general-purpose.

### Automated — bounded chase / disengage

- NPC may close distance or briefly pursue an active local threat.
- Target moving materially away after threat ends does not drag NPC indefinitely from expedition locality.
- Disengagement ends combat and returns to normal re-arbitration.
- Disengagement itself does not delete accompany commitment.

### Automated — injury during combat

```text
NPC takes accepted hit
→ ordinary physicalInjury updates
→ derived severity changes
→ cooperative response can re-evaluate
→ NPC may disengage/flee
```

No duplicate wounded state.

### Automated — flee vs abandonment

Temporary case:

```text
flee
→ threat resolves
→ continuation remains viable
→ same accompany commitment resumes
```

Terminal case:

```text
severe combat outcome
→ shared npc-032 continuation evaluation = abandon
→ npc-029 ends commitment with semantic reason
→ generic return/life handoff
```

### Automated — death

- NPC death uses ordinary `commitNpcDeath` / post-death lifecycle.
- Existing corpse/loot semantics remain authoritative.
- Still-owned player-given items follow normal NPC corpse-loot rules.
- No companion death state/respawn exists.

### Automated — performance / boundedness

- No per-NPC global fauna/NPC scan is introduced.
- Threat candidate collection remains bounded/local.
- Cooperative response/continuation scoring is throttled/event-driven rather than full per-frame tactical simulation.

### Automated — observability

Trace/inspection should make it possible to identify:

- threat source,
- threatened participant,
- selected response,
- usable combat capability,
- chosen mode,
- health/injury context,
- overwhelmed/risk reason where applicable,
- disengage/flee reason,
- whether accompany later resumed or ended.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. Companion follows normally before danger.
2. Wolf attacks player → armed/healthy companion can protect using normal combat.
3. Neutral nearby fauna does not become a target merely because companion is close.
4. Player-given sword changes real capability without an Equip command.
5. NPC with bow but no usable arrows does not pretend to have ranged capability.
6. Bow + melee weapon produces sensible behaviour at close vs distant range.
7. Badly injured / overwhelmed NPC can disengage or flee instead of fighting suicidally.
8. Temporary flee can resolve and the same expedition can continue.
9. Severe combat outcome can explicitly end the expedition through normal commitment viability.
10. NPC does not chase one enemy indefinitely away from the group.
11. A second expedition NPC can be protected when the runtime supports the participant lookup.
12. NPC death uses normal corpse/loot semantics.
13. Ordinary non-accompanying NPC animal self-defense remains unchanged.

## Completion criteria

The roadmap slice is complete when an ordinary accompanying NPC can participate in shared local combat through existing systems:

```text
ordinary NPC
+
active accompany commitment
+
real hostile local threat
+
normal personal equipment
+
normal health/injury/personality/social context
        ↓
bounded threat perception
        ↓
inspectable protection/self-preservation decision
        ↓
shared weapon/mode selection
        ↓
existing CombatIntent
        ↓
existing NPC combat/flee execution
        ↓
ordinary damage / injury / death
        ↓
bounded disengage / pursuit
        ↓
normal re-arbitration
        ↓
resume expedition
OR
explicitly abandon via shared continuation lifecycle
```

No parallel companion combat, threat, damage, inventory/equipment, party-control or loyalty system exists.

## Implementation documentation

Before implementation create/update implementation notes after recon of the final `npc-029`, `npc-032` and `items-player-027` APIs plus the current damage/threat matrix.

Record exact relevant files/symbols, ownership boundaries, candidate-forwarding call-sites, final weapon/ammo resolver and continuation API so the implementation agent does not need to rediscover them.

Add concise JSDoc to important new public/shared threat/response helpers where useful for preflight discovery, including `@domain npc`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
