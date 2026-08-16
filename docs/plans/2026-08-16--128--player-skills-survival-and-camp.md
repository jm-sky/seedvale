# Plan: Skills v2 — Skill Progression, Survival & Camp System

**Created:** 2026-08-16
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~124~~

## Cel

Rozwinąć istniejącą podstawę `PlayerSkills` w rzeczywisty system rozwoju umiejętności oraz dodać pierwszy pełny skill — `Survival`.

Plan jednocześnie domyka istniejące mechaniki biwakowania:

    ognisko + koc + namiot
        → jeden spójny system odpoczynku

Skill nie powinien być systemem RPG z ręcznym rozdawaniem punktów. Umiejętności rozwijają się przez **rzeczywiste używanie powiązanych mechanik**.

---

## Stan obecny

Plan 124 dodał:

- `PlayerController.skills`;
- `SkillId = 'sneak'`;
- `SkillState { value, active }`;
- Sneak o stałej wartości `0.5`;
- aktywację/dezaktywację Sneak;
- wpływ Sneak na prędkość gracza;
- wpływ Sneak na percepcję zwierząt;
- ekran Skills w menu pauzy.

Nie istnieje jeszcze:

- XP/progresja skills;
- zapis progresu skills;
- drugi skill;
- zależność istniejących mechanik od Survival;
- interakcja między ogniskiem, kocem i namiotem.

Istnieją już mechaniki potrzebne do Survival:

- rozpalanie ogniska;
- gotowanie;
- namiot;
- koc;
- odpoczynek;
- potrzeby gracza;
- stamina/vigor/hunger/thirst;
- persistence gracza.

---

# Etap 1 — Skill progression

## Model

Rozszerzyć `PlayerSkills` tak, aby skill posiadał progresję zamiast stałego `value`.

Preferowany model:

```ts
type SkillState = {
  value: number
  xp: number
  active: boolean
}
```

Jeżeli obecny model można rozszerzyć prościej, nie wprowadzać dodatkowych pól bez potrzeby.

## Rozwój przez używanie

XP przyznawać za **znaczące zakończone działania**, nie za samo rozpoczęcie akcji.

Przykłady:

| Skill | Akcja | XP |
|---|---|---:|
| Sneak | skuteczne skradanie się przez określony czas/dystans | małe |
| Survival | rozpalenie ogniska | małe |
| Survival | rozstawienie namiotu | małe |
| Survival | odpoczynek na biwaku | małe |
| Survival | ugotowanie mięsa | małe |

Nie przyznawać XP:

- co klatkę;
- za wielokrotne anulowanie tej samej akcji;
- za spamowanie interakcji;
- za rozpoczęcie akcji, która nie została ukończona.

## Krzywa progresji

Pierwsze poziomy powinny być łatwe do zdobycia, kolejne coraz wolniejsze.

Nie dodawać jeszcze:

- level capów klasowych;
- perk tree;
- punktów do rozdawania;
- skill unlocków;
- skomplikowanego RPG stat system.

Skill ma być prostym, ciągłym rozwojem.

---

# Etap 2 — Persistence

Rozszerzyć istniejący `SaveData`.

Zapisywać:

- XP skills;
- aktualną wartość skills.

Nie zapisywać tymczasowego stanu:

- `active` Sneak, jeżeli jest traktowany jako runtime state;
- aktualnie wykonywanej akcji;
- chwilowego progresu kanału `ignite/cook/rest`.

Dodać migrację istniejących save'ów.

Stary save powinien otrzymać:

- Sneak na dotychczasowym poziomie `0.5`;
- Survival na wartości początkowej.

---

# Etap 3 — Survival

Dodać:

```ts
SkillId = 'survival'
```

Survival ma być przede wszystkim umiejętnością **sprawnego radzenia sobie poza cywilizacją**.

## 3.1 Rozpalanie ogniska

Obecny czas `ignite` zostaje mechanizmem bazowym.

Survival wpływa na:

- czas rozpalania;
- docelowo może kompensować trudniejsze warunki.

W pierwszej wersji:

    wyższy Survival → krótszy ignite

Nie tworzyć nowego systemu rozpalania.

Wykorzystać istniejący busy channel `ignite`.

---

## 3.2 Rozbijanie namiotu

Wykorzystać istniejącą mechanikę namiotu.

Survival wpływa na:

    wyższy Survival → krótszy czas rozstawiania

Packowanie namiotu również powinno pozostać szybkie/proste i nie wymagać osobnego systemu progresji, chyba że obecna mechanika już posiada czasową akcję.

