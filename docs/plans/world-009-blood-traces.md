# Plan: Blood Traces

**Created:** 2026-09-01
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `world`
**Tags:** `environment` `combat` `weather`

## Cel

Dodać krótkotrwałe ślady krwi powstające w miejscu otrzymania obrażeń przez playera, NPC lub animal.

Krew ma być częścią świata, a nie osobnym modelem 3D.

Docelowo:

```
damage
  ↓
blood trace
  ↓
terrain / grass overlay
  ↓
natural fading
  ↓
weather accelerates fading
  ↓
removed
```

System ma działać niezależnie od obecności gracza i kamery.

## Zakres

### 1. Blood trace creation

Po otrzymaniu obrażeń przez:
- player,
- NPC,
- animal

może zostać utworzony blood trace.

Trace powinien posiadać minimalny stan potrzebny do renderowania i lifecycle:
- pozycję w świecie,
- rozmiar,
- wariant tekstury,
- rotację,
- czas utworzenia.

Nie tworzyć osobnego 3D modelu krwi.

Nie tworzyć osobnego combat/death systemu.

### 2. Blood mark size

Rozmiar śladu powinien uwzględniać:
- rozmiar poszkodowanej jednostki,
- ilość otrzymanego damage,
- niewielką deterministyczną różnorodność.

Zastosować rozsądne minimum i maksimum.

Nie stosować nieograniczonej liniowej zależności damage → rozmiar.

### 3. Rendering

Preferowanym rozwiązaniem jest wykorzystanie istniejącego terrain rendering pipeline:

```
terrain shader
    +
blood mask / overlay
```

Przed implementacją sprawdzić aktualny terrain shader/material oraz sposób streamowania chunków i dobrać mechanizm zgodny z istniejącym pipeline.

Jeżeli bezpośrednia integracja z terrain shaderem wymagałaby nieproporcjonalnej przebudowy, preferować rozwiązanie batched/instanced zamiast osobnego mesh per blood trace.

Jeżeli obecny grass rendering pozwala sensownie uwzględnić blood overlay, krew może być również widoczna na/między trawą. Nie wymuszać jednak osobnego grass shader path tylko dla tego feature.

### 4. Blood textures

System powinien obsługiwać kilka wariantów tekstury, np. 3–4 PNG z alpha.

Wariant powinien być wybierany deterministycznie lub zgodnie z istniejącymi zasadami proceduralnej różnorodności.

Każdy trace może dodatkowo otrzymać:
- losową rotację,
- niewielką różnicę skali,
- niewielką różnicę opacity.

Nie wymagać produkcji nowych assetów w ramach implementacji, jeżeli placeholder textures wystarczą do weryfikacji pipeline.

### 5. Lifetime

Blood trace powinien być widoczny przez około:

```
1–3 dni
```

Po tym czasie powinien zniknąć.

Lifetime powinien wynikać z world time/timestampu, a nie z renderer-only timer.

Nie wymagać aktywnego renderowania ani obecności kamery do upływu lifetime.

### 6. Weather

Deszcz powinien przyspieszać zanikanie krwi.

Wpływ powinien być kumulatywny względem czasu ekspozycji na deszcz:

```
dry weather
→ normal fading

rain
→ faster fading

prolonged/heavy rain
→ significantly faster fading
```

Krótki deszcz nie powinien automatycznie usuwać wszystkich śladów.

Wykorzystać istniejący system czasu i pogody.

Nie tworzyć osobnego weather systemu dla blood traces.

### 7. Trace accumulation

Wiele trafień w krótkim czasie może tworzyć wiele śladów, ale system musi chronić przed niekontrolowaną kumulacją.

Jeżeli kilka blood traces znajduje się bardzo blisko siebie i w krótkim czasie, rozważyć ich agregację lub ograniczenie liczby reprezentacji zamiast tworzenia nieograniczonej liczby renderowanych elementów.

Mechanizm agregacji nie powinien zmieniać znaczenia istniejących damage events.

### 8. Chunk / world lifecycle

Blood traces muszą współpracować z istniejącym world/chunk lifecycle.

Streaming/rendering nie może powodować:
- utraty aktywnego śladu,
- resetowania jego lifetime,
- wielokrotnego generowania tego samego śladu.

Dla trace poza aktywnym obszarem renderowania nie należy utrzymywać niepotrzebnej reprezentacji GPU.

