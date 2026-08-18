---
domain: items-player
tags: [fauna, ui-input]
---

# Plan: Combat Mode, Target Lock, Defense and Downed State

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~123~~ ~~124~~

## Cel

Rozwinąć istniejący melee combat w bardziej przewidywalny system walki:

- combat mode ma priorytet nad przypadkowymi interakcjami ze światem,
- `Tab` wybiera wyłącznie żywe cele bojowe,
- `Shift + Tab` pozwala świadomie przełączać się na cele nieożywione/interaktywne,
- aktywny cel jest utrzymywany jako **soft lock**, bez blokowania ruchu ani kamery,
- utrata wszystkich HP powoduje stan `downed`: postać pada, pozostaje na ziemi przez określony czas, a następnie wstaje,
- broń lub przedmiot trzymany w ręku może dawać szansę na blok całkowity albo częściową redukcję obrażeń,
- skuteczność obrony jest powiązana ze skill'em bojowym, który rośnie przez używanie mechaniki walki.

Regeneracja HP i apteczki są **poza zakresem** tego planu i będą osobnym zadaniem.

## Aktualny stan

Plan rozszerza istniejący combat, zamiast tworzyć drugi system:

- `src/player/playerMelee.ts` zawiera już wspólny melee state machine, target acquisition, pamięć ostatnich trafionych celów, hit detection i gap-close; istnieje `pickCombatTarget()` oraz `yawToward()`. cite nie dotyczy repo — patrz aktualny kod
- plan 123 wprowadził wspólną akcję melee i `HealthState` jako źródło HP/damage;
- plan 124 dodał forgiving target acquisition i gap-close;
- plan 142 dotyczy mobile target acquisition/auto-facing i powinien nadal korzystać ze wspólnego targetowania, bez tworzenia drugiego systemu.

Przed implementacją ponownie sprawdzić aktualny kod, ponieważ plany 123/124/142 mogą być już częściowo lub całkowicie zaimplementowane.

## 1. Combat mode

Nie tworzyć ciężkiego `CombatManager` ani osobnego globalnego singletonu.

Wprowadzić mały, jawny stan combat, którego ownership pozostaje przy istniejącym player combat/input flow.

### Wejście w combat

Combat mode aktywuje się, gdy:

- gracz rozpocznie atak,
- gracz zostanie trafiony przez przeciwnika,
- gracz wybierze żywy combat target przez `Tab`.

Nie ma osobnego pojęcia „aktywny cel bojowy” wymaganego do wejścia w combat — aktywna walka i aktywny target są powiązanymi, ale rozdzielnymi stanami.

### Zachowanie w combat

- ruch pozostaje swobodny,
- kamera pozostaje swobodna,
- nie ma hard lock-on ani automatycznego śledzenia celu,
- aktualny living target jest utrzymywany jako soft lock,
- zwykła interakcja świata nie może przypadkowo zastąpić combat targetu.

Combat mode kończy się po krótkim czasie bez aktywnej walki, ataku, obrażeń i living targetu. Dokładny timeout dobrać jako parametr podczas implementacji/browser verification, bez hardcodowania logiki w inputach.

## 2. Target categories i klawisze

Target acquisition rozdzielić na dwie istniejące logicznie kategorie.

### `Tab` — living combat targets

`Tab` cykluje wyłącznie po żywych celach bojowych:

- NPC,
- animals,
- przyszłe żywe combatants, jeżeli pojawią się w istniejącym modelu targetów.

Przykład:

```text
Wolf A → Wolf B → Wolf C → Wolf A
```

Pierwszy target po `Tab` powinien być wybierany deterministycznie przez istniejący ranking targetów. Preferować sensowny cel względem kierunku patrzenia, dystansu i istniejącej pamięci targetów zamiast arbitralnego kolejnego elementu listy.

Jeżeli gracz jest w grupie zwierząt, kolejne `Tab` pozwala świadomie wybrać konkretne zwierzę.

### `Shift + Tab` — non-living / world targets

`Shift + Tab` cykluje po interaktywnych celach nieożywionych:

- drzewa,
- skrzynie,
- przedmioty,
- inne istniejące world interactables.

