# Roadmap: Locations

## Goal

Stworzyć spójny system **lokacji świata**, które są rzeczywistymi, nazwanymi miejscami w Seedvale i mogą być odkrywane, zapamiętywane, prezentowane na mapie oraz wykorzystywane przez NPC, questy i inne systemy świata.

Kluczowa zasada:

```
world location
    ↓
physical place + identity
    ↓
knowledge / discovery
    ↓
map / NPC / quests / navigation
```

---

## Phase 1 — Location Foundation

Wspólny fundament systemu lokacji:

- `WorldLocation`,
- stabilne ID,
- typ lokacji,
- pozycja,
- nazwa,
- deterministyczne nazewnictwo,
- discovery state,
- discovery source,
- discovery weight.

Lokacja jest lekkimi danymi świata, niezależnymi od Three.js i UI.

---

## Phase 2 — Initial World Locations

Pierwszy katalog lokacji:

- `settlement`,
- `cave`,
- `mountainPeak`,
- `lake`,
- `cemetery`.

Integracja z istniejącymi systemami świata:

- settlementy,
- `CaveDefinition`,
- procedural landmarks,
- dane jezior.

Dla mountain peaks przewidziane jest również fizyczne oznaczenie miejsca, np. kamień/tablica z nazwą.

---

## Phase 3 — Location Knowledge

System wiedzy gracza o konkretnych lokacjach:

- niezależny od odkrywania komórek mapy,
- `discoveredLocations`,
- źródła wiedzy,
- `estimated → discovered → confirmed`,
- persistence,
- dystans do lokacji.

Jednostka gameplayowa:

```
1 dzień drogi = 20 km
```

Zakresy:

| Zakres | Odległość |
|---|---:|
| near | 0–20 km |
| medium | 20–60 km |
| far | 60–200 km |

Odległość w pierwszej wersji liczona w poziomie X/Z.

---

## Phase 4 — Location Discovery

Pozyskiwanie wiedzy o lokacjach przez NPC.

### Guard knowledge

Strażnik:

- zna landmarki w zakresie near + medium,
- wybiera top 5 landmarków wg `discoveryWeight`,
- zna najbliższe settlementy niezależnie od landmark pool.

Dialog:

> Opowiedz mi coś o okolicy.

Jedna rozmowa odkrywa losowo 1–3 lokacje z puli top 5.

Kolejne rozmowy mogą odkrywać inne lokacje z tej puli.

Discovery weight określa ważność przy wyborze wiedzy, a nie prawdopodobieństwo wygenerowania lokacji.

---

## Phase 5 — Maps as Knowledge Sources

Mapy kupowane u handlarzy dostarczają wiedzy o lokacjach.

### Near Map

- landmarki w near range,
- weighted top 10,
- pobliskie settlementy.

### Far Map

- landmarki w far range,
- weighted top 10,
- settlementy w dalszym zakresie,
- brak powtórzeń landmarków z Near Map.

Mapa jest przedmiotem inventory, ale zdobyta wiedza jest trwała i niezależna od posiadania mapy.

---

## Phase 6 — Map & Navigation UX

Rozbudowa pełnej mapy i minimapy:

- markery znanych lokacji,
- kliknięcie lokacji,
- location information popover,
- nazwa, typ i dystans,
- przybliżony czas drogi,
- wybór maksymalnie 3 celów,
- osobne kolory celów,
- lista aktywnych celów,
- usuwanie pojedynczego celu,
- wyczyszczenie wszystkich celów,
- centrowanie mapy na graczu,
- filtrowanie kategorii lokacji.

Minimapa pokazuje wyłącznie aktywne cele:

- marker, gdy cel jest w obrębie minimapy,
- kierunkową strzałkę na krawędzi, gdy cel znajduje się poza nią.

Nie tworzyć osobnego systemu GPS.

---

## Phase 7 — Developer Tools

Narzędzia developerskie wspierające testowanie systemu:

- pokazanie wszystkich lokacji,
- pokazanie nieodkrytych lokacji,
- pokazanie ID,
- reveal pojedynczej lokacji,
- reveal all.

Szczególny nacisk na możliwość szybkiego odnajdywania i testowania deep caves.

Debug nie może modyfikować normalnej logiki discovery poza świadomym użyciem narzędzia.

---

## Phase 8 — Location Integration

Wykorzystanie `WorldLocation` jako wspólnego punktu odniesienia dla kolejnych systemów:

```
WorldLocation
    ├── Map
    ├── NPC knowledge
    ├── Dialogue
    ├── Quests
    ├── Exploration
    ├── Events
    ├── History
    └── Navigation
```

Lokacja nie powinna być jedynie ikoną na mapie — powinna reprezentować rzeczywiste miejsce świata, z którym mogą wiązać się konsekwencje i wydarzenia.

---

## Phase 9 — Additional Location Types

Rozszerzanie katalogu bez tworzenia nowych, równoległych mechanizmów.

Przyszłe przykłady:

- spring,
- river source,
- waterfall,
- ruins,
- monolith,
- abandoned places,
- inne charakterystyczne miejsca świata.

---

## Related Plans

### 012 — World Locations, Discovery and Map Navigation

Pierwsza pełna implementacja systemu obejmująca fundament lokacji, pierwsze typy, location knowledge, discovery przez strażnika, mapy kupowane u handlarza, mapę/minimapę, nawigację oraz narzędzia debug.

