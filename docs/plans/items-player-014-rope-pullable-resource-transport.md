# Plan: Rope-pullable resource transport

**Created:** 2026-09-02
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~155~~ ~~122~~
**Domain:** `items-player`

## Cel

Umożliwić graczowi transport fizycznych przedmiotów, których nie może umieścić w inventory.

Pierwszym mechanizmem jest ciągnięcie przedmiotu na linie. Rozwiązanie ma wykorzystać istniejące item instances, interakcje, movement oraz Stamina/Vigor zamiast tworzyć równoległe systemy.

Problem jest szczególnie widoczny przy gromadzeniu dużych ilości materiałów budowlanych, takich jak belki i kamień.

## UX

### Zwykły pickup

Jeżeli cały podnoszony item/stack mieści się w inventory, zachowanie pozostaje bez zmian:

`E — Podnieś`

### Pickup bez miejsca

Jeżeli pickup nie może zostać wykonany atomowo z powodu braku miejsca:

- item musi mieć capability `ropePullable`,
- gracz musi posiadać linę,
- pojawia się alternatywna akcja:

`R — Ciągnij liną`

Nie pokazujemy stale dodatkowego promptu dla każdego przedmiotu. Opcja ciągnięcia pojawia się jako alternatywa, gdy zwykły pickup nie jest możliwy.

Jeżeli gracz nie ma liny albo item nie jest `ropePullable`, pozostaje tylko istniejący komunikat o braku możliwości podniesienia.

### Podczas ciągnięcia

Po rozpoczęciu:

- lina jest automatycznie przypięta,
- gracz normalnie steruje postacią,
- item pozostaje fizycznym obiektem świata,
- nie trafia do inventory,
- transport jest ograniczony ruchem i stamina drainem,
- gracz może zakończyć ciągnięcie i pozostawić item w świecie.

UI powinno pokazywać minimalny stan aktywnego transportu, np.:

`🪢 Ciągniesz: Belka`

oraz istniejącą akcję/input służący do odczepienia.

Nie wprowadzamy osobnego trybu ręcznego sterowania liną ani bezpośredniego sterowania pozycją ładunku.

## Item capability

Dodać capability określającą, czy konkretny item może być ciągnięty liną, np.:

`ropePullable: true`

Capability opisuje możliwość transportu, a nie parametry fizyczne.

Nie należy duplikować masy ani innych właściwości itemu wyłącznie na potrzeby liny. Jeżeli istnieją odpowiednie dane fizyczne itemu, system powinien je wykorzystać do wyliczenia zachowania.

Potencjalne przyszłe zastosowania obejmują m.in.:

- belki,
- duże kłody,
- stosy kamienia,
- skrzynie,
- duże obiekty/materials,
- zwłoki zwierząt.

Nie należy dodawać capability do konkretnych itemów bez potwierdzenia ich aktualnego modelu i sposobu reprezentacji.

## Transport

Wprowadzić minimalny stan aktywnego rope pulling zgodny z istniejącym ownership interakcji/player action. Nie tworzyć dużego, globalnego `PlayerTransportManager`, jeśli obecna architektura nie wymaga takiej granicy.

Podczas ciągnięcia:

- prędkość gracza jest ograniczona,
- stamina jest zużywana,
- koszt zależy od ciężaru/parametrów ładunku, jeśli obecny model je udostępnia,
- początkowy tuning może celować w około 50% normalnej prędkości,
- wartości pozostają tuningiem gameplayowym, a nie twardym kontraktem architektonicznym,
- istniejące collision/grounding/physics zachowanie powinno zostać wykorzystane zamiast implementowania osobnej symulacji świata.

Jeżeli istniejący runtime nie zapewnia wystarczającej fizyki dla ciągniętego obiektu, implementacja ma wybrać najmniejszy mechanizm potrzebny do stabilnego zachowania; nie budować realistycznej symulacji liny.

## Pickup i stacki

Pickup pozostaje atomowy.

Jeżeli cały item/stack nie mieści się w inventory, nie należy automatycznie dzielić go na część do inventory i część do transportu liną w ramach tej interakcji.

Rope pulling operuje na konkretnym fizycznym obiekcie/ładunku, zgodnie z jego istniejącą reprezentacją.

## Integracja

Podczas implementacji należy wykorzystać istniejące mechanizmy dla:

- item instances i inventory,
- pickup/drop/interactions,
- physical world items,
- player movement,
- Stamina/Vigor,
- collision/physics,
- istniejącej reprezentacji i użycia liny, jeżeli już występuje.

Należy sprawdzić dokładne ownership i lifecycle tych systemów przed dodaniem nowego stanu.

Ważne funkcje/klasy architektoniczne powinny otrzymać JSDoc z `@domain` tam, gdzie jest to potrzebne do późniejszego preflight/discovery.

## Construction

Plan nie zmienia systemu construction.

Głównym use case'em jest umożliwienie graczowi zebrania materiałów i przewiezienia ich na plac budowy bez wielokrotnych kursów inventory:

`gather → inventory/full → rope-pull → transport → drop → construction`

Późniejsze dostarczanie materiałów do miejsc składowania może korzystać z tego mechanizmu, ale nie jest częścią tego planu.

## Wózek i przyszłe transportery

Wózek jest poza zakresem tego planu.

Jednocześnie capability `ropePullable` i stan transportu nie powinny być zaprojektowane jako jednorazowy hack dla belek. Przyszły wózek powinien móc korzystać z tych samych pojęć ładunku i transportu.

Docelowe rozszerzenie może obejmować:

`player + rope → player + cart → NPC + cart → animal-drawn cart`

Nie implementować tych etapów teraz.

## Poza zakresem

- zwiększanie pojemności inventory,
- automatyczny transport,
- wózek,
- wozy zaprzęgowe,
- transport przez zwierzęta,
- NPC pulling,
- automatyczne dostarczanie materiałów,
- ręczne sterowanie liną,
- realistyczna symulacja fizyki liny,
- nowe systemy ekonomiczne.

## Verification

Manual browser verification:

1. Item mieszczący się w inventory nadal działa przez zwykłe `E`.
2. Item/stack niemieszczący się w inventory nie zostaje częściowo pobrany.
3. Dla `ropePullable` + posiadanej liny pojawia się możliwość ciągnięcia.
4. Brak liny usuwa możliwość ciągnięcia.
5. Item bez `ropePullable` nie oferuje ciągnięcia.
6. Rozpoczęcie ciągnięcia nie dodaje itemu do inventory.
7. Gracz może normalnie sterować postacią podczas transportu.
8. Ruch podczas ciągnięcia jest wyraźnie wolniejszy.
9. Ciągnięcie zużywa Stamina zgodnie z istniejącym systemem.
10. Cięższy/większy ładunek, jeżeli model fizyczny na to pozwala, może mieć większy koszt ruchu/staminy.
11. Odczepienie pozostawia item w świecie.
12. Item nie znika ani nie duplikuje się podczas attach/detach.
13. Można ponownie rozpocząć transport tego samego itemu.
14. Materiał można fizycznie przewieźć na miejsce budowy.
15. Istniejące pickup/drop/inventory/construction nie mają regresji.

**Zrób git commit i push do main, rebase jeżeli trzeba**