Nie tworzyć osobnego systemu `WorldTargetManager`. Wykorzystać istniejący mechanizm interakcji/targetów i dodać jedynie rozróżnienie kategorii tam, gdzie jest potrzebne.

Świadome `Shift + Tab` może opuścić living combat target i wrócić do normalnej interakcji ze światem.

### Normalne wskazanie/interakcja

Poza combat mode obecne zachowanie interakcji pozostaje bez zmian.

W combat mode kliknięcie/przycisk interakcji nie może przypadkowo przełączyć living combat targetu na drzewo lub inny world object. Do tego służy jawne `Shift + Tab`.

## 3. Target detection range

Rozdzielić dwa pojęcia:

```text
target detection range
        ↓
    można wybrać cel
        ↓
weapon attack range
        ↓
    można trafić
```

`target detection range` musi być większy niż zasięg aktualnej broni.

Dzięki temu gracz może mieć aktywny target znajdujący się np. kilka metrów dalej, mimo że aktualny atak jeszcze go nie dosięga.

Nie używać weapon `range` jako jedynego ograniczenia target acquisition.

Istniejący gap-close z planu 124 pozostaje mechanizmem podejścia do celu; nie zastępować go większym weapon range.

## 4. Soft target lock

Po wyborze living targetu utrzymywać jego ID jako aktywny target.

Soft lock oznacza:

- target pozostaje aktywny mimo drobnych zmian kąta patrzenia,
- gracz może swobodnie chodzić,
- gracz może swobodnie obracać kamerę,
- system nie obraca stale gracza do celu,
- target może zostać zmieniony przez `Tab`, utracony albo zastąpiony przez świadome `Shift + Tab`.

Nie implementować hard lock-on ani automatycznego śledzenia kamery.

Target powinien zostać unieważniony, gdy obiekt przestaje być prawidłowym living combat targetem, np. umiera albo zostaje usunięty.

## 5. Downed state

Obecny `HealthState` ustawia `dead` przy HP = 0. Należy zweryfikować wszystkie obecne użytkowania tego pola przed zmianą semantyki.

Dla postaci podlegających temu systemowi rozdzielić:

```text
alive
  ↓ damage
HP = 0
  ↓
downed
  ↓ timer
recover / stand up
```

`downed` nie jest tym samym co trwała śmierć.

### Zachowanie

Po zejściu HP do 0:

- postać przestaje wykonywać normalne akcje bojowe,
- aktywny attack state zostaje anulowany,
- postać wykonuje animację upadku / przechodzi do leżącej pozycji,
- przez określony czas pozostaje `downed`,
- po zakończeniu czasu może wstać i wrócić do normalnego działania.

Dokładny czas `downed` powinien być konfigurowalny i dobrany podczas browser verification.

Nie dodawać w tym planie regeneracji HP. Wstanie oznacza odzyskanie stanu działania zgodnie z późniejszym systemem HP/regeneracji, który zostanie opisany osobno.

### Ważne

Nie łamać istniejącego lifecycle śmierci zwierząt. Zwierzęta, dla których obecny model oznacza realną śmierć po HP = 0, muszą nadal korzystać z istniejącego death/collapse/onDeath flow, chyba że audyt pokaże, że ten plan powinien świadomie rozszerzyć również ich lifecycle.

Plan powinien przede wszystkim objąć combatants, dla których wymagany jest stan `downed`, bez globalnego zastępowania `dead` przez `downed`.

## 6. Defense

Dodać wspólny, deterministyczny resolver obrony przed otrzymaniem obrażeń.

Kolejność:

```text
incoming attack
    ↓
defense check
    ├── full block → 0 damage
    ├── partial block → reduced damage
    └── no block → full damage
```

### Item / weapon in hand

Trzymany przedmiot może dostarczać parametrów obronnych przez istniejący `ITEM_CATALOG` / istniejącą konfigurację itemów.

Nie tworzyć drugiego katalogu broni ani osobnego systemu equipment stats.

Przedmiot powinien móc określać co najmniej:

- czy może blokować,
- bazową szansę na block,
- maksymalną/typową redukcję obrażeń przy partial block.

Dokładne wartości dla konkretnych itemów są częścią balansu i powinny być centralnie konfigurowalne.