---

## 3.3 Spanie na samym kocu

Koc powinien pozostać użyteczny nawet bez namiotu.

Survival zmniejsza negatywne konsekwencje takiego odpoczynku.

Przykładowa zależność:

    niski Survival
        → duża kara

    wysoki Survival
        → mniejsza kara

Nie tworzyć dodatkowego statystyki `comfort`.

Wykorzystać istniejące `vigor/stamina/rest` i istniejący system odpoczynku.

---

# Etap 4 — Gotowanie i Survival

Nie skracać gotowania.

Zamiast tego Survival zwiększa **wartość odżywczą przygotowanego mięsa**.

Obecna droga:

    raw_meat
        ↓
    campfire cooking
        ↓
    roasted_meat

pozostaje bez zmian.

Zmienia się jedynie efekt konsumpcji:

    roasted_meat food value
        ↑
    Survival

## Ważne

Nie tworzyć:

- `roasted_meat_good`;
- `roasted_meat_perfect`;
- wielu nowych itemów;
- osobnych receptur zależnych od skilla.

`roasted_meat` pozostaje tym samym itemem, a jego efekt jest obliczany na podstawie Survival.

Dzięki temu system pozostaje prosty i kompatybilny z istniejącym inventory/catalog.

---

# Etap 5 — Camp System

Ten etap jest **niezależny od Skills**.

Celem jest połączenie istniejących mechanik:

- campfire;
- blanket;
- tent;
- rest.

Obecnie są to osobne mechaniki. Powinny tworzyć jeden system biwakowania.

## 5.1 Wykrywanie obozu

Nie tworzyć osobnego dużego `CampManager`, jeżeli nie jest konieczny.

Odpoczynek powinien określić lokalny kontekst:

- czy w pobliżu znajduje się aktywne ognisko;
- czy gracz posiada/używa koca;
- czy znajduje się w namiocie;
- czy znajduje się w odpowiednim miejscu do odpoczynku.

Wykorzystać istniejące world objects i istniejące proximity/interactable mechanisms.

---

# Etap 6 — Jakość odpoczynku

Wprowadzić prostą hierarchię:

### Sam koc

    blanket

Najgorszy wariant.

- możliwy odpoczynek;
- większa kara;
- Survival ją zmniejsza.

### Namiot + koc

    tent + blanket

Dobry podstawowy odpoczynek.

- mniejsza kara;
- ochrona zapewniana przez namiot.

### Koc + ognisko

    blanket + campfire

Ciepły biwak.

- lepszy odpoczynek niż sam koc;
- ognisko daje bonus cieplny.

### Namiot + koc + ognisko

    tent + blanket + campfire

Pełny biwak.

- najlepszy odpoczynek;
- namiot zapewnia ochronę;
- ognisko zapewnia ciepło;
- koc zapewnia komfort.

Nie dodawać jeszcze nowych statystyk typu `temperature`, `comfort` czy `sleepQuality`.

Efekt powinien być wyrażony przez istniejące:

- vigor;
- stamina;
- ewentualne istniejące kary rest.

---

# Etap 7 — Ognisko jako element obozu

Aktywne ognisko powinno mieć lokalny zasięg.

Jeżeli gracz odpoczywa w jego pobliżu:

    campfire → warm rest

Nie wymaga to nowych mechanik światowych.

Wykorzystać istniejące `PlacedFires`.

Ognisko powinno wpływać tylko na odpoczynek, gdy faktycznie jest:

- aktywne;
- wystarczająco blisko gracza.

Zgaszone ognisko nie daje bonusu.

---

# Etap 8 — Skills UI

Rozszerzyć istniejący `SkillsScreen.vue`.

Pokazywać:

### Sneak

- aktualny poziom/progres;
- pasek XP;
- krótki opis efektu.

### Survival

- aktualny poziom/progres;
- pasek XP;
- krótki opis:
  - szybsze rozpalanie;
  - szybsze rozstawianie namiotu;
  - lepszy odpoczynek na kocu;
  - bardziej wartościowe ugotowane mięso.

Nie dodawać osobnego ekranu.

---

# Etap 9 — Integracja Sneak z progresją

Przepiąć istniejący Sneak z:

    fixed 0.5

na:

    PlayerSkills.sneak.value

Istniejące mechanizmy pozostają:

- movement modifier;
- fauna perception;
- active toggle.

Zmienia się tylko źródło wartości.

Sneak rozwija się przez faktyczne używanie skradania.

Nie dodawać nowych mechanizmów percepcji.

---

