# Seedvale — wybrane funkcjonalności do dokończenia

**Data:** 2026-08-15


## 1. Rozwój ekonomii gospodarstw domowych

**Źródło:** plan 071 — Local Economy and Settlement Development

Podstawy lokalnej ekonomii już istnieją: gospodarstwa mają zapasy i zapotrzebowanie, a osada potrafi uwzględniać dostępne zasoby.

Brakuje pełniejszego modelu produkcji dóbr. NPC powinien nie tylko wykonywać pracę, ale rzeczywiście przekształcać dostępne zasoby w produkty, które trafiają do gospodarstw i magazynów.

Docelowy przepływ:

`zasoby → praca → produkcja → dobra → magazynowanie → konsumpcja`

---

## 6. Miejsca społeczne i życie społeczne NPC

**Źródło:** plan 020 — NPC Daily Routine and Place

Plan przewidywał bardziej konkretne miejsca, w których NPC mogą wykonywać czynności społeczne.

Nie chodzi tylko o to, że dwóch NPC stoi obok siebie. Istniejące `schedule → place → behaviour` powinno umożliwiać NPC spotykanie się, rozmowy, wspólne przebywanie i wykonywanie aktywności społecznych.

To ma być rozwinięcie istniejącego systemu, a nie osobny system „social AI”.

---

## 7. Zbieranie naturalnych zasobów

**Źródło:** plan 032 — Natural Resources & Economy

Natural resources już istnieją w świecie i mogą wpływać na generowanie osad.

Brakuje jednak faktycznego wykorzystania ich jako źródeł surowców.

Przykładowy przepływ:

`drzewo → drewno → NPC zbiera drewno → drewno trafia do gospodarstwa lub magazynu`

To samo podejście może później obejmować inne zasoby świata.

---

## 8. Produkcja i przetwarzanie dóbr

**Źródło:** plan 071

Kolejny etap po samym zbieraniu zasobów.

Zasoby powinny być przekształcane przez pracę NPC w dobra użyteczne dla gospodarstw i osad.

Czyli:

`surowiec → praca NPC → produkt → magazyn/konsumpcja`

Pełny łańcuch produkcyjny nie został jeszcze zrealizowany.

---

## 11. Wspólny łańcuch ekonomiczny dla NPC i gracza

**Źródło:** plan 071 + VISION

Docelowo ekonomia NPC i gracza nie powinna być dwoma oddzielnymi systemami.

Te same `ItemKind`, zasoby, miejsca i mechanizmy gospodarki powinny być używane przez oba światy.

Docelowy łańcuch:

`world resources → gathering → items → production → storage → consumption → trade`

Gracz powinien uczestniczyć w istniejącej gospodarce świata, zamiast korzystać z osobnej „ekonomii gracza”.

---

## 14. Terytoria zwierząt

**Źródło:** plan 118 — Fauna

Fauna ma już podstawowe zachowania związane ze stadem i środowiskiem.

Odłożone zostało bardziej trwałe pojęcie terytorium.

Zwierzęta mogłyby preferować konkretne obszary świata zależnie od gatunku, pożywienia, wody i warunków środowiskowych.

Terytorium powinno być częścią naturalnego modelu zachowania zwierząt, a nie ręcznie przypisaną strefą.

---

## 19. Persystencja fauny

**Źródło:** plan 118 — Fauna

Jeżeli gracz opuści obszar, zwierzęta nie powinny po prostu zostać zniszczone i pojawić się ponownie w przypadkowym stanie.

Odłożona została persystencja istotnego stanu fauny.

Celem jest zachowanie ciągłości:

`świat → fauna → stan populacji → opuszczenie regionu → symulacja/off-screen → powrót`

Po powrocie świat powinien odzwierciedlać to, co wydarzyło się podczas nieobecności gracza.

---

## 21. Questy związane z konkretnymi landmarkami

**Źródło:** plan 093 + plan 049

System landmarków istnieje jako fundament, ale pełniejsze wykorzystanie ich przez questy zostało odłożone.

Quest powinien móc odnosić się do konkretnego, stabilnego landmarku świata, zamiast tylko wskazywać ogólną lokalizację.

Przykładowo:

`quest → konkretny landmark → podróż → odkrycie/interakcja → postęp questa`

---

## 22. Bandyci jako problemy świata

**Źródło:** plan 093 — Quests V3

Bandyci zostali przewidziani nie jako zwykły zestaw ręcznie napisanych questów, ale jako kolejny rodzaj problemu świata.

Docelowy kierunek:

`grupa bandytów → problem lokalny → wpływ na NPC/osadę → quest → reakcja świata`

Dzięki temu bandyci mogą być źródłem konsekwencji dla istniejących systemów, a nie tylko przeciwnikami czekającymi na gracza.

---

## 23. Sezonowy wpływ na pozostałe systemy

**Źródło:** plan 040 — Seasons & Weather

System pór roku i pogody został częściowo wykonany.

Odłożone zostało jednak rozszerzenie sezonów poza warstwę wizualną.

Sezon powinien wpływać również na:

- NPC,
- faunę,
- dostępność zasobów,
- produkcję,
- gospodarkę,
- zachowania świata.

Czyli:

`sezon → zmiana warunków → zmiana dostępności zasobów → zmiana zachowań → konsekwencje dla świata`

---

## 24. GPU Weather Renderer

**Źródło:** plan 040 — Seasons & Weather

Deszcz i śnieg działają obecnie przez CPU `THREE.Points`.

Pierwsza implementacja została potraktowana jako rozwiązanie tymczasowe.

Odłożona została wersja wykorzystująca GPU/shadery, która pozwoliłaby przenieść większą część kosztu symulacji i renderowania pogody na GPU.

To jest przede wszystkim zadanie wydajnościowe, a nie nowa mechanika świata.

---

## 30. Dalsze detale wizualne terenu

**Źródło:** plan 044

Plan przewidywał dodatkowe detale powierzchni terenu, między innymi normal/bump detail.

Celem jest poprawienie wizualnej jakości powierzchni bez zmiany samej geometrii terenu.

To pozostaje warstwą wizualną, a nie nowym systemem symulacji.

---

## 31. Temporal Rendering i dalsze techniki GPU

**Źródło:** plan 113 — Rendering Performance & GPU Scaling

W późniejszych etapach optymalizacji renderingu przewidziano bardziej zaawansowane techniki renderowania czasowego oraz dalsze wykorzystanie GPU.

Obejmuje to między innymi techniki pozwalające ograniczyć koszt renderowania przy zachowaniu odpowiedniej jakości obrazu.

Jest to część późniejszego skalowania renderingu, a nie brakująca mechanika świata.

---