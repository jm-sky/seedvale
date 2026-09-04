# Plan: Animal traps — bait attraction and species coverage

**Created:** 2026-09-04
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-010
**Domain:** `fauna`
**Subdomains:** `predation` `prey` `habitat`
**Tags:** `traps` `bait` `attraction` `interaction`
**Roadmap:** -

## Cel

Rozwinąć istniejący system pułapek tak, aby:

- obejmował sensownie większą część dzikiej fauny,
- typ pułapki miał znaczenie dla wielkości i siły zwierzęcia,
- przynęta rzeczywiście przyciągała kompatybilne zwierzęta zamiast być wyłącznie ukrytym bonusem do detection roll,
- gracz świadomie wybierał przynętę podczas interakcji z pułapką zamiast automatycznie zużywać pierwszy item z inventory.

Rozszerzać obecne `animalTraps.ts` / `createPlacedTraps.ts`, wspólną dietę z `fauna-010`, istniejący fauna decision/navigation pipeline i istniejącą interakcję z pułapką. Nie tworzyć osobnego trapping AI, osobnego systemu zapachu ani drugiego modelu diety.

## Stan obecny

Aktualnie `TRAPPABLE_SPECIES` zawiera tylko:

```text
boar
rabbit
deer   // sarna
```

`stag` oznacza jelenia i został wcześniej celowo wykluczony jako zbyt duży dla V1. Predatory zostały wykluczone jako grupa.

Obie pułapki używają tej samej listy gatunków. Przynęta nie wpływa na ruch zwierząt: obniża tylko detection chance przez `TRAP_BAIT_DETECTION_CUT`. Podczas uzbrajania `armTrap()` automatycznie pobiera pierwszy dostępny item z `BAIT_ITEM_PRIORITY`.

## 1. Kompatybilność gatunek × typ pułapki

Zastąpić pojedyncze `TRAPPABLE_SPECIES` deklaratywną kompatybilnością gatunku z typem pułapki.

V1 proponowany zakres:

| Gatunek | Simple | Good | Uwagi |
|---|---:|---:|---|
| rabbit | tak | tak | mała zdobycz |
| fox | tak | tak | mały drapieżnik |
| deer (sarna) | tak | tak | obecne zachowanie |
| boar | tak | tak | obecne zachowanie |
| stag (jeleń) | nie | tak | za duży dla simple |
| wolf | nie | tak | silny drapieżnik, wymaga good |
| bear | nie | nie | poza skalą obecnych pułapek |

Domestic/livestock (`dog`, `horse`, `cow`, `sheep`, `donkey`, `chicken`, `rooster`) pozostają poza systemem pułapek gracza w tym planie.

Nie kodować wyjątków typu `kind === 'wolf'` w runtime. Jedna tabela/definicja ma odpowiadać za kompatybilność.

Jeżeli podczas implementacji rzeczywiste parametry modeli/combat pokażą, że `boar` powinien również wymagać `good`, można skorygować tabelę bez zmiany architektury.

## 2. Przynęta musi być zgodna z dietą

Nie utrzymywać osobnej tabeli `trap bait species` równolegle do `AnimalDef` diet z `fauna-010`.

Podstawowa reguła:

```text
bait item
→ shared food/diet metadata
→ species can consume / is attracted by item
→ trap is a valid lure candidate
```

Przykładowo:

```text
rabbit + carrot/plant food → attraction
stag + compatible plant food → attraction
wolf + meat → attraction
fox + meat → attraction
wolf + carrot → brak attraction
```

Jeżeli wspólny diet contract nie pozwala bezpiecznie odpowiedzieć na pytanie „czy ten item jest atrakcyjny dla gatunku?”, rozszerzyć go minimalnie zamiast tworzyć trapping-only listy.

## 3. Bait attraction jako stimulus do istniejącej AI

Aktywna, zanęcona pułapka powinna wystawiać lekki world stimulus / food-lure candidate dla kompatybilnych zwierząt w pobliżu.

Nie przesuwać zwierzęcia bezpośrednio z `createPlacedTraps.update()` i nie tworzyć drugiego movement loop.

Preferowany flow:

```text
active trap + bait
→ nearby compatible animal notices lure
→ existing fauna decision scoring considers investigating/foraging toward bait
→ existing navigation moves animal toward trap
→ animal enters trigger radius
→ existing detection/capture resolution
```

Attraction ma konkurować z istniejącymi potrzebami i zachowaniami. Nie może nadpisywać ważniejszych stanów, takich jak:

