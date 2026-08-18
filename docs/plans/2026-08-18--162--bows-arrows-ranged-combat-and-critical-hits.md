---
domain: items-player
tags: [fauna, quests-progression]
---

# Plan: Bows, Arrows, Ranged Combat and Critical Hits

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** 🟡 medium · **Effort:** L
**Depends on:** ~~150~~ ~~155~~

> Check: `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits-implementation-notes.md`

## Cel

Rozszerzyć istniejący combat o wspólny mechanizm ataków dystansowych oraz pierwszą jego implementację w postaci łuków i strzał. W ramach tego samego rozszerzenia dodać trafienia krytyczne jako część wspólnego damage pipeline.

Zakres:

- 2–3 rodzaje łuków,
- 1–3 rodzaje strzał,
- ranged attacks używane przez gracza i NPC,
- projectile / lot strzały i trafienie celu,
- amunicja powiązana z istniejącym inventory/item instances,
- skill `archery`,
- critical hits jako wspólna mechanika combat, możliwa do wykorzystania także przez melee i inne przyszłe ataki.

Nie tworzyć osobnego „bow system”. Łuk ma być pierwszym użytkownikiem wspólnego ranged combat.

## Aktualny stan

Plan 150 rozszerzył istniejący melee combat o combat mode, target acquisition, soft lock, defense i downed state. Plan 155 wprowadził generyczne `ItemInstance` i lifecycle itemów, co powinno być bazą dla indywidualnych strzał i ich zużycia/odzyskiwania.

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
defense resolver
    ↓
final damage
    ↓
HealthState
```

Ranged attack powinien korzystać z istniejącego targetowania i health/damage ownership, zamiast tworzyć własne odpowiedniki.

## 2. Łuki

Dodać 2–3 typy łuków, przykładowo:

- `short_bow` — szybki, mały zasięg, niższe obrażenia,
- `hunting_bow` — uniwersalny,
- `long_bow` — większy zasięg/obrażenia, wolniejsze oddanie strzału.

Parametry powinny być centralnie konfigurowalne w istniejącym katalogu itemów/weapon config.

Nie tworzyć osobnego katalogu łuków.

Łuk powinien określać m.in.:

- ranged attack range,
- draw/attack time,
- bazową moc ataku,
- typ używanej amunicji,
- ewentualny modifier do critical chance.

Dokładne wartości są balansem i nie powinny być rozproszone po kodzie combat.

## 3. Strzały

Dodać 1–3 rodzaje strzał, przykładowo:

- `arrow` — podstawowa,
- `broadhead_arrow` — większe obrażenia przeciw żywym celom/polowaniu,
- `war_arrow` — cięższa, mocniejsza strzała.

Strzała jest amunicją i powinna korzystać z istniejącego systemu itemów oraz `ItemInstance`, zamiast mieć równoległy inventory state.

Każde wystrzelenie zużywa konkretną instancję amunicji. Jeżeli mechanika odzyskiwania strzał jest prosta do podpięcia do istniejącego world-item/item-instance flow, można ją objąć zakresem; nie tworzyć jednak osobnego systemu recovery tylko dla tego planu.

## 4. Projectile

Dodać minimalny wspólny projectile model potrzebny dla strzały.

Projectile powinien mieć co najmniej:

- origin,
- direction,
- speed,
- lifetime / max range,
- source entity,
- attack/damage payload.

Trafienie powinno korzystać z istniejących targetów/HealthState. Nie budować pełnej fizyki pocisku, jeśli nie jest potrzebna.

W pierwszej wersji ważniejsze są poprawne konsekwencje symulacyjne niż realistyczna balistyka.

Jeżeli projectile wizualny jest kosztowny, zachować możliwość uproszczonego/off-screen resolution zgodnie z istniejącą architekturą hybrydowej symulacji.

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

Celność powinna zależeć od `archery`, parametrów łuku oraz sensownych warunków ataku. Nie należy jeszcze tworzyć rozbudowanego systemu balistyki, wind drift czy hitboxów per body part.

Dla NPC resolver powinien być możliwy do wykonania bez konieczności symulowania każdego pocisku w pełnej rozdzielczości poza sytuacjami, gdzie taka wizualna symulacja jest potrzebna.

## 6. Critical hits

Dodać critical hit jako wspólny element istniejącego damage pipeline, a nie mechanikę specyficzną dla łuków.

Docelowo:

```text
successful hit
    ↓
