# Plan: NPC Helper Resource Delivery

**Created:** 2026-08-19
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** 164

## Cel

Umożliwić istniejącemu NPC pomaganie graczowi poprzez dostarczanie wybranych zasobów do jego storage.

Pierwszym zastosowaniem jest:

> NPC zbiera jedzenie i dostarcza je do skrzyni gracza.

NPC **nie staje się Companionem**.

Pozostaje członkiem swojego householdu, zachowuje własne potrzeby, profesję, schedule, relacje i normalne życie.

Jest to niezależna rola **Helper / Supplier**, która może pozostać w grze niezależnie od późniejszego systemu Companion.

---

## 1. Zakres pierwszej wersji

Pierwsza wersja powinna obsługiwać:

```text
NPC
 ↓
decyzja o pomocy
 ↓
pozyskanie jedzenia
 ↓
transport
 ↓
player storage
```

Minimalny przypadek:

- NPC ma przypisany player storage jako cel,
- NPC może zbierać jedzenie,
- NPC transportuje jedzenie do storage,
- zasób trafia do kontenera,
- NPC wraca do swojego normalnego życia.

Woda może zostać dodana w tym samym mechanizmie, jeżeli istniejące systemy zasobów i transportu pozwalają na jej bezpośrednie wykorzystanie.

Jeżeli implementacja wymaga dodatkowego systemu dla wody, nie należy rozszerzać tego planu poza niezbędne fundamenty.

---

## 2. Helper jako rola / zadanie NPC

Nie tworzyć osobnego `CompanionAI` ani `HelperAI`.

Helper powinien być reprezentowany przez istniejące mechanizmy NPC:

```text
NPC state
+
needs
+
problems
+
goals
+
pressures
+
relationships
+
profession
+
schedule
```

które prowadzą do decyzji:

```text
decision
 ↓
strategy
 ↓
actions
```

Pomoc graczowi powinna być jednym z możliwych celów / źródeł presji NPC.

---

## 3. Player Storage jako cel

Helper musi mieć możliwość wskazania konkretnego storage gracza jako celu dostawy.

Przykład:

```text
Helper assignment
    ↓
target = Player Chest #123
```

Nie należy tworzyć specjalnego:

```text
HelperStorage
```

ani:

```text
CompanionStorage
```

NPC korzysta z istniejącego `Container` / storage.

---

## 4. Relacja NPC → Player

Helper powinien być powiązany z graczem istniejącym mechanizmem relacji, jeśli taki mechanizm już obsługuje odpowiedni przypadek.

Nie tworzyć osobnego systemu:

```text
HelperRelationship
```

Relacja może dostarczać podstawy do decyzji, czy NPC chce lub może pomagać graczowi.

Dokładna logika zależy od istniejącego systemu relationships/decision making.

---

## 5. Źródło zasobu

NPC powinien korzystać z istniejących źródeł jedzenia.

Przepływ powinien wykorzystywać istniejące mechanizmy:

```text
resource source
 ↓
gather / collect
 ↓
NPC inventory
 ↓
transport
 ↓
player storage
```

Nie tworzyć specjalnej logiki:

```text
HelperFoodGathering
```

jeżeli istniejące NPC actions mogą zostać rozszerzone o nowy target.

---

## 6. Własne potrzeby NPC mają pierwszeństwo

Helper nadal jest normalnym NPC.

Pomoc graczowi nie może powodować ignorowania jego podstawowych potrzeb.

Przykładowo:

```text
critical own need
    >
household responsibility
    >
profession / normal work
    >
help player
```

Nie należy jednak hardcode'ować powyższej hierarchii bez sprawdzenia istniejącego systemu `pressures` i `decision making`.

Celem jest dodanie nowej presji/goal, a nie stworzenie osobnego priority system.

---

## 7. Ilość dostarczanego jedzenia

NPC nie powinien bezwarunkowo oddawać całego dostępnego jedzenia.

Powinien zachować ilość potrzebną do:

- własnego spożycia,
- własnego householdu, jeżeli wynika to z jego aktualnej roli,
- innych istniejących obowiązków.

