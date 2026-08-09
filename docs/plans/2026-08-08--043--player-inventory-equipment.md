# Plan: Ekwipunek gracza v1 — Inventory, waga i pierwsze narzędzia

> Szkic od ChatGPT

**Status:** `verification needed`  
**Created:** 2026-08-08  
**Priority:** średni

Zaimplementowane: **punkty 1-11** — `ItemDef` z `category`/`weight`, `Inventory` z `maxWeight`/`canAdd()`, ekran „Ekwipunek" (`[I]`, `src/ui/createInventoryScreen.ts`) z akcją Wyrzuć, nóż/krzesiwo/koc jako startowy loadout (też jako migracja dla starych save'ów), krzesiwo wymagane do zapalenia (nie do dołożenia) ogniska, koc wymagany do odpoczynku, nóż jako bonus do szansy na gałąź, HUD pokazuje wagę zamiast liczników. **Nie zaimplementowano** `Użyj`/`Połącz` z §6 — v1 nie ma jeszcze koncepcji "aktywnego narzędzia" ani craftingu (§12), więc te przyciski nie miałyby żadnego działania; kontekstowe sprawdzanie narzędzi (`has('firestarter'|'knife'|'blanket', 1)`) już działa bez nich.

## Cel

Zastąpić obecne tekstowe liczniki zbieralnych przedmiotów dedykowanym ekwipunkiem gracza. Inventory ma przechowywać rzeczy, które gracz niesie, uwzględniać ich wagę i limit oraz udostępniać akcje zależne od typu przedmiotu.

Pierwszy etap łączy inventory z istniejącymi mechanikami świata:

- **krzesiwo** — wymagane do rozpalenia ogniska,
- **koc** — wymagany do odpoczynku/nocowania,
- **nóż** — zwiększa szansę zbierania gałęzi bezpośrednio z drzewa.

Nie jest to jeszcze pełny survival/RPG. System ma być wspólną warstwą dla przyszłego craftingu, produkcji, handlu i gospodarstwa gracza.

## Kontekst

Istnieje już `src/items/Inventory.ts`, ale jest to obecnie `Map<ItemKind, number>` z `add`, `remove`, `count`, `has`, `isEmpty` i `toJSON()`. Brakuje wagi, limitu, kategorii, narzędzi i akcji.

`ROADMAP.md` już zakłada usunięcie tekstowych liczników z HUD i zastąpienie ich dedykowanym ekranem Inventory z limitem wagowym. Plan `030` przygotował generyczny model `ItemKind` i zbieralne zasoby, pozostawiając pełne inventory/crafting/ekonomię poza zakresem.

## 1. Jeden model przedmiotów

Rozszerzyć istniejące `ItemKind` / `ITEM_DEFS`, bez budowania równoległych systemów.

Docelowo definicja powinna mieć co najmniej:

```ts
type ItemCategory = 'resource' | 'tool' | 'utility'

type ItemDef = {
  label: string
  category: ItemCategory
  weight: number
}
```

Kategorie:

- `resource` — kamień, gałąź, muszla, grzyb, kwiat, szyszka,
- `tool` — nóż, krzesiwo,
- `utility` — koc.

Nie tworzyć jeszcze osobnych klas `Tool`, `Equipment`, `Resource`.

## 2. Pierwsze przedmioty

| Przedmiot | Typ | Zastosowanie |
|---|---|---|
| Kamień | resource | istniejący zbieralny |
| Gałąź | resource | paliwo ogniska |
| Muszla | resource | istniejący zbieralny |
| Grzyb | resource | zbieralny |
| Kwiat | resource | zbieralny |
| Szyszka | resource | zbieralny |
| Nóż | tool | bonus do zbierania gałęzi z drzewa |
| Krzesiwo | tool | rozpalenie ogniska |
| Koc | utility | odpoczynek/nocowanie |

Dokładne wartości wag dobrać podczas implementacji i kalibracji.

## 3. Inventory i waga

Inventory pozostaje jednym źródłem prawdy dla rzeczy noszonych przez gracza.

Dodać:

- `totalWeight`,
- `maxWeight`,
- `canAdd(kind, n)`,
- bezpieczne dodawanie, które nie pozwala przekroczyć limitu.

Na v1 wszystkie przedmioty mogą być stackowane po `ItemKind`; narzędzia i utility mogą mieć ilość `1`.

Nie wprowadzać jeszcze slotów ograniczających liczbę różnych przedmiotów.

## 4. Zbieranie

Istniejący mechanizm zbierania nadal korzysta z `Inventory` i `ItemKind`.

Po podniesieniu:

1. sprawdź limit wagi,
2. dodaj item,
3. usuń reprezentację ze świata.

Jeżeli limit jest przekroczony, przedmiot zostaje w świecie, a gracz dostaje prosty feedback, np. `Ekwipunek jest za ciężki`.

Narzędzia nie potrzebują osobnego magazynu. Na początku mogą być elementem startowego loadoutu gracza.

## 5. Ekran Inventory

Dodać dedykowany ekran w istniejącym Game UI, zgodny ze wzorcem obecnych ekranów.

Pokazuje:

- nazwę,
- kategorię,
- ilość,
- wagę jednostkową,
- wagę całkowitą stacka,
- `current / max` dla całego Inventory,
- dostępne akcje.

Przykład:

```text
EKWIPUNEK

4 × Gałąź       0.5 kg   2.0 kg   [Użyj] [Wyrzuć]
2 × Kamień       1.0 kg   2.0 kg   [Wyrzuć]
1 × Nóż          0.4 kg   0.4 kg   [Użyj]
1 × Krzesiwo     0.2 kg   0.2 kg   [Użyj]
1 × Koc          1.5 kg   1.5 kg   [Użyj]

Waga: 6.1 / 20 kg
```