critical check
    ├── normal → base damage
    └── critical → modified damage
```

Critical powinien być deterministyczny względem istniejącego RNG/simulation flow.

Konfiguracja powinna pozwalać określić co najmniej:

- bazową critical chance,
- critical damage multiplier,
- modifier z weapon/attack type,
- modifier ze skill/traits, jeśli istniejący system pozwala to zrobić bez tworzenia równoległego progression systemu.

Critical nie może omijać istniejącego defense resolvera. Kolejność powinna pozostać jawna, np.:

```text
hit
  ↓
critical modifier
  ↓
defense
  ↓
final damage
```

Jeżeli aktualny combat nie ma jeszcze sensownego wspólnego damage result, wydzielić mały współdzielony resolver/result zamiast dodawać warunki w każdym ataku.

## 7. Archery skill

Dodać skill `archery`, wykorzystując istniejący skill/progression mechanism.

Skill powinien wpływać przede wszystkim na zachowanie:

- celność,
- efektywny zasięg / stabilność ataku,
- czas oddania strzału,
- opcjonalnie critical chance w niewielkim zakresie.

Nie robić prostego „skill level = +X% damage”.

Skill powinien rosnąć przez faktyczne używanie łuku/ranged combat, zarówno przez gracza, jak i NPC, jeśli obecny skill model wspiera NPC progression.

Jeżeli istniejące traits/personality mogą wpływać na skuteczność, skill nie powinien ich zastępować. Finalna decyzja powinna korzystać z:

```text
weapon + arrow + archery + traits + combat state
→ ranged attack outcome
```

## 8. NPC combat

NPC powinny móc używać łuku przez ten sam ranged attack mechanism co gracz.

Nie tworzyć player-only ranged combat.

NPC powinien:

- posiadać łuk jako item/equipment,
- posiadać strzały jako inventory/item instances,
- rozpoznawać dystans jako element decyzji o ataku,
- wybrać ranged attack, gdy strategia/warunki są odpowiednie,
- zużywać amunicję,
- reagować na brak strzał przez istniejący decision/action flow.

Nie tworzyć osobnego `ArcherAI`. Wykorzystać istniejące decyzje/strategie combat i rozszerzyć je o możliwość ranged attack.

## 9. Player combat

Gracz powinien korzystać z tego samego ranged attack modelu.

Potrzebne elementy input/UI:

- wyposażenie łuku,
- posiadanie/wybór strzał,
- rozpoczęcie draw/attack,
- oddanie strzały,
- feedback trafienia/miss/critical.

Nie tworzyć osobnego inventory ani equipment flow tylko dla łuku.

## 10. Reuse existing systems

Przed implementacją sprawdzić aktualny kod szczególnie w:

- `src/player/playerMelee.ts` — istniejący combat/target flow;
- `src/app/gameLoop.ts` — input i integracja combat/interact;
- `src/app/interactables.ts` — istniejące combat targets;
- `src/shared/HealthState.ts` — HP/damage ownership;
- `src/items/itemCatalog.ts` — item/weapon configuration;
- `src/items/HeldTool.ts` — held item/equipment;
- `src/items/` — `ItemInstance` i inventory po planie 155;
- istniejącym skill/progression mechanism;
- `src/ai/NpcAgent.ts` — decyzje/akcje NPC;
- `src/fauna/` — istniejący combat/death flow.

Nie tworzyć:

- `BowSystem`,
- `ArrowSystem`,
- `ArcherAI`,
- osobnego inventory dla amunicji,
- osobnego health/damage systemu,
- drugiego target managera,
- God Object `CombatManager`.

## 11. Performance / simulation

Projectile i ranged combat muszą być kompatybilne z hybrydową symulacją Seedvale.

Dla obserwowanych/ważnych walk można używać pełnego projectile visualization.

Dla odległych NPC nie wymagamy renderowania każdej strzały. Wynik ataku może zostać rozwiązany jako deterministyczne zdarzenie symulacyjne, zachowując:

- źródło,
- cel,
- czas,
- amunicję,
- hit/miss,
- critical,
- damage,
- konsekwencje.

Nie dodawać Web Workera tylko dla tego planu bez pomiaru kosztu.

## 12. Implementation phases

### Phase 1 — Audit

Zweryfikować aktualny combat, item instances, equipment, skills oraz NPC combat. Ustalić dokładne miejsca rozszerzenia przed zmianami.

### Phase 2 — Damage result + critical

Wydzielić/rozszerzyć wspólny damage result/resolver i dodać critical hit bez zmiany zachowania istniejącego melee poza nową opcjonalną mechaniką.

### Phase 3 — Ranged attack abstraction

Dodać wspólny ranged attack flow oraz minimalny projectile model.

### Phase 4 — Bows + arrows

Dodać 2–3 łuki i 1–3 strzały w istniejącym item catalogu. Podpiąć amunicję przez `ItemInstance`.

### Phase 5 — Archery skill

Dodać `archery` do istniejącego progression mechanism i podłączyć go do ranged outcome.

### Phase 6 — Player + NPC

Podłączyć gracza i NPC do tego samego ranged combat flow. Dodać decyzję NPC o użyciu łuku bez osobnego AI.

### Phase 7 — Feedback + balancing

Dodać podstawowy feedback hit/miss/critical, dobrać parametry broni, amunicji, celności i critical chance oraz sprawdzić zachowanie w walce i polowaniu.

## Acceptance criteria

- Istnieje wspólny ranged attack mechanism zamiast osobnego systemu łuków.
- Istnieją 2–3 różne łuki z realnie różnymi parametrami.
- Istnieje 1–3 rodzaje strzał jako amunicja.
- Wystrzelenie zużywa istniejącą instancję amunicji.
- Strzała może trafić lub chybić.
- Trafienie przechodzi przez istniejący damage/health pipeline.
- Critical hit jest możliwy dla ranged attack.
- Critical jest częścią wspólnego combat pipeline i nie jest zakodowany wyłącznie dla łuków.
- Defense z planu 150 nadal działa przy trafieniu z łuku.
- `archery` jest istniejącym skill/progression mechanism, a nie osobnym systemem.
- Skill realnie wpływa na ranged combat outcome.
- Gracz może użyć łuku w walce.
- NPC może użyć łuku w walce przez ten sam mechanizm.
- NPC zużywa własne strzały i reaguje na brak amunicji przez istniejący decision/action flow.
- Nie powstaje osobny `BowSystem`, `ArrowSystem`, `ArcherAI`, inventory ani health system.
- Ranged combat może działać w uproszczonej formie poza obserwowanym obszarem bez wymagania renderowania każdego projectile.
- Istniejące melee combat i animal death flow nie zostają przypadkowo zepsute.
- `tsc`, build i test przechodzą.
- Browser verification obejmuje co najmniej: strzał gracza, hit/miss, critical, różne łuki/strzały, zużycie amunicji oraz NPC używającego łuku.

## Out of scope

- kusze,
- broń palna,
- body-part hitboxes,
- zaawansowana balistyka,
- wind drift,
- rozbudowany armor/penetration system,
- crafting specjalnie dla łuków/strzał poza istniejącymi mechanizmami,
- osobny system recovery strzał, jeśli wymagałby nowej architektury,
- rozbudowany ranged tactics/formation AI.

> Zrób git commit i push do main, rebase jeżeli trzeba
