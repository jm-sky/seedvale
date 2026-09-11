# Plan: Companion combat cooperation

**Created:** 2026-09-11
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** npc-029, items-player-027
**Domain:** `npc`
**Subdomains:** `combat` `behavior` `decision-making`
**Tags:** `companions` `combat` `mutual-defense` `pressure` `equipment`
**Roadmap:** `companions.md`

> **Draft note:** ten plan opisuje brakujący roadmapowy slice „Companion combat cooperation”. Przed zmianą statusu na `planned` należy ponownie zweryfikować finalny contract `npc-029` oraz stan implementacji `items-player-027`. Nie tworzyć companion-specific combat AI ani party combat managera.

## Goal

Pozwolić zwykłemu NPC z aktywnym `accompany/follow commitment` reagować na zagrożenie gracza lub innych uczestników tej samej wyprawy przez istniejący NPC combat/flee stack.

Towarzyszenie może zwiększać presję do ochrony innych, ale nie daje bezwarunkowego rozkazu walki.

Docelowo:

```text
ordinary NPC
+
existing threat perception
+
active accompany commitment / relationship context
+
health + injury + personality + usable equipment
        ↓
protection / self-preservation pressures
        ↓
normal defend / flee decision
        ↓
existing CombatIntent + NpcAgent combat execution
        ↓
fight / disengage / flee
        ↓
normal re-arbitration
        ↓
resume accompany if commitment remains viable
```

Nie tworzyć:

- `CompanionCombatAI`,
- `PartyCombatManager`,
- companion-only target selection,
- osobnego combat FSM,
- companion weapon slots,
- suicidal-loyalty override.

## Current architecture and reuse

### Combat execution already exists

`NpcAgent` ma istniejący `combat` phase i `beginCombat(intent: CombatIntent)` / `cancelCombat()`. Melee i ranged korzystają ze wspólnych neutralnych lifecycle z `src/combat/`.

Combat executor nie wybiera sam powodu walki ani celu. Otrzymuje `CombatIntent` z zewnętrznego decision systemu.

**Implication:** ten plan ma rozszerzyć perception/decision context, nie budować nowego combat engine.

### NPC animal-threat defense already has the right defend/flee shape

`src/ai/npcAnimalThreat.ts` już rozdziela:

```text
immediate threat
→ score defend vs flee
→ NpcAgent applies result
```

Scoring uwzględnia:

- usable combat capability,
- health ratio,
- neuroticism,
- brak broni/ammo jako twardy powód, aby `defend` nie było wykonalne.

To jest właściwy precedent dla ochrony innej osoby: protection context powinien modyfikować zwykłą decyzję fight/flee, a nie zastępować ją poleceniem „attack”.

### Equipment is already ordinary personal ownership

NPC melee/ranged weapon resolution korzysta z `personalInventory`. `items-player-027` generalizuje Player → NPC transfer właśnie do tego ownera.

Nie potrzeba companion equipment state.

Jeżeli NPC posiada odpowiednią broń:

```text
personalInventory
→ existing combat resolver
```

Jeśli nie posiada realnej capability, protection pressure nie może tworzyć niewykonalnego combat intent.

### Accompany commitment is context, not combat authority

`npc-029` definiuje source-neutral temporary accompany commitment, który może być przerywany przez combat/flee bez utraty samego commitmentu.

Commitment odpowiada na pytanie, dlaczego NPC podróżuje z graczem. Nie powinien przechowywać:

- combat target,
- stance,
- aggro table,
- squad order,
- target assignment.

Ten plan może użyć aktywnego commitmentu jako jednego z inputów protection pressure.

## Core design

### 1. Introduce a general protection-context pressure, not Companion combat mode

Potrzebny jest mały, inspectable signal reprezentujący:

> ktoś, z kim NPC ma aktualnie znaczący związek/commitment, jest bezpośrednio zagrożony.

Preferować neutralny model użyteczny również poza Companions, np. household/NPC relationship w przyszłości.

Nie hardcodować:

```text
if companion && player attacked => fight
```

Accompany jest tylko jednym źródłem protection context.

### 2. Protection increases willingness to engage but competes with self-preservation

Decyzja powinna uwzględniać istniejące realne czynniki:

- distance / immediacy of threat,
- whether protected actor is actually under threat,
- current HP,
- derived injury severity/effective physical capability,
- usable melee/ranged equipment + ammo,
- personality/risk sensitivity,
- own immediate threat,
- relative danger where cheaply available,
- accompany commitment / relationship context.

Protection pressure może przesunąć wynik w kierunku `defend`, ale nie usuwać `flee`.

W szczególności:

```text
badly injured / unarmed / overwhelmed
→ may flee or refuse engagement
```

### 3. Reuse existing threat sensing and target handles

Jeżeli zwierzę atakuje gracza/NPC, reuse istniejących `CombatTargetHandle` oraz bounded live threat candidates.

Nie dodawać globalnego aggro scan po całym świecie.

Dla pierwszego slice wystarczy bezpośrednie, lokalne zagrożenie podczas detailed simulation.

Off-screen combat encounters/random encounters nie należą do tego planu.

### 4. Mutual defense should remain symmetric where practical

Plan powinien być skonstruowany tak, aby ten sam protection-context seam mógł objąć:

- gracza,
- innego NPC uczestniczącego w tej samej wyprawie,
- później bliskiego NPC/household membera,

bez tworzenia party membership managera.

V1 może materializować przede wszystkim ochronę gracza, jeśli aktualny runtime nie ma jeszcze lekkiego group-membership query dla wielu towarzyszy.

Nie tworzyć group controller tylko po to, aby przygotować przyszłość.

### 5. Existing combat/flee remains authoritative

Po wybraniu fight/defend:

```text
existing CombatIntent
→ NpcAgent.beginCombat()
→ existing melee/ranged execution
```

Po wybraniu flee:

- reuse istniejący flee/wander/movement path,
- nie kasować accompany commitmentu automatycznie,
- po ustaniu bezpośredniego zagrożenia wrócić do normalnej re-arbitracji.

Dopiero istniejące/later commitment viability rules mogą uznać, że dalsza wyprawa jest niewykonalna.

### 6. Target selection must be bounded and contextual

Nie tworzyć pełnego tactical target managera.

Pierwszy implementation slice powinien preferować bezpośredniego agresora atakującego protected actor lub NPC samego.

Jeżeli wielu agresorów jest aktywnych, deterministic bounded selection może korzystać z:

- direct attacker first,
- distance/immediacy,
- target alive/reachable,

bez party-wide focus-fire systemu.

### 7. Player-caused aggression does not imply blind support

Jeżeli gracz sam inicjuje konflikt, samo accompany nie powinno automatycznie gwarantować wsparcia.

V1 powinno odróżniać co najmniej:

```text
protected actor under immediate hostile threat
```

od:

```text
player chose to attack a neutral target
```

Nie rozszerzać planu w pełny morality/crime/witness system. Jeśli current threat APIs nie pozwalają wiarygodnie rozróżnić tej sytuacji, ograniczyć pierwszy slice do istniejących jasno hostile animal threats.

### 8. Supplied weapons feed the same resolver

Po `items-player-027` broń przekazana NPC trafia do `personalInventory` i ma być widoczna przez normalny combat resolver.

Ten plan nie implementuje transfer UI ani equipment slots.

Dodać regression coverage, że protection decision widzi realną capability po transferze i nie korzysta z transient `carried` jako default personal weapon owner.

### 9. Ammunition ownership follows general item-transfer plan

Jeżeli ranged ammo nadal ma split pomiędzy `personalInventory` i transient hunter supply, użyć finalnego general resolvera z `items-player-027`.

Nie tworzyć companion ammo pool.

### 10. Combat interruption/resume must not duplicate accompany lifecycle

```text
follow
→ protection response / self-defense combat
→ combat ends or NPC flees
→ normal choose/re-arbitration
→ accompany resumes if still viable
```

Nie persistować:

- `protectingPlayer`,
- `combatPausedFollow`,
- `partyCombatState`.

### 11. Death and severe injury remain ordinary NPC consequences

NPC może zginąć. Nie respawnować ani zastępować companionów.

Severe injury po walce trafia do istniejącego `physicalInjury` → healing/recovery flow. `npc-032` i shared healing path odpowiadają za survival po walce.