- flee / immediate threat,
- combat/chase,
- critical thirst/hunger behaviour, jeśli istniejący scorer nadaje mu wyższy priorytet,
- household/home constraints zwierząt, które w przyszłości mogłyby korzystać z podobnego stimulus.

Nie dodawać ciągłego „magnesu” ani steeringu prosto do pułapki.

## 4. Zasięg i siła attraction

Attraction powinno być ograniczone przestrzennie i deterministyczne.

W V1 wystarczy niewielki deklaratywny zestaw parametrów, np.:

- lure radius,
- lure score/weight,
- opcjonalnie multiplier wynikający z jakości/typu przynęty, tylko jeśli istniejące food metadata dostarcza naturalnej wartości.

Nie projektować jeszcze pełnej symulacji zapachu, kierunku wiatru, scent trails ani diffusion map.

Różne gatunki mogą mieć różną podatność na lure tylko wtedy, gdy można to wyrazić przez istniejący species/decision config bez mnożenia trapping-only parametrów.

## 5. Detection po dojściu do pułapki

Zachować istniejący detection roll i `Traps` skill jako mechanizm rozstrzygający spotkanie przy pułapce.

Przynęta nadal może obniżać detection chance, ale jej główną nową funkcją jest **doprowadzenie zwierzęcia w pobliże pułapki**.

Flow:

```text
bait attracts animal
→ animal approaches
→ enters trigger radius
→ detection roll
    detected → escapes / cooldown
    not detected → capture
```

Nie robić z attraction gwarancji złapania.

## 6. Świadomy wybór przynęty

Usunąć automatyczne pobieranie pierwszego itemu z `BAIT_ITEM_PRIORITY` przy `armTrap()`.

Interakcja z rozbrojoną pułapką powinna pozwolić graczowi zdecydować:

```text
Uzbrój bez przynęty
Uzbrój z przynętą…
Zabierz pułapkę
```

Po wyborze `Uzbrój z przynętą…` pokazać tylko bait-capable itemy faktycznie dostępne w inventory, z czytelną nazwą i liczbą sztuk.

Nie tworzyć dużego inventory screen. Użyć najbliższego istniejącego lekkiego Vue dialog/menu/choice mechanism po reconie UI.

## 7. Transaction invariant dla przynęty

Zachować invariant:

> Item przynęty jest usuwany dokładnie raz dopiero wtedy, gdy wybór i uzbrojenie pułapki zakończyły się sukcesem.

Nie usuwać itemu przed operacją, a potem próbować go ręcznie oddawać przy failure, jeśli istniejący action/UI flow pozwala najpierw zwalidować całą operację.

Po rozbrojeniu lub zabraniu pułapki przed udanym capture przynęta nadal wraca do inventory; przy braku miejsca może wykorzystać obecny dropped-item fallback.

Udany capture zużywa przynętę.

## 8. Zmiana/przegląd przynęty

Prompt/interakcja aktywnej pułapki powinna pokazywać, czy pułapka ma przynętę i jaką.

V1 nie musi pozwalać wymieniać przynęty „na żywo”. Najprostsza spójna ścieżka:

```text
active trap
→ Rozbrój
→ bait wraca
→ ponowne uzbrojenie
→ wybór nowej przynęty
```

Unika to dodatkowego mutation path dla aktywnej pułapki.

## 9. UI / feedback

Gracz powinien móc łatwo odczytać:

- stan: rozbrojona / uzbrojona / zniszczona,
- aktualną przynętę albo brak,
- durability,
- dla wyboru przynęty: dostępne itemy i count.

Po uzbrojeniu feedback powinien jasno mówić np.:

```text
Pułapka uzbrojona bez przynęty.
Pułapka uzbrojona — przynęta: Surowe mięso.
```

Nie ujawniać graczowi surowych procentów attraction/detection w zwykłym HUD; mogą być dostępne w debug tooling.

## 10. Persistence

`PlacedTrapRecord.baitKind` już jest persistowane jako część stanu pułapki. Zachować ten authority.

Jeżeli attraction wymaga transient runtime target/cooldown state, nie persistować go bez wyraźnej potrzeby. Po reloadzie pułapka z zapisanym `baitKind` powinna ponownie stać się źródłem attraction.

Nie tworzyć osobnego `TrapBaitSaveData`.

## 11. Off-screen / hybrid simulation boundary

Nie rozszerzać w tym planie pułapek do pełnej agregowanej symulacji zwierząt poza aktywną fauną, jeśli taka fauna nie jest jeszcze symulowana w tym samym fidelity.

Mechanizm attraction powinien jednak należeć do domeny world/fauna, a nie camera/player proximity, aby przyszły off-screen simulation mógł użyć tych samych reguł.

