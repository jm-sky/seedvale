---
domain: items-player
tags: [fauna, quests-progression]
---

# Plan: Bows, Arrows, Ranged Combat and Critical Hits

**Created:** 2026-08-18
**Status:** `planned` 📋
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

- Istnieje wspólny ranged attack mechanism zamiast osobnego systemu łuków.
- Istnieją 2–3 różne łuki z realnie różnymi parametrami.
- Istnieje 1–3 rodzaje strzał jako stackable `ItemKind` + count.
- Wystrzelenie zużywa 1 sztukę istniejącej stackable amunicji.
- Nie powstaje `ArrowItemInstance`, quiver inventory ani arrow-specific persistence.
- Strzała może trafić lub chybić.
- Trafienie przechodzi przez istniejący damage/health pipeline.
- Critical hit jest możliwy dla ranged attack i jest częścią wspólnego pipeline.
- Istniejąca obrona jest używana tam, gdzie target ma wymagane defense inputs.
- `archery` korzysta z istniejącego skill/progression mechanism.
- Gracz może użyć łuku przez istniejący held-item flow.
- NPC może użyć łuku przez ten sam mechanizm.
- NPC zużywa stackable amunicję i reaguje na jej brak przez istniejący decision/action flow.
- `AnimalAgent`/fauna pozostaje ownerem konsekwencji trafienia zwierzęcia.
- Nie powstaje żaden z zakazanych równoległych systemów.
- Ranged combat może działać w uproszczonej formie poza obserwowanym obszarem.
- Istniejące melee i animal death flow nie zostają przypadkowo zmienione.
- `tsc`, build i test przechodzą.
- Browser verification obejmuje gracza, hit/miss, critical, różne łuki/strzały, zużycie amunicji i NPC ranged attack.

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
