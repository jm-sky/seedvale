# Plan: Landmark variety and quest hooks

**Created:** 2026-09-13
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~quests-progression-016~~, ~~world-024~~
**Domain:** `world-terrain`
**Type:** `feature`
**Roadmap:** -

## Cel

Rozszerzyć proceduralne landmarki o charakterystyczne miejsca zwiększające różnorodność, eksplorację i rozpoznawalność świata:

- mała łódź na brzegu morza,
- większy statek / wrak statku,
- samotna wieża,
- wielkie stare drzewo,
- porzucony wóz.

Landmark **nie musi mieć questa ani loot**. Najpierw jest realnym elementem świata, a questy, loot i historie mogą się do niego opcjonalnie podłączać.

```text
World generation
      ↓
Landmark
      ├─ exploration
      ├─ optional loot
      └─ optional quest
```

## Istniejące systemy do wykorzystania

Nie tworzyć nowego `LandmarkManager`.

Rozszerzyć istniejące:

- `src/terrain/chunkEnvironment.ts`,
- stabilne `EnvironmentPlacement.id` / `landmarkId`,
- istniejący `LandmarkKind`,
- generic `interact_landmark`,
- istniejący world landmark lookup,
- `Hidden Finds`,
- systemic treasure/chests z `world-024`,
- obecny quest runtime / `QuestManager`.

Quest ma wskazywać konkretny istniejący `landmarkId`, a nie współrzędne.

## 1. Mała łódź

Mała łódź pozostawiona lub wyrzucona na brzeg.

### Placement

- tylko wybrzeże morza,
- blisko linii brzegowej,
- teren odpowiednio płaski,
- brak kolizji z budynkami i innymi dużymi obiektami.

### Gameplay

Opcjonalny niewielki loot.

Może być również całkowicie pusta.

## 2. Statek / wrak statku

Znacznie większy landmark niż łódź.

Nie powinien być po prostu powiększoną łodzią.

### Placement

- wyłącznie okolice morza,
- duży footprint,
- bardzo rzadki,
- częściowo na brzegu lub w płytkiej wodzie zależnie od możliwości obecnego terrain/water pipeline.

### Gameplay

Większy potencjalny loot niż łódź.

Może wykorzystywać istniejący systemic treasure/chest mechanism.

Nie gwarantować bogatego skarbu w każdym wraku.

## 3. Samotna wieża

Duży landmark orientacyjny widoczny z daleka.

Warianty:

- wieża nad morzem,
- wieża górska.

Może być całkowicie opuszczona.

Nie wymaga NPC ani questa.

### Placement

Preferować:

```text
coastal tower → coast + odpowiednia wysokość
mountain tower → ridge / altitude + stabilny teren
```

Duży footprint musi być brany pod uwagę przy placement rejection.

## 4. Wielkie stare drzewo

Naturalny landmark.

### Ważne

Musi mieć **dedykowany model**.

Nie implementować jako:

```text
normalTree.scale *= 3
```

Powinno mieć własną sylwetkę:

- masywny pień,
- charakterystyczne konary,
- duża korona,
- rozpoznawalność z dystansu.

Placement np.:

- polana,
- skraj lasu,
- wzgórze,
- duża łąka.

Generator powinien pozostawić wokół niego więcej wolnej przestrzeni niż wokół zwykłego drzewa.

Loot domyślnie niepotrzebny.

## 5. Porzucony wóz

Mały landmark związany z podróżą i historią świata.

### Placement

Preferować okolice istniejących dróg/traktów:

```text
road
  ↓
small lateral offset
  ↓
abandoned wagon
```

Nie stawiać na środku drogi.

### Gameplay

Opcjonalny mały loot.

Wóz może też być pusty.

# Quest integration

Landmark istnieje **niezależnie od questa**.

```text
World generates landmark
        ↓
NPC/world problem may reference it
        ↓
Quest binds landmarkId
```

Nie generować landmarku dlatego, że pojawił się quest.

Użyć istniejącego:

```ts
{ type: 'interact_landmark', landmarkId }
```

Nie dodawać osobnych objective'ów typu `visit_shipwreck`, `visit_tower`, `visit_tree`, `visit_wagon`, jeżeli zwykłe `interact_landmark` wystarcza.

## Przykładowe questy

### Wrak — zaginiony ładunek

```text
kupiec / rybak
→ zaginiony statek
→ odnajdź wrak
→ odzyskaj / sprawdź ładunek
→ wróć do NPC
```

Docelowo quest powinien korzystać z realnych itemów/handlu, a nie quest-only cargo.

### Wieża — sprawdź co się dzieje

NPC słyszał lub widział:

- światło,
- dym,
- ruch,
- albo ktoś nie wrócił z okolicy.

```text
NPC concern
→ real tower landmark
→ investigate
→ report
```

Wieża może okazać się zupełnie opuszczona.

### Stare drzewo — punkt spotkania

Może służyć jako:

- umówione miejsce,
- punkt orientacyjny,
- miejsce związane z lokalną historią,
- ostatni znany punkt zaginionej osoby.

Nie robić z niego automatycznie magicznego drzewa.

### Porzucony wóz — zaginiony handlarz

```text
trader disappeared
→ locate wagon
→ investigate
→ optional next clue
```

W przyszłości może łączyć się z realnymi bandytami/trade simulation.

### Łódź / wrak — zaginiony rybak

```text
fisherman missing
→ boat found on shore
→ investigate
→ player learns what happened
```

## Loot

Orientacyjnie:

```text
wóz         → small
łódź        → small
statek      → medium / large
wieża       → optional
stare drzewo → none by default
```

Reuse:

- Hidden Finds dla prostych ukrytych znalezisk,
- istniejące chest/treasure-site mechanisms dla widocznego lootu.

Nie tworzyć `LandmarkLootManager`.

## Generation

Każdy landmark ma własne kryteria:

```text
boat / ship → coast
tower       → coast OR mountains
old tree    → biome + clearing
wagon       → road proximity
```

Wszystko deterministyczne względem world seed.

Landmarki powinny być rzadkie — szczególnie:

- statek,
- wieża,
- stare drzewo.

## Non-goals

Nie implementować tutaj:

- żeglowania,
- używalnych łodzi,
- załóg statków,
- osobnego systemu landmark quests,
- questa dla każdego landmarku,
- magicznych właściwości starego drzewa,
- bandit simulation tylko na potrzeby wozu,
- nowego systemu loot,
- globalnego landmark registry.

## Verification

User sprawdza w przeglądarce:

- łódź wygląda naturalnie na brzegu,
- statek jest wyraźnie większym landmarkiem,
- wieża dobrze działa nad morzem / w górach,
- stare drzewo jest rzeczywiście unikalnym modelem,
- wóz pojawia się przy drodze, ale jej nie blokuje,
- landmarki nie nachodzą na osady i inne obiekty,
- loot nie respawnuje po reloadzie,
- quest może wskazać konkretny nowy landmark,
- landmark działa również bez questa.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