Pułapka ma działać niezależnie od obecności gracza.

## 12. Performance

Nie wykonywać pełnego `all animals × all traps` skanu co frame.

Wykorzystać istniejące throttling/spatial mechanisms tam, gdzie są dostępne. Obecny trap proximity pass działa co `TRAP_CHECK_INTERVAL_SEC`; attraction również powinno mieć niską częstotliwość i bounded nearby query/candidate set.

Ruch pozostaje własnością `AnimalAgent` / istniejącego navigation pipeline.

Nie tworzyć Web Workera dla tej funkcji.

## 13. Debugging

Rozszerzyć istniejący fauna/trap debug tylko jeśli potrzebne o:

- trap bait kind,
- species compatibility z trap kind,
- bait compatibility z dietą obserwowanego zwierzęcia,
- lure radius,
- czy trap jest aktualnym lure targetem zwierzęcia,
- detection chance po wejściu w trigger radius.

Debug powinien pozwolić odpowiedzieć:

> Dlaczego to zwierzę ignoruje tę przynętę albo dlaczego podeszło, ale nie zostało złapane?

## Testy

Dodać testy przede wszystkim dla domenowych reguł:

- simple/good mają deklaratywnie różne species coverage,
- `stag` i `wolf` nie mogą zostać złapane przez `simple`,
- `stag` i `wolf` mogą zostać złapane przez `good`,
- `bear` pozostaje niekompatybilny,
- domestic animals pozostają niekompatybilne,
- zgodna dietetycznie przynęta tworzy attraction candidate,
- niezgodna przynęta nie przyciąga gatunku,
- pułapka bez bait nie tworzy lure,
- nieaktywna/zniszczona pułapka nie tworzy lure,
- attraction nie omija istniejącego detection roll,
- successful capture consumes bait exactly once,
- disarm/collect returns bait exactly once,
- wybór `bez przynęty` nie zużywa itemu,
- anulowanie bait selection nie zużywa itemu,
- reload aktywnej pułapki z `baitKind` odtwarza lure behaviour.

## Manual verification

W przeglądarce sprawdzić co najmniej:

1. Rozbrojona pułapka daje wybór uzbrojenia bez przynęty lub z konkretną przynętą.
2. Lista przynęt odpowiada rzeczywistemu inventory i nie zużywa itemu przed zatwierdzeniem.
3. Królik/sarna/dzik nadal mogą zostać złapane.
4. Lis może wejść w system trapping zgodnie z tabelą.
5. Jeleń (`stag`) ignoruje `simple` jako pułapkę zdolną do capture, ale może zostać złapany przez `good`.
6. Wilk nie może zostać złapany przez `simple`, ale `good` z kompatybilnym mięsem może go przyciągnąć i złapać.
7. Niedźwiedź nie może zostać złapany przez żadną obecną pułapkę.
8. Roślinożerca reaguje na kompatybilną roślinną przynętę, ale nie na niezgodny bait.
9. Wilk reaguje na kompatybilne mięso, ale nie na roślinną przynętę.
10. Zwierzę nie jest teleportowane ani bezwarunkowo prowadzone do pułapki; silniejsze zachowania nadal mogą wygrać decyzję.
11. Po podejściu nadal może wykryć pułapkę i uciec.
12. Rozbrojenie pułapki zwraca przynętę; capture ją zużywa.
13. Save/load zachowuje wybraną przynętę i po reloadzie attraction działa nadal.

## Non-goals

Poza zakresem tego planu:

- nowe modele/typy dużych pułapek na niedźwiedzie,
- pułapki żywołowne,
- trapping livestock/domestic animals,
- scent trails i wiatr wpływający na zapach,
- crafting/repair overhaul,
- NPC trapping jobs,
- pełna off-screen fauna/trap simulation,
- osobna macierz bait effectiveness utrzymywana obok wspólnej diety.

## Implementation notes

Przed implementacją przygotować `docs/plans/implementation-notes/fauna-014-animal-traps-bait-attraction-and-species-coverage-implementation-notes.md` po reconie aktualnych:

- `src/world/animalTraps.ts`,
- `src/world/createPlacedTraps.ts`,
- `src/app/actions/gatheringActions.ts`,
- `src/fauna/AnimalAgent.ts`,
- `src/fauna/faunaDecision.ts`,
- diet/food source API z `fauna-010`,
- player interaction / Vue dialog infrastructure.

Ważne funkcje/publiczne kontrakty dodane przy implementacji powinny dostać JSDoc; dla istotnych punktów domenowych użyć `@domain fauna` tam, gdzie pomoże to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