Na mobile użyć tego samego ekranu z większymi targetami dotykowymi.

## 6. Akcje

Podstawowe akcje:

- **Użyj** — jeżeli item ma zastosowanie,
- **Wyrzuć** — usuwa item z Inventory i tworzy jego reprezentację w świecie,
- **Połącz** — przygotowanie pod przyszłe receptury/łączenie materiałów; pełny crafting pozostaje poza v1.

Akcje powinny być kontekstowe. Nie tworzyć osobnej logiki dla każdego przedmiotu.

## 7. Krzesiwo → ognisko

Istniejące rozpalanie ogniska zostaje połączone z Inventory:

```text
rozpal ognisko
    └── wymagane: krzesiwo + drewno/gałęzie
```

Krzesiwo jest wielokrotnego użytku i nie znika po użyciu. Istniejące zużywanie gałęzi jako paliwa zachować.

## 8. Koc → odpoczynek

Istniejąca mechanika odpoczynku/nocowania zostaje połączona z Inventory:

```text
odpoczynek / nocowanie
    └── wymagany: koc
```

Koc jest wielokrotnego użytku i pozostaje w Inventory. Nie zmieniać samej mechaniki skoku czasu/fade-to-black — tylko warunek dostępności.

## 9. Nóż → drzewo

Obecne zbieranie gałęzi z drzewa pozostaje możliwe bez noża, ale nóż zwiększa prawdopodobieństwo sukcesu:

```text
bez noża  → bazowa szansa
z nożem   → bazowa szansa + bonus
```

Nóż nie jest twardym wymaganiem. Bonus powinien być stałą konfiguracyjną, np. `KNIFE_BRANCH_BONUS`.

## 10. HUD

Usunąć tekstowe liczniki typu:

```text
muszla 2 · kamień 1 · gałąź 4
```

z głównego HUD. Pełna lista rzeczy należy do Inventory. HUD może później pokazywać tylko kontekstowe informacje, np. aktywne narzędzie, wagę lub krótkie feedbacki.

Nie usuwać `Inventory` ani `ItemKind` — zmienia się sposób prezentacji.

## 11. Save / persistence

Inventory powinno być zapisane w istniejącym `SaveData`, wykorzystując obecne `toJSON()` zamiast nowego save systemu.

Minimalnie:

```ts
player: {
  position: ...,
  inventory: ...,
}
```

Waga i limit mogą wynikać z definicji/configu i nie muszą być zapisywane. Stare save'y zawierające tylko liczniki `ItemKind` muszą nadal działać.

## 12. Przyszłość — zarys

### Equipment / sloty

Później można dodać aktywne narzędzie, broń, ubranie, plecak i sloty utility. Nadal powinny używać tych samych `ItemDef`/`ItemKind`.

### Durability

Narzędzia mogą później mieć durability, zużycie, naprawę i wymianę. Na v1 nóż i krzesiwo są bezterminowe.

### ItemInstance

Jeśli pojawią się przedmioty z różnymi statystykami, `Map<ItemKind, number>` może zostać zastąpione przez `ItemInstance` z własnym ID/durability. Nie wprowadzać tego przed realną potrzebą.

### Crafting / production / handel

Naturalny kierunek:

```text
Natural resources
    ↓
Inventory
    ↓
Crafting / production
    ↓
Goods
    ↓
Barter / trade
```

Crafting powinien konsumować itemy z tego samego Inventory, a ekonomia wiosek powinna używać tych samych `ItemKind` jako surowców, produktów i dóbr handlowych.

### Plecaki

W przyszłości wyposażenie może zwiększać `maxWeight`, np. 20 → 30 → 45 kg. Capacity powinno wynikać z wyposażenia, a nie z wyjątków w Inventory.

## Poza zakresem v1

- pełny crafting i receptury,
- ekonomia i barter,
- sklepy/handel,
- durability,
- sloty equipment,
- broń i combat gracza,
- ubrania i statystyki postaci,
- encumbrance wpływający na prędkość/staminę,
- unikalne `ItemInstance`,
- rarity/quality/loot tiers,
- rozbudowany RPG-owy UI.

## Zasady architektoniczne

1. **Jeden system przedmiotów** — Inventory, crafting, ekonomia i equipment korzystają z `ItemKind`/`ItemDef`.
2. **Nie duplikować zasobów** — kamień/gałąź są tym samym itemem niezależnie od właściciela.
3. **Kontekst zamiast wyjątków** — `Użyj` sprawdza wymagania interakcji świata.
4. **Narzędzia rozszerzają istniejące mechaniki** — nóż modyfikuje szansę, nie tworzy nowego systemu zbierania.
5. **Inventory nie jest craftingiem** — Inventory przechowuje, inne systemy wykorzystują.
6. **Prosto teraz** — bez `ItemInstance`, durability i slotów, dopóki `Map<ItemKind, number>` nie stanie się realnym ograniczeniem.

## Weryfikacja

- wszystkie zbieralne przedmioty trafiają do Inventory,
- stare liczniki znikają z HUD,
- ekran pokazuje ilość i wagę,
- przekroczenie limitu blokuje podniesienie,
- wyrzucenie usuwa item i pozwala go ponownie podnieść,
- krzesiwo jest wymagane do rozpalenia,
- koc jest wymagany do odpoczynku,
- nóż zwiększa szansę pozyskania gałęzi z drzewa,
- stare save'y nadal się ładują,
- Inventory zapisuje się i odtwarza po Continue,
- `npx tsc --noEmit`, `npm run lint`, `npm run build` przechodzą poprawnie.
