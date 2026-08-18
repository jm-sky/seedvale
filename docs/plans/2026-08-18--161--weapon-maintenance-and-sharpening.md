# Plan: Weapon maintenance and sharpening

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~155~~ ~~160~~

domain: items-player
tags: [settlements-npcs, quests-progression]

## Cel

Dodać mały, generyczny system konserwacji broni białej oparty na dwóch niezależnych stanach konkretnego egzemplarza:

```text
ItemInstance
├── durability  → stan fizyczny
└── sharpness   → ostrość ostrza
```

Ostrzenie nie naprawia uszkodzeń. Naprawa durability pozostaje osobnym przyszłym mechanizmem.

## Stan obecny

`ItemInstance` jest już generycznym mechanizmem przechowywania indywidualnego stanu, a `TrapItemInstance` posiada `durability`. Inventory obsługuje instances oraz ich persistence. Nie istnieje jeszcze instance-backed broń ani sharpness. citeturn11file0turn20file0

Istniejące bronie korzystają ze wspólnego `MeleeConfig` i obecnego melee/defense pipeline. Plan 160 dodaje wysokiej jakości warianty broni i celowo pozostawia durability/sharpening poza swoim zakresem. citeturn19file0turn21file0

Źródłem prawdy podczas implementacji są aktualne pliki i testy.

## Zakres broni

Instance-backed mają zostać bronie białe, które posiadają ostrze i są używane w melee:

- `knife`
- `short_sword`
- `long_sword`
- `spear` — tylko jeśli aktualny model gameplayowy traktuje grot jako ostrze wymagające ostrzenia;
- `axe`
- `sickle`
- `pitchfork` — tylko jeśli analiza aktualnego harvest/combat flow uzasadni sharpness;
- nowe bronie z planu 160: Damascus, obsydian, battle axe, masterwork.

Nie migrować automatycznie wszystkich `ItemKind` do instances. Podczas implementacji ustalić minimalny zbiór itemów, dla których durability/sharpness ma znaczenie.

## Model danych

Rozszerzyć istniejący model bez tworzenia osobnego systemu equipment:

```text
WeaponItemInstance {
    id
    kind
    durability
    sharpness
}
```

Zakres wartości:

```text
durability: 0..1
sharpness: 0..1
```

Oba pola są stanem konkretnego egzemplarza i muszą przetrwać:

```text
inventory
→ held
→ combat
→ inventory
→ save/load
```

Nie tworzyć `sharp_knife`, `dull_sword`, `broken_sword` itd. jako `ItemKind`.

## Durability

Ten plan wprowadza **durability dla broni**, ponieważ obecnie nie istnieje ona dla weapon instances.

Durability ma być niezależna od sharpness.

Przykład:

```text
miecz
condition: 95%
sharpness: 35%
```

Ostrzenie przywraca sharpness, ale pozostawia condition 95%.

W tym planie nie implementować pełnego systemu naprawy durability. Można jednak dodać minimalne zużywanie durability w combat, jeśli aktualny melee resolver nie posiada jeszcze takiego mechanizmu i jest to potrzebne do sensownego rozdzielenia obu stanów.

## Sharpness

Sharpness wpływa na skuteczność ofensywną istniejącego melee resolvera.

Preferowany pierwszy model:

```text
effectiveDamage = baseDamage × sharpnessModifier
```

Zachować łagodny efekt, np.:

```text
100% sharpness → 100% damage
75%            → ~94%
50%            → ~85%
25%            → ~72%
0%             → ~55%
```

Dokładna krzywa ma być centralnym parametrem/resolverem, a nie logiką UI.

Broń tępa nadal może być używana. Nie zamieniać automatycznie `sharpness = 0` w broken.

## Zużywanie ostrości

Każde skuteczne użycie broni może zmniejszać sharpness.

W pierwszej wersji:

- udane trafienie → mały spadek sharpness;
- pudło nie musi zużywać ostrza;
- ciężkie/odporne cele mogą zużywać ostrze bardziej;
- parametry zależą od typu/materialu broni;
- nie wykonywać ticka per-frame.

Zużycie powinno być rozwiązywane podczas konkretnej akcji melee.

## Materiały / typy ostrzy

Nie tworzyć pełnego systemu materiałów.

Istniejący `ItemKind` może określać profil ostrza przez centralną konfigurację, np. logicznie:

```text
blade profile
├── max sharpness
├── sharpness loss
├── sharpening efficiency
└── durability wear
```

Dzięki temu:

- zwykła stal zużywa się normalnie;
- Damascus długo zachowuje ostrość;
- masterwork jest trwały i dobrze trzyma ostrość;
- obsydian ma bardzo wysoką ostrość/obrażenia, ale może mieć specyficzną kruchość i większą podatność na durability wear.

Nie dodawać osobnego resolvera combat dla każdego materiału.

## Osełka

Dodać nowy stackable item, np. `whetstone` / `sharpening_stone`.

Osełka:

- jest normalnym itemem inventory;
- zużywa określoną liczbę użyć albo jest konsumowana przy ostrzeniu;
- zwiększa sharpness konkretnej weapon instance;
- nie zmienia durability;
- działa bez specjalnego sprzętu świata.

Preferowane UX:

```text
Inventory
→ wybierz broń
→ Ostrz
→ wybierz osełkę
→ sharpness +N
```

Nie tworzyć osobnego weapon inventory.

## Ostrzenie przy kole