### Kierunek ataku

Defense powinno uwzględniać, czy atak znajduje się w sensownym kierunku obrony przed postacią — nie chcemy tarczy/przedmiotu blokującego automatycznie każdy atak z dowolnego kierunku.

Wykorzystać istniejącą geometrię kierunku/facing zamiast raycastowania całego świata.

## 7. Combat defense skill

Dodać jeden skill związany z combat defense, zamiast wielu małych umiejętności.

Skill:

- wpływa na skuteczność defense,
- poprawia szansę na block i/lub skuteczność partial block,
- rośnie poprzez rzeczywiste używanie mechaniki obrony,
- ma jawne limity/progression zamiast losowego wzrostu.

Nie tworzyć osobnego skill systemu, jeżeli istniejący progression/skill mechanism może zostać rozszerzony.

Skill nie powinien samodzielnie dodawać damage, HP regeneration ani armor.

## 8. Damage pipeline

Defense musi wejść **przed** istniejące `damageHealth()` / damage application.

Docelowo:

```text
attack
  ↓
hit / target
  ↓
defense resolver
  ↓
final damage
  ↓
existing HealthState
  ↓
downed or death lifecycle
```

Nie duplikować health state ani damage modelu.

## 9. Reuse existing systems

Przed implementacją sprawdzić i rozszerzać:

- `src/player/playerMelee.ts` — melee lifecycle, `pickCombatTarget()`, target memory, hit detection;
- `src/app/gameLoop.ts` — istniejący input/interact/combat integration;
- `src/app/interactables.ts` — `buildCombatTarget()` i istniejące interactables;
- `src/shared/HealthState.ts` — HP/damage ownership;
- `src/items/itemCatalog.ts` — item/melee configuration;
- `src/items/HeldTool.ts` — aktualnie trzymany przedmiot;
- `src/player/PlayerController.ts` — ruch/facing;
- `src/ai/NpcAgent.ts` — NPC health/combat lifecycle, jeśli NPC zostaną objęte defense/downed;
- `src/fauna/AnimalAgent.ts` / `src/fauna/faunaCombat.ts` — istniejący fauna combat/death flow;
- istniejący skill/progression mechanism, jeżeli taki już obsługuje player skills.

Nie tworzyć:

- `CombatManager` jako God Object,
- `TargetManager` tylko dla tego zadania,
- osobnego `DefenseSystem`, jeśli resolver może być małym współdzielonym modułem,
- nowego health systemu,
- drugiego item/weapon catalogu.

## 10. Implementation phases

### Phase 1 — Audit

Zweryfikować aktualny combat po planach 123/124 oraz istniejącą ścieżkę interakcji.

W szczególności ustalić:

- gdzie obecnie wybierany jest target,
- jak `buildCombatTarget()` odróżnia living targets od world interactables,
- gdzie `gameLoop` wybiera interakcję,
- które encje używają `HealthState.dead` jako trwałej śmierci,
- gdzie istnieje player/NPC skill progression.

### Phase 2 — Combat mode + target categories

Dodać minimalny combat state oraz:

- `Tab` → living targets,
- `Shift + Tab` → non-living targets,
- soft lock,
- większy target detection range,
- deterministyczny cycling.

Nie zmieniać istniejącego melee hit detection.

### Phase 3 — Downed lifecycle

Rozszerzyć health/lifecycle tylko tam, gdzie jest to potrzebne dla postaci, bez niszczenia istniejącego animal death flow.

Dodać downed timer, anulowanie akcji i wejście/wyjście ze stanu.

### Phase 4 — Defense

Dodać defense config do istniejących itemów i resolver przed damage application.

Najpierw full block / partial block / no block, potem skill modifier.

### Phase 5 — Combat defense skill

Podłączyć istniejący progression/skill mechanism albo małe rozszerzenie istniejącego systemu.

Skill powinien rosnąć tylko przy faktycznym użyciu defense.

### Phase 6 — Cleanup + integration

Usunąć przypadkowe world interaction podczas combat, uporządkować ownership targetów i upewnić się, że player/NPC/fauna korzystają z istniejących wspólnych mechanizmów tam, gdzie semantyka jest wspólna.