Nie dodawać companion revive/rescue mechanics.

## Likely integration points

Zweryfikować ponownie na aktualnym `main` przy implementacji:

- `src/ai/npcAnimalThreat.ts` — obecny defend/flee scoring i threat representation;
- `src/ai/NpcAgent.ts` — application of defend/flee + combat execution;
- `src/ai/npcCombat.ts` — personal weapon/ammo capability/resolution;
- `src/combat/combatIntent.ts` — existing target seam;
- fauna/player threat integration call-sites feeding `ThreateningAnimalCandidate`;
- `src/settlement/npcState.ts` / final `npc-029` accompany commitment read-only context;
- Player↔NPC relation/reputation only if already cheaply available at the decision call-site; nie ciągnąć nowych managerów przez combat stack tylko dla scoringu.

Preferować wydzielenie małego pure protection scoring/context helpera zamiast rozbudowy `NpcAgent` o kolejną dużą policy sekcję.

## Scope

- protection context dla aktywnego accompany commitment;
- reakcja, gdy gracz jest bezpośrednio zagrożony w detailed simulation;
- możliwość ochrony innego uczestnika wyprawy, jeśli istniejące membership/query API pozwala bez nowego managera;
- deterministic fight/defend vs flee scoring;
- real weapon/ammo capability;
- istniejący `CombatIntent` i NPC combat executor;
- interruption/resume normalnego accompany flow;
- debug/trace visibility dla protection reason i selected response;
- regression tests bez companion-specific combat state.

## Non-goals

- party tactics / formations / focus fire;
- orders typu attack/hold-fire;
- CompanionCombatAI / PartyCombatManager;
- new combat FSM or damage model;
- player-vs-NPC combat implementation unrelated to protection;
- bandit AI framework;
- off-screen random combat encounters;
- morality/crime/faction system;
- resurrection/revive;
- assisted Medicine;
- armor/equipment slots;
- relationship consequences after combat;
- long-term companion loyalty progression;
- multiple-companion coordination beyond simple independent protection responses.

## Verification

### Automated — ordinary autonomy

- NPC bez accompany context zachowuje current animal-threat defend/flee behaviour.
- Protection context modyfikuje willingness to defend, ale nie omija feasibility.
- Unarmed NPC nie dostaje niewykonalnego combat intent.
- Badly injured/high-risk NPC może wybrać flee mimo active accompany.

### Automated — protection

- hostile animal threatens player within bounded range → accompanying capable NPC evaluates protection response;
- direct attacker is preferred without global target scan;
- dead/non-threatening target is ignored;
- unrelated distant threat does not trigger protection.

### Automated — equipment

- weapon in `personalInventory` enables the existing capability path;
- transferred weapon after `items-player-027` is usable through the same resolver;
- ranged intent requires real ammo from the actual authoritative owner;
- no companion equipment state is created.

### Automated — lifecycle

- protection combat interrupts follow execution without deleting accompany commitment;
- after combat ends, normal decision flow can resume the same commitment;
- flee likewise preserves commitment until normal viability logic decides otherwise;
- NPC death ends executable participation through ordinary lifecycle.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. Companion follows normally before danger.
2. Wolf attacks player → armed/healthy companion may engage through normal combat.
3. Unarmed or badly injured companion may flee instead of suicidally attacking.
4. Supplied weapon changes real combat capability without an Equip command.
5. After danger ends, companion can resume normal follow.
6. Ordinary nearby NPC without relevant protection context does not become a permanent player bodyguard.

## Completion criteria

The roadmap slice is complete when accompaniment can influence an ordinary NPC's existing threat decision without replacing autonomy:

```text
accompany context
+
real immediate threat to player/group member
+
NPC health/injury/personality/equipment
→ inspectable protection/self-preservation scoring
→ existing defend/flee result
→ existing combat or flee execution
→ ordinary consequences
→ normal re-arbitration / resume
```

No parallel companion combat system exists.

## Implementation documentation

Before implementation create/update implementation notes after recon of the final `npc-029` and `items-player-027` APIs. Add JSDoc to important new public/shared protection-context functions where useful for preflight discovery, with `@domain npc` where appropriate.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
