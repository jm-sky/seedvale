# Plan: Food provenance, freshness and storage

**Created:** 2026-08-31  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~155~~ ~~159~~ ~~164~~ ~~184~~  
**Domain:** `items-player`
**Roadmap:** `physical-resource-storage-and-logistics`  

## Cel

Rozszerzyć istniejący system żywności tak, aby:
- przetworzone mięso zachowywało gatunek źródłowy,
- FoodBatch zachowywał dokładny czas pozyskania,
- persistence nie powodował utraty wieku ani pochodzenia żywności,
- warunki przechowywania wpływały na tempo psucia,
- zwykła skrzynia spowalniała psucie względem ekwipunku,
- obróbka zachowywała istotną historię produktu,
- inventory mogło agregować wiele partii bez utraty informacji o freshness,
- nie powstawały osobne ItemKind dla każdego gatunku i procesu.

Poza zakresem: spiżarnie, piwnice, lodówki, temperatura/wilgotność, solenie, wędzenie, osobny parametr quality oraz osobne roasted_*_meat.

## 1. Pochodzenie mięsa

Surowe mięso pozostaje gatunkowym ItemKind:
- deer_meat
- rabbit_meat
- boar_meat
- wolf_meat
- beef

Pieczone mięso pozostaje jednym ItemKind: `roasted_meat`.

FoodBatch zachowuje:
`sourceSpecies?: AnimalKind`

Przykład:

```ts
{
  itemKind: 'roasted_meat',
  count: 3,
  sourceSpecies: 'deer',
  acquiredAtDays: 125.4
}
```

Wartość odżywcza pieczonego mięsa wynika z sourceSpecies, tak jak obecnie wynika z gatunku dla surowego mięsa. Nie tworzyć osobnych ItemKind tylko dla różnic wartości odżywczej lub ceny.

## 2. FoodBatch jako wewnętrzna partia

FoodBatch jest partią, a nie pojedynczym slotem inventory.

Minimalny model zachowuje istniejące pola i rozszerza go o pochodzenie:

```ts
type FoodBatch = {
  count: number
  acquiredAtDays: number
  sourceSpecies?: AnimalKind
  // istniejące pola zachować
}
```

Nie zaokrąglać acquiredAtDays do godzin/dni tylko po to, aby umożliwić stackowanie.

Przykład polowania:

- 10:15 → deer × 5
- 12:20 → deer × 3

może utworzyć dwa batche:

- Batch A → ×5 @ 10:15
- Batch B → ×3 @ 12:20

Dokładny czas pozostaje źródłem prawdy dla freshness.

## 3. Stackowanie inventory

Stack itemu i FoodBatch to różne poziomy.

Inventory może prezentować:
`Deer meat × 8`

mimo że wewnętrznie posiada:
- FoodBatch A → ×5
- FoodBatch B → ×3

Agregacja nie może utracić informacji potrzebnej do prawidłowego obliczenia freshness.

Nie tworzyć osobnego slotu UI dla każdej partii.

Przy konsumpcji perishable food preferować najstarszy dostępny batch (FIFO), aby starsze jedzenie nie pozostawało ukryte za nowszym.

Nie scalać batchy, jeśli merge utraciłby istotny timestamp lub inne dane partii. W razie potrzeby agregować je wyłącznie na poziomie prezentacji/countingu.

## 4. Freshness

Obecny model czasu pozostaje źródłem prawdy. Nie wprowadzać ręcznie zmniejszanego licznika freshness.

Stan wynika z:
- current world time,
- timestampu FoodBatch,
- warunku przechowywania,
- reguł trwałości danego ItemKind.

Freshness oznacza zdatność produktu, nie jego jakość.

Na tym etapie:
- Fresh / Medium → można użyć,
- Spoiled → nie można zjeść.

Nie dodawać osobnego quality.

## 5. Warunki przechowywania

Wprowadzić generyczny storage/decay modifier.

Na obecnym etapie:
- player inventory → normal decay,
- chest → slower decay.

Przykładowy punkt startowy:
- inventory → 1.0× decay,
- chest → 0.5× decay.

Dokładne wartości ustalić podczas implementacji na podstawie istniejących okresów trwałości i gameplayu.

Przeniesienie inventory ↔ chest nie resetuje wieku produktu. Zmienia wyłącznie tempo dalszego decay.

Mechanizm powinien pozwolić później dodać pantry/cellar bez zmiany FoodBatch.

## 6. Obróbka i freshness

Nie wprowadzać osobnego parametru quality.

### Pieczenie

Pieczenie:
- zachowuje sourceSpecies,
- tworzy roasted_meat,
- tworzy nową partię aktualnej formy produktu,
- nie pozwala przetwarzać spoiled meat,
- nie zmienia wartości odżywczej wynikającej z gatunku.

