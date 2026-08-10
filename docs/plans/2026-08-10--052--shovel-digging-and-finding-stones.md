## Plan: Shovel — digging & finding stones

**Created:** 2026-08-10

### Cel

Dodać prostą interakcję z terenem, która rozszerza istniejącą pętlę:

**item → akcja gracza → zmiana świata → resource**

W świecie jest mało kamieni w porównaniu z gałęziami. Łopata pozwala graczowi pozyskiwać kamienie poprzez kopanie ziemi, jednocześnie wprowadzając pierwszą prostą formę lokalnej modyfikacji terenu.

### Gameplay

* W wiosce znajduje się łopata jako interaktywny przedmiot.
* Gracz może ją podnieść.
* Posiadanie łopaty odblokowuje nową akcję:

  * **Kopanie**
  * **Wykop dołek**
* Akcja jest dostępna tylko wtedy, gdy gracz ma łopatę.
* Po wykonaniu akcji:

  1. teren w miejscu kopania zostaje lokalnie obniżony,
  2. istnieje szansa znalezienia kamienia,
  3. gracz otrzymuje znaleziony resource, jeśli kopanie zakończyło się sukcesem.

### Podłoże

Efekt kopania powinien zależeć od rodzaju terenu.

Przykładowa logika:

| Podłoże      | Kopanie | Szansa na kamień | Efekt        |
| ------------ | ------- | ---------------: | ------------ |
| Grass / soil | ✅       |          średnia | mały dołek   |
| Dirt / clay  | ✅       |           wysoka | mały dołek   |
| Sand         | ✅       |            niska | płytki dołek |
| Rock         | ❌       |                — | brak akcji   |

Nie trzeba od razu wprowadzać rozbudowanego systemu typów gleby. Należy wykorzystać istniejącą informację o typie / wysokości terenu, jeśli repo już ją posiada.

### Terrain modification

Dołek powinien być **lokalną modyfikacją wysokości terenu**, a nie przebudową proceduralnego świata.

Preferowany kierunek:

* niewielki promień oddziaływania,
* niewielka głębokość,
* miękkie przejście między oryginalną wysokością a obniżonym środkiem,
* kilka kolejnych wykopań w pobliżu może tworzyć większy obszar zmodyfikowanego terenu.

Trzeba uwzględnić architekturę chunków: modyfikacja nie powinna niszczyć istniejącego proceduralnego generowania terenu. Jeśli terrain jest generowany w workerach / per chunk, lokalne zmiany powinny być traktowane jako **runtime modification layer** nakładana na wygenerowany teren.

Na tym etapie nie jest wymagane zapisywanie modyfikacji terenu w save, chyba że istniejący system persystencji daje taką możliwość niewielkim kosztem.

### Stones / resources

Kamień powinien zostać potraktowany jako istniejący lub przyszły **resource**, a nie specjalny rezultat mechaniki łopaty.

Przykładowo:

```ts
dig()
  → terrain.modify(...)
  → resourceDrop("stone", ...)
```

Dzięki temu później ten sam system może obsłużyć inne źródła zasobów:

* kamienie znajdowane podczas kopania,
* kamienie leżące w świecie,
* drewno z gałęzi,
* zasoby z przyszłego gospodarstwa itd.

### Interakcja

Łopata powinna korzystać z istniejącego systemu interakcji gracza, zamiast tworzyć osobny input handler.

Przykładowy flow:

```text
Player
  ↓
has shovel?
  ↓ yes
Dig action available
  ↓
player selects ground
  ↓
validate terrain
  ↓
modify terrain
  ↓
roll resource drop
  ↓
stone → inventory/resource system
```

Jeżeli inventory nie jest jeszcze dostępne w aktualnym branchu, można na potrzeby implementacji użyć prostego tymczasowego resource state, ale nie należy tworzyć równoległego, docelowego systemu inventory tylko dla tej funkcji.

### Wizualny feedback

Minimalny feedback jest wskazany:

* krótka animacja / efekt kopania,
* mała chmura ziemi lub particle effect,
* dźwięk uderzenia łopaty w ziemię,
* wizualnie widoczny dołek,
* jeśli znaleziono kamień — kamień może pojawić się przy miejscu kopania.

Nie jest wymagane realistyczne modelowanie fizyki ziemi.

### Scope

**W tej wersji:**

* pickup łopaty,
* sprawdzanie posiadania łopaty,
* akcja „Wykop dołek”,
* lokalna modyfikacja terenu,
* różne zachowanie zależne od podłoża,
* szansa na znalezienie kamienia,
* integracja z istniejącym systemem resource/interactions,
* podstawowy feedback wizualny/audio.

**Poza zakresem:**

* pełny system kopania / budowy,
* realistyczna deformacja terenu,
* nieskończone kopanie,
* generowanie jaskiń,
* rozbudowany system typów gleby,
* persistence wszystkich zmian terenu,
* crafting wykorzystujący kamień.

### Zasada projektowa

Nie budować osobnego „Shovel System”.

Łopata powinna być pierwszym konkretnym przypadkiem istniejącego mechanizmu:

**Item → Player Action → World Interaction → Resource**

Mechanika powinna być możliwie generyczna, aby później można było dodać inne narzędzia i interakcje z tym samym fundamentem.