# Architektura

## Zasada

Skill ma **modyfikować istniejące mechaniki**, a nie tworzyć ich alternatywne wersje.

Przykład:

    existing ignite
        ↓
    Survival modifier
        ↓
    krótszy czas

Nie:

    SurvivalIgniteSystem
        ↓
    drugi sposób rozpalania

Analogicznie:

    existing rest
        ↓
    camp context
        ↓
    rest quality

oraz:

    existing cooking
        ↓
    Survival
        ↓
    food value

---

# Pliki / obszary do sprawdzenia

Przed implementacją dokładnie zweryfikować aktualne ścieżki:

- `src/player/PlayerSkills.ts`
- `src/player/PlayerController.ts`
- `src/player/PlayerNeeds.ts`
- `src/player/...` — istniejący rest/camp flow
- `src/items/...` — inventory/catalog
- `src/items/campfireCooking.ts`
- `src/world/...` — `PlacedFires`
- `src/world/...` — `PlacedTents`
- `src/persistence/saveData.ts`
- `src/persistence/...` — migracje
- `SkillsScreen.vue`
- `gameLoop.ts`
- istniejące interakcje `ignite`, `cook`, `tent`, `rest`

Nie tworzyć nowych managerów bez potwierdzenia, że istniejące mechanizmy nie mogą zostać rozszerzone.

---

# Balans

Początkowo stosować małe modyfikatory.

Skill powinien być odczuwalny, ale nie zamieniać podstawowych czynności w natychmiastowe akcje.

Przykładowa filozofia:

    Survival 0
        podstawowe możliwości

    Survival 0.5
        zauważalnie sprawniejszy biwak

    Survival 1
        bardzo doświadczony survivalista

Nie ustalać ostatecznych wartości przed sprawdzeniem obecnych czasów `ignite`, `tent`, `cook` oraz efektów rest.

---

# Testy

## Unit

Dodać testy dla:

- XP gain;
- XP → skill value;
- granic `0..1`;
- progresji Sneak;
- progresji Survival;
- Survival → ignite duration;
- Survival → tent setup duration;
- Survival → blanket penalty;
- Survival → cooked meat food value;
- camp context;
- kombinacji:
  - blanket;
  - tent + blanket;
  - campfire + blanket;
  - campfire + tent + blanket.

## Regression

Sprawdzić:

- istniejące Sneak;
- fauna perception;
- melee;
- cooking;
- tent placement/rest;
- campfire;
- player needs;
- save/load.

---

# Browser verification

Po implementacji obowiązkowo zweryfikować w przeglądarce:

- Sneak faktycznie rozwija się podczas używania;
- Survival faktycznie rośnie po akcjach;
- UI pokazuje progres;
- rozpalanie zmienia czas wraz z Survival;
- namiot zmienia czas wraz z Survival;
- gotowane mięso daje większą wartość przy wyższym Survival;
- sam koc daje gorszy odpoczynek;
- koc + ognisko daje lepszy odpoczynek;
- namiot + koc + ognisko daje najlepszy odpoczynek;
- zgaszone ognisko nie daje bonusu;
- zapis i reload zachowują progres.

Zweryfikować również, że nie pojawiają się nowe hitchy ani zbędne obliczenia per-frame.

---

# Out of scope

Nie dodawać w tym planie:

- perk tree;
- ręcznego rozdawania punktów;
- wielu klas postaci;
- statystyk RPG;
- craftingu zależnego od Survival;
- leczenia zależnego od Survival;
- osobnego systemu temperatury;
- pełnego systemu pogody wpływającego na biwak;
- nowych itemów dla jakości ugotowania;
- multiplayer progression;
- LLM-driven skills.

Pogoda może być później naturalnym kolejnym rozszerzeniem:

    weather
      ↓
    campfire / shelter / rest
      ↓
    Survival jako częściowa kompensacja

---

# Rezultat

Po ukończeniu gracz powinien mieć prostą, ale już wyraźną pętlę:

    eksploracja
        ↓
    używanie umiejętności
        ↓
    rozwój skills
        ↓
    lepsze wykonywanie czynności
        ↓
    lepszy biwak
        ↓
    dłuższa / skuteczniejsza eksploracja

A istniejące przedmioty zaczynają działać razem:

    Ognisko
       +
    Koc
       +
    Namiot
       ↓
    Biwak
       ↓
    Lepszy odpoczynek

To jest ważniejsze niż samo dodanie kolejnych bonusów do Survival — tworzy pierwszy mały, spójny system „życia poza osadą”.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