Świeże i średnio świeże mięso tego samego gatunku daje tę samą wartość odżywczą. Freshness decyduje o przydatności i czasie pozostałym do spoilage, a nie o karze do hunger value.

Pieczenie nie może być sposobem na odzyskanie przydatności zepsutego mięsa.

Dla produktu przetworzonego należy zapisać moment rozpoczęcia jego własnej trwałości tak, aby jego dalsze psucie liczyło się od procesu przetworzenia, bez utraty informacji o sourceSpecies i — jeśli potrzebne do reguły — stanie surowca w momencie obróbki.

### Suszenie

Istniejące suszenie powinno korzystać z tego samego modelu:
- zachowuje sourceSpecies,
- wynik to dried_meat,
- wynik otrzymuje trwałość właściwą dla suszonego produktu,
- nie traci pochodzenia.

Nie zmieniać istniejących zasad suszenia poza tym, co jest konieczne do zachowania FoodBatch.

## 7. Persistence

Zweryfikować wszystkie miejsca, w których FoodBatch może istnieć:
- player inventory,
- placed containers,
- carried containers,
- household food storage,
- settlement food storage.

Po save → load należy zachować:
- count,
- sourceSpecies,
- timestamp rozpoczęcia starzenia,
- pozostałe istniejące dane FoodBatch.

Save/load nie może odświeżać żywności ani usuwać jej pochodzenia.

Szczególnie sprawdzić obecne ścieżki SaveData dla containerów, ponieważ sam zapis counts/instances nie może zastępować danych FoodBatch.

## 8. Inventory UI

Nie tworzyć osobnych ItemKind ani slotów dla poszczególnych batchy.

Przykładowo:
`Pieczone mięso × 8`

może reprezentować wiele FoodBatch.

Gatunek może być pokazany w szczegółach itemu, jeśli obecny UI ma odpowiednie miejsce. Nie eksponować technicznego timestampu jako podstawowej informacji.

Freshness może być prezentowane istniejącymi kategoriami Fresh / Medium / Spoiled.

## 9. Shop / wartość

Cena nie wymaga osobnych ItemKind.

System cen powinien móc korzystać z:
- itemKind,
- sourceSpecies,
- istniejących reguł ceny.

Na tym etapie nie wprowadzać dodatkowej kary ekonomicznej za Medium, jeśli obecny model cen tego nie wymaga.

## 10. Weryfikacja techniczna

Przed implementacją sprawdzić aktualny kod i dokumentację dla:
- FoodBatch,
- Inventory,
- foodItems,
- animalMeat,
- cooking,
- drying,
- item instances,
- placed/carried containers,
- household food storage,
- settlement food storage,
- SaveData,
- stackowania perishable food.

Kod pozostaje źródłem prawdy; plan nie zakłada implementacji opisanej tylko w dokumentacji.

## 11. Scenariusze testowe

### Pochodzenie
- deer_meat → cook → roasted_meat(sourceSpecies=deer)
- rabbit_meat → cook → roasted_meat(sourceSpecies=rabbit)
- wolf_meat → cook → roasted_meat(sourceSpecies=wolf)

### Wartość odżywcza
Ten sam roasted_meat daje wartość zależną od sourceSpecies.

### Batchowanie
10:00 deer ×5 + 12:00 deer ×3 → widoczny stack ×8, ale dwa batche z osobnymi timestampami.

### Freshness
Każdy batch starzeje się od własnego timestampu.

### Konsumpcja
Najstarszy batch jest zużywany pierwszy.

### Storage
Inventory ma normal decay, chest wolniejszy decay. Przenoszenie nie resetuje wieku.

### Persistence
Save/load zachowuje wiek, pochodzenie, liczbę sztuk i stan batcha.

### Processing
Fresh raw → cooked, Medium raw → cooked, Spoiled raw → cannot cook. SourceSpecies pozostaje zachowany.

## 12. Kryteria zakończenia

- roasted_meat zachowuje sourceSpecies,
- wartość odżywcza przetworzonego mięsa korzysta z gatunku źródłowego,
- FoodBatch zachowuje dokładny timestamp,
- wiele batchy może być agregowanych do jednego widocznego stacka,
- agregacja nie niszczy freshness,
- najstarsze partie są zużywane pierwsze,
- inventory ma normalny decay,
- chest ma wolniejszy decay,
- transfer storage nie resetuje wieku,
- wszystkie istotne FoodBatch są poprawnie zapisywane i odtwarzane,
- cooking/drying zachowują pochodzenie,
- spoiled food nie może zostać przetworzone w celu odzyskania przydatności,
- nie powstają osobne ItemKind dla gatunku × procesu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
