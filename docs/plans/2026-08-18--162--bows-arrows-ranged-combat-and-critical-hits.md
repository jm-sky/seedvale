---
domain: items-player
tags: [fauna, quests-progression]
---

# Plan: Bows, Arrows, Ranged Combat and Critical Hits

**Created:** 2026-08-18
**Status:** `verification needed` 🔍 — implemented 2026-08-20. Technical verification green (`tsc`/lint/build/test, 1283 tests); no browser/gameplay verification yet. **NPC ranged combat (§8) was not implemented** — see "Implementation summary" (bottom of this file) for why. See also the [implementation notes](./2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits-implementation-notes.md).
**Priority:** 🟡 medium · **Effort:** L
**Depends on:** ~~150~~

> Check: `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits-implementation-notes.md`

## Cel

Rozszerzyć istniejący combat o wspólny mechanizm ataków dystansowych oraz pierwszą jego implementację w postaci łuków i strzał. W ramach tego samego rozszerzenia dodać trafienia krytyczne jako część wspólnego damage pipeline.

Zakres:

- 2–3 rodzaje łuków,
- 1–3 rodzaje strzał,
- ranged attacks używane przez gracza i NPC,
- projectile / lot strzały i trafienie celu,
- amunicja jako zwykłe stackable `ItemKind` + count w istniejącym inventory,
- skill `archery`,
- critical hits jako wspólna mechanika combat, możliwa do wykorzystania także przez melee i inne przyszłe ataki.

Nie tworzyć osobnego „bow system”. Łuk ma być pierwszym użytkownikiem wspólnego ranged combat.

## Aktualny stan

Plan 150 rozszerzył istniejący melee combat o combat mode, target acquisition, soft lock, defense i downed state. Plan 155 wprowadził generyczne `ItemInstance` i hybrydowy inventory. Plan 162 korzysta z istniejącego `Inventory` również dla stackable ammunition, ale nie wymaga instance-backed arrows.

Przed implementacją ponownie sprawdzić aktualny kod i faktyczny stan planów. Dokumentacja/plany nie są źródłem prawdy ponad kodem.

## 1. Wspólny ranged combat

Nie tworzyć drugiego systemu walki. Rozszerzyć istniejący attack/combat flow o typ ataku dystansowego.

Docelowo:

```text
attack request
    ↓
attack type: melee / ranged
    ↓
target acquisition
    ↓
projectile / hit resolver
    ↓
hit / miss
    ↓
critical?
    ↓
defense, where applicable
    ↓
final damage
    ↓
HealthState / existing target consequence
```

`PlayerCombat` pozostaje ownerem soft-lock state. Istniejący target identity/ranking pozostaje wspólną podstawą target acquisition. Jeżeli ranged weapon wymaga większego zasięgu niż obecne 7 jednostek, rozszerzyć parametr istniejącego target query/rankingu zamiast tworzyć drugi target manager.

Target acquisition i projectile hit są odrębnymi etapami: wybrany target nie oznacza automatycznego trafienia.

## 2. Łuki

Dodać 2–3 typy łuków, przykładowo:

- `short_bow` — szybki, mały zasięg, niższe obrażenia,
- `hunting_bow` — uniwersalny,
- `long_bow` — większy zasięg/obrażenia, wolniejsze oddanie strzału.

Parametry powinny być centralnie konfigurowalne w istniejącym katalogu itemów/weapon config. Nie tworzyć osobnego katalogu łuków.

Łuk powinien określać m.in. ranged attack range, draw/attack time, bazową moc ataku, typ używanej amunicji oraz ewentualny modifier do critical chance.

## 3. Strzały

Dodać 1–3 rodzaje strzał, przykładowo:

- `arrow` — podstawowa,
- `broadhead_arrow` — większe obrażenia przeciw żywym celom/polowaniu,
- `war_arrow` — cięższa, mocniejsza strzała.

Strzała jest zwykłym stackable itemem (`ItemKind` + count). Każde wystrzelenie zużywa 1 sztukę kompatybilnej amunicji.