Nie rozszerzać pełnego SaveData wyłącznie dla krótkotrwałych blood traces, jeśli obecny world/chunk lifecycle nie wymaga ich persistence.

### 9. Performance

System powinien być projektowany pod potencjalnie dużą liczbę śladów.

Preferować:
- shader/mask,
- batching,
- instancing,
- chunk-local aggregation,

zależnie od możliwości istniejącego terrain pipeline.

Unikać osobnego draw call per blood trace.

Cleanup i agregacja powinny ograniczać liczbę aktywnych reprezentacji.

### 10. Combat integration

Blood traces są prezentacją obrażeń.

Istniejący system pozostaje właścicielem:

```
damage calculation
HealthState
combat resolution
```

Blood system reaguje na rzeczywisty damage event/state.

Nie zmieniać:
- damage calculation,
- critical hits,
- combat decisions,
- health,
- death lifecycle.

Śmierć może wygenerować blood trace poprzez ten sam mechanizm co zwykłe obrażenia; nie tworzyć osobnego death-only blood systemu.

### 11. Debug

Jeżeli potrzebne, dodać minimalną diagnostykę pozwalającą sprawdzić:
- utworzenie blood trace,
- pozycję,
- rozmiar,
- variant,
- lifetime,
- wpływ pogody,
- cleanup/agregację.

Nie tworzyć osobnego debug UI.

## Ownership

```
Combat / HealthState
    → damage

Blood Trace system
    → environmental blood state

Terrain rendering
    → visual representation

World time / Weather
    → lifetime progression

Chunk / World
    → streaming and representation lifecycle
```

Nie tworzyć `BloodManager` posiadającego combat state lub health state.

## Poza zakresem

- blood trails,
- corpse lifecycle,
- corpse rendering,
- bones,
- predator/scavenger behaviour,
- disease,
- wound mechanics,
- new combat mechanics,
- new damage system,
- permanent blood stains,
- pełna persistence krótkotrwałych blood traces,
- player-specific blood system.

Blood trails mogą zostać osobnym późniejszym rozszerzeniem wykorzystującym ten sam blood trace mechanism.

## Verification

### Creation

1. Player otrzymuje damage → pojawia się blood trace.
2. NPC otrzymuje damage → pojawia się blood trace.
3. Animal otrzymuje damage → pojawia się blood trace.
4. Brak damage nie generuje śladu.
5. Wielkość śladu odpowiada victim size + damage.
6. Bardzo mały i bardzo duży damage pozostają w rozsądnych granicach.

### Rendering

1. Blood jest renderowana jako overlay/mask albo odpowiednik wybranego batched/instanced rozwiązania, nie osobny model 3D per trace.
2. Różne warianty tekstury są widoczne.
3. Rotacja i skala nie wyglądają identycznie dla wszystkich śladów.
4. Ślad poprawnie dopasowuje się do terrain.
5. Jeśli grass rendering został objęty rozwiązaniem, krew nie powoduje oczywistych artefaktów.

### Lifetime

1. Ślad pozostaje widoczny przez około 1–3 dni.
2. Po zakończeniu lifetime znika.
3. Streaming chunków nie resetuje lifetime.
4. Brak kamery nie zatrzymuje lifecycle.

### Weather

1. Deszcz przyspiesza fading.
2. Brak deszczu używa normalnego lifetime.
3. Dłuższa ekspozycja na deszcz powoduje większe skrócenie lifetime.
4. Krótki deszcz nie usuwa automatycznie wszystkich śladów.
5. Zmiany pogody nie powodują błędnego resetowania lifetime.

### Accumulation

1. Wielokrotne trafienia nie powodują niekontrolowanego wzrostu liczby reprezentacji.
2. Bliskie ślady mogą zostać agregowane/ograniczone bez utraty poprawności damage/combat.
3. Cleanup usuwa nieaktywne ślady i reprezentacje.

### Performance

1. Duża liczba blood traces nie powoduje osobnego mesh/draw call per trace.
2. GPU representation jest ograniczana do aktywnego obszaru zgodnie z istniejącym streamingiem.
3. Cleanup nie powoduje nadmiernego GC.

### Regression

Uruchomić istniejące testy i build.

Nie zmieniać bez potrzeby combat, HealthState, terrain generation, weather ani chunk streaming.

**Zrób git commit i push do main, rebase jeżeli trzeba**