Dostawa powinna dotyczyć **nadwyżki** lub ilości wynikającej z aktualnego celu.

Dokładny model należy dopasować do istniejącego inventory/resource ownership/household storage.

---

## 8. Transport

Helper powinien używać istniejącego modelu transportu przedmiotów.

Nie tworzyć osobnego systemu transportu tylko dla helperów.

Przykładowy przebieg:

```text
NPC
 ↓
select resource
 ↓
move to source
 ↓
gather
 ↓
carry item(s)
 ↓
move to target container
 ↓
store
 ↓
return to normal schedule
```

Jeżeli istniejące NPC actions już obsługują część tego przepływu, należy je rozszerzyć zamiast tworzyć nowe równoległe akcje.

---

## 9. Storage Capacity

Próba dostarczenia zasobu musi uwzględniać ograniczenia kontenera:

- `ItemSize`,
- available capacity,
- ewentualne ograniczenia weight,
- stackowanie.

Jeżeli storage jest pełne:

- NPC nie powinien próbować bez końca dostarczać tego samego zasobu,
- powinien zakończyć lub zmienić zadanie,
- decyzja powinna wrócić do normalnego systemu NPC.

Nie tworzyć specjalnego `HelperStorageFullState`, jeśli istniejący system action failure / decision recovery może obsłużyć ten przypadek.

---

## 10. Zachowanie po dostawie

Po udanej dostawie NPC powinien:

1. zaktualizować swój stan/inventory,
2. zakończyć akcję transportową,
3. wrócić do swojej normalnej rutyny,
4. ponownie ocenić swoje potrzeby i cele przy kolejnym decision cycle.

NPC nie powinien pozostawać przy skrzyni tylko dlatego, że jest helperem.

---

## 11. Powtarzalność

Helper powinien móc wielokrotnie wykonywać zadanie.

Nie powinno to jednak oznaczać:

```text
while helper:
    gather food
    deliver food
```

bez udziału systemu decyzji.

Lepszy model:

```text
normal NPC decision cycle
        ↓
player-help pressure active?
        ↓
yes
        ↓
select delivery goal
        ↓
execute actions
        ↓
delivery complete
        ↓
normal decision cycle
```

Dzięki temu późniejsze cele mogą konkurować z pomocą graczowi.

---

## 12. Wiele helperów

System powinien działać również wtedy, gdy kilku NPC pomaga temu samemu graczowi.

Nie implementować jeszcze specjalnego coordinatora/helper managera.

Każdy NPC powinien niezależnie:

- podejmować decyzję,
- wybierać zasób,
- wybierać storage,
- wykonywać transport.

Jeżeli pojawi się problem z konkurencją o ten sam zasób lub storage, powinien zostać rozwiązany przez istniejące mechanizmy resource reservation/logistics/decision making.

---

## 13. UI / konfiguracja

Jeżeli istnieje już odpowiedni UI do relacji lub wydawania NPC poleceń, należy go rozszerzyć.

Nie tworzyć osobnego dużego „Companion Management UI”.

Minimalna konfiguracja powinna umożliwić określenie:

```text
NPC:
  role = helper
  target = player storage
  resource = food
```

Sposób prezentacji powinien zostać dopasowany do aktualnej architektury UI.

Jeżeli istniejący system nie posiada jeszcze mechanizmu konfiguracji NPC goals/assignments, plan powinien dodać minimalny mechanizm potrzebny do tego przypadku, bez budowania kompletnego systemu rozkazów dla NPC.

---

## 14. Woda

Po poprawnym działaniu jedzenia ten sam mechanizm powinien umożliwić:

```text
resource = water
```

bez tworzenia osobnej implementacji helpera.

Docelowo:

```text
Helper assignment
 ├── food
 ├── water
 └── other resources
```

Jeżeli istniejący model zasobów pozwala obsłużyć oba przypadki jednym mechanizmem, należy to wykorzystać.

---

## 15. Persistence

Stan przypisania helpera powinien być zachowany, jeżeli helper assignment jest trwałą relacją/rolą NPC.

Po save/load należy zachować:

- NPC,
- relację z graczem,
- target storage,
- ustawiony resource/goal,
- stan wymagany do kontynuowania zadania.

Nie tworzyć osobnego save systemu.

Jeżeli target storage posiada stabilny ID, należy zapisywać jego ID, a nie pozycję skrzyni jako substytut referencji.

---

## 16. Off-screen Simulation

Helper nie może wymagać obecności gracza lub kamery.

Gdy NPC i storage są poza aktywnym obszarem:

- system powinien nadal zachować ciągłość stanu,
- nie należy wymuszać pełnej symulacji klatka po klatce,
- mechanizm powinien być kompatybilny z istniejącą hybrydową symulacją NPC.

Na pierwszym etapie nie należy jednak budować specjalnego off-screen helper simulation.

Wykorzystać istniejący model symulacji.

---

## 17. Przyszłe rozszerzenia

Ten mechanizm powinien umożliwiać późniejsze:

- dostarczanie wody,
- dostarczanie drewna,
- dostarczanie materiałów,
- transport określonych przedmiotów,
- okresowe dostawy,
- różne priorytety,
- limity ilościowe,
- różne storage targets,
- wiele storage,
- role specjalizowane.

Nie implementować ich, jeżeli nie są wymagane do pierwszej wersji.

---

## 18. Relacja z Companion

Ten plan **nie implementuje Companion**.

Pomocnik i Companion są niezależnymi rolami:

```text
NPC
 ├── Helper / Supplier
 │     └── pozostaje w swoim household
 │
 └── Companion
       └── może żyć przy graczu
```

Helper może istnieć przez całą grę bez kiedykolwiek stania się Companionem.

Przyszły Companion może natomiast korzystać z tych samych mechanizmów dostarczania zasobów.

---

## 19. Poza zakresem

Nie implementować:

- opuszczania household przez NPC,
- przeprowadzki do obozu gracza,
- follow,
- obrony gracza,
- party management,
- Companion UI,
- nowych combat mechanics,
- specjalnego Helper AI,
- specjalnego transport system,
- LLM-driven decisions.

---

## 20. Weryfikacja

### Podstawowy przepływ

- można przypisać istniejącego NPC jako helpera,
- można wskazać player storage,
- NPC wybiera jedzenie,
- NPC zbiera jedzenie,
- NPC dostarcza je do storage,
- zawartość skrzyni zwiększa się,
- NPC wraca do normalnego życia.

### Autonomia NPC

- NPC nadal realizuje własne potrzeby,
- NPC nadal wykonuje profesję,
- NPC nadal wykonuje schedule,
- pomoc graczowi nie tworzy permanentnej pętli,
- NPC może przerwać pomoc na rzecz ważniejszych potrzeb.

### Storage

- pełna skrzynia jest poprawnie obsługiwana,
- `ItemSize` jest respektowany,
- istniejące ograniczenia storage działają,
- helper nie gubi przedmiotów przy nieudanej dostawie.

### Persistence

- assignment przetrwa save/load,
- target storage zostanie poprawnie odnaleziony,
- NPC będzie mógł kontynuować pracę po odtworzeniu świata.

### Multiple NPCs

- dwóch helperów może dostarczać do tej samej skrzyni,
- nie dochodzi do utraty przedmiotów,
- istniejące mechanizmy konfliktów/rezerwacji są respektowane.

### Off-screen

- helper nie wymaga obecności gracza,
- zachowanie nie zależy od renderowania,
- nie wprowadzono helper-specific frame loop.

---

## 21. Kryterium ukończenia

Istniejący NPC może zostać pomocnikiem gracza i w ramach swojej normalnej autonomii:

1. otrzymać cel dostarczania zasobu,
2. pozyskać jedzenie,
3. przetransportować je do player storage,
4. umieścić je w kontenerze,
5. zachować wystarczające zasoby dla siebie i swoich obowiązków,
6. wrócić do normalnego życia,
7. powtórzyć proces przy kolejnej decyzji.

Mechanizm działa przez istniejące systemy NPC, storage i logistics, bez tworzenia osobnego `HelperAI`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