Dodać możliwość ostrzenia przy istniejącym lub przyszłym miejscu typu grindstone/workshop, ale bez tworzenia dużego crafting systemu.

Koło szlifierskie powinno:

- działać szybciej lub skuteczniej niż osełka;
- nie wymagać zużywania osobnej osełki, jeśli korzysta z istniejącej infrastruktury;
- mieć prostą akcję/interakcję;
- modyfikować sharpness tej samej ItemInstance.

Jeżeli w codebase nie istnieje jeszcze odpowiedni world place, pierwsza implementacja może ograniczyć się do osełki i zostawić grindstone jako rozszerzenie tego samego planu tylko wtedy, gdy nie wymaga nowego dużego systemu places.

## Skill

Nie dodawać osobnego skilla tylko dla ostrzenia w pierwszej wersji.

Jeżeli istnieje odpowiedni skill kowalski/craftingowy, można go wykorzystać jako modyfikator skuteczności. W przeciwnym razie sharpening ma być deterministyczne.

Nie tworzyć nowego skill system tylko dla tego mechanizmu.

## NPC / gospodarka

Konserwacja powinna być możliwa do wykorzystania przez NPC w przyszłości.

Nie implementować pełnego NPC blacksmith behaviour w tym planie, ale API powinno pozwalać na:

```text
NPC weapon
→ sharpening action
→ same WeaponItemInstance
```

Przyszły kowal może świadczyć usługę ostrzenia, co może wejść do ekonomii osad bez tworzenia równoległego systemu broni.

## Persistence

Rozszerzyć istniejący `SaveItemInstance` / persistence o pola wymagane dla weapon instances:

```text
{
    id,
    kind,
    durability,
    sharpness
}
```

Stare save'y bez tych pól muszą działać.

Dla nowych weapon instances brak pól powinien zostać zinterpretowany przez centralny initializer jako pełna durability i pełna sharpness.

Nie zmieniać persistence stackable items.

## Inventory / UI

Lista inventory nadal grupuje itemy według `ItemKind`.

Dla instance-backed weapon:

```text
Miecz ×2

1× 100% condition / 92% sharpness
1× 78% condition / 41% sharpness
```

Szczegóły itemu powinny umożliwiać wybranie konkretnego `instance.id` do ostrzenia.

Stan nie może być kopiowany do komponentów UI jako drugi source of truth.

## Combat integration

Docelowy flow:

```text
held WeaponItemInstance
        ↓
existing melee config
        ↓
sharpness modifier
        ↓
hit / damage
        ↓
sharpness wear
        ↓
durability wear (jeżeli przewidziane dla danego trafienia)
```

Nie tworzyć nowego weapon combat system.

Istniejący `MeleeConfig` pozostaje bazową definicją broni, a stan instance jest nakładany w centralnym resolverze.

## Trading

Sprzedaż konkretnej weapon instance powinna w przyszłości uwzględniać durability i sharpness.

Jeżeli obecny trade resolver zostanie rozszerzony w tym planie, cena powinna być liczona centralnie:

```text
base item price
→ condition modifier
→ sharpness modifier
→ final price
```

Nie przechowywać ceny w instance.

## Performance

- brak globalnego weapon tick;
- sharpness/durability zmieniane wyłącznie przy akcjach;
- brak per-frame skanowania inventory instances;
- sharpening UI i price calculation tylko podczas interakcji;
- nie tworzyć managera broni.

## Konkretne miejsca do sprawdzenia/zmiany

- `src/items/itemInstances.ts` — WeaponItemInstance i profile ostrzy;
- `src/items/Inventory.ts` — instance storage/persistence;
- `src/items/items.ts` — ewentualny `whetstone` i nowe item definitions;
- `src/items/itemCatalog.ts` — weapon/melee metadata;
- player held-item/equipment flow;
- player melee resolver;
- durability/trap instance patterns jako istniejący wzorzec persistence;
- trade resolver/catalog;
- inventory/item details UI;
- ewentualny place/workshop/grindstone flow;
- testy inventory, instances, combat, persistence i trade.

Nie tworzyć nowych managerów bez potwierdzonej potrzeby.

## Kryteria akceptacji

- [ ] Wybrane bronie są przechowywane jako indywidualne `WeaponItemInstance`.
- [ ] Każda weapon instance ma stabilne `id`, `durability` i `sharpness`.
- [ ] Nowa broń zaczyna z pełną durability i sharpness.
- [ ] Sharpness i durability są niezależne.
- [ ] Combat zmniejsza sharpness zgodnie z centralnym profilem broni.
- [ ] Sharpness wpływa na damage bez tworzenia osobnego combat system.
- [ ] Osełka pozwala zwiększyć sharpness konkretnego egzemplarza.
- [ ] Ostrzenie nie regeneruje durability.
- [ ] Osełka jest normalnym itemem inventory.
- [ ] Jeśli grindstone zostanie włączony do implementacji, działa przez ten sam sharpening resolver.
- [ ] Save/load zachowuje durability i sharpness.
- [ ] Stare save'y bez weapon instance fields pozostają kompatybilne.
- [ ] Inventory/UI rozróżnia konkretne instances, gdy ich stan się różni.
- [ ] Testy pokrywają initializer, sharpening, sharpness wear, damage modifier i persistence.
- [ ] Build/type-check/test przechodzą.
- [ ] Browser/manual check potwierdza ostrzenie i zmianę skuteczności broni w walce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