## Acceptance criteria

### Combat mode / targets

- Rozpoczęcie ataku wprowadza playera w combat mode.
- Otrzymanie obrażeń od przeciwnika również może wejść w combat mode.
- `Tab` wybiera wyłącznie living combat targets.
- `Tab` pozwala przełączać się między kilkoma zwierzętami/NPC.
- `Shift + Tab` wybiera non-living/world targets.
- Zwykła interakcja nie zastępuje przypadkowo living combat targetu podczas walki.
- Living target może pozostać aktywny mimo niewielkiej zmiany kierunku patrzenia.
- Ruch i kamera nie są blokowane przez target lock.
- Target detection range jest większy niż weapon attack range.
- Target poza attack range może być aktywny, ale nie może zostać trafiony samym weapon hit.

### Downed

- HP = 0 powoduje wymagany stan `downed` dla objętych nim postaci.
- Postać pada i pozostaje leżąca przez konfigurowalny czas.
- W `downed` nie może normalnie atakować ani wykonywać zwykłych akcji combat.
- Po timerze postać może wstać.
- Istniejący permanent death/collapse lifecycle zwierząt nie zostaje przypadkowo zepsuty.

### Defense

- Przedmiot w ręku może umożliwiać defense.
- Defense może dać full block → 0 damage.
- Defense może dać partial block → reduced damage.
- Brak udanej obrony pozostawia pełny damage.
- Kierunek ataku ma znaczenie dla możliwości obrony.
- Final damage przechodzi przez istniejący `HealthState`.
- Nie powstaje drugi health/damage system.

### Skill

- Combat defense skill istnieje jako część istniejącego progression mechanism.
- Skill poprawia skuteczność defense.
- Skill rośnie przez rzeczywiste używanie obrony.
- Nie wpływa bezpośrednio na HP regeneration ani apteczki.

## Verification

### Code / tests

- TypeScript / lint / test / build.
- Test cycling `Tab` tylko po living targets.
- Test `Shift + Tab` tylko po non-living targets.
- Test target detection range > weapon range.
- Test zachowania soft lock po zmianie kierunku.
- Test unieważnienia targetu po śmierci/usunięciu.
- Test downed transition i timer.
- Test, że downed postać nie wykonuje normalnego ataku.
- Test full block.
- Test partial block.
- Test no block.
- Test wpływu defense skill.
- Test, że final damage nadal korzysta z istniejącego `HealthState`.
- Test regresji istniejącego animal death/collapse lifecycle.

### Browser / gameplay

Zweryfikować desktop oraz istniejący mobile combat flow:

1. Grupa zwierząt — `Tab` pozwala wybrać konkretne zwierzę.
2. Wielu przeciwników — aktywny target nie przeskakuje przypadkowo na drzewo.
3. Target kilka metrów dalej — można go wybrać mimo że broń jeszcze nie dosięga.
4. Atak zbyt daleko — brak trafienia poza weapon range.
5. `Shift + Tab` świadomie wybiera drzewo/world object.
6. Ruch i obrót kamery pozostają swobodne przy soft lock.
7. Target umiera/znika — lock zostaje prawidłowo unieważniony.
8. Player/NPC objęty downed — pada, leży, a następnie wstaje.
9. Defense z przedmiotem blokującym — obserwować pełny i częściowy block.
10. Defense bez odpowiedniego przedmiotu — damage pozostaje pełny.
11. Wyższy skill daje zauważalnie lepszą obronę bez automatycznego blokowania każdego ataku.
12. Istniejący melee timing, stamina, gap-close i animal death behaviour nadal działają.
13. Mobile target acquisition z planu 142 nie traci swojej tolerancji/auto-facing.

Wartości balansu (`downed duration`, target detection range, block chances, partial reduction, skill progression) dobrać po pierwszym działającym przebiegu i browser verification, zamiast zakładać je na sztywno w planie.

## Out of scope

- HP regeneration,
- apteczki,
- ranged combat,
- combos,
- dodge/roll,
- parry jako osobna mechanika timingowa,
- armor system,
- weapon durability,
- status effects,
- multiplayer combat,
- pełny NPC combat AI redesign,
- nowy globalny CombatManager.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