V1 nie śledzi indywidualnej tożsamości strzały i nie implementuje recovery. Nie tworzyć `ArrowItemInstance`, quiver inventory ani arrow-specific persistence. Jeśli kiedyś pojawi się realna potrzeba per-arrow state/recovery, będzie to osobne rozszerzenie istniejącego modelu z planu 155.

## 4. Projectile

Dodać minimalny wspólny projectile model potrzebny dla strzały.

Projectile powinien mieć co najmniej origin, direction, speed, lifetime/max range, source entity oraz attack/damage payload.

Projectile jest lekkim runtime data, nie `Object3D` i nie inventory entity. Wizualny projectile może istnieć dla obserwowanej walki, ale nie może być source of truth.

Trafienie powinno korzystać z istniejących targetów/HealthState. Nie budować pełnej fizyki pocisku, jeśli nie jest potrzebna.

## 5. Ranged hit / miss

Ranged attack musi mieć jawne rozróżnienie:

```text
attack
  ↓
valid target?
  ↓
projectile reaches target
  ↓
hit / miss
```

Nie zakładać, że wybór targetu oznacza automatyczne trafienie.

Celność powinna zależeć od `archery`, parametrów łuku oraz sensownych warunków ataku. Nie tworzyć jeszcze rozbudowanego systemu balistyki, wind drift czy hitboxów per body part.

Dla NPC wynik może być rozwiązany deterministycznie bez renderowania każdego projectile poza obserwowanymi sytuacjami.

## 6. Critical hits

Dodać critical hit jako wspólny element istniejącego damage pipeline, a nie mechanikę specyficzną dla łuków.

```text
successful hit
    ↓
critical modifier
    ↓
defense, where applicable
    ↓
final damage
```

Critical powinien być deterministyczny względem istniejącego RNG/simulation flow. Nie powinien bezpośrednio mutować HP ani omijać obrony.

Jeżeli aktualny combat nie ma sensownego wspólnego damage result, wydzielić tylko mały współdzielony pure resolver/result, który usuwa rzeczywistą duplikację. Nie refaktoryzować melee do dużego frameworka tylko dla symetrii.

Nie tworzyć `rangedDefenseResolver`. `defenseResolver` pozostaje wspólnym boundary tam, gdzie target ma wymagane defense inputs. Dla targetów bez takich danych zachować istniejący no-defense path.

## 7. Archery skill

Dodać skill `archery`, wykorzystując istniejący `PlayerSkills` / XP mechanism.

Skill powinien wpływać przede wszystkim na celność/stabilność, efektywny zasięg lub czas oddania strzału; nie robić prostego „skill level = +X% damage”.

Aktualizować union, default state, persistence/migration oraz UI tylko tam, gdzie obecny `PlayerSkills` wymaga tego wprost.

Nie tworzyć archery progression subsystem.

## 8. NPC combat

NPC powinny móc używać łuku przez ten sam ranged attack mechanism co gracz.

NPC powinien:

- posiadać łuk przez istniejący equipment/held-item flow,
- posiadać stackable strzały w istniejącym inventory,
- rozpoznawać dystans jako element decyzji o ataku,
- wybrać ranged attack, gdy strategia/warunki są odpowiednie,
- zużywać amunicję,
- reagować na brak strzał przez istniejący decision/action flow.

Nie tworzyć `ArcherAI`. Rozszerzyć istniejący NPC combat decision/action flow.

Animal targets remain targets, not owners of ranged combat. Ranged damage against animals musi wejść w istniejący `AnimalAgent` / fauna consequence lifecycle. Nie refaktorować predator bites do ranged pipeline tylko dla symetrii.

## 9. Player combat

Gracz korzysta z tego samego ranged attack modelu i istniejącego held-item flow.

Potrzebne elementy:

- wyposażenie łuku,
- posiadanie/wybór strzał przez istniejący inventory,
- draw/attack,
- release,
- feedback hit/miss/critical.

Nie tworzyć osobnego inventory ani equipment flow tylko dla łuku.

## 10. Reuse existing systems

Przed implementacją sprawdzić aktualny kod szczególnie w:

