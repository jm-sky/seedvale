# Seedvale — Osady i NPC

**Purpose:** źródło prawdy dla generacji osad i życia NPC *jak jest zaimplementowane*.

**Nie jest:** indeksem planów ([plans/README.md](./plans/README.md)), katalogiem GLB ([assets/](./assets/README.md)), kontraktem renderu ([GRAPHICS.md](./GRAPHICS.md)), ani snapshotem całego codebase ([STATE.md](./STATE.md)).

**Last verified:** 2026-08-14

Gdy ten plik rozjeżdża się z kodem — **wygrywa kod**, potem aktualizujemy ten dokument.

Historia zakresu: zarchiwizowane plany [047](./plans/archive/2026-08-09--047--village-generation-overhaul.md), [071](./plans/archive/2026-08-11--071--local-economy-and-settlement-development.md), [060](./plans/archive/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md), [076](./plans/archive/2026-08-12--076--village-generator-polish.md), [077](./plans/archive/2026-08-12--077--village-gardens-scale.md), [079](./plans/archive/2026-08-12--079--interaction-queue-well-drink.md), [092](./plans/archive/2026-08-13--092--npc-stamina-and-daily-vigor.md). Household (plan [069](./plans/2026-08-11--069--npc-household-resources.md)) jest `todo`, nie tutaj.

---

## Standing decisions

| ID | Decyzja | Skutek |
|----|---------|--------|
| S1 | Generacja jest **plan-first**: jeden `VillagePlan` na osadę (tożsamość → strefy/działki/budynki/landmarki/ścieżki/wejścia), potem projekcja na `SettlementDef` runtime. | `settlementPlanCache` karmi `SettlementsManager` i `RoadNetwork` |
| S2 | Komórki otwartego oceanu są **pomijane** (bez mokrego fallbacku). Osada domowa poszerza poszukiwanie, gdy spawn jest mokry. | issue [029](./issues/2026-08-13--029--village-in-open-ocean.md) |
| S3 | `SettlementEconomy` to **hurtowy stock osady** (`wood` / `food` / `water`), nie `Inventory` gracza i nie ekwipunek NPC. | `src/economy/`; household = plan 069 |
| S4 | Picie ze studni idzie przez wspólny per-osada `InteractionQueue` (FIFO, jedna obsługa naraz). Picie w domu omija kolejkę. | ten sam typ kolejki jest do ponownego użycia przy ogrodzie/straganie |
| S5 | Dzienny rytm = szablon roli + overlay cech (`effectiveScheduleFor`). Pilne potrzeby wygrywają w `choose()`. | brak social Place — overlay `sociable` nie ma producenta |
| S6 | `VigorState` ≠ `StaminaState`. Wigor to budżet dnia; zwykły odpoczynek odnawia tylko staminę. Collapse → istniejący `goSleep`/`sleep`. | fauna nie używa wigoru |
| S7 | Runtime NPC (needs, AI, vigor) **nie** jest w save. Continue nie przywraca pełnej symulacji. | vigor startuje pełny przy spawnie |

Multiplayer nie jest planowany teraz i nie projektujemy go tutaj. Ale S3/S7 pokazują, że ownership stanu (ekonomia osady, runtime NPC) jest już oddzielony od `Inventory` gracza i od save gracza — utrzymuj ten podział, żeby ewentualne przejście na server-authoritative symulację (mały świat, ~2–5 graczy) nie wymagało przepisania. Zob. [performance-and-workers.md](./architecture/performance-and-workers.md).

---

## Stan obecny

### Generator i wygląd

- Rodziny, domy, drogi lokalne i międzysiedliskowe, siting zależny od terenu.
- Domy: per-model `HOUSE_CATALOG` (wysokość, ułamek lampy); `towerhouse` nie jest domem rodzinnym.
- Ogrody skalują się z liczbą domów (S/M/L); środki grządek poza dyskiem placu. Osady z `foodSourceType === 'field'` stawiają pole przy landmarku `field`.
- Zużyte lokalne drogi, clearing placu, yaw/pady domów, tablica przy studni, palisada tylko inland.
- Drogi między osadami wchodzą przez `entranceToward`; lokalne korytarze z `VillagePlan.paths`. Drogowskazy: `yawToward`.
- GLB z proceduralnym fallbackiem: studnia, stos drewna, ogrody/crops, pole, kaktus/trzcina w środowisku chunka (nie w generatorze osady).

### Streaming

- `HOME_RADIUS` (56) jest niezależny od załadowanego terenu — osada i fauna zachowują się tak samo, gdy gracz jest daleko.
- Stream osad: `loadRadius` 300 / `unloadRadius` 420 (`worldBundle.ts`).
- Budowa propsów oddaje klatki (`frameYield`) żeby nie zatykać głównego wątku przy dociągnięciu wioski.

### Ekonomia

- Każda załadowana osada ma `SettlementEconomy`: cele popytu, niedobór/nadwyżka.
- Drwal: ścinka → depozyt na stosie. Drugi, mniejszy stos (woodshed) jest płatny raz z nadwyżki drewna.
- Farmer / rybak / górnik wołają wspólny production hook — **puste wyjścia** do planu 069.
- Stock przeżywa stream-out/in w rejestrze `SettlementsManager`; nie jest w `SaveData`.

### NPC

- Needs + FSM + osobowość/cechy/Big Five; HP przez `HealthState`, wysiłek przez `StaminaState`.
- Harmonogram: `eat` / `home` / `wake` / `work` / `sleep` przez istniejący FSM. `night_owl` przesuwa dzień; `fast_worker` wydłuża pracę.
- Kupiec pomija `woodDuty` (zostaje przy straganie).
- Ciężka `work`/`chop` drenuje wigor; sen (grafik albo forced) go przywraca.
- Dialog v2 = ekran Vue. W osadzie domowej: handel u kupca; strażnik może oddać miecz.

### Świadomie nie ma

- Household / zużycie stocku przez rodziny (069).
- Social Place (typ istnieje, brak producenta).
- Pełny snapshot NPC w save.
- Handel między osadami.

---

## Entry points

```text
src/settlement/SettlementsManager.ts
src/settlement/createSettlement.ts
src/settlement/villagePlan.ts
src/economy/
src/ai/NpcAgent.ts
src/ai/Needs.ts
src/ai/schedule.ts
src/shared/VigorState.ts
src/shared/StaminaState.ts
```

`HOME_RADIUS` i promienie streamu: `src/app/worldBundle.ts`.
