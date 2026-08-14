# Plan: Fauna — źródła jedzenia i wody dla sytości / nawodnienia

**Status:** `verification needed` 🔍 — implemented, technically verified (`tsc`/`lint`/`build`/`test` pass); browser verification still required (see [implementation notes](./2026-08-13--094--fauna-food-water-for-satiety-hydration-implementation-notes.md#implementation-status-2026-08-13)).  
**Created:** 2026-08-13  
**Priority:** 🟡 medium · **Effort:** L · **Depends on:** ~~021~~, ~~010~~  
**Źródło:** issue `015` (2026-08-11) — obserwacja po paskach statusu nad zwierzętami (HP / stamina / sytość / nawodnienie)

## Cel

Zwierzęta mają **co jeść i pić w świecie**, żeby paski sytości i nawodnienia mogły rosnąć w wiarygodny sposób — nie przez abstrakcyjny relief przy wanderze.

```text
need elevated (hunger / thirst)
        ↓
  celuj w realne źródło (forage / brzeg wody / padlina)
        ↓
     dojście + krótka akcja
        ↓
  hunger / thirst spada → pasek sytości / nawodnienia rośnie
```

To domknięcie odłożonej części planu [021](./2026-08-07--021--npc-3-animal-life.md) (Animal Life v1: needs → wander bias, **bez** lokacji jedzenia/wody). Nie jest bugiem UI.

## Stan wyjściowy

- `AnimalLifeState` (`src/fauna/AnimalLife.ts`): `hunger` / `thirst` (`0…1`, rosną w `tickAnimalLife`). Stamina jest osobnym `StaminaState` (plan 045).
- UI nad zwierzęciem: **sytość** = `1 - hunger`, **nawodnienie** = `1 - thirst` (`AnimalAgent`).
- Jedyny mechanizm obniżający potrzeby: `relieveElevatedNeeds()` przy dojściu do celu wander — flat `-0.25` powyżej `NEED_ELEVATED_THRESHOLD`, bez obiektu jedzenia/wody. Komentarz w kodzie wprost nazywa to abstrakcją „grazed/drank something along the way”.
- Wander bias przy elevated need już istnieje (`needWanderBias` / szerszy promień, krótszy timer) — ale cel jest losowy w `home` + `ROAM_RADIUS`, nie przy źródle.
- `isWalkable` odrzuca teren `≤ waterLevel + WATER_MARGIN` (0.3). Brzeg jeziora / rzeki / oceanu jest więc już wykrywalny z `sampleHeight` + `waterLevel`; fauna **unika** wody, nie pije z niej.
- Drapieżniki zabijają ofiary (`faunaCombat`); zwłoki leżą 60 s. **Padlinożerstwo nie jest zaimplementowane** (`STATE.md`). Hunger napędza atak na człowieka (plan 056), ale zabicie ofiary nie karmi.
- NPC mają osobny tor `Needs` + studnia/ogród (020 / 060 / 079). Nie mieszać.

## Kierunek v1

Rozszerzyć istniejący `AnimalAgent` / `AnimalLife`, nie budować drugiego FSM ani `FaunaNeedsManager`.

### Woda

Gdy `thirst` jest elevated, wander/intencja celuje w **najbliższy dostępny brzeg** w zasięgu home range (wysokość tuż nad `waterLevel + WATER_MARGIN`, nie w wodę). Po dojściu krótka akcja picia obniża `thirst`.

- Jezioro / rzeka / ocean: wszystkie brzegi są legalnym źródłem v1, o ile punkt jest walkable i (dla `wild`) poza footprintem osady — ten sam kontrakt co obecny wander.
- Nie wymagać nowej geometrii wody ani kopii `landmarks.well`. Query: sampling wysokości wokół agenta / home, ewentualnie reuse `detectWaterBodies` tylko jeśli da się to zrobić bez skanowania chunka co klatkę.
- Preferować event-driven / retarget przy elevated need, nie raycast na każdej klatce.

### Jedzenie

Gdy `hunger` jest elevated:

| Rola | Źródło v1 | Relief |
|------|-----------|--------|
| **Prey** (jeleń, jeleń szlachetny) | forage w habicie — trawa / las / zarośla już obecne w terenie (`sampleForestFactor`, pobliskie drzewa, suchy grunt nad wodą). Bez nowych propów flory. | krótki graze przy celu → spadek `hunger` |
| **Predator** (wilk, lis) | zabita ofiara lub padlina w zasięgu (istniejące zwłoki 60 s) | scavenging / jedzenie po killu → spadek `hunger` |

Nie dodawać dropów jedzenia ani farmy. Habitat-specific forage = bias celu w stronę wegetacji / zarośli, nie nowy katalog roślin.

### Decyzja

Zastąpić bezwarunkowe `relieveElevatedNeeds()` na każdym przybyciu wander. Relief tylko gdy agent **rzeczywiście** doszedł do źródła (brzeg / forage / padlina) i wykonał krótką akcję. Dopóki źródła nie ma w zasięgu, need zostaje elevated i wander bias nadal szuka — paski nie odbijają „za darmo”.

Intencje przez istniejący lifecycle (`setIntent` / `wander` / chase), bez drugiej maszyny stanów. Threat (flee/chase) nadal wygrywa z jedzeniem/piciem.

## Poza zakresem

- Zmiana semantyki pasków (zostaje sytość / nawodnienie).
- NPC needs food/water (osobny tor Needs / studnia / ogród).
- Pełny ecosystem, farming, nowe modele flory, itemy-jedzenie dla gracza.
- Persystencja stanu fauny (`SaveData` nadal nie zapisuje zwierząt — jak 021).
- Osobny daily schedule per gatunek (odłożone w 021).
- Nowa geometria rzek / poideł / karmników.
- Nowe assety modeli/dźwięków w v1 (cisza albo istniejący SFX, jeśli naturalnie pasuje).

## Open questions (from STATE, 2026-08-14)

- Czy zjedzone przez drapieżnika zwłoki są faktycznie usuwane po konsumpcji?
- Czy żerowanie roślinożerców wykorzystuje wirtualne/habitatowe żerowiska, czy realne obiekty świata (np. konkretne kępy trawy)?

## Kryteria

1. Głodne/spragnione zwierzę idzie do **konkretnego** źródła, nie tylko szerzej błądzi.
2. Po jedzeniu pasek sytości **rośnie**; po piciu pasek nawodnienia **rośnie**.
3. Bez źródła w zasięgu paski nie dostają flat reliefu z wanderu.
4. Prey nie musi zabijać, żeby jeść; predator nie „pasie się” jak jeleń — je ofiarę/padlinę.
5. Brak drugiego systemu AI; threat nadal przerywa forage/drink.
6. Brak nowych assetów i braku pełnego ecosystemu.

## Powiązania

- ~~021~~ Animal Life — v1 świadomie bez lokacji; ten plan to odłożony zakres.
- ~~010~~ predator-prey — kill/zwłoki jako jedzenie drapieżnika.
- 056 (🔍) — hunger vs fear; realne karmienie sprawia, że hunger po polowaniu spada, zamiast zostawać elevated.
- 080 — unikanie osady przy celowaniu w brzeg/forage (wild).
- NPC 020 / 060 / 079 — analogia behawioralna, nie współdzielony kod miejsc.