- `src/player/playerCombat.ts` — soft-lock owner i combat state;
- `src/player/playerMelee.ts` — lifecycle oraz target-ranking primitives;
- `src/app/gameLoop.ts` — integracja combat/interact i damage consequences;
- `src/app/interactables.ts` — target acquisition/range;
- `src/shared/HealthState.ts` — HP primitive;
- `src/combat/defenseResolver.ts` — istniejący defense boundary;
- `src/items/itemCatalog.ts` — centralna konfiguracja;
- `src/items/items.ts` — `ItemKind`/definitions;
- `src/items/HeldTool.ts` — held item;
- `src/items/Inventory.ts` — stackable counts;
- `src/items/itemInstances.ts` — przyszła kompatybilność, nie wymaganie dla arrows;
- `src/player/PlayerSkills.ts` — istniejący skill mechanism;
- `src/ai/NpcAgent.ts` — decyzje/akcje NPC;
- `src/fauna/AnimalAgent.ts` i `src/fauna/faunaCombat.ts` — fauna consequences.

Nie tworzyć:

- `BowSystem`,
- `ArrowSystem`,
- `ArcherAI`,
- `RangedCombatManager`,
- `TargetManager`,
- God Object `CombatManager`,
- quiver-specific inventory,
- ranged-specific `HealthState`,
- ranged-specific defense system.

## 11. Performance / simulation

Projectile i ranged combat muszą być kompatybilne z hybrydową symulacją Seedvale.

Dla obserwowanych/ważnych walk można używać pełnego projectile visualization. Dla odległych NPC wynik ataku może zostać rozwiązany jako deterministyczne zdarzenie bez renderowania każdego projectile.

Nie dodawać Web Workera tylko dla tego planu bez pomiaru kosztu.

Projectile collision powinna używać prostego swept segment/distance logic zamiast `Raycaster` allocation per arrow.

## 12. Implementation phases

### Phase 1 — Audit

Zweryfikować aktualny combat, items, skills oraz NPC combat i ustalić dokładne miejsca rozszerzenia.

### Phase 2 — Critical + minimal damage primitive

Dodać mały pure critical/damage result tylko jeśli aktualny kod pokaże realną duplikację. Zachować istniejące melee behaviour.

### Phase 3 — Ranged attack abstraction

Dodać wspólny ranged attack flow oraz minimalny projectile runtime model. Bez globalnego managera.

### Phase 4 — Bows + arrows

Dodać 2–3 łuki i 1–3 strzały w istniejącym catalogu. Amunicję podpiąć przez istniejący count-based `Inventory`.

### Phase 5 — Archery

Dodać `archery` do istniejącego progression mechanism oraz niezbędną persistence/UI migration.

### Phase 6 — Player + NPC

Podłączyć gracza i NPC do tego samego ranged flow. Dodać decyzję NPC bez osobnego AI.

### Phase 7 — Feedback + balancing

Dodać podstawowy feedback hit/miss/critical i dobrać parametry.

## Acceptance criteria

- [x] Istnieje wspólny ranged attack mechanism zamiast osobnego systemu łuków.
- [x] Istnieją 2–3 różne łuki z realnie różnymi parametrami (3: short/hunting/long_bow).
- [x] Istnieje 1–3 rodzaje strzał jako stackable `ItemKind` + count (3: arrow/broadhead_arrow/war_arrow).
- [x] Wystrzelenie zużywa 1 sztukę istniejącej stackable amunicji.
- [x] Nie powstaje `ArrowItemInstance`, quiver inventory ani arrow-specific persistence.
- [x] Strzała może trafić lub chybić (swept-segment collision against a deviated trajectory).
- [x] Trafienie przechodzi przez istniejący damage/health pipeline (`AnimalAgent.takeDamage`).
- [x] Critical hit jest możliwy dla ranged attack i jest częścią wspólnego pipeline (dzielony z melee).
- [x] Istniejąca obrona jest używana tam, gdzie target ma wymagane defense inputs — zwierzęta ich nie mają (melee też ich nie używa przeciw zwierzętom), więc ranged poprawnie zostaje przy no-defense path.
- [x] `archery` korzysta z istniejącego skill/progression mechanism.
- [x] Gracz może użyć łuku przez istniejący held-item flow.
- [ ] **NPC może użyć łuku przez ten sam mechanizm — nie zaimplementowane, patrz summary.**
- [ ] **NPC zużywa stackable amunicję i reaguje na jej brak — nie zaimplementowane (brak NPC ranged decision flow), patrz summary.**
- [x] `AnimalAgent`/fauna pozostaje ownerem konsekwencji trafienia zwierzęcia.
- [x] Nie powstaje żaden z zakazanych równoległych systemów.
- [x] Ranged combat może działać w uproszczonej formie poza obserwowanym obszarem — nie dotyczy w praktyce: strzały są tylko gracza (zawsze blisko/obserwowane); brak wizualnego pocisku 3D w ogóle, więc nie ma kosztu renderowania do uproszczenia.
- [x] Istniejące melee i animal death flow nie zostają przypadkowo zmienione (pełny istniejący test suite zielony bez zmiany assercji poza wymaganymi migracjami instance).
- [x] `tsc`, build i test przechodzą.
- [ ] Browser verification obejmuje gracza, hit/miss, critical, różne łuki/strzały, zużycie amunicji — nie wykonane w tej sesji (użytkownik testuje ręcznie). NPC ranged attack nie dotyczy (nie zaimplementowane).

## Implementation summary (2026-08-20)

Implemented end-to-end against the real codebase together with plan 161 (shared files: `itemCatalog.ts`, `items.ts`, `gameLoop.ts`, `createApp.ts`, `PlayerSkills.ts`). Key points:

- **Shared ranged mechanism**: `RangedConfig` on `ItemCatalogEntry.ranged` (`items/itemCatalog.ts`) is the ranged counterpart of `MeleeConfig`. `player/playerRanged.ts`'s `createPlayerRanged()` is a draw→release→recovery state machine with a single `fireReady` edge — deliberately mirrors `playerMelee.ts`'s shape/ownership split (lifecycle timing only; `gameLoop.ts` owns ammo, projectile spawning, world consequences) rather than reusing melee code directly (different phases: draw/release/recovery vs windUp/hitWindow/recovery).
- **Bows/arrows**: `short_bow`/`hunting_bow`/`long_bow` (damage 14/20/28, range 11/15/20, increasingly slow draw) and `arrow`/`broadhead_arrow`/`war_arrow` (+0/+4/+8 damage via `ARROW_DAMAGE_BONUS`) as ordinary `ItemKind`s — arrows are plain stackable counts, no instance/persistence.
- **Projectile**: `combat/projectile.ts` — a plain data `Projectile` (position/direction/speed/maxDistance/damage/attempt), `advanceProjectile()` (pure step), `sweptProjectileHit()` (segment-to-point distance test against a per-tick candidate list, no `Raycaster`). `gameLoop.ts` owns a live `Projectile[]`, ticked every unpaused frame independent of the currently held tool (so a mid-flight arrow isn't dropped by a weapon switch). No `Object3D`/visual arrow mesh in v1 — deliberate scope cut (the plan explicitly allows resolving off-screen combat "without rendering every projectile"; skipping the visual entirely for the only consumer (player-fired arrows, always near/observed) avoided a chunk of Three.js-object lifecycle work with no gameplay payoff, and keeps the feature fully unit-testable without a scene).
- **Accuracy/hit-miss**: `combat/rangedAttack.ts`'s `resolveRangedDirection()` applies an aim-yaw deviation scaled by `(1 - accuracy)` (bow base accuracy + `archery` skill bonus) using a deterministic per-shot roll (`rangedDeviationRoll`) — this **is** the hit/miss mechanism (a wide-enough deviation geometrically misses the swept-collision test), not a separate probability roll layered on top of the projectile. Kept deliberately simple (no wind/ballistics) per the plan's own "not yet" on that.
- **Critical hits**: `combat/criticalHit.ts`'s `resolveCriticalHit()` — a small shared pure resolver (deterministic roll, same hash shape as `defenseResolver.ts`'s `defenseBlockRoll`), evaluated after hit/before defense, used by ranged (`RangedConfig.criticalChance`/`criticalMultiplier`, only `hunting_bow`/`long_bow` have a chance) **and** melee (new flat `MELEE_CRITICAL_CHANCE`/`MELEE_CRITICAL_MULTIPLIER` baseline wired into the existing `gameLoop.ts` melee hit block) — satisfies the plan's "usable by melee too" without adding a `criticalChance` field to every existing `MeleeConfig` entry.
- **Target acquisition — new function, not a new manager**: `player/playerCombat.ts`'s `collectRangedAnimalCandidates()` gathers live wild-fauna + settlement-livestock `AnimalAgent`s within a fixed `RANGED_CANDIDATE_RANGE` (26 units, covers `long_bow`'s 20-unit range + margin) — **cannot** reuse the existing melee candidate list, which is bounded by `GAZE_RANGE` (5 units, far shorter than any bow). This is new code but reuses the exact same settlement/fauna iteration `collectLivingCombatTargets` already does, just returning raw `AnimalAgent` refs instead of `Interactable`-wrapped ones.
- **Archery skill**: added to `PlayerSkills.SkillId` (now `sneak | survival | traps | defense | archery`); `SKILL_XP_AWARD.rangedHit` awarded once per confirmed projectile hit (never per shot/miss). No save-schema version bump needed — `SaveSkills`' own validator (`isSkillsField`) only ever checked `sneak`/`survival` presence, and every skills migration step already defaults missing skills to `{xp: 0}`.
- **Player flow**: `[E]` over a gazed live animal while a bow is held starts the draw (mirrors melee's trigger UX exactly) — no ammo check passes without a toast ("Brak strzał."/"Brak siły na strzał."). Ammo kind is resolved fresh at fire time (first compatible kind still held) and consumed there, not at draw request.
- **NPC ranged combat — deliberately not implemented**: plan 162 §8/§9 asks to "extend the existing NPC combat decision/action flow." Auditing the actual codebase found **no such flow exists** — `NpcAgent.ts` has no attack/combat decision-making at all; the only creature-vs-human combat in the game is fauna predators attacking the player (`fauna/predatorHumanDecision.ts` → `applyPlayerDamage`), and there are currently no hostile NPCs to fight in the first place (`docs/STATE.md`'s "Not implemented" list: "full NPC-vs-fauna combat wiring"). Building a decision-making framework from scratch just to let an NPC fire a bow would itself be the "ArcherAI"/parallel combat system the plan explicitly forbids, for a feature with no current in-game consumer. `RangedConfig`/`playerRanged.ts`'s lifecycle shape/`combat/projectile.ts`/`combat/rangedAttack.ts` are all generic (not player-coupled beyond `sourceId`), so a future NPC combat system (e.g. bandits, plan 093 Etap H) can reuse them without a second ranged architecture — tracked as a loose end (`docs/plans/LOOSE-ENDS.md`, 2026-08-20).
- **No models/sounds exist yet** for bows/arrows (`docs/assets/MODELS.md` M50/M51 — procedural fallback wired) or bow draw/release (`docs/assets/SOUNDS.md` S22 — currently silent); arrow hit/kill reuse the existing melee hit/kill sounds (no dedicated arrow-impact clip).
- **Verification**: `npx tsc --noEmit`, `pnpm lint:fix`, `pnpm run build`, `pnpm run test` (1283 tests, incl. new `combat/criticalHit.test.ts`, `combat/projectile.test.ts`, `combat/rangedAttack.test.ts`, `player/playerRanged.test.ts`, and archery coverage in `PlayerSkills.test.ts`) are all green. No browser/gameplay verification.

## Out of scope

- kusze,
- broń palna,
- body-part hitboxes,
- zaawansowana balistyka,
- wind drift,
- rozbudowany armor/penetration system,
- osobny arrow recovery system,
- rozbudowany ranged tactics/formation AI,
- bow durability/sharpness i weapon maintenance z Planu 161.

Plan 155 jest kontekstem istniejącej architektury inventory/instances, ale nie jest formalną zależnością dla stackable arrows. Plan 160 jest wzorcem `ItemKind` + `ITEM_CATALOG`. Plan 161 pozostaje osobnym, przyszłym rozszerzeniem weapon instances i nie jest zależnością Planu 162.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
